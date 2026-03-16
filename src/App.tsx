import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContextEnhanced';
import { DevModeProvider } from './contexts/DevModeContext';
import { isKakaoTalkBrowser, isAndroid, isIOS, openInExternalBrowser, copyUrlToClipboard, openSafariFallback } from './utils/browserDetect';
import { EventProvider } from './contexts/EventContext';
import { MemberProvider } from './contexts/MemberContext';
import { PoemProvider } from './contexts/PoemContext';
import { RulesProvider } from './contexts/RulesContext';
import { NoticeProvider } from './contexts/NoticeContext';
import { HistoryProvider } from './contexts/HistoryContext';
import { GalleryProvider } from './contexts/GalleryContext';
import { HikingHistoryProvider } from './contexts/HikingHistoryContext';
import { PostProvider } from './contexts/PostContext';
import { ExecutiveProvider } from './contexts/ExecutiveContext';
import { PendingUserProvider } from './contexts/PendingUserContext';
import { GuestApplicationProvider } from './contexts/GuestApplicationContext';
import { PaymentProvider } from './contexts/PaymentContext';
import { AttendanceProvider } from './contexts/AttendanceContext';
import { ParticipationProvider } from './contexts/ParticipationContext';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';

/**
 * lazy import 재시도 래퍼
 *
 * 배포 후 청크 파일명이 변경되면 기존 HTML이 참조하는 구버전 청크가 404를 반환.
 * 최대 2회 재시도하며, 실패 시 페이지를 강제 새로고침하여 최신 HTML을 로드한다.
 */
function lazyWithRetry(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(async () => {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await importFn();
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          // 모든 재시도 실패 → 강제 새로고침 (sessionStorage로 무한루프 방지)
          const key = 'chunk-reload-' + window.location.pathname;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            window.location.reload();
          }
          throw error;
        }
        // 짧은 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw new Error('Lazy import failed');
  });
}

