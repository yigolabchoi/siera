import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import {
  Mountain, ArrowLeft, Clock, AlertCircle, Calendar, CheckCircle,
  Copy, Check, Loader2, ArrowRight, ChevronRight, Users, Smartphone, Shield,
  XCircle, UserX,
} from 'lucide-react';
import { formatDeadline, getDaysUntilDeadline, isApplicationClosed, formatDate } from '../utils/format';
import { useEvents } from '../contexts/EventContext';
import { useParticipations } from '../contexts/ParticipationContext';
import { useGuestApplications } from '../contexts/GuestApplicationContext';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { isInAppBrowser, openInExternalBrowser } from '../utils/browserDetect';
import { cleanupRecaptcha } from '../lib/firebase/auth';
import { GoogleIcon } from '../components/icons/SocialIcons';
import Modal from '../components/ui/Modal';
import SEOHead from '../components/SEOHead';
import { useLoadingSafetyTimeout } from '../hooks/useLoadingSafetyTimeout';

/**
 * 게스트 산행 신청 페이지
 *
 * 프로세스 (인증 기반 → 정회원 전환 시 이력 연동):
 *   Step 1 'intro'    → 산행 정보 확인 + Google/SMS 인증
 *   Step 2 (외부)     → /complete-profile 에서 추가 정보 입력 (기존 폼 재활용)
 *   Step 3 'complete' → 신청 완료 + 입금 안내
 *
 * ※ 추가정보 입력 페이지(CompleteGoogleProfile)와 동일한 폼 사용으로 데이터 일관성 보장
 */
type PageStep = 'intro' | 'complete' | 'cancel-confirm' | 'cancel-complete';

