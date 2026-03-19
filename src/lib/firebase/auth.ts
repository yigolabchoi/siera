import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  PhoneAuthProvider,
  linkWithCredential,
  linkWithPopup,
  unlink,
  type AuthError,
} from 'firebase/auth';
import { auth } from './config';

// ==================== 타입 정의 ====================

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthResultWithUser extends AuthResult {
  user?: FirebaseUser;
  isNewUser?: boolean;
}

/** Firebase AuthError 타입 가드 */
const isAuthError = (error: unknown): error is AuthError =>
  typeof error === 'object' && error !== null && 'code' in error;

/** Firebase 에러에서 사용자 메시지 추출 */
const getErrorMessage = (error: unknown, fallback = '알 수 없는 오류가 발생했습니다.'): string => {
  if (isAuthError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
};

// ==================== 기본 인증 ====================

export const signUp = async (
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResultWithUser> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
};

export const signIn = async (email: string, password: string): Promise<AuthResultWithUser> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
};

export const signOut = async (): Promise<AuthResult> => {
  try {
    await firebaseSignOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
};

export const resetPassword = async (email: string): Promise<AuthResult> => {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
};

// ==================== 인증 상태 ====================

export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => auth.currentUser;

export const getUserToken = async (forceRefresh = false): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
};

export const getUserTokenResult = async (forceRefresh = false) => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const result = await user.getIdTokenResult(forceRefresh);
    return { token: result.token, claims: result.claims };
  } catch {
    return null;
  }
};

// ==================== Google 인증 ====================

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * 구글 로그인 (팝업 방식 - PC/모바일 공통)
 * signInWithRedirect는 iOS Safari ITP 정책으로 모바일에서 불안정하여 팝업으로 통일
 */
export const signInWithGoogle = async (): Promise<AuthResultWithUser> => {
  const userCredential = await signInWithPopup(auth, googleProvider);
  return {
    success: true,
    user: userCredential.user,
    isNewUser: userCredential.user.metadata.creationTime === userCredential.user.metadata.lastSignInTime,
  };
};

/**
 * Google Redirect 결과 처리 (레거시 - 팝업 방식으로 전환 후 미사용)
 * 기존 redirect 방식에서 팝업 방식으로 전환되어 항상 null 반환
 */
export const handleGoogleRedirectResult = async (): Promise<AuthResultWithUser | null> => {
  return null;
};

// ==================== SMS(전화번호) 인증 ====================

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

/** SMS 에러 코드 → 사용자 메시지 매핑 */
const SMS_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': '유효하지 않은 전화번호입니다.',
  'auth/too-many-requests': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  'auth/quota-exceeded': 'SMS 할당량이 초과되었습니다. 관리자에게 문의해주세요.',
  'auth/operation-not-allowed': 'SMS 인증이 활성화되지 않았습니다. Firebase Console에서 Phone Authentication을 활성화해주세요.',
  'auth/invalid-app-credential': 'reCAPTCHA 인증에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.',
  'auth/captcha-check-failed': 'reCAPTCHA 확인에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.',
  'auth/missing-phone-number': '전화번호가 입력되지 않았습니다.',
  'auth/api-key-not-valid': 'Firebase API 키가 유효하지 않습니다.',
};

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-verification-code': '잘못된 인증코드입니다. 다시 확인해주세요.',
  'auth/code-expired': '인증코드가 만료되었습니다. 다시 전송해주세요.',
};

/** reCAPTCHA verifier 안전하게 정리 */
const clearRecaptcha = () => {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch { /* ignore */ }
    recaptchaVerifier = null;
  }
};

/**
 * reCAPTCHA 초기화
 * invisible reCAPTCHA를 사용하여 사용자에게 보이지 않게 처리
 */
export const setupRecaptcha = (buttonId: string): RecaptchaVerifier => {
  clearRecaptcha();

  recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => { clearRecaptcha(); },
  });

  return recaptchaVerifier;
};

/** 전화번호로 인증 코드 전송 */
export const sendPhoneVerificationCode = async (phoneNumber: string): Promise<AuthResult> => {
  try {
    if (!recaptchaVerifier) {
      return { success: false, error: 'reCAPTCHA가 초기화되지 않았습니다.' };
    }

    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
    return { success: true };
  } catch (error: unknown) {
    clearRecaptcha();

    if (isAuthError(error)) {
      const userMessage = SMS_ERROR_MESSAGES[error.code];
      if (userMessage) return { success: false, error: userMessage };
      return { success: false, error: `SMS 전송 실패 [${error.code}]: ${error.message}` };
    }
    return { success: false, error: 'SMS 전송에 실패했습니다.' };
  }
};

/** SMS 인증코드 확인 */
export const verifyPhoneCode = async (verificationCode: string): Promise<AuthResultWithUser> => {
  try {
    if (!confirmationResult) {
      return { success: false, error: '인증 세션이 만료되었습니다. 다시 시도해주세요.' };
    }

    const userCredential = await confirmationResult.confirm(verificationCode);
    confirmationResult = null;

    return {
      success: true,
      user: userCredential.user,
      isNewUser: userCredential.user.metadata.creationTime === userCredential.user.metadata.lastSignInTime,
    };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      if (error.code === 'auth/code-expired') confirmationResult = null;
      const userMessage = VERIFY_ERROR_MESSAGES[error.code];
      if (userMessage) return { success: false, error: userMessage };
    }
    return { success: false, error: '인증코드 확인에 실패했습니다.' };
  }
};

