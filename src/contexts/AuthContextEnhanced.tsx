/**
 * Enhanced Auth Context with Firebase Integration
 * Firebase Auth와 통합된 인증 컨텍스트
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo, useCallback } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { User, RegisterData } from '../types';
import { userStorage } from '../utils/storage';
import { signIn as firebaseSignIn, signUp, signOut as firebaseSignOut, onAuthChange, signInWithGoogle as firebaseSignInWithGoogle, handleGoogleRedirectResult, setupRecaptcha, sendPhoneVerificationCode, verifyPhoneCode as firebaseVerifyPhoneCode, cleanupRecaptcha } from '../lib/firebase/auth';
import { getDocument, setDocument, updateDocument, queryDocuments, deleteDocument } from '../lib/firebase/firestore';
import { logError, ErrorCategory, ErrorLevel } from '../utils/errorHandler';
import { recordLoginHistory } from '../utils/loginHistory';
import { TIMING, SUPER_ADMIN_EMAILS } from '../constants';

// Google 로그인 결과 타입
interface GoogleLoginResult {
  success: boolean;
  isNewUser?: boolean;
  isPendingUser?: boolean;
  needsProfile?: boolean;
  matchedRole?: string; // members에서 매칭된 기존 사용자의 role (게스트 재신청 판별용)
  message?: string;
}

// SMS 인증 결과 타입
interface PhoneLoginResult {
  success: boolean;
  isNewUser?: boolean;
  isPendingUser?: boolean;
  needsProfile?: boolean;
  matchedRole?: string; // members에서 매칭된 기존 사용자의 role (게스트 재신청 판별용)
  matchedMember?: {
    name: string;
    position?: string;
    company?: string;
    id?: string;
  };
  message?: string;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<GoogleLoginResult>;
  initPhoneAuth: (buttonId: string) => void;
  sendPhoneCode: (phoneNumber: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneCode: (code: string) => Promise<PhoneLoginResult>;
  logout: () => Promise<void>;
  register: (userData: RegisterData) => Promise<{ success: boolean; message?: string }>;
  updateProfileImage: (imageUrl: string | null) => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** firebaseUser 기반으로 Firestore에서 user 데이터를 강제 재로드 (user가 null이어도 동작) */
  reloadUserFromFirestore: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  /** Google redirect 결과 (모바일): null=미완료/해당없음 */
  googleRedirectResult: GoogleLoginResult | null;
  clearGoogleRedirectResult: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialAuthCheck = useRef(true);
  const [googleRedirectResult, setGoogleRedirectResult] = useState<GoogleLoginResult | null>(null);
  const clearGoogleRedirectResult = useCallback(() => setGoogleRedirectResult(null), []);

  /**
   * 크로스 프로바이더 계정 병합
   * 기존 회원 데이터를 새 Auth UID로 이전하고 관련 데이터를 마이그레이션
   */
  const mergeAccounts = useCallback(async (oldMemberId: string, newUid: string) => {
    console.log(`🔗 계정 통합 시작: ${oldMemberId} → ${newUid}`);
    
    const relatedCollections = [
      { name: 'executives', fields: ['memberId'] },
      { name: 'participations', fields: ['userId'] },
      { name: 'attendances', fields: ['memberId'] },
      { name: 'payments', fields: ['userId', 'memberId'] },
      { name: 'hikingHistory', fields: ['memberId', 'userId'] },
    ];
    
    for (const col of relatedCollections) {
      for (const field of col.fields) {
        try {
          const refs = await queryDocuments<any>(col.name, [
            { field, operator: '==', value: oldMemberId }
          ]);
          if (refs.success && refs.data) {
            for (const doc of refs.data) {
              // 마이그레이션 전 중복 체크: 같은 이벤트에 newUid로 이미 레코드가 있으면 old 삭제
              if (col.name === 'participations' && doc.eventId) {
                const existing = await queryDocuments<any>('participations', [
                  { field: 'userId', operator: '==', value: newUid },
                  { field: 'eventId', operator: '==', value: doc.eventId },
                ]);
                if (existing.success && existing.data && existing.data.length > 0) {
                  await deleteDocument('participations', doc.id);
                  console.log(`  🗑️ participations 중복 제거: ${doc.id} (${doc.eventId})`);
                  continue;
                }
              }
              if (col.name === 'payments' && doc.eventId) {
                const existing = await queryDocuments<any>('payments', [
                  { field: 'userId', operator: '==', value: newUid },
                  { field: 'eventId', operator: '==', value: doc.eventId },
                ]);
                if (existing.success && existing.data && existing.data.length > 0) {
                  await deleteDocument('payments', doc.id);
                  console.log(`  🗑️ payments 중복 제거: ${doc.id} (${doc.eventId})`);
                  continue;
                }
              }
              await updateDocument(col.name, doc.id, { [field]: newUid });
            }
            if (refs.data.length > 0) {
              console.log(`  ✅ ${col.name}.${field}: ${refs.data.length}건 처리`);
            }
          }
        } catch (migErr) {
          console.warn(`  ⚠️ ${col.name}.${field} 마이그레이션 실패:`, migErr);
        }
      }
    }
    
    // 기존 문서 비활성화 (mergedInto 표시)
    try {
      await updateDocument('members', oldMemberId, {
        isActive: false,
        mergedInto: newUid,
        mergedAt: new Date().toISOString(),
      });
      console.log(`  ✅ 기존 문서 비활성화 (mergedInto: ${newUid})`);
    } catch (err) {
      console.warn('  ⚠️ 기존 문서 비활성화 실패:', err);
      if (oldMemberId.startsWith('pre_')) {
        try {
          await deleteDocument('members', oldMemberId);
          console.log(`  🗑️ pre_ 문서 삭제 완료: ${oldMemberId}`);
        } catch (delErr) {
          console.warn('  ⚠️ pre_ 문서 삭제도 실패:', delErr);
        }
      }
    }
    
    // preRegisteredMembers 머지 마킹
    if (oldMemberId.startsWith('pre_')) {
      try {
        await updateDocument('preRegisteredMembers', oldMemberId, {
          isMergedIntoCurrentUser: true,
          mergedInto: newUid,
          mergedAt: new Date().toISOString(),
        });
        console.log(`  ✅ preRegisteredMembers 머지 마킹 완료`);
      } catch {
        // preRegisteredMembers에 문서가 없을 수 있음
      }
    }
    
    console.log(`🔗 계정 통합 완료: ${oldMemberId} → ${newUid}`);
  }, []);

  /**
   * Firestore에서 사용자 정보 가져오기
   */
  const fetchUserFromFirestore = useCallback(async (uid: string, email?: string): Promise<User | null> => {
    try {
      // 1차: members 컬렉션에서 uid로 조회 (승인된 회원)
      const result = await getDocument<User>('members', uid);
      
      if (result.success && result.data) {
        if ((result.data as any).mergedInto) {
          console.log('ℹ️ 병합된 계정 발견, 새 계정으로 연결 필요:', (result.data as any).mergedInto);
        } else {
          // 동일 전화번호의 pre_ 중복 문서 자동 정리
          const phone = (result.data as any).phoneNumber?.replace(/[-\s]/g, '');
          if (phone && !uid.startsWith('pre_')) {
            try {
              const dupResult = await queryDocuments<any>('members', [
                { field: 'phoneNumber', operator: '==', value: phone }
              ]);
              if (dupResult.success && dupResult.data) {
                const preDups = dupResult.data.filter(
                  (m: any) => m.id !== uid && m.id.startsWith('pre_') && !m.mergedInto
                );
                for (const dup of preDups) {
                  await mergeAccounts(dup.id, uid);
                  console.log(`🧹 로그인 시 pre_ 중복 자동 정리: ${dup.id} → ${uid}`);
                }
              }
            } catch (cleanupErr) {
              console.warn('⚠️ pre_ 중복 정리 실패:', cleanupErr);
            }
          }
          return result.data;
        }
      }
      
      // 2차: 이메일로 members 컬렉션 조회 (다른 인증 방식으로 가입한 경우 uid가 다를 수 있음)
      if (email) {
        const emailResult = await queryDocuments<User>('members', [
          { field: 'email', operator: '==', value: email }
        ]);
        
        if (emailResult.success && emailResult.data && emailResult.data.length > 0) {
          // 병합되지 않은 활성 회원만 필터링
          const activeMembers = emailResult.data.filter((m: any) => !m.mergedInto);
          
          if (activeMembers.length > 0) {
            const memberByEmail = activeMembers[0];
            console.log('📧 이메일로 기존 회원 발견:', memberByEmail.email, '(uid 불일치, 이메일 기반 매칭)');
            
            try {
              const memberData = { ...memberByEmail, id: uid };
              await setDocument('members', uid, memberData);
              console.log('✅ 현재 Auth uid로 member 문서 복제 완료:', uid);
              
              // 기존 문서와 UID가 다르면 계정 병합
              if (memberByEmail.id && memberByEmail.id !== uid) {
                await mergeAccounts(memberByEmail.id, uid);
              }
            } catch (copyErr) {
              console.warn('⚠️ member 문서 복제 실패:', copyErr);
            }
            
            return { ...memberByEmail, id: uid };
          }
        }
      }
      
      // 3차: pendingUsers 컬렉션에서 조회 (가입 대기 중인 사용자)
      const pendingResult = await getDocument<any>('pendingUsers', uid);
      
      if (pendingResult.success && pendingResult.data) {
        const pending = pendingResult.data;
        console.log('📋 pendingUsers에서 대기 중인 사용자 발견:', pending.email);
        
        const pendingUser: User = {
          id: uid,
          name: pending.name || '',
          email: pending.email || '',
          phoneNumber: pending.phoneNumber || '',
          gender: pending.gender || '',
          birthYear: pending.birthYear || '',
          company: pending.company || '',
          position: pending.position || '',
          role: 'guest',
          isApproved: false,
          joinDate: pending.appliedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        };
        
        return pendingUser;
      }
      
      return null;
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { uid });
      return null;
    }
  }, [mergeAccounts]);

  // Google redirect 결과 처리 (모바일에서 signInWithRedirect 후 돌아왔을 때)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await handleGoogleRedirectResult();
        if (cancelled || !result) return;

        if (result.success && result.user) {
          setFirebaseUser(result.user);
          const userData = await fetchUserFromFirestore(result.user.uid, result.user.email || undefined);

          if (userData) {
            setUser(userData);
            userStorage.set(userData);
            if (userData.isApproved) {
              await recordLoginHistory(
                userData.id,
                userData.name || result.user.displayName || 'Unknown',
                userData.email,
                'google'
              );
            }
            setGoogleRedirectResult({ success: true, isNewUser: false, matchedRole: userData.role });
          } else {
            const pendingResult = await getDocument<any>('pendingUsers', result.user.uid);
            if (pendingResult.success && pendingResult.data) {
              const pending = pendingResult.data;
              const pendingUser: User = {
                id: result.user.uid,
                name: pending.name || '',
                email: pending.email || result.user.email || '',
                phoneNumber: pending.phoneNumber || '',
                gender: pending.gender || '',
                birthYear: pending.birthYear || '',
                company: pending.company || '',
                position: pending.position || '',
                role: 'guest',
                isApproved: false,
                joinDate: pending.appliedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
              };
              setUser(pendingUser);
              userStorage.set(pendingUser);
              setGoogleRedirectResult({ success: true, isNewUser: false, isPendingUser: true });
            } else {
              setGoogleRedirectResult({ success: true, isNewUser: true, needsProfile: true });
            }
          }
        }
      } catch (err) {
        console.error('Google redirect 처리 오류:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchUserFromFirestore]);

  /**
   * Firebase Auth 상태 변경 리스너
   *
   * - onAuthStateChanged 단일 리스너로 인증 상태 처리
   * - 초기 로드 시에만 isLoading=true를 설정하여 모바일 빈 화면 방지
   * - 이후 auth 변경(로그인/로그아웃)은 각 함수가 직접 상태를 관리
   */
  useEffect(() => {
    // 안전 타임아웃: 초기 인증 확인이 지연될 경우 강제 로딩 해제
    const safetyTimeout = setTimeout(() => {
      if (isInitialAuthCheck.current) {
        console.warn('⚠️ Auth 초기화 타임아웃 - 로딩 강제 해제');
        setIsLoading(false);
        isInitialAuthCheck.current = false;
      }
    }, TIMING.AUTH_INIT_TIMEOUT);

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      // 초기 인증 확인 시에만 로딩 표시 (앱 첫 로드 시)
      // 이후 auth 상태 변경(로그인/로그아웃)에서는 로딩 표시하지 않음
      const isInitial = isInitialAuthCheck.current;
      if (isInitial) {
        setIsLoading(true);
      }
      
      try {
        if (firebaseUser) {
          setFirebaseUser(firebaseUser);
          
          const userData = await fetchUserFromFirestore(firebaseUser.uid, firebaseUser.email || undefined);
          
          if (userData) {
            setUser(userData);
            userStorage.set(userData);
          } else {
            // Firestore에 사용자 데이터가 없는 경우
            const isSuperAdmin = firebaseUser.email && SUPER_ADMIN_EMAILS.includes(firebaseUser.email);
            
            if (isSuperAdmin) {
              // 슈퍼 관리자는 자동으로 계정 복구
              const newUser: User = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                role: 'admin',
                isApproved: true,
                joinDate: new Date().toISOString().split('T')[0],
              };
              
              await setDocument('members', firebaseUser.uid, {
                ...newUser,
                authProvider: 'google',
                profileImage: firebaseUser.photoURL || '',
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              console.log('✅ 슈퍼 관리자 계정 자동 복구:', firebaseUser.email);
              
              setUser(newUser);
              userStorage.set(newUser);
            }
            // 비슈퍼 관리자: Firestore에 데이터가 없으면 user를 설정하지 않음
          }
        } else {
          setFirebaseUser(null);
          setUser(null);
          userStorage.remove();
        }
      } catch (err) {
        console.error('❌ Auth 상태 변경 처리 중 오류:', err);
      } finally {
        setIsLoading(false);
        isInitialAuthCheck.current = false;
      }
    });
    
    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, [fetchUserFromFirestore]);

  /**
   * 로그인
   */
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await firebaseSignIn(email, password);

      if (result.success && result.user) {
        // Firebase Auth 상태 변경을 기다림
        // onAuthChange가 사용자 정보를 설정할 때까지 대기
        await new Promise<void>((resolve) => {
          const checkUser = setInterval(() => {
            if (user !== null) {
              clearInterval(checkUser);
              resolve();
            }
          }, 100);
          
          // 5초 타임아웃
          setTimeout(() => {
            clearInterval(checkUser);
            resolve();
          }, 5000);
        });
        
        // 로그인 이력 기록
        if (user) {
          await recordLoginHistory(
            user.id,
            user.name || 'Unknown',
            user.email,
            'email'
          );
        }
        
        return true;
      }

      setError(result.error || '로그인에 실패했습니다.');
      return false;
    } catch (err: any) {
      const errorMessage = err.message || '로그인 중 오류가 발생했습니다.';
      setError(errorMessage);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH, { email });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /**
   * 로그아웃
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await firebaseSignOut();
      setUser(null);
      setFirebaseUser(null);
      userStorage.remove();
    } catch (err: any) {
      const errorMessage = err.message || '로그아웃 중 오류가 발생했습니다.';
      setError(errorMessage);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH);
      throw err;
    }
  }, []);

  /**
   * 구글 로그인 (팝업 방식 - 결과 즉시 반환)
   * signInWithPopup 앞에 비동기 호출이 없어야 팝업 차단 방지됨
   */
  const loginWithGoogle = useCallback(async (): Promise<GoogleLoginResult> => {
    try {
      setError(null);
      // 주의: setIsLoading(true)를 여기서 호출하면 리렌더링이 발생하지만
      // signInWithPopup은 firebaseSignInWithGoogle 내부에서 동기적으로 호출되므로 문제없음
      
      const result = await firebaseSignInWithGoogle();

      if (!result.success || !result.user) {
        return { success: false, message: 'Google 로그인에 실패했습니다.' };
      }

      // 즉시 firebaseUser 상태 설정 (onAuthStateChanged 완료 전에 상태 반영)
      setFirebaseUser(result.user);

      // Firestore에서 사용자 확인
      let existingUser = await fetchUserFromFirestore(result.user.uid, result.user.email || undefined);
      
      // 슈퍼 관리자인데 Firestore에 문서가 없으면 자동 생성
      if (!existingUser && result.user.email && SUPER_ADMIN_EMAILS.includes(result.user.email)) {
        const adminUser = {
          id: result.user.uid,
          name: result.user.displayName || '',
          email: result.user.email,
          role: 'admin' as const,
          isApproved: true,
          isActive: true,
          joinDate: new Date().toISOString().split('T')[0],
          authProvider: 'google',
          profileImage: result.user.photoURL || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDocument('members', result.user.uid, adminUser);
        console.log('✅ 슈퍼 관리자 계정 자동 복구 (Google 로그인):', result.user.email);
        existingUser = adminUser as any;
      }

      if (existingUser) {
        // 네비게이션 전에 user 상태를 직접 설정 (onAuthStateChanged 완료를 기다리지 않음)
        setUser(existingUser);
        userStorage.set(existingUser);

        if (existingUser.isApproved) {
          await recordLoginHistory(
            existingUser.id,
            existingUser.name || result.user.displayName || 'Unknown',
            existingUser.email,
            'google'
          );
        }
        return { success: true, isNewUser: false, matchedRole: existingUser.role };
      }

      // pendingUsers 확인
      const pendingResult = await getDocument<any>('pendingUsers', result.user.uid);
      if (pendingResult.success && pendingResult.data) {
        // pendingUser 데이터로 User 객체 생성하여 즉시 상태 설정
        const pending = pendingResult.data;
        const pendingUser: User = {
          id: result.user.uid,
          name: pending.name || '',
          email: pending.email || result.user.email || '',
          phoneNumber: pending.phoneNumber || '',
          gender: pending.gender || '',
          birthYear: pending.birthYear || '',
          company: pending.company || '',
          position: pending.position || '',
          role: 'guest',
          isApproved: false,
          joinDate: pending.appliedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setUser(pendingUser);
        userStorage.set(pendingUser);
        return { success: true, isNewUser: false, isPendingUser: true };
      }

      // 완전히 새로운 사용자
      return { success: true, isNewUser: true, needsProfile: true };
    } catch (err: any) {
      // 사용자가 팝업을 닫은 경우
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return { success: false, message: '로그인이 취소되었습니다.' };
      }
      
      const errorMessage = err.message || 'Google 로그인 중 오류가 발생했습니다.';
      console.error('Google 로그인 에러:', err);
      setError(errorMessage);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH);
      return { success: false, message: errorMessage };
    }
  }, [fetchUserFromFirestore]);

  /**
   * SMS 인증 초기화 (reCAPTCHA 설정)
   */
  const initPhoneAuth = useCallback((buttonId: string) => {
    try {
      setupRecaptcha(buttonId);
      console.log('✅ SMS 인증 reCAPTCHA 초기화 완료');
    } catch (err: any) {
      console.error('❌ reCAPTCHA 초기화 실패:', err);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH);
    }
  }, []);

  /**
   * SMS 인증코드 전송
   * @param phoneNumber - 전화번호 (010-1234-5678 또는 01012345678 형식 → +821012345678로 변환)
   */
  const sendPhoneCode = useCallback(async (phoneNumber: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      
      // 한국 전화번호 포맷 변환: 하이픈 제거 후 +82 추가
      let formattedNumber = phoneNumber.replace(/[-\s]/g, '');
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '+82' + formattedNumber.substring(1);
      } else if (!formattedNumber.startsWith('+')) {
        formattedNumber = '+82' + formattedNumber;
      }
      
      console.log('📱 SMS 인증코드 전송:', formattedNumber);
      const result = await sendPhoneVerificationCode(formattedNumber);
      return result;
    } catch (err: any) {
      console.error('❌ SMS 전송 에러:', err);
      setError(err.message);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH);
      return { success: false, error: err.message || 'SMS 전송에 실패했습니다.' };
    }
  }, []);

  /**
   * SMS 인증코드 확인 및 로그인
   * 1) Firebase Phone Auth로 인증
   * 2) Firestore members에서 전화번호로 사전등록 회원 매칭
   * 3) preRegisteredMembers 컬렉션에서도 매칭 시도
   */
  const verifyPhoneCode = useCallback(async (code: string): Promise<PhoneLoginResult> => {
    try {
      setError(null);
      
      const result = await firebaseVerifyPhoneCode(code);
      
      if (!result.success || !result.user) {
        return { success: false, message: result.error || '인증에 실패했습니다.' };
      }

      const phoneUser = result.user;
      const phoneNumber = phoneUser.phoneNumber || '';
      
      // 즉시 firebaseUser 상태 설정 (onAuthStateChanged 완료 전에 상태 반영)
      setFirebaseUser(phoneUser);
      
      // 1차: 기존 members에서 UID로 매칭 (이미 승인된 회원)
      const existingUser = await fetchUserFromFirestore(phoneUser.uid, undefined);
      if (existingUser) {
        // 네비게이션 전에 user 상태를 직접 설정
        setUser(existingUser);
        userStorage.set(existingUser);
        
        if (existingUser.isApproved) {
          await recordLoginHistory(
            existingUser.id,
            existingUser.name || 'Unknown',
            existingUser.email,
            'phone'
          );
        }
        return { success: true, isNewUser: false, matchedRole: existingUser.role };
      }

      // 2차: members 컬렉션에서 전화번호로 매칭 (사전등록 또는 다른 프로바이더로 가입한 경우)
      if (phoneNumber) {
        const domesticNumber = phoneNumber.startsWith('+82') 
          ? '0' + phoneNumber.substring(3) 
          : phoneNumber;
        const hyphenNumber = domesticNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        
        for (const searchNumber of [phoneNumber, domesticNumber, hyphenNumber]) {
          const phoneResult = await queryDocuments<User>('members', [
            { field: 'phoneNumber', operator: '==', value: searchNumber }
          ]);
          
          if (phoneResult.success && phoneResult.data && phoneResult.data.length > 0) {
            // 병합되지 않은 활성 회원만 필터링
            const activeMembers = phoneResult.data.filter((m: any) => !m.mergedInto);
            if (activeMembers.length === 0) continue;
            
            const matchedMember = activeMembers[0];
            console.log('📱 전화번호로 기존 회원 매칭:', matchedMember.name);
            
            const existingProvider = (matchedMember as any).authProvider;
            const isCrossProvider = matchedMember.id && matchedMember.id !== phoneUser.uid && !matchedMember.id.startsWith('pre_');
            
            if (isCrossProvider) {
              console.log(`🔗 크로스 프로바이더 감지: 기존 ${existingProvider} → 현재 phone`);
            }
            
            const updatedMemberData: User = { 
              ...matchedMember, 
              id: phoneUser.uid, 
              phoneNumber: domesticNumber,
            };
            
            try {
              await setDocument('members', phoneUser.uid, {
                ...updatedMemberData,
                authProvider: 'phone',
                updatedAt: new Date().toISOString(),
              });
              console.log('✅ Phone Auth uid로 member 문서 복제 완료');
              
              // 기존 문서와 UID가 다르면 계정 병합 (pre_ 및 크로스 프로바이더 모두 처리)
              if (matchedMember.id && matchedMember.id !== phoneUser.uid) {
                await mergeAccounts(matchedMember.id, phoneUser.uid);
              }
            } catch (copyErr) {
              console.warn('⚠️ member 문서 복제 실패:', copyErr);
            }
            
            setUser(updatedMemberData);
            userStorage.set(updatedMemberData);
            
            if (matchedMember.isApproved) {
              await recordLoginHistory(
                phoneUser.uid,
                matchedMember.name || 'Unknown',
                matchedMember.email,
                'phone'
              );
            }
            return {
              success: true,
              isNewUser: false,
              matchedRole: matchedMember.role,
              matchedMember: {
                name: matchedMember.name,
                position: matchedMember.position,
                company: matchedMember.company,
                id: matchedMember.id,
              }
            };
          }
        }
      }

      // 3차: preRegisteredMembers 컬렉션에서 전화번호로 매칭 (관리자가 사전등록한 회원)
      if (phoneNumber) {
        const domesticNumber = phoneNumber.startsWith('+82') 
          ? '0' + phoneNumber.substring(3) 
          : phoneNumber;
        const hyphenNumber = domesticNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        
        for (const searchNumber of [phoneNumber, domesticNumber, hyphenNumber]) {
          const preRegResult = await queryDocuments<any>('preRegisteredMembers', [
            { field: 'phoneNumber', operator: '==', value: searchNumber }
          ]);
          
          if (preRegResult.success && preRegResult.data && preRegResult.data.length > 0) {
            const preRegMember = preRegResult.data[0];
            console.log('📋 사전등록 회원 매칭:', preRegMember.name);
            
            // 사전등록 정보로 members에 등록
            const newMemberData: User = {
              id: phoneUser.uid,
              name: preRegMember.name,
              email: phoneUser.email || '',
              phoneNumber: domesticNumber,
              gender: preRegMember.gender || '',
              birthYear: preRegMember.birthYear || '',
              company: preRegMember.company || '',
              position: preRegMember.position || '',
              role: preRegMember.role || 'member',
              isApproved: preRegMember.isApproved !== undefined ? preRegMember.isApproved : true,
              joinDate: new Date().toISOString().split('T')[0],
            };
            
            await setDocument('members', phoneUser.uid, {
              ...newMemberData,
              authProvider: 'phone',
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            
            // 사전등록 데이터에 매칭 완료 표시
            if (preRegMember.id) {
              await updateDocument('preRegisteredMembers', preRegMember.id, {
                matched: true,
                matchedUid: phoneUser.uid,
                matchedAt: new Date().toISOString(),
              });
            }
            
            // 네비게이션 전에 user 상태를 직접 설정
            setUser(newMemberData);
            userStorage.set(newMemberData);
            
            if (newMemberData.isApproved) {
              await recordLoginHistory(
                phoneUser.uid,
                preRegMember.name || 'Unknown',
                '',
                'phone'
              );
            }
            
            return { 
              success: true, 
              isNewUser: false,
              matchedMember: {
                name: preRegMember.name,
                position: preRegMember.position,
                company: preRegMember.company,
              }
            };
          }
        }
      }

      // 4차: pendingUsers 확인
      const pendingResult = await getDocument<any>('pendingUsers', phoneUser.uid);
      if (pendingResult.success && pendingResult.data) {
        // pendingUser 데이터로 User 객체 생성하여 즉시 상태 설정
        const pending = pendingResult.data;
        const pendingUser: User = {
          id: phoneUser.uid,
          name: pending.name || '',
          email: pending.email || phoneUser.email || '',
          phoneNumber: pending.phoneNumber || phoneNumber || '',
          gender: pending.gender || '',
          birthYear: pending.birthYear || '',
          company: pending.company || '',
          position: pending.position || '',
          role: 'guest',
          isApproved: false,
          joinDate: pending.appliedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        };
        setUser(pendingUser);
        userStorage.set(pendingUser);
        return { success: true, isNewUser: false, isPendingUser: true };
      }
      
      // 완전히 새로운 사용자 (사전등록 정보 없음)
      return { success: true, isNewUser: true, needsProfile: true };
    } catch (err: any) {
      console.error('❌ SMS 인증 확인 에러:', err);
      setError(err.message);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH);
      return { success: false, message: err.message || '인증 확인 중 오류가 발생했습니다.' };
    }
  }, [fetchUserFromFirestore]);

  /**
   * 회원가입
   */
  const register = useCallback(async (userData: RegisterData): Promise<{ success: boolean; message?: string }> => {
    try {
      setError(null);
      setIsLoading(true);

      console.log('🚀 회원가입 시작:', {
        email: userData.email,
        name: userData.name,
      });

      // Firebase Auth 회원가입
      const result = await signUp(userData.email, userData.password, userData.name);

      if (!result.success || !result.user) {
        console.error('❌ Firebase Auth 회원가입 실패:', result.error);
        return {
          success: false,
          message: result.error || '회원가입에 실패했습니다.',
        };
      }

      // members 컬렉션에 정회원으로 자동 승인하여 직접 저장
      const memberData = {
        id: result.user.uid,
        name: userData.name,
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        gender: userData.gender,
        birthYear: userData.birthYear,
        company: userData.company,
        position: userData.position,
        referredBy: userData.referredBy,
        hikingLevel: userData.hikingLevel,
        applicationMessage: userData.applicationMessage,
        role: 'member' as const,
        isApproved: true,
        isActive: true,
        joinDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const memberResult = await setDocument('members', result.user.uid, memberData);

      if (!memberResult.success) {
        console.error('❌ members 저장 실패:', memberResult.error);
        return {
          success: false,
          message: `회원가입 정보 저장에 실패했습니다.\n오류: ${memberResult.error}`,
        };
      }

      return {
        success: true,
        message: '회원가입이 완료되었습니다. 바로 산행 신청이 가능합니다.',
      };
    } catch (err: any) {
      const errorMessage = err.message || '회원가입 중 오류가 발생했습니다.';
      console.error('❌ 회원가입 에러:', err);
      setError(errorMessage);
      logError(err, ErrorLevel.ERROR, ErrorCategory.AUTH, { email: userData.email });
      return {
        success: false,
        message: errorMessage,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 프로필 이미지 업데이트
   */
  const updateProfileImage = useCallback(async (imageUrl: string | null): Promise<void> => {
    if (!user) return;

    try {
      const updates = { profileImage: imageUrl || undefined };
      
      await updateDocument('members', user.id, updates);
      
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      userStorage.set(updatedUser);
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { userId: user.id });
      throw err;
    }
  }, [user]);

  /**
   * 사용자 정보 업데이트
   */
  const updateUser = useCallback(async (userData: Partial<User>): Promise<void> => {
    if (!user) {
      console.error('❌ updateUser 실패: user가 없습니다.');
      throw new Error('로그인이 필요합니다.');
    }

    console.log('📝 사용자 정보 업데이트 시작:', {
      userId: user.id,
      updateData: userData,
    });

    try {
      const result = await updateDocument('members', user.id, userData);
      
      if (!result.success) {
        console.error('❌ Firestore 업데이트 실패:', result.error);
        throw new Error(result.error || '업데이트에 실패했습니다.');
      }
      
      console.log('✅ Firestore 업데이트 성공');
      
      const updatedUser = { ...user, ...userData };
      setUser(updatedUser);
      userStorage.set(updatedUser);
      
      console.log('✅ 로컬 상태 업데이트 완료');
    } catch (err: any) {
      console.error('❌ updateUser 에러:', err);
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { userId: user.id });
      throw err;
    }
  }, [user]);

  /**
   * 사용자 정보 새로고침
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    if (!user) return;

    try {
      const userData = await fetchUserFromFirestore(user.id, user.email || undefined);
      if (userData) {
        setUser(userData);
        userStorage.set(userData);
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { userId: user.id });
    }
  }, [user, fetchUserFromFirestore]);

  /**
   * firebaseUser 기반으로 Firestore에서 user 데이터를 강제 재로드
   * - user가 null이어도 동작 (CompleteGoogleProfile 등에서 프로필 저장 직후 사용)
   */
  const reloadUserFromFirestore = useCallback(async (): Promise<void> => {
    if (!firebaseUser) return;

    try {
      const userData = await fetchUserFromFirestore(firebaseUser.uid, firebaseUser.email || undefined);
      if (userData) {
        setUser(userData);
        userStorage.set(userData);
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { uid: firebaseUser.uid });
    }
  }, [firebaseUser, fetchUserFromFirestore]);

  /**
   * Memoized values
   */
  const isAuthenticated = useMemo(() => !!user && !!firebaseUser, [user, firebaseUser]);
  const isAdmin = useMemo(() => 
    user?.role === 'chairman' || 
    user?.role === 'committee' || 
    (user?.email && SUPER_ADMIN_EMAILS.includes(user.email))
  , [user]);

  /**
   * Context value
   */
  const value = useMemo<AuthContextType>(
    () => ({
      user,
      firebaseUser,
      login,
      loginWithGoogle,
      initPhoneAuth,
      sendPhoneCode,
      verifyPhoneCode,
      logout,
      register,
      updateProfileImage,
      updateUser,
      refreshUser,
      reloadUserFromFirestore,
      isAuthenticated,
      isAdmin,
      isLoading,
      error,
      googleRedirectResult,
      clearGoogleRedirectResult,
    }),
    [
      user,
      firebaseUser,
      login,
      loginWithGoogle,
      initPhoneAuth,
      sendPhoneCode,
      verifyPhoneCode,
      logout,
      register,
      updateProfileImage,
      updateUser,
      refreshUser,
      reloadUserFromFirestore,
      isAuthenticated,
      isAdmin,
      isLoading,
      error,
      googleRedirectResult,
      clearGoogleRedirectResult,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