// 코드 스플리팅 적용 (재시도 로직 포함)
const Landing = lazyWithRetry(() => import('./pages/Landing'));
const AboutSierra = lazyWithRetry(() => import('./pages/AboutSierra'));
const Register = lazyWithRetry(() => import('./pages/Register'));
const CompleteGoogleProfile = lazyWithRetry(() => import('./pages/CompleteGoogleProfile'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const Home = lazyWithRetry(() => import('./pages/Home'));
const Events = lazyWithRetry(() => import('./pages/Events'));
const Gallery = lazyWithRetry(() => import('./pages/Gallery'));
const Board = lazyWithRetry(() => import('./pages/Board'));
const BoardDetail = lazyWithRetry(() => import('./pages/BoardDetail'));
const BoardWrite = lazyWithRetry(() => import('./pages/BoardWrite'));
const Members = lazyWithRetry(() => import('./pages/Members'));
const Attendance = lazyWithRetry(() => import('./pages/Attendance'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ProfilePhotoEdit = lazyWithRetry(() => import('./pages/ProfilePhotoEdit'));
const ClubInfo = lazyWithRetry(() => import('./pages/ClubInfo'));
const HikingHistory = lazyWithRetry(() => import('./pages/HikingHistory'));
const GuestApplication = lazyWithRetry(() => import('./pages/GuestApplication'));
const QuickEventApply = lazyWithRetry(() => import('./pages/QuickEventApply'));
const EventManagement = lazyWithRetry(() => import('./pages/Admin/EventManagement'));
const EventPrintView = lazyWithRetry(() => import('./pages/Admin/EventPrintView'));
const TeamManagement = lazyWithRetry(() => import('./pages/Admin/TeamManagement'));
const MemberManagement = lazyWithRetry(() => import('./pages/Admin/MemberManagement'));
const PaymentManagement = lazyWithRetry(() => import('./pages/Admin/PaymentManagement'));
const AnnualFeeManagement = lazyWithRetry(() => import('./pages/Admin/AnnualFeeManagement'));
const ContentManagement = lazyWithRetry(() => import('./pages/Admin/ContentManagement'));
const WeatherTest = lazyWithRetry(() => import('./pages/Admin/WeatherTest'));
const CleanupAccounts = lazyWithRetry(() => import('./pages/Admin/CleanupAccounts'));
const PublicAlbum = lazyWithRetry(() => import('./pages/PublicAlbum'));


// 로딩 컴포넌트
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

// 에러 바운더리 - 렌더링 에러 시 빈 화면 대신 복구 UI 표시
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">⚠️</p>
            <h2 className="text-xl font-bold text-slate-900 mb-2">페이지 로딩 오류</h2>
            <p className="text-slate-600 mb-6 text-sm">일시적인 오류가 발생했습니다.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== 카카오톡 인앱 브라우저 가드 =====
// index.html의 인라인 스크립트가 즉시 리다이렉트를 시도하지만,
// 실패하거나 지연되는 경우 이 컴포넌트가 fallback UI를 제공합니다.
const KakaoInAppGuard = ({ children }: { children: React.ReactNode }) => {
  const [isKakao, setIsKakao] = useState(false);
  const [redirectAttempted, setRedirectAttempted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isKakaoTalkBrowser()) return;
    
    setIsKakao(true);
    
    // 즉시 외부 브라우저로 이동 시도
    openInExternalBrowser();
    
    // 2초 후에도 여전히 이 페이지에 있다면 리다이렉트 실패로 판단
    const timer = setTimeout(() => {
      setRedirectAttempted(true);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    openInExternalBrowser();
  };

  const handleCopyUrl = async () => {
    const success = await copyUrlToClipboard();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 카카오톡이 아니면 정상 렌더링
  if (!isKakao) return <>{children}</>;

  // 리다이렉트 진행 중 (2초 대기)
  if (!redirectAttempted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin mx-auto mb-6" />
          <p className="text-lg font-semibold text-slate-800">외부 브라우저로 이동 중...</p>
          <p className="text-sm text-slate-500 mt-2">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  // 리다이렉트 실패 — 수동 이동 안내
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        {/* 로고 영역 */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3l4 8 5-5 2 15H2L8 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">시애라(Sierra)</h1>
        </div>

        {/* 안내 메시지 */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-semibold text-amber-800 text-sm">카카오톡 브라우저 감지</span>
          </div>
          <p className="text-amber-700 text-sm leading-relaxed">
            카카오톡 내부 브라우저에서는 일부 기능이<br/>
            정상적으로 작동하지 않을 수 있습니다.
          </p>
        </div>

        {/* 외부 브라우저 이동 버튼 */}
        <button
          onClick={handleRetry}
          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-base hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20 mb-3"
        >
          {retryCount > 0 ? '다시 시도하기' : '외부 브라우저에서 열기'}
        </button>

        {/* iOS: Safari 강제 실행 버튼 (클립보드 복사 + x-web-search 스킴) */}
        {isIOS() && (
          <button
            onClick={async () => {
              const success = await openSafariFallback();
              if (!success) {
                handleCopyUrl();
              }
            }}
            className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Safari에서 열기
          </button>
        )}

        {/* URL 복사 버튼 (폴백) */}
        <button
          onClick={handleCopyUrl}
          className="w-full py-3.5 bg-white text-slate-700 rounded-2xl font-semibold text-sm border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-green-600">복사 완료!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              URL 복사 후 브라우저에 붙여넣기
            </>
          )}
        </button>

        {/* iOS 사용자를 위한 추가 안내 */}
        {isIOS() && retryCount > 0 && (
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
            <p className="text-blue-800 text-xs font-semibold mb-2">Safari에서 여는 방법</p>
            <ol className="text-blue-700 text-xs space-y-1.5 list-decimal list-inside">
              <li>위 <strong>"Safari에서 열기"</strong> 버튼을 탭하세요</li>
              <li>Safari 주소창을 <strong>길게 터치</strong>하세요</li>
              <li><strong>"붙여놓기 및 이동"</strong>을 누르세요</li>
            </ol>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          Chrome, Safari 등 외부 브라우저에서<br/>
          원활한 이용이 가능합니다.
        </p>
      </div>
    </div>
  );
};

function App() {
  return (
    <KakaoInAppGuard>
    <DevModeProvider>
      {/* Public Data Providers - Auth와 완전히 독립 */}
      <EventProvider>
        <MemberProvider>
          <ParticipationProvider>
            {/* Auth Provider - 로그인 관련만 담당 */}
            <AuthProvider>
              <Toaster position="top-right" />
              <ExecutiveProvider>
                <PendingUserProvider>
                  <GuestApplicationProvider>
                    <PaymentProvider>
                      <AttendanceProvider>
                        <GalleryProvider>
                          <HikingHistoryProvider>
                            <PostProvider>
                              <PoemProvider>
                                <RulesProvider>
                                  <NoticeProvider>
                                    <HistoryProvider>
                                    <Router>
                                      <ScrollToTop />
                                      <ErrorBoundary>
                                      <Suspense fallback={<PageLoader />}>
                                        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<AboutSierra />} />
            <Route path="/register" element={<Register />} />
            <Route path="/complete-profile" element={<CompleteGoogleProfile />} />
            <Route path="/complete-google-profile" element={<CompleteGoogleProfile />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/guest-application" element={<GuestApplication />} />
            <Route path="/quick-apply" element={<QuickEventApply />} />
            <Route path="/share/album/:shareId" element={<PublicAlbum />} />
            
            {/* Protected Member Routes */}
            <Route path="/home" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/home/events" replace />} />
              <Route path="events" element={<Events />} />
              <Route path="gallery" element={<Gallery />} />
              <Route path="board" element={<Board />} />
              <Route path="board/:type/:id" element={<BoardDetail />} />
              <Route path="board/write" element={<BoardWrite />} />
              <Route path="members" element={<Members />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="club-info" element={<ClubInfo />} />
              <Route path="hiking-history" element={<HikingHistory />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            
            {/* Profile Photo Edit - 별도 레이아웃 없이 */}
            <Route path="/home/profile/edit-photo" element={
              <ProtectedRoute>
                <ProfilePhotoEdit />
              </ProtectedRoute>
            } />
            
            {/* Admin Routes */}
            <Route path="/admin" element={
              <ProtectedRoute requireAdmin>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/admin/members" replace />} />
              <Route path="members" element={<MemberManagement />} />
              <Route path="payment" element={<PaymentManagement />} />
              <Route path="annual-fee" element={<AnnualFeeManagement />} />
              <Route path="events" element={<EventManagement />} />
              <Route path="teams" element={<TeamManagement />} />
              <Route path="content" element={<ContentManagement />} />

              <Route path="weather-test" element={<WeatherTest />} />
              <Route path="cleanup" element={<CleanupAccounts />} />
            </Route>
            
            {/* Print View - 별도 레이아웃 없이 */}
            <Route path="/admin/events/print/:eventId" element={
              <ProtectedRoute requireAdmin>
                <EventPrintView />
              </ProtectedRoute>
            } />
            
            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
                                      </Suspense>
                                      </ErrorBoundary>
                                    </Router>
                                    </HistoryProvider>
                                  </NoticeProvider>
                                </RulesProvider>
                              </PoemProvider>
                            </PostProvider>
                          </HikingHistoryProvider>
                        </GalleryProvider>
                      </AttendanceProvider>
                    </PaymentProvider>
                  </GuestApplicationProvider>
                </PendingUserProvider>
              </ExecutiveProvider>
            </AuthProvider>
          </ParticipationProvider>
        </MemberProvider>
      </EventProvider>
    </DevModeProvider>
    </KakaoInAppGuard>
  );
}

export default App;