/** 현재 사용자에 전화번호 인증 연결 (Account Linking) */
export const linkPhoneToCurrentUser = async (verificationCode: string): Promise<AuthResult> => {
  try {
    if (!confirmationResult) {
      return { success: false, error: '인증 세션이 만료되었습니다.' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: '로그인된 사용자가 없습니다.' };
    }

    const credential = PhoneAuthProvider.credential(
      confirmationResult.verificationId,
      verificationCode,
    );

    await linkWithCredential(currentUser, credential);
    confirmationResult = null;
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error, '계정 연결에 실패했습니다.') };
  }
};

/** reCAPTCHA 및 인증 세션 정리 */
export const cleanupRecaptcha = () => {
  clearRecaptcha();
  confirmationResult = null;
};

// ==================== 재인증 (Reauthentication) ====================

/** 현재 사용자의 인증 제공자를 반환 */
export const getAuthProvider = (): 'google' | 'phone' | 'email' | 'unknown' => {
  const currentUser = auth.currentUser;
  if (!currentUser) return 'unknown';

  const providers = currentUser.providerData.map(p => p.providerId);
  
  if (providers.includes('google.com')) return 'google';
  if (providers.includes('phone')) return 'phone';
  if (providers.includes('password')) return 'email';
  return 'unknown';
};

/** Google 팝업 재인증 */
export const reauthenticateWithGoogle = async (): Promise<AuthResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return { success: false, error: '로그인된 사용자가 없습니다.' };

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(currentUser, provider);
    return { success: true };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      if (error.code === 'auth/popup-closed-by-user') {
        return { success: false, error: '인증 팝업이 닫혔습니다. 다시 시도해주세요.' };
      }
      if (error.code === 'auth/user-mismatch') {
        return { success: false, error: '현재 로그인된 계정과 다른 Google 계정입니다.' };
      }
    }
    return { success: false, error: getErrorMessage(error, 'Google 재인증에 실패했습니다.') };
  }
};

/** 이메일/비밀번호 재인증 */
export const reauthenticateWithPassword = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return { success: false, error: '로그인된 사용자가 없습니다.' };

    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(currentUser, credential);
    return { success: true };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        return { success: false, error: 'wrong-password' };
      }
      if (error.code === 'auth/too-many-requests') {
        return { success: false, error: 'too-many-requests' };
      }
    }
    return { success: false, error: getErrorMessage(error, '비밀번호 확인에 실패했습니다.') };
  }
};

/** SMS 재인증용 reCAPTCHA 초기화 및 코드 전송 */
let reauthRecaptchaVerifier: RecaptchaVerifier | null = null;
let reauthConfirmationResult: ConfirmationResult | null = null;

export const sendReauthPhoneCode = async (phoneNumber: string, buttonId: string): Promise<AuthResult> => {
  try {
    // 기존 reCAPTCHA 정리
    if (reauthRecaptchaVerifier) {
      try { reauthRecaptchaVerifier.clear(); } catch { /* ignore */ }
      reauthRecaptchaVerifier = null;
    }

    reauthRecaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        if (reauthRecaptchaVerifier) {
          try { reauthRecaptchaVerifier.clear(); } catch { /* ignore */ }
          reauthRecaptchaVerifier = null;
        }
      },
    });

    reauthConfirmationResult = await signInWithPhoneNumber(auth, phoneNumber, reauthRecaptchaVerifier);
    return { success: true };
  } catch (error: unknown) {
    if (reauthRecaptchaVerifier) {
      try { reauthRecaptchaVerifier.clear(); } catch { /* ignore */ }
      reauthRecaptchaVerifier = null;
    }

    if (isAuthError(error)) {
      const userMessage = SMS_ERROR_MESSAGES[error.code];
      if (userMessage) return { success: false, error: userMessage };
    }
    return { success: false, error: getErrorMessage(error, 'SMS 전송에 실패했습니다.') };
  }
};

/** SMS 재인증 코드 확인 */
export const verifyReauthPhoneCode = async (verificationCode: string): Promise<AuthResult> => {
  try {
    if (!reauthConfirmationResult) {
      return { success: false, error: '인증 세션이 만료되었습니다. 다시 시도해주세요.' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) return { success: false, error: '로그인된 사용자가 없습니다.' };

    const credential = PhoneAuthProvider.credential(
      reauthConfirmationResult.verificationId,
      verificationCode,
    );

    await reauthenticateWithCredential(currentUser, credential);
    reauthConfirmationResult = null;
    return { success: true };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      if (error.code === 'auth/invalid-verification-code') {
        return { success: false, error: '잘못된 인증코드입니다. 다시 확인해주세요.' };
      }
      if (error.code === 'auth/code-expired') {
        reauthConfirmationResult = null;
        return { success: false, error: '인증코드가 만료되었습니다. 다시 전송해주세요.' };
      }
    }
    return { success: false, error: getErrorMessage(error, '인증코드 확인에 실패했습니다.') };
  }
};

/** 재인증 세션 정리 */
export const cleanupReauthSession = () => {
  if (reauthRecaptchaVerifier) {
    try { reauthRecaptchaVerifier.clear(); } catch { /* ignore */ }
    reauthRecaptchaVerifier = null;
  }
  reauthConfirmationResult = null;
};

// 미사용 import 방지 (다른 모듈에서 사용될 수 있으므로 re-export)
export { linkWithPopup, unlink, PhoneAuthProvider };
export type { FirebaseUser };
