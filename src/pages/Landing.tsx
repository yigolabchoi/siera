import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mountain, Users } from 'lucide-react';
import { LandingNavbar } from './Landing/LandingNavbar';
import { LandingHero } from './Landing/LandingHero';
import { LandingTargeting } from './Landing/LandingTargeting';
import { LandingProgram } from './Landing/LandingProgram';
import { LandingTrust } from './Landing/LandingTrust';
import { LandingHeritage } from './Landing/LandingHeritage';
import { LandingFAQCTA } from './Landing/LandingFAQCTA';
import { LandingFooter } from './Landing/LandingFooter';
import SEOHead from '../components/SEOHead';
import Modal from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../constants';

export default function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();
  const [showGuide, setShowGuide] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    // location.state에서 scrollTo 값을 확인
    const scrollTo = (location.state as { scrollTo?: string })?.scrollTo;

    if (scrollTo) {
      // 페이지 렌더링이 완료된 후 스크롤
      setTimeout(() => {
        const element = document.getElementById(scrollTo);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      // state 초기화 (뒤로가기 시 다시 스크롤되지 않도록)
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // 산행 신청 안내 팝업: '다시 보지 않기'를 체크하지 않았다면 방문 시마다 노출
  useEffect(() => {
    if (authLoading) return;
    const hideGuide = storage.get<boolean>(STORAGE_KEYS.HIDE_APPLICATION_GUIDE);
    if (!hideGuide) {
      setShowGuide(true);
    }
  }, [authLoading]);

  const handleCloseGuide = () => {
    if (dontShowAgain) {
      storage.set(STORAGE_KEYS.HIDE_APPLICATION_GUIDE, true);
    }
    setShowGuide(false);
  };

  // 인증 세션 확인 중: 스플래시 스크린만 표시 (다른 섹션 렌더링 방지)
  if (authLoading) {
    return (
      <main className="bg-slate-900 min-h-screen">
        <LandingHero />
      </main>
    );
  }

  return (
    <main className="bg-white min-h-screen selection:bg-slate-900 selection:text-white">
      <SEOHead
        path="/"
        description="2005년 창립, 21년 전통의 하이 트러스트 등산 커뮤니티. CEO·임원·전문직 리더들이 산행을 통해 심신을 단련하고 신뢰 네트워크를 구축하는 품격 있는 교류의 장."
      />
      <LandingNavbar />
      <LandingHero />
      <LandingTargeting />
      <LandingProgram />
      <LandingTrust />
      <LandingHeritage />
      <LandingFAQCTA />
      <LandingFooter />

      {showGuide && (
        <Modal onClose={handleCloseGuide} title="산행 신청 안내" maxWidth="max-w-lg">
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500">
              산행 신청 방법은 회원 여부에 따라 두 가지로 나뉩니다. 해당하는 방법을 선택해주세요.
            </p>

            {/* 간편 산행 신청 */}
            <div className="p-4 rounded-xl border border-green-200 bg-green-50">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                  <Mountain className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-bold text-slate-900">간편 산행 신청</h4>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                이미 등록된 <strong>정회원</strong>을 위한 방법입니다. 로그인 없이 이름 검색만으로
                바로 신청할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => { setShowGuide(false); navigate('/quick-apply'); }}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 transition-colors"
              >
                간편 산행 신청하기
              </button>
            </div>

            {/* 게스트 산행 신청 */}
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-bold text-slate-900">게스트 산행 신청</h4>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                아직 회원이 아닌 <strong>게스트</strong>를 위한 방법입니다. 최초 1회 Google 또는
                SMS로 간편 인증하면, 다음 산행부터는 재인증 없이 바로 신청할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => { setShowGuide(false); navigate('/guest-application'); }}
                className="w-full py-2.5 bg-amber-500 text-white rounded-lg font-semibold text-sm hover:bg-amber-600 transition-colors"
              >
                게스트 산행 신청하기
              </button>
            </div>

            {/* 다시 보지 않기 + 확인 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                다시 보지 않기
              </label>
              <button
                type="button"
                onClick={handleCloseGuide}
                className="px-5 py-2 bg-slate-800 text-white rounded-lg font-semibold text-sm hover:bg-slate-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