const GuestApplication = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { events, isLoading: eventsLoading } = useEvents();
  const { addParticipation, participations, deleteParticipation } = useParticipations();
  const { addGuestApplication, guestApplications, rejectGuestApplication } = useGuestApplications();
  const {
    firebaseUser, user,
    loginWithGoogle, initPhoneAuth, sendPhoneCode, verifyPhoneCode,
    isLoading: authLoading,
    googleRedirectResult, clearGoogleRedirectResult,
  } = useAuth();

  // URL 파라미터 또는 location.state에서 complete step 초기화
  // (CompleteGoogleProfile에서 돌아온 경우)
  const urlStep = searchParams.get('step');
  const urlEventId = searchParams.get('event');
  const urlName = searchParams.get('name');
  const isCompleteFromUrl = urlStep === 'complete';
  const isCompleteFromState = location.state?.step === 'complete';

  const [step, setStep] = useState<PageStep>(
    (isCompleteFromUrl || isCompleteFromState) ? 'complete' : 'intro'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  // 취소 모드
  const [mode, setMode] = useState<'apply' | 'cancel'>(
    searchParams.get('mode') === 'cancel' ? 'cancel' : 'apply'
  );
  const [guestParticipation, setGuestParticipation] = useState<any>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [appliedName, setAppliedName] = useState(
    urlName || location.state?.appliedName || ''
  );
  const [authError, setAuthError] = useState('');

  // Google 로그인 상태
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);

  // SMS 인증 상태
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsPhoneNumber, setSmsPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [smsSuccess, setSmsSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  const recaptchaInitialized = useRef(false);

  // 인앱 브라우저 감지
  const [isInApp, setIsInApp] = useState(false);

  // 대기중인 사용자 자동 신청 플래그
  const [waitingForAutoApply, setWaitingForAutoApply] = useState(false);
  const autoApplyInProgress = useRef(false);

  const loadingTimedOut = useLoadingSafetyTimeout(undefined, 'GuestApplication');

  // 인앱 브라우저 감지
  useEffect(() => {
    setIsInApp(isInAppBrowser());
  }, []);

  // 페이지 로드 시 맨 위로 스크롤
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // step 전환 시 맨 위로 스크롤
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // SMS 카운트다운
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // SMS 모달 reCAPTCHA 초기화
  useEffect(() => {
    if (showSmsModal && !recaptchaInitialized.current) {
      const timer = setTimeout(() => {
        initPhoneAuth('guest-sms-send-button');
        recaptchaInitialized.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!showSmsModal) {
      recaptchaInitialized.current = false;
      cleanupRecaptcha();
    }
  }, [showSmsModal, initPhoneAuth]);

  // 신청 가능한 산행 (현재부터 2개월 이내)
  const currentEvent = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const twoMonthsLater = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const availableEvents = events
      .filter((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const isPublished = event.isPublished !== false && event.isDraft !== true;
        const isNotCompleted = event.status !== 'completed';
        const isInDateRange = eventDate >= now && eventDate <= twoMonthsLater;
        return isPublished && isNotCompleted && isInDateRange;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return availableEvents[0] || null;
  }, [events]);

  // complete 페이지에서 사용할 이벤트 (URL 파라미터 / location.state / currentEvent 순서로 조회)
  const completeEvent = useMemo(() => {
    const eventId = urlEventId || location.state?.eventId;
    if (eventId) {
      const found = events.find((e: any) => e.id === eventId);
      if (found) return found;
    }
    return currentEvent;
  }, [urlEventId, location.state?.eventId, events, currentEvent]);

  // Google redirect 결과 처리 (모바일)
  useEffect(() => {
    if (!googleRedirectResult) return;
    clearGoogleRedirectResult();

    if (googleRedirectResult.success) {
      if (!googleRedirectResult.isNewUser && !googleRedirectResult.needsProfile && !googleRedirectResult.isPendingUser) {
        if (mode === 'cancel') {
          navigate('/quick-apply', { replace: true });
        } else {
          navigate('/home/events', { replace: true });
        }
        return;
      }

      if (mode === 'cancel') {
        // 취소 모드: 인증 완료 후 cancel useEffect에서 처리
        return;
      }

      if (googleRedirectResult.isPendingUser) {
        setWaitingForAutoApply(true);
      } else if (currentEvent) {
        navigate(`/complete-profile?guest=${currentEvent.id}`, { replace: true });
      }
    }
  }, [googleRedirectResult, clearGoogleRedirectResult, navigate, currentEvent, mode]);

  const applicationDeadline = currentEvent ? formatDeadline(currentEvent.date, currentEvent.applicationDeadline) : '';
  const daysUntilDeadline = currentEvent ? getDaysUntilDeadline(currentEvent.date, currentEvent.applicationDeadline) : 0;
  const applicationClosed = currentEvent
    ? (currentEvent.status === 'closed' || currentEvent.status === 'ongoing' || currentEvent.status === 'completed')
    : true;

  // 이미 인증된 사용자가 intro 페이지 진입 시 자동 처리 (신청 모드)
  useEffect(() => {
    if (mode === 'cancel') return; // 취소 모드는 별도 처리
    if (authLoading || eventsLoading || step !== 'intro' || isGoogleLoggingIn || showSmsModal) return;
    if (autoApplyInProgress.current) return;
    if (!firebaseUser || !currentEvent) return;

    // 이미 승인된 정회원 → 일반 산행 신청으로 안내
    if (user?.isApproved) {
      navigate('/home/events', { replace: true });
      return;
    }

    // 대기 중인 사용자 (프로필 있음) → 자동 신청
    if (user && !user.isApproved) {
      autoApplyInProgress.current = true;
      handleAutoApply({
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        company: user.company,
        position: user.position,
      });
      return;
    }

    // 신규 사용자 (프로필 없음) → 추가정보 입력 페이지로 이동
    if (!user) {
      navigate(`/complete-profile?guest=${currentEvent.id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, user, authLoading, eventsLoading, step, currentEvent, isGoogleLoggingIn, showSmsModal, mode]);

  // waitingForAutoApply 플래그로 대기 후 자동 신청 (인증 직후, 신청 모드만)
  useEffect(() => {
    if (mode === 'cancel') return;
    if (!waitingForAutoApply || !user || !firebaseUser || !currentEvent || autoApplyInProgress.current) return;
    autoApplyInProgress.current = true;
    handleAutoApply({
      name: user.name,
      phoneNumber: user.phoneNumber,
      email: user.email,
      company: user.company,
      position: user.position,
    });
    setWaitingForAutoApply(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForAutoApply, user, firebaseUser, currentEvent, mode]);

  // 취소 모드: 인증 후 참가 내역 조회
  useEffect(() => {
    if (mode !== 'cancel' || authLoading || eventsLoading || step !== 'intro') return;
    if (isGoogleLoggingIn || showSmsModal) return;
    if (!firebaseUser || !currentEvent) return;

    // 승인된 정회원 → 간편 취소 안내
    if (user?.isApproved) {
      navigate('/quick-apply', { replace: true });
      return;
    }

    // 참가 내역 조회
    const found = participations.find(
      p => p.eventId === currentEvent.id && p.userId === firebaseUser.uid
    );

    setGuestParticipation(found || null);
    setStep('cancel-confirm');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firebaseUser, user, authLoading, eventsLoading, step, currentEvent, participations, isGoogleLoggingIn, showSmsModal]);

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  // 모드 전환
  const handleModeChange = (newMode: 'apply' | 'cancel') => {
    setMode(newMode);
    setStep('intro');
    setAuthError('');
    setGuestParticipation(null);
    setIsCancelling(false);
  };

  // ===== 게스트 산행 취소 처리 =====
  const handleGuestCancel = async () => {
    if (!guestParticipation || isCancelling) return;

    const confirmCancel = window.confirm(
      '산행 신청을 취소하시겠습니까?\n관련된 조편성 및 입금 정보도 함께 삭제됩니다.'
    );
    if (!confirmCancel) return;

    setIsCancelling(true);
    try {
      // 1. 참가 신청 삭제 (결제/조편성 캐스케이드 삭제 포함)
      await deleteParticipation(guestParticipation.id);

      // 2. 게스트 신청 기록 업데이트 (선택적)
      try {
        const guestApp = guestApplications.find(
          app => app.userId === firebaseUser?.uid && app.eventId === currentEvent?.id
        );
        if (guestApp) {
          await rejectGuestApplication(guestApp.id, '본인 취소');
        }
      } catch {
        // 게스트 신청 기록 업데이트 실패는 무시 (참가 취소는 완료)
      }

      setStep('cancel-complete');
    } catch (error) {
      console.error('게스트 산행 취소 실패:', error);
      alert('취소 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsCancelling(false);
    }
  };

  // 전화번호 포맷팅 (SMS 모달용)
  const formatPhoneInput = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return numbers.slice(0, 3) + '-' + numbers.slice(3);
    return numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
  };

  // ===== 기존 프로필 데이터로 자동 게스트 신청 =====
  const handleAutoApply = async (userData: {
    name: string;
    phoneNumber?: string;
    email?: string;
    company?: string;
    position?: string;
  }) => {
    if (!currentEvent || !firebaseUser || isSubmitting) {
      autoApplyInProgress.current = false;
      return;
    }
    if (applicationClosed) {
      alert('신청 기간이 마감되었습니다.');
      autoApplyInProgress.current = false;
      return;
    }

    // 중복 체크 (취소된 참가는 제외 — 재신청 허용)
    const eventParticipations = participations.filter(p => p.eventId === currentEvent.id);
    if (eventParticipations.some(p => p.userId === firebaseUser.uid && p.status !== 'cancelled')) {
      // 이미 신청됨 → 완료 페이지 표시
      setAppliedName(userData.name);
      setStep('complete');
      autoApplyInProgress.current = false;
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. 참여 신청 생성
      await addParticipation({
        eventId: currentEvent.id,
        userId: firebaseUser.uid,
        userName: userData.name,
        userEmail: userData.email || firebaseUser.email || '',
        userPhone: userData.phoneNumber || '',
        userCompany: userData.company || '',
        userPosition: userData.position || '',
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        isGuest: true,
        registeredAt: new Date().toISOString(),
      });

      // 2. 게스트 신청 기록 (관리자 추적용)
      try {
        const email = userData.email || firebaseUser.email;
        const phoneNumber = userData.phoneNumber;
        
        if (!email || !phoneNumber) {
          throw new Error('이메일 또는 전화번호가 없습니다.');
        }
        
        await addGuestApplication({
          userId: firebaseUser.uid,
          name: userData.name,
          email: email,
          phoneNumber: phoneNumber,
          company: userData.company || '',
          position: userData.position || '',
          eventId: currentEvent.id,
          eventTitle: currentEvent.title,
          eventDate: currentEvent.date,
        });
      } catch (guestErr) {
        console.warn('게스트 신청 기록 생성 실패 (참여 신청은 완료):', guestErr);
      }

      setAppliedName(userData.name);
      setStep('complete');
    } catch (error) {
      console.error('게스트 신청 실패:', error);
      alert('신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
      autoApplyInProgress.current = false;
    }
  };

  // ===== Google 로그인 =====
  const handleGoogleLogin = async () => {
    if (isGoogleLoggingIn) return;
    if (isInApp) {
      openInExternalBrowser();
      return;
    }

    setIsGoogleLoggingIn(true);
    setAuthError('');

    try {
      const result = await loginWithGoogle();

      if (result.success) {
        if (!result.isNewUser && !result.needsProfile && !result.isPendingUser) {
          // 이미 승인된 정회원
          if (mode === 'cancel') {
            navigate('/quick-apply', { replace: true });
          } else {
            navigate('/home/events', { replace: true });
          }
          return;
        }

        if (mode === 'cancel') {
          // 취소 모드: 인증 완료 후 cancel useEffect에서 처리
          return;
        }

        if (result.isPendingUser) {
          // 대기 중인 사용자 → 기존 프로필로 자동 신청 (useEffect에서 처리)
          setWaitingForAutoApply(true);
        } else {
          // 신규 사용자 → 추가정보 입력 페이지로 이동
          if (currentEvent) {
            navigate(`/complete-profile?guest=${currentEvent.id}`, { replace: true });
          }
        }
      } else if (result.message && !result.message.includes('취소')) {
        setAuthError(result.message);
      }
    } catch {
      setAuthError('Google 로그인 중 오류가 발생했습니다.');
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  // ===== SMS 인증코드 전송 =====
  const handleSendSms = async () => {
    if (isSendingSms || countdown > 0) return;
    const cleanNumber = smsPhoneNumber.replace(/[-\s]/g, '');
    if (cleanNumber.length < 10) {
      setSmsError('올바른 전화번호를 입력해주세요.');
      return;
    }

    setIsSendingSms(true);
    setSmsError('');
    setSmsSuccess('');

    try {
      if (smsSent) {
        initPhoneAuth('guest-sms-send-button');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const result = await sendPhoneCode(cleanNumber);
      if (result.success) {
        setSmsSent(true);
        setCountdown(180);
        setSmsSuccess('인증코드가 전송되었습니다.\nSMS를 확인해주세요.');
      } else {
        setSmsError(result.error || 'SMS 전송에 실패했습니다.');
      }
    } catch {
      setSmsError('SMS 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingSms(false);
    }
  };

  // ===== SMS 인증코드 확인 =====
  const handleVerifyCode = async () => {
    if (isVerifying || !verificationCode) return;
    if (verificationCode.length !== 6) {
      setSmsError('6자리 인증코드를 입력해주세요.');
      return;
    }

    setIsVerifying(true);
    setSmsError('');
    setSmsSuccess('');

    try {
      const result = await verifyPhoneCode(verificationCode);

      if (result.success) {
        if (result.matchedMember && !result.isPendingUser && !result.isNewUser && !result.needsProfile) {
          // 이미 승인된 정회원
          if (mode === 'cancel') {
            setSmsSuccess(`${result.matchedMember.name}님은 정회원입니다.\n간편 취소를 이용해주세요.`);
            setTimeout(() => {
              setShowSmsModal(false);
              navigate('/quick-apply', { replace: true });
            }, 2000);
          } else {
            setSmsSuccess(`${result.matchedMember.name}님, 이미 회원으로 등록되어 있습니다.`);
            setTimeout(() => {
              setShowSmsModal(false);
              navigate('/home/events', { replace: true });
            }, 2000);
          }
          return;
        }

        if (mode === 'cancel') {
          // 취소 모드: 인증 완료 후 cancel useEffect에서 처리
          setSmsSuccess('인증이 완료되었습니다!');
          setTimeout(() => {
            setShowSmsModal(false);
          }, 1500);
          return;
        }

        if (result.isPendingUser) {
          // 대기 중인 사용자 → 기존 프로필로 자동 신청
          setSmsSuccess('인증이 완료되었습니다!');
          setTimeout(() => {
            setShowSmsModal(false);
            setWaitingForAutoApply(true);
          }, 1500);
        } else {
          // 신규 사용자 → 추가정보 입력 페이지로 이동
          setSmsSuccess('인증이 완료되었습니다!');
          setTimeout(() => {
            setShowSmsModal(false);
            if (currentEvent) {
              navigate(`/complete-profile?guest=${currentEvent.id}`, { replace: true });
            }
          }, 1500);
        }
      } else {
        setSmsError(result.message || '인증에 실패했습니다.');
      }
    } catch {
      setSmsError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  // SMS 모달 닫기
  const handleCloseSmsModal = () => {
    setShowSmsModal(false);
    setSmsPhoneNumber('');
    setVerificationCode('');
    setSmsSent(false);
    setSmsError('');
    setSmsSuccess('');
    setCountdown(0);
    cleanupRecaptcha();
    recaptchaInitialized.current = false;
  };

  // ===== 프로세스 인디케이터 =====
  const ProcessIndicator = ({ currentStep }: { currentStep: PageStep }) => {
    const steps = [
      { key: 'intro', label: '인증' },
      { key: 'form', label: '정보 입력' },
      { key: 'complete', label: '완료' },
    ];
    const currentIdx = currentStep === 'complete' ? 2 : 0;

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              i < currentIdx ? 'bg-emerald-100 text-emerald-700' :
              i === currentIdx ? 'bg-emerald-600 text-white' :
              'bg-slate-100 text-slate-400'
            }`}>
              {i < currentIdx && <Check className="w-3 h-3" />}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300" />}
          </div>
        ))}
      </div>
    );
  };

  // ===== 산행 정보 요약 카드 =====
  const EventSummaryCard = ({ compact = false }: { compact?: boolean }) => {
    if (!currentEvent) return null;
    return (
      <div className={`bg-slate-50 rounded-xl border border-slate-200 ${compact ? 'p-3' : 'p-4'}`}>
        <div className="flex items-start gap-3">
          <div className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Mountain className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-emerald-600`} />
          </div>
          <div className="min-w-0">
            {!compact && <p className="text-xs text-slate-500 mb-0.5">다가오는 산행</p>}
            <p className={`font-bold text-slate-900 ${compact ? 'text-sm' : 'text-sm'}`}>{currentEvent.title}</p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDate(currentEvent.date)}</span>
            </div>
            {currentEvent.location && (
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                <Mountain className="w-3.5 h-3.5" />
                <span>{currentEvent.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ========== 로딩 화면 ==========
  if (!loadingTimedOut && (eventsLoading || isSubmitting)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
          <p className="text-slate-600">
            {isSubmitting ? '게스트 산행 신청 처리 중...' : '산행 정보를 불러오고 있습니다...'}
          </p>
        </div>
      </div>
    );
  }

  // ========== Step 1: 인증 + 산행 안내 ==========
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-8 sm:py-12 px-4">
        <SEOHead
          title="게스트 산행 신청"
          description="시애라 게스트 산행 신청. 간편 인증 후 바로 산행에 참여하세요."
          path="/guest-application"
        />
        <div className="max-w-md w-full">
          <Link
            to="/"
            className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            메인으로 돌아가기
          </Link>

          {/* 헤더 */}
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              mode === 'cancel' ? 'bg-red-100' : 'bg-emerald-100'
            }`}>
              {mode === 'cancel'
                ? <XCircle className="w-8 h-8 text-red-500" />
                : <Mountain className="w-8 h-8 text-emerald-600" />
              }
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              {mode === 'cancel' ? '게스트 산행 취소' : '게스트 산행 신청'}
            </h1>
            <p className="text-slate-500 text-sm">
              {mode === 'cancel'
                ? '신청 시 사용한 인증 방법으로 로그인하세요'
                : '간편 인증 후 바로 산행에 참여하세요'
              }
            </p>
          </div>

          {/* 신청 / 취소 탭 */}
          <div className="mb-6 flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => handleModeChange('apply')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                mode === 'apply'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Mountain className="w-4 h-4" />
              산행 신청
            </button>
            <button
              onClick={() => handleModeChange('cancel')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                mode === 'cancel'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <XCircle className="w-4 h-4" />
              산행 취소
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* 프로세스 안내 */}
            <div className="p-5 sm:p-6">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                {mode === 'cancel' ? '취소 프로세스' : '신청 프로세스'}
              </h3>
              <div className="space-y-2.5">
                {(mode === 'cancel' ? [
                  { num: '1', text: '간편 인증', sub: '신청 시 사용한 방법으로 인증', current: true },
                  { num: '2', text: '신청 내역 확인', sub: '참가 신청 정보 확인', current: false },
                  { num: '3', text: '취소 완료', sub: '산행 신청 취소', current: false },
                ] : [
                  { num: '1', text: '간편 인증', sub: 'Google 또는 SMS 인증', current: true },
                  { num: '2', text: '추가 정보 입력', sub: '이름, 연락처 등', current: false },
                  { num: '3', text: '게스트 산행 신청 완료', sub: '입금 안내 확인', current: false },
                ]).map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${
                    item.current
                      ? mode === 'cancel'
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-emerald-50 border border-emerald-200'
                      : 'bg-slate-50'
                  }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      item.current
                        ? mode === 'cancel' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'
                        : 'bg-slate-300 text-white'
                    }`}>
                      {item.num}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-sm font-semibold block ${
                        item.current
                          ? mode === 'cancel' ? 'text-red-800' : 'text-emerald-800'
                          : 'text-slate-500'
                      }`}>{item.text}</span>
                      <span className={`text-xs ${
                        item.current
                          ? mode === 'cancel' ? 'text-red-600' : 'text-emerald-600'
                          : 'text-slate-400'
                      }`}>{item.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 산행 정보 미리보기 */}
            {currentEvent ? (
              <div className="mx-5 sm:mx-6 mb-4 sm:mb-5">
                <EventSummaryCard />
                {/* 마감 상태 (신청 모드에서만 표시) */}
                {mode === 'apply' && (
                  applicationClosed ? (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <p className="text-xs font-bold text-red-700">신청 마감 (조 편성 완료)</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                      <div className="flex items-center gap-2 text-xs text-blue-700">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>신청 접수 중 · <strong>조 편성 완료 시 마감</strong></span>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="mx-5 sm:mx-6 mb-5 sm:mb-6 p-6 bg-slate-50 rounded-xl text-center">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">현재 신청 가능한 산행이 없습니다</p>
                <p className="text-xs text-slate-500">다음 산행 일정을 기다려주세요.</p>
              </div>
            )}

            {/* 인증 안내 + 버튼 (신청 모드: 마감 전만, 취소 모드: 항상) */}
            {currentEvent && (mode === 'cancel' || !applicationClosed) && (
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-3">
                {/* 안내 메시지 */}
                <div className={`p-3 rounded-xl border ${
                  mode === 'cancel' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'
                }`}>
                  <div className="flex items-start gap-2.5">
                    <Shield className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      mode === 'cancel' ? 'text-red-500' : 'text-blue-500'
                    }`} />
                    <p className={`text-xs leading-relaxed ${
                      mode === 'cancel' ? 'text-red-700' : 'text-blue-700'
                    }`}>
                      {mode === 'cancel'
                        ? '게스트 산행 신청 시 사용한 동일한 인증 방법(Google 또는 SMS)으로 로그인해주세요.'
                        : <>산행 이력 관리를 위해 간편 인증이 필요합니다.<br />추후 정회원 가입 시 게스트 산행 이력이 자동으로 연동됩니다.</>
                      }
                    </p>
                  </div>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-xs text-red-700 text-center">{authError}</p>
                  </div>
                )}

                {/* 인앱 브라우저 안내 */}
                {isInApp && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs text-amber-700 text-center">
                      인앱 브라우저에서는 Google 로그인이 제한됩니다.<br />
                      <strong>SMS 인증</strong>을 이용해주세요.
                    </p>
                  </div>
                )}

                {/* Google 로그인 버튼 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoggingIn || authLoading}
                  className="w-full px-6 py-3.5 bg-white text-slate-700 border border-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {isGoogleLoggingIn ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      로그인 중...
                    </>
                  ) : isInApp ? (
                    <>
                      <GoogleIcon />
                      외부 브라우저에서 Google 로그인
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      Google 계정으로 인증
                    </>
                  )}
                </button>

                {/* SMS 인증 버튼 */}
                <button
                  onClick={() => { setAuthError(''); setShowSmsModal(true); }}
                  disabled={isGoogleLoggingIn || authLoading}
                  className={`w-full px-6 py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${
                    mode === 'cancel'
                      ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
                  }`}
                >
                  <Smartphone className="w-5 h-5" />
                  SMS 인증으로 시작
                </button>
              </div>
            )}

            {/* 마감된 경우 (신청 모드에서만) */}
            {mode === 'apply' && (!currentEvent || applicationClosed) && (
              <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                <button
                  disabled
                  className="w-full px-6 py-4 bg-slate-200 text-slate-400 rounded-xl font-bold text-base cursor-not-allowed"
                >
                  {currentEvent ? '신청 마감' : '신청 가능한 산행 없음'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SMS 인증 모달 */}
        {showSmsModal && (
          <Modal onClose={handleCloseSmsModal} maxWidth="max-w-md">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Smartphone className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">SMS 인증</h3>
                <p className="text-sm text-slate-500 mt-1">
                  휴대폰 번호로 간편하게 인증하세요
                </p>
              </div>

              {!smsSent ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">휴대폰 번호</label>
                    <input
                      type="tel"
                      value={smsPhoneNumber}
                      onChange={(e) => {
                        setSmsPhoneNumber(formatPhoneInput(e.target.value));
                        setSmsError('');
                      }}
                      placeholder="010-1234-5678"
                      className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-center tracking-widest"
                      maxLength={13}
                      autoFocus
                    />
                  </div>
                  {smsError && <p className="text-sm text-red-500 text-center">{smsError}</p>}
                  <button
                    id="guest-sms-send-button"
                    type="button"
                    onClick={handleSendSms}
                    disabled={isSendingSms || smsPhoneNumber.replace(/[-\s]/g, '').length < 10}
                    className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingSms ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> 전송 중...</>
                    ) : (
                      <><ArrowRight className="w-5 h-5" /> 인증코드 받기</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <p className="text-sm text-emerald-700">
                      <strong>{smsPhoneNumber}</strong>으로 인증코드를 전송했습니다
                    </p>
                    {countdown > 0 && (
                      <p className="text-xs text-emerald-600 mt-1">
                        남은 시간: {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">인증코드 6자리</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={verificationCode}
                      onChange={(e) => {
                        setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                        setSmsError('');
                      }}
                      placeholder="000000"
                      className="w-full px-4 py-3 text-2xl border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-center tracking-[0.5em] font-mono"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  {smsError && <p className="text-sm text-red-500 text-center">{smsError}</p>}
                  {smsSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="text-sm font-semibold text-emerald-800">{smsSuccess}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={isVerifying || verificationCode.length !== 6}
                    className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> 확인 중...</>
                    ) : (
                      <><CheckCircle className="w-5 h-5" /> 인증 확인</>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setSmsSent(false);
                        setVerificationCode('');
                        setSmsError('');
                        setSmsSuccess('');
                        recaptchaInitialized.current = false;
                        cleanupRecaptcha();
                        setTimeout(() => {
                          initPhoneAuth('guest-sms-send-button');
                          recaptchaInitialized.current = true;
                        }, 500);
                      }}
                      className="text-slate-500 hover:text-slate-700 underline"
                    >
                      번호 다시 입력
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        recaptchaInitialized.current = false;
                        cleanupRecaptcha();
                        setTimeout(() => {
                          initPhoneAuth('guest-sms-send-button');
                          recaptchaInitialized.current = true;
                          setTimeout(() => handleSendSms(), 500);
                        }, 500);
                      }}
                      disabled={countdown > 0}
                      className="text-emerald-600 hover:text-emerald-700 underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      {countdown > 0 ? `재전송 (${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')})` : '인증코드 재전송'}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center">
                  SMS 인증 시 통신사 문자 수신 비용이 발생할 수 있습니다
                </p>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ========== 취소 확인 ==========
  if (step === 'cancel-confirm') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 sm:py-12 px-4">
        <SEOHead
          title="게스트 산행 취소"
          description="시애라 게스트 산행 취소"
          path="/guest-application"
        />
        <div className="max-w-lg mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">게스트 산행 취소</h1>
            <p className="text-slate-500 text-sm">신청 내역을 확인하고 취소할 수 있습니다</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* 산행 정보 */}
            {currentEvent && (
              <div className="p-5 sm:p-6 border-b bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 mb-3">산행 정보</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mountain className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-sm">{currentEvent.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{formatDate(currentEvent.date)}</span>
                  </div>
                  {currentEvent.location && (
                    <div className="flex items-center gap-2 text-slate-600 text-sm">
                      <Mountain className="w-4 h-4 text-slate-400" />
                      <span>{currentEvent.location}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {guestParticipation ? (
              <>
                {/* 신청 내역 */}
                <div className="p-5 sm:p-6 border-b">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">신청 내역</h3>
                  <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">신청자</span>
                      <span className="text-sm font-medium text-slate-900">{guestParticipation.userName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">신청 상태</span>
                      <span className={`text-sm font-medium ${
                        guestParticipation.status === 'confirmed' ? 'text-emerald-600' :
                        guestParticipation.status === 'cancelled' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {guestParticipation.status === 'confirmed' ? '확정' :
                         guestParticipation.status === 'cancelled' ? '취소됨' : '대기중'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">입금 상태</span>
                      <span className={`text-sm font-medium ${
                        guestParticipation.paymentStatus === 'completed' || guestParticipation.paymentStatus === 'confirmed' ? 'text-emerald-600' :
                        guestParticipation.paymentStatus === 'cancelled' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {guestParticipation.paymentStatus === 'completed' || guestParticipation.paymentStatus === 'confirmed' ? '입금 완료' :
                         guestParticipation.paymentStatus === 'cancelled' ? '취소됨' : '입금 대기'}
                      </span>
                    </div>
                    {guestParticipation.course && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">선택 코스</span>
                        <span className="text-sm font-medium text-slate-900">{guestParticipation.course}</span>
                      </div>
                    )}
                  </div>

                  {(guestParticipation.paymentStatus === 'completed' || guestParticipation.paymentStatus === 'confirmed') && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                          이미 입금이 완료된 상태입니다. 취소 시 환불은 별도로 진행해야 합니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 취소 버튼 */}
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/"
                    className="flex-1 px-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-center hover:bg-slate-200 transition-colors"
                  >
                    돌아가기
                  </Link>
                  <button
                    onClick={handleGuestCancel}
                    disabled={isCancelling}
                    className={`flex-1 px-6 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      isCancelling
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200'
                    }`}
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        신청 취소하기
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* 신청 내역 없음 */
              <div className="p-5 sm:p-6">
                <div className="text-center py-8">
                  <UserX className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">신청 내역을 찾을 수 없습니다</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    이 산행에 대한 게스트 신청 내역이 없습니다.<br />
                    기존에 인증했던 동일한 방법(Google/SMS)으로 인증해주세요.
                  </p>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                  >
                    메인으로 돌아가기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== 취소 완료 ==========
  if (step === 'cancel-complete') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 sm:py-12 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-12 h-12 text-red-500" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">취소가 완료되었습니다</h1>
            <p className="text-lg text-slate-600">
              게스트 산행 신청이 취소되었습니다.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {completeEvent && (
              <div className="p-5 sm:p-6 border-b bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 mb-3">취소된 산행</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mountain className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-sm">{completeEvent.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{formatDate(completeEvent.date)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 sm:p-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
                <p className="text-sm text-blue-800">
                  입금하신 참가비가 있는 경우, 환불은 별도로 진행됩니다.<br />
                  문의사항은 담당자에게 연락해주세요.
                </p>
              </div>

              <Link
                to="/"
                className="w-full flex items-center justify-center px-6 py-3.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors"
              >
                메인으로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== Step 3: 신청 완료 (이벤트 로딩 대기) ==========
  if (step === 'complete' && !completeEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
          <p className="text-slate-600">신청 완료 정보를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  // ========== Step 3: 신청 완료 ==========
  if (step === 'complete' && completeEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 sm:py-12 px-4">
        <div className="max-w-lg mx-auto">
          <ProcessIndicator currentStep="complete" />

          {/* 성공 헤더 */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">신청이 완료되었습니다!</h1>
            <p className="text-lg text-slate-600">
              {appliedName}님의 게스트 산행 신청이 접수되었습니다
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* 산행 정보 */}
            <div className="p-5 sm:p-6 border-b bg-slate-50">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3">신청 산행 정보</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-700">
                  <Mountain className="w-4 h-4 text-slate-500" />
                  <span className="font-medium text-sm sm:text-base">{completeEvent.title}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{formatDate(completeEvent.date)}</span>
                </div>
                {completeEvent.location && (
                  <div className="flex items-center gap-2 text-slate-600 text-sm">
                    <Mountain className="w-4 h-4 text-slate-400" />
                    <span>{completeEvent.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 입금 안내 */}
            <div className="p-5 sm:p-6">
              <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-900 mb-1 text-sm">입금 완료 필수</h4>
                    <p className="text-xs sm:text-sm text-amber-800">
                      아래 계좌로 참가비를 입금하셔야 최종 신청이 확정됩니다.<br />
                      입금자명은 <strong>{appliedName}</strong>으로 입력해주세요.
                    </p>
                  </div>
                </div>
              </div>

              {/* 입금 정보 */}
              {completeEvent.paymentInfo ? (
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">입금 정보</h3>

                  {completeEvent.paymentInfo.cost && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <p className="text-sm text-emerald-700 mb-1">참가비</p>
                      <p className="text-2xl font-bold text-emerald-900">{`${String(completeEvent.paymentInfo.cost).replace(/원\s*$/, '')}원`}</p>
                    </div>
                  )}

                  <div className="p-4 bg-slate-50 rounded-xl space-y-4">
                    {/* 은행명 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-slate-500 mb-1">은행명</p>
                        <p className="text-base sm:text-lg font-bold text-slate-900">{completeEvent.paymentInfo.bankName}</p>
                      </div>
                      <button
                        onClick={() => handleCopyToClipboard(completeEvent.paymentInfo?.bankName || '', 'bank')}
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        {copiedText === 'bank' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>

                    {/* 계좌번호 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-slate-500 mb-1">계좌번호</p>
                        <p className="text-base sm:text-lg font-bold text-slate-900">{completeEvent.paymentInfo.accountNumber}</p>
                      </div>
                      <button
                        onClick={() => handleCopyToClipboard(completeEvent.paymentInfo?.accountNumber || '', 'account')}
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        {copiedText === 'account' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>

                    {/* 예금주 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-slate-500 mb-1">예금주</p>
                        <p className="text-base sm:text-lg font-bold text-slate-900">{completeEvent.paymentInfo.accountHolder}</p>
                      </div>
                      <button
                        onClick={() => handleCopyToClipboard(completeEvent.paymentInfo?.accountHolder || '', 'holder')}
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        {copiedText === 'holder' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                  </div>

                  {completeEvent.paymentInfo.managerName && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <h4 className="font-semibold text-blue-900 mb-1 text-sm">문의사항</h4>
                      <p className="text-xs sm:text-sm text-blue-800">
                        담당자: {completeEvent.paymentInfo.managerName}
                        {completeEvent.paymentInfo.managerPhone && ` (${completeEvent.paymentInfo.managerPhone})`}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-sm text-blue-800">
                    입금 계좌 정보가 아직 등록되지 않았습니다.<br />
                    담당자가 곧 안내드리겠습니다.
                  </p>
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="p-5 sm:p-6 border-t bg-slate-50">
              <Link
                to="/"
                className="w-full flex items-center justify-center px-6 py-3.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors"
              >
                확인
              </Link>
            </div>
          </div>

          {/* 다음 안내 */}
          <div className="mt-5 space-y-3">
            <div className="p-4 bg-white rounded-xl shadow-sm border">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">다음 단계 안내</h4>
              <div className="space-y-2 text-sm text-slate-600">
                <p>1. 위 계좌로 참가비를 입금해주세요.</p>
                <p>2. 입금 확인 후 조편성에 반영됩니다.</p>
                <p>3. 산행 당일 집합 장소에서 만나뵙겠습니다.</p>
              </div>
            </div>

            {/* 정회원 전환 안내 */}
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="flex items-start gap-2.5">
                <Users className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-emerald-800 mb-1">정회원 가입 안내</h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    정회원으로 가입하시면 오늘 신청한 게스트 산행 이력이 자동으로 연동됩니다.
                    메인 페이지에서 로그인하여 가입을 진행해주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 폴백: 산행이 없는 경우 또는 예외
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">현재 신청 가능한 산행이 없습니다</h2>
        <p className="text-slate-500 mb-6">다음 산행 일정을 기다려주세요.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-700 transition-colors"
        >
          메인으로 돌아가기
        </Link>
      </div>
    </div>
  );
};

export default GuestApplication;
