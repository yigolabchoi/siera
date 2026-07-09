import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, ArrowLeft, AlertCircle, Loader2, CheckCircle, Clock, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { useEvents } from '../contexts/EventContext';
import { useParticipations } from '../contexts/ParticipationContext';
import { useGuestApplications } from '../contexts/GuestApplicationContext';
import { useMembers } from '../contexts/MemberContext';
import { formatPhoneNumberInput, removePhoneNumberHyphens } from '../utils/format';
import { getDocument, setDocument, queryDocuments, updateDocument, deleteDocument } from '../lib/firebase/firestore';

// 추천인 검색 결과 마스킹 (간편 산행 신청과 동일한 방식 — 최소 정보만 노출)
const maskReferrerName = (name: string): string => {
  if (!name) return '';
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
};
const maskReferrerCompany = (company: string): string => {
  if (!company) return '';
  if (company.length <= 1) return '*';
  if (company.length <= 3) return company[0] + '*'.repeat(company.length - 1);
  return company.slice(0, 2) + '*'.repeat(company.length - 2);
};

const CompleteGoogleProfile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const guestEventId = searchParams.get('guest'); // 게스트 산행 신청 흐름에서 전달된 이벤트 ID
  const { firebaseUser, user, logout, isLoading: authLoading, reloadUserFromFirestore } = useAuth();
  const { events } = useEvents();
  const { addParticipation, participations } = useParticipations();
  const { addGuestApplication } = useGuestApplications();
  const { members } = useMembers();

  // 게스트 산행 대상 이벤트 조회
  const guestEvent = useMemo(() => {
    if (!guestEventId) return null;
    return events.find(e => e.id === guestEventId) || null;
  }, [guestEventId, events]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchSuccess, setMatchSuccess] = useState(false);
  const [matchedName, setMatchedName] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    gender: '',
    birthYear: '',
    company: '',
    position: '',
    referredBy: '',
    hikingLevel: '',
    applicationMessage: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReferrerSuggestions, setShowReferrerSuggestions] = useState(false);

  // 추천인 검색 결과 (승인된 회원만, 최대 8명)
  const referrerSuggestions = useMemo(() => {
    const q = formData.referredBy.trim();
    if (!q) return [];
    return members
      .filter(m => m.isApproved && m.isActive !== false)
      .filter(m => m.name.includes(q))
      .slice(0, 8);
  }, [formData.referredBy, members]);

  // Google 로그인 상태 확인 및 기존 회원 리다이렉트 (auth 로딩 완료 후에만 체크)
  useEffect(() => {
    if (authLoading) return; // Auth 상태 확인 중에는 대기
    if (!firebaseUser) {
      navigate('/');
      return;
    }

    // 게스트 산행 신청 흐름에서는 기존 사용자 리다이렉트를 건너뜀
    // (프로필 저장 후 게스트 참여 생성이 이 페이지에서 처리됨)
    if (guestEventId) return;

    // 이미 Firestore에 데이터가 있는 사용자 (기존 회원)는 이 페이지에 올 필요 없음
    // 모바일 리다이렉트 타이밍 이슈로 잘못 도달한 경우 올바른 페이지로 이동
    if (user) {
      if (user.isApproved) {
        navigate('/home/events', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
      return;
    }
  }, [firebaseUser, user, authLoading, navigate, guestEventId]);

  // 페이지 로드 시 맨 위로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // 전화번호 필드인 경우 자동 포맷팅 적용
    const formattedValue = name === 'phoneNumber' ? formatPhoneNumberInput(value) : value;
    
    setFormData({
      ...formData,
      [name]: formattedValue,
    });
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: '',
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '이름을 입력해주세요.';
    }

    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = '전화번호를 입력해주세요.';
    } else if (!/^\d{3}-\d{3,4}-\d{4}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)';
    }

    // 출생연도 유효성 검사 (입력한 경우에만)
    if (formData.birthYear.trim() && !/^\d{4}$/.test(formData.birthYear)) {
      newErrors.birthYear = '올바른 연도를 입력해주세요. (예: 1990)';
    }

    // 소속(회사명)은 회원가입/게스트 신청 공통 필수
    if (!formData.company.trim()) {
      newErrors.company = '소속(회사명)을 입력해주세요.';
    }

    // 게스트 산행 신청 시 직책도 필수
    if (guestEventId) {
      if (!formData.position.trim()) {
        newErrors.position = '직책을 입력해주세요.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ===== pre_ → Auth UID 전환 시 관련 데이터 마이그레이션 =====
  const migrateRelatedData = async (oldPreId: string, newUid: string) => {
    console.log(`🔄 관련 데이터 마이그레이션: ${oldPreId} → ${newUid}`);
    
    // 마이그레이션 대상 컬렉션과 참조 필드
    const collections = [
      { name: 'executives', field: 'memberId' },
      { name: 'participations', field: 'userId' },
      { name: 'attendance', field: 'memberId' },
      { name: 'payments', field: 'memberId' },
      { name: 'hikingHistory', field: 'memberId' },
    ];

    for (const col of collections) {
      try {
        const result = await queryDocuments<any>(col.name, [
          { field: col.field, operator: '==', value: oldPreId },
        ]);
        if (result.success && result.data && result.data.length > 0) {
          for (const doc of result.data) {
            await updateDocument(col.name, doc.id, { [col.field]: newUid });
            console.log(`  ✅ ${col.name}/${doc.id} ${col.field}: ${oldPreId} → ${newUid}`);
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ ${col.name} 마이그레이션 실패:`, err);
      }
    }
  };

  // ===== pre_ 프로필 사진을 새 UID 경로로 이전 =====
  const migrateProfilePhoto = async (oldPreId: string, newUid: string, existingProfileImage?: string): Promise<string | null> => {
    // 기존 pre_ 문서에 커스텀 프로필 이미지가 있는 경우 (Google 아바타가 아닌 경우)
    if (existingProfileImage && 
        !existingProfileImage.includes('googleusercontent.com') &&
        existingProfileImage.includes('firebasestorage.googleapis.com')) {
      try {
        // URL에서 파일 경로 추출
        const pathMatch = existingProfileImage.match(/profiles%2F[^?]+/);
        if (pathMatch) {
          const oldPath = decodeURIComponent(pathMatch[0]);
          const fileName = oldPath.split('/').pop() || 'profile.jpg';
          const newPath = `profiles/${newUid}/${fileName}`;
          
          // 기존 파일 다운로드 후 새 경로에 업로드 (클라이언트에서는 직접 복사 불가)
          // 대신 URL을 새 경로로 변환하여 반환
          const newEncodedPath = encodeURIComponent(newPath);
          console.log(`  📸 프로필 사진 경로 유지: ${existingProfileImage}`);
          return existingProfileImage; // 기존 URL 그대로 사용 (Storage 파일은 그대로 남아있음)
        }
      } catch (err) {
        console.warn('  ⚠️ 프로필 사진 마이그레이션 실패:', err);
      }
    }
    return null;
  };

  // ===== 게스트 산행 참여 자동 생성 (프로필 저장 완료 후 호출) =====
  const createGuestParticipation = async (profileData: {
    name: string;
    phoneNumber: string;
    email: string;
    company?: string;
    position?: string;
  }) => {
    if (!guestEvent || !firebaseUser) return;

    // 중복 체크 (취소된 참가는 제외 — 재신청 허용)
    const eventParticipations = participations.filter(p => p.eventId === guestEvent.id);
    if (eventParticipations.some(p => p.userId === firebaseUser.uid && p.status !== 'cancelled')) {
      console.log('ℹ️ 이미 해당 산행에 신청되어 있음 - 게스트 참여 생성 스킵');
      return;
    }

    // 회원명부(members)에 아직 없으면 관리자 승인 없이 즉시 role='guest'로 등록
    // (preRegisteredMembers/기존 회원 매칭 branch에서는 이미 role='member'로 생성돼 있으므로 건드리지 않음)
    try {
      const existingMemberResult = await getDocument<any>('members', firebaseUser.uid);
      if (!existingMemberResult.success && existingMemberResult.error === 'Document not found') {
        await setDocument('members', firebaseUser.uid, {
          id: firebaseUser.uid,
          name: profileData.name,
          email: profileData.email || firebaseUser.email || '',
          phoneNumber: profileData.phoneNumber || '',
          company: profileData.company || '',
          position: profileData.position || '',
          role: 'guest' as const,
          isApproved: true,
          isActive: true,
          joinDate: new Date().toISOString().split('T')[0],
          authProvider: 'google',
        });
        console.log('👤 게스트를 회원명부에 즉시 등록:', firebaseUser.uid);
      }
    } catch (memberErr) {
      console.warn('⚠️ 게스트 회원명부 등록 중 오류 (참가 신청은 계속 진행):', memberErr);
    }

    try {
      // 1. 참여 신청 생성
      await addParticipation({
        eventId: guestEvent.id,
        userId: firebaseUser.uid,
        userName: profileData.name,
        userEmail: profileData.email || '',
        userPhone: profileData.phoneNumber || '',
        userCompany: profileData.company || '',
        userPosition: profileData.position || '',
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        isGuest: true,
        registeredAt: new Date().toISOString(),
      });

      // 2. 게스트 신청 기록 (관리자 추적용)
      try {
        await addGuestApplication({
          userId: firebaseUser.uid,
          name: profileData.name,
          email: profileData.email || firebaseUser.email || '',
          phoneNumber: profileData.phoneNumber || '',
          company: profileData.company || '',
          position: profileData.position || '',
          eventId: guestEvent.id,
          eventTitle: guestEvent.title,
          eventDate: guestEvent.date,
        });
      } catch (guestErr) {
        console.warn('게스트 신청 기록 생성 실패 (참여 신청은 완료):', guestErr);
      }

      console.log('✅ 게스트 산행 참여 자동 생성 완료');
    } catch (error) {
      console.error('❌ 게스트 산행 참여 생성 실패:', error);
    }
  };

  // ===== 게스트 완료 페이지로 이동 (URL 파라미터로 완료 상태 전달) =====
  const navigateToGuestComplete = (appliedName: string) => {
    const params = new URLSearchParams({
      step: 'complete',
      event: guestEventId || '',
      name: appliedName,
    });
    navigate(`/guest-application?${params.toString()}`, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    if (!firebaseUser) {
      alert('로그인 정보를 찾을 수 없습니다.');
      navigate('/');
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedPhone = removePhoneNumberHyphens(formData.phoneNumber);
      const trimmedName = formData.name.trim();

      console.log('📝 Google 사용자 추가 정보 제출:', {
        uid: firebaseUser.uid,
        name: trimmedName,
        email: firebaseUser.email,
      });

      // ===== 1단계: preRegisteredMembers에서 이름 + 전화번호 매칭 =====
      console.log('🔍 사전등록 회원 매칭 시도:', { name: trimmedName, phone: normalizedPhone });
      
      const matchResult = await queryDocuments<{
        id: string;
        name: string;
        phoneNumber: string;
        company?: string;
        position?: string;
        role?: string;
        isApproved?: boolean;
        matched?: boolean;
        memo?: string;
      }>('preRegisteredMembers', [
        { field: 'name', operator: '==', value: trimmedName },
        { field: 'phoneNumber', operator: '==', value: normalizedPhone },
      ]);

      const preRegMember = matchResult.success && matchResult.data && matchResult.data.length > 0
        ? matchResult.data[0]
        : null;

      // 전화번호로 기존 members 문서 검색 (pre_ 및 다른 프로바이더 포함)
      const existingMemberResult = await queryDocuments<any>('members', [
        { field: 'phoneNumber', operator: '==', value: normalizedPhone },
      ]);
      // 현재 UID와 다른, 병합되지 않은 활성 회원 찾기
      const existingMember = existingMemberResult.success && existingMemberResult.data
        ? existingMemberResult.data.find((m: any) => m.id !== firebaseUser.uid && !m.mergedInto)
        : null;

      if (preRegMember && !preRegMember.matched) {
        // ===== 매칭 성공: members에 즉시 정회원 등록 =====
        console.log('✅ 사전등록 회원 매칭 성공:', preRegMember.name);

        const migratedPhoto = existingMember 
          ? await migrateProfilePhoto(existingMember.id, firebaseUser.uid, existingMember.profileImage)
          : null;

        const memberData = {
          id: firebaseUser.uid,
          name: trimmedName,
          email: firebaseUser.email || '',
          phoneNumber: normalizedPhone,
          gender: formData.gender.trim() || existingMember?.gender || '',
          birthYear: formData.birthYear.trim() || existingMember?.birthYear || '',
          company: formData.company.trim() || preRegMember.company || existingMember?.company || '',
          position: formData.position.trim() || preRegMember.position || existingMember?.position || '',
          role: preRegMember.role || existingMember?.role || 'member',
          isApproved: true,
          isActive: true,
          joinDate: existingMember?.joinDate || new Date().toISOString(),
          createdAt: existingMember?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hikingLevel: formData.hikingLevel.trim() || existingMember?.hikingLevel || '',
          referredBy: formData.referredBy.trim() || existingMember?.referredBy || '',
          bio: existingMember?.bio || '',
          profileImage: migratedPhoto || firebaseUser.photoURL || '',
          authProvider: 'google',
        };

        const memberResult = await setDocument('members', firebaseUser.uid, memberData);

        if (memberResult.success) {
          await updateDocument('preRegisteredMembers', preRegMember.id, {
            matched: true,
            matchedUid: firebaseUser.uid,
            matchedAt: new Date().toISOString(),
          });

          // 기존 members 문서가 있으면 계정 병합 (pre_ 및 크로스 프로바이더 모두 처리)
          if (existingMember && existingMember.id !== firebaseUser.uid) {
            await migrateRelatedData(existingMember.id, firebaseUser.uid);
            
            if (existingMember.id.startsWith('pre_')) {
              await deleteDocument('members', existingMember.id);
              console.log(`🗑️ 기존 pre_ 문서 삭제: ${existingMember.id}`);
            } else {
              // 크로스 프로바이더: 기존 문서 비활성화
              try {
                await updateDocument('members', existingMember.id, {
                  isActive: false,
                  mergedInto: firebaseUser.uid,
                  mergedAt: new Date().toISOString(),
                });
                console.log(`🔗 크로스 프로바이더 계정 병합 완료: ${existingMember.id} → ${firebaseUser.uid}`);
              } catch (mergeErr) {
                console.warn('⚠️ 기존 문서 비활성화 실패:', mergeErr);
              }
            }
          }

          console.log('✅ 사전등록 회원 → 정회원 즉시 등록 완료');

          if (guestEventId) {
            await createGuestParticipation({
              name: trimmedName,
              phoneNumber: normalizedPhone,
              email: firebaseUser.email || '',
              company: formData.company || preRegMember.company || '',
              position: formData.position || preRegMember.position || '',
            });
            setIsSubmitting(false);
            reloadUserFromFirestore().catch(() => {});
            navigateToGuestComplete(trimmedName);
            return;
          }

          setMatchedName(trimmedName);
          setMatchSuccess(true);
          setIsSubmitting(false);

          setTimeout(async () => {
            await reloadUserFromFirestore();
            navigate('/home', { replace: true });
          }, 3000);
          return;
        } else {
          console.error('❌ 정회원 등록 실패, 일반 가입 흐름으로 전환:', memberResult.error);
        }
      } else {
        if (preRegMember?.matched) {
          console.log('ℹ️ 이미 매칭된 사전등록 회원:', preRegMember.name);
        } else {
          console.log('ℹ️ 사전등록 회원 매칭 없음, members에서 기존 문서 확인');
        }
      }

      // ===== 2단계: members 컬렉션에서 전화번호로 기존 회원 매칭 (pre_ 및 크로스 프로바이더) =====
      if (existingMember) {
        const isCrossProvider = !existingMember.id?.startsWith('pre_');
        console.log(`✅ members에서 기존 회원 매칭: ${existingMember.name} (${isCrossProvider ? '크로스 프로바이더' : 'pre_'})`);

        const migratedPhoto = await migrateProfilePhoto(existingMember.id, firebaseUser.uid, existingMember.profileImage);

        const updatedMemberData = {
          ...existingMember,
          id: firebaseUser.uid,
          name: trimmedName,
          email: firebaseUser.email || '',
          phoneNumber: normalizedPhone,
          gender: formData.gender.trim() || existingMember.gender || '',
          birthYear: formData.birthYear.trim() || existingMember.birthYear || '',
          company: formData.company.trim() || existingMember.company || '',
          position: formData.position.trim() || existingMember.position || '',
          isApproved: true,
          isActive: true,
          hikingLevel: formData.hikingLevel.trim() || existingMember.hikingLevel || '',
          referredBy: formData.referredBy.trim() || existingMember.referredBy || '',
          bio: existingMember.bio || '',
          profileImage: migratedPhoto || firebaseUser.photoURL || '',
          authProvider: 'google',
          updatedAt: new Date().toISOString(),
        };

        // mergedInto 필드 제거 (복제 시 포함되지 않도록)
        delete (updatedMemberData as any).mergedInto;
        delete (updatedMemberData as any).mergedAt;

        const newDocResult = await setDocument('members', firebaseUser.uid, updatedMemberData);
        if (newDocResult.success) {
          await migrateRelatedData(existingMember.id, firebaseUser.uid);
          
          if (existingMember.id.startsWith('pre_')) {
            await deleteDocument('members', existingMember.id);
            console.log('✅ pre_ → Auth UID 문서 전환 완료');
          } else {
            try {
              await updateDocument('members', existingMember.id, {
                isActive: false,
                mergedInto: firebaseUser.uid,
                mergedAt: new Date().toISOString(),
              });
              console.log(`🔗 크로스 프로바이더 계정 병합 완료: ${existingMember.id} → ${firebaseUser.uid}`);
            } catch (mergeErr) {
              console.warn('⚠️ 기존 문서 비활성화 실패:', mergeErr);
            }
          }

          if (guestEventId) {
            await createGuestParticipation({
              name: trimmedName,
              phoneNumber: normalizedPhone,
              email: firebaseUser.email || '',
              company: formData.company || existingMember.company || '',
              position: formData.position || existingMember.position || '',
            });
            setIsSubmitting(false);
            reloadUserFromFirestore().catch(() => {});
            navigateToGuestComplete(trimmedName);
            return;
          }

          setMatchedName(trimmedName);
          setMatchSuccess(true);
          setIsSubmitting(false);

          setTimeout(async () => {
            await reloadUserFromFirestore();
            navigate('/home', { replace: true });
          }, 3000);
          return;
        }
      }

      // ===== 매칭 실패: pendingUsers에 저장 (관리자 승인 대기) =====
      const pendingUserData = {
        id: firebaseUser.uid,
        name: trimmedName,
        email: firebaseUser.email || '',
        phoneNumber: normalizedPhone,
        gender: formData.gender,
        birthYear: formData.birthYear,
        company: formData.company,
        position: formData.position,
        referredBy: formData.referredBy,
        hikingLevel: formData.hikingLevel,
        applicationMessage: formData.applicationMessage || 'Google 로그인을 통해 가입',
        profileImage: firebaseUser.photoURL || '',
        authProvider: 'google',
        appliedAt: new Date().toISOString(),
        status: 'pending',
      };

      const result = await setDocument('pendingUsers', firebaseUser.uid, pendingUserData);

      if (result.success) {
        console.log('✅ 가입 신청 완료 (관리자 승인 대기)');

        // 게스트 산행 신청 흐름인 경우 → 참여 생성 후 게스트 완료 페이지로 이동
        if (guestEventId) {
          await createGuestParticipation({
            name: trimmedName,
            phoneNumber: normalizedPhone,
            email: firebaseUser.email || '',
            company: formData.company,
            position: formData.position,
          });
          setIsSubmitting(false);
          reloadUserFromFirestore().catch(() => {}); // 백그라운드 리로드
          navigateToGuestComplete(trimmedName);
          return;
        }

        // 승인 대기 UI 표시
        setMatchedName(trimmedName);
        setMatchSuccess(true);
        setPendingApproval(true);
        setIsSubmitting(false);

        // 3초 후 홈으로 이동 (ProtectedRoute에서 승인 대기 UI 표시)
        setTimeout(async () => {
          await reloadUserFromFirestore();
          navigate('/home', { replace: true });
        }, 3000);
        return;
      } else {
        console.error('❌ 정보 저장 실패:', result.error);
        alert('정보 저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error: any) {
      console.error('❌ 제출 오류:', error);
      alert(`오류가 발생했습니다.\n\n${error.message || '다시 시도해주세요.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (confirm('입력한 정보가 저장되지 않습니다. 취소하시겠습니까?')) {
      await logout();
      navigate('/');
    }
  };

  // Auth 로딩 중이거나 firebaseUser가 아직 없는 경우 로딩 표시
  if (authLoading || !firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 가입 완료 / 승인 대기 화면
  if (matchSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className={`w-20 h-20 ${pendingApproval ? 'bg-amber-500/20' : 'bg-emerald-500/20'} rounded-full flex items-center justify-center mx-auto mb-6 animate-in fade-in`}>
            {pendingApproval ? (
              <Clock className="w-10 h-10 text-amber-400" />
            ) : (
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 animate-in fade-in" style={{ animationDelay: '100ms' }}>
            {pendingApproval ? '가입 신청 완료!' : '가입 완료!'}
          </h1>
          <p className={`text-lg ${pendingApproval ? 'text-amber-400' : 'text-emerald-400'} font-semibold mb-2 animate-in fade-in`} style={{ animationDelay: '200ms' }}>
            {matchedName}님, 환영합니다!
          </p>
          <p className="text-slate-400 mb-8 animate-in fade-in" style={{ animationDelay: '300ms' }}>
            {pendingApproval ? (
              <>가입 신청이 접수되었습니다.<br/>관리자 승인 후 서비스를 이용하실 수 있습니다.</>
            ) : (
              <>회원 등록이 완료되었습니다.<br/>지금 바로 산행을 신청하실 수 있습니다.</>
            )}
          </p>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 mb-8 animate-in fade-in" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center gap-3 text-left">
              <div className={`w-10 h-10 ${pendingApproval ? 'bg-amber-500/20' : 'bg-emerald-500/20'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                {pendingApproval ? (
                  <Clock className="w-5 h-5 text-amber-400" />
                ) : (
                  <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">
                  {pendingApproval ? '승인 대기 중' : '회원 등록 완료'}
                </p>
                <p className="text-slate-400 text-xs">
                  {pendingApproval
                    ? '관리자가 신청을 확인하면 알림을 보내드립니다'
                    : '산행 신청 및 모든 기능을 이용하실 수 있습니다'}
                </p>
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-500 animate-in fade-in" style={{ animationDelay: '500ms' }}>
            잠시 후 이동합니다...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            취소하고 돌아가기
          </button>
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              {guestEventId ? '게스트 산행 - 추가 정보 입력' : '추가 정보 입력'}
            </h1>
            <p className="text-lg text-slate-400">
              {guestEventId
                ? '산행 참여를 위한 추가 정보를 입력해주세요.'
                : 'Google 계정으로 로그인하셨습니다. 추가 정보를 입력해주세요.'}
            </p>
          </div>
        </div>

        {/* 게스트 산행 신청 진행 안내 */}
        {guestEventId && guestEvent && (
          <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div className="text-sm flex-1">
                <p className="font-semibold mb-1 text-white">게스트 산행 신청 진행 중</p>
                <p className="text-emerald-300 text-xs">{guestEvent.title}</p>
                <p className="text-slate-400 text-xs mt-1">
                  아래 정보 입력 후 자동으로 산행 신청이 완료됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Google Account Info */}
        <div className="mb-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
                <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
                <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
                <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
              </svg>
            </div>
            <div className="text-sm flex-1">
              <p className="font-semibold mb-1 text-white">Google 계정으로 로그인됨</p>
              <p className="text-slate-300">{firebaseUser.email}</p>
              <p className="text-slate-400 text-xs mt-1">
                {guestEventId
                  ? '* 아래 정보를 입력하면 게스트 산행 신청이 완료됩니다'
                  : '* 회원 가입을 완료하려면 아래 정보를 입력해주세요'}
              </p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-8 md:p-12 border border-slate-800 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 기본 정보 */}
            <div>
              <h3 className="text-xl font-bold text-white mb-4 pb-3 border-b border-slate-700">
                기본 정보
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    이름 (한글) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-slate-800 border ${
                      errors.name ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors`}
                    placeholder="홍길동"
                  />
                  {errors.name && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.name}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    * Google 계정 이름과 다를 수 있습니다. 실명을 입력해주세요.
                  </p>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    전화번호 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-slate-800 border ${
                      errors.phoneNumber ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors`}
                    placeholder="010-1234-5678"
                  />
                  {errors.phoneNumber && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.phoneNumber}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">
                      성별
                    </label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 bg-slate-800 border ${
                        errors.gender ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl text-white focus:outline-none focus:border-emerald-500 transition-colors`}
                    >
                      <option value="">선택하세요</option>
                      <option value="male">남성</option>
                      <option value="female">여성</option>
                    </select>
                    {errors.gender && (
                      <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.gender}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-2 text-sm">
                      출생연도
                    </label>
                    <input
                      type="text"
                      name="birthYear"
                      value={formData.birthYear}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 bg-slate-800 border ${
                        errors.birthYear ? 'border-red-500' : 'border-slate-700'
                      } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors`}
                      placeholder="1990"
                      maxLength={4}
                    />
                    {errors.birthYear && (
                      <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {errors.birthYear}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 직업 정보 */}
            <div>
              <h3 className="text-xl font-bold text-white mb-4 pb-3 border-b border-slate-700">
                직업 정보
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    소속 (회사명) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-slate-800 border ${
                      errors.company ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors`}
                    placeholder="예: 삼성전자, 프리랜서, 자영업 등"
                  />
                  {errors.company && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.company}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    직책 {guestEventId && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-slate-800 border ${
                      errors.position ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors`}
                    placeholder="예: 부장, 이사, 대표 등"
                  />
                  {errors.position && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.position}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 등산 정보 */}
            <div>
              <h3 className="text-xl font-bold text-white mb-4 pb-3 border-b border-slate-700">
                등산 정보
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    등산 수준
                  </label>
                  <select
                    name="hikingLevel"
                    value={formData.hikingLevel}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 bg-slate-800 border ${
                      errors.hikingLevel ? 'border-red-500' : 'border-slate-700'
                    } rounded-xl text-white focus:outline-none focus:border-emerald-500 transition-colors`}
                  >
                    <option value="">선택하세요</option>
                    <option value="beginner">초급 (등산 경험 1년 미만)</option>
                    <option value="intermediate">중급 (등산 경험 1-3년)</option>
                    <option value="advanced">고급 (등산 경험 3년 이상)</option>
                  </select>
                  {errors.hikingLevel && (
                    <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.hikingLevel}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <label className="block text-white font-semibold mb-2 text-sm">
                    추천인 (선택)
                  </label>
                  <input
                    type="text"
                    name="referredBy"
                    value={formData.referredBy}
                    onChange={handleChange}
                    onFocus={() => setShowReferrerSuggestions(true)}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="추천해주신 회원의 이름을 입력해주세요"
                    autoComplete="off"
                  />
                  <p className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    추천인이 있으신 경우 반드시 입력해주세요.
                  </p>

                  {showReferrerSuggestions && referrerSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2">
                        <p className="text-xs text-slate-500 px-3 py-1.5">검색 결과 ({referrerSuggestions.length}명)</p>
                        {referrerSuggestions.map(member => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, referredBy: member.name }));
                              setShowReferrerSuggestions(false);
                            }}
                            className="w-full p-2.5 rounded-lg hover:bg-slate-700 transition-colors text-left flex items-center gap-2.5"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold flex-shrink-0 text-xs">
                              {member.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white text-sm truncate">{maskReferrerName(member.name)}</p>
                              {member.company && (
                                <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                                  <Building2 className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{maskReferrerCompany(member.company)}</span>
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2 text-sm">
                    가입 인사 (선택)
                  </label>
                  <textarea
                    name="applicationMessage"
                    value={formData.applicationMessage}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                    placeholder="시애라 클럽에 가입하고 싶은 이유나 각오를 자유롭게 적어주세요"
                  />
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-6 py-4 bg-slate-800 text-white rounded-xl font-bold text-center hover:bg-slate-700 transition-all border border-slate-700"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-emerald-500"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    {guestEventId ? '게스트 산행 신청 완료' : '가입 신청 완료'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteGoogleProfile;
