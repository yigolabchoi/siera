import { Calendar, MapPin, Users, TrendingUp, CheckCircle, XCircle, Clock, Navigation, UserCheck, Phone, Mail, CreditCard, Copy, X, Shield, Mountain, Settings, CalendarX, Bell, AlertTriangle, Check, Backpack, Cloud, Thermometer, Wind, Droplets, CloudRain, CloudSnow, Sun, Edit, Camera, ChevronLeft, ChevronRight, ZoomIn, Globe, Plane, ArrowRight, Wallet, Star } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { useDevMode } from '../contexts/DevModeContext';
import { useEvents } from '../contexts/EventContext';
import { usePoems } from '../contexts/PoemContext';
import { useParticipations } from '../contexts/ParticipationContext';
import { useMembers } from '../contexts/MemberContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { formatDeadline, getDaysUntilDeadline, isApplicationClosed, formatDate } from '../utils/format';
import { getWeatherByLocation, WeatherData } from '../utils/weather';
import SEOHead from '../components/SEOHead';
import { getMemberPhoto } from '../utils/memberPhoto';

const Events = () => {
  const { user } = useAuth();
  const { isDevMode, applicationStatus, specialApplicationStatus } = useDevMode();
  const { currentEvent, specialEvent, getEventById, getParticipantsByEventId, getTeamsByEventId, refreshParticipants: refreshEventParticipants } = useEvents();
  const { currentPoem } = usePoems();
  const { participations, getParticipationsByEvent, addParticipation, cancelParticipation, refreshParticipations } = useParticipations();
  const { members, getMemberById } = useMembers();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copiedText, setCopiedText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchParams] = useSearchParams();

  // 답사 사진 라이트박스 상태
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);
  
  // URL에서 eventId 가져오기
  const eventIdFromUrl = searchParams.get('eventId');
  
  // 날씨 데이터 (실제 API 연동)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  
  // EventContext에서 이벤트 가져오기
  // URL에 eventId가 있으면 해당 이벤트, 없으면 currentEvent 사용
  const selectedEvent = useMemo(() => {
    if (eventIdFromUrl) {
      return getEventById(eventIdFromUrl);
    }
    return currentEvent;
  }, [eventIdFromUrl, currentEvent, getEventById]);
  
  // 특별산행 여부 확인
  const isSpecialEvent = selectedEvent?.isSpecial === true;
  
  // 해당 이벤트의 신청 상태 가져오기
  const currentApplicationStatus = isSpecialEvent ? specialApplicationStatus : applicationStatus;
  
  // 활성 회원 수 (모집 가능 인원으로 표시)
  const activeMemberCount = useMemo(() => {
    return members.filter(m => m.isActive !== false).length;
  }, [members]);

  // 참석자 목록: ParticipationContext 기반 (취소 제외)
  const eventParticipations = useMemo(() => {
    if (!selectedEvent) return [];
    return getParticipationsByEvent(selectedEvent.id).filter(p => p.status !== 'cancelled');
  }, [selectedEvent, participations, getParticipationsByEvent]);
  
  // EventContext의 레거시 참석자 (participations에 없는 경우만)
  const legacyParticipants = useMemo(() => {
    if (!selectedEvent) return [];
    const rawParticipants = getParticipantsByEventId(selectedEvent.id);
    const participationUserIds = new Set(eventParticipations.map(p => p.userId));
    return rawParticipants.filter(p => !participationUserIds.has(p.memberId || p.id));
  }, [selectedEvent, getParticipantsByEventId, eventParticipations]);

  // 실시간 참가자 수 계산
  const realTimeParticipantCount = useMemo(() => {
    return eventParticipations.length + legacyParticipants.length;
  }, [eventParticipations, legacyParticipants]);

  // EventContext에서 현재 이벤트 사용 (개발 모드 상태 반영 + 실시간 카운트)
  const event = useMemo(() => {
    if (!selectedEvent) return null;
    
    return {
      ...selectedEvent,
      currentParticipants: isDevMode && currentApplicationStatus === 'full' 
        ? activeMemberCount 
        : realTimeParticipantCount,
    };
  }, [selectedEvent, isDevMode, currentApplicationStatus, realTimeParticipantCount]);
  
  // 참석자 데이터를 회원 DB와 매칭하여 실시간 정보 적용
  const participants = useMemo(() => {
    const fromParticipations = eventParticipations.map(p => {
      const member = getMemberById(p.userId) || 
                     members.find(m => m.name === p.userName && m.email === p.userEmail);
      return {
        id: p.userId,
        memberId: p.userId,
        name: member?.name || p.userName,
        email: member?.email || p.userEmail,
        company: member?.company || p.userCompany || '',
        position: member?.position || p.userPosition || '',
        phoneNumber: member?.phoneNumber || p.userPhone || '',
        status: p.status as 'confirmed' | 'pending',
        isGuest: p.isGuest || false,
        profileImage: member?.profileImage,
      };
    });
    
    const fromLegacy = legacyParticipants.map(p => {
      const member = getMemberById(p.memberId || p.id) || 
                     members.find(m => m.name === p.name && m.email === p.email);
      if (member) {
        return {
          ...p,
          name: member.name || p.name,
          company: member.company || p.company,
          position: member.position || p.position,
          profileImage: member.profileImage,
          phoneNumber: member.phoneNumber || p.phoneNumber,
          email: member.email || p.email,
        };
      }
      return { ...p, profileImage: undefined as string | undefined };
    });
    
    return [...fromParticipations, ...fromLegacy];
  }, [eventParticipations, legacyParticipants, members, getMemberById]);
  
  // 페이지 진입 시 최신 참가 데이터 로드 (다른 세션에서 추가된 신청 반영)
  useEffect(() => {
    refreshParticipations();
    if (selectedEvent) {
      refreshEventParticipants(selectedEvent.id);
    }
  }, [refreshParticipations, refreshEventParticipants, selectedEvent?.id]);

  // 조 편성 (Firebase에서 로드) — 번호 오름차순 정렬
  const teams = event
    ? [...getTeamsByEventId(event.id)].sort((a, b) => {
        const numA = (a as any).number ?? parseInt(a.name) ?? 0;
        const numB = (b as any).number ?? parseInt(b.name) ?? 0;
        return numA - numB;
      })
    : [];
  
  // 현재 사용자의 신청 여부 확인
  const userParticipation = useMemo(() => {
    if (!user || !event) return null;
    const allParticipations = getParticipationsByEvent(event.id);
    return allParticipations.find(p => p.userId === user.id && p.status !== 'cancelled');
  }, [user, event, participations]);
  
  const isUserApplied = !!userParticipation;
  
  // 날씨 데이터 로드 - 산행 이벤트가 있을 때만
  useEffect(() => {
    // event가 없으면 날씨 로드하지 않음
    if (!event) {
      setWeatherData(null);
      return;
    }
    
    const loadWeather = async () => {
      setIsWeatherLoading(true);
      try {
        const eventDate = event.date; // YYYY-MM-DD 형식
        
        // LocationInfo 구성
        const locationInfo = {
          address: event.address || event.location,
          coordinates: event.coordinates,
        };
        
        // 산행 날짜와 위치 기반 날씨 조회 (좌표가 있으면 가장 가까운 관측소 사용)
        const weather = await getWeatherByLocation(eventDate, locationInfo);
        
        setWeatherData(weather);
      } catch (error) {
        console.error('❌ [Events] 날씨 데이터 로드 실패:', error);
        setWeatherData(null);
      } finally {
        setIsWeatherLoading(false);
      }
    };
    
    loadWeather();
  }, [event?.id, event?.date, event?.location, event?.coordinates, event?.address]); // event 정보가 변경될 때마다 재로드

  // 날씨 상태에 따른 아이콘 및 텍스트
  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'sunny':
        return { icon: Sun, color: 'text-amber-400', bg: 'bg-amber-50', text: '맑음' };
      case 'cloudy':
        return { icon: Cloud, color: 'text-slate-400', bg: 'bg-slate-50', text: '흐림' };
      case 'rainy':
        return { icon: CloudRain, color: 'text-blue-500', bg: 'bg-blue-50', text: '비' };
      case 'snowy':
        return { icon: CloudSnow, color: 'text-cyan-400', bg: 'bg-cyan-50', text: '눈' };
      default:
        return { icon: Cloud, color: 'text-slate-400', bg: 'bg-slate-50', text: '흐림' };
    }
  };

  const weatherInfo = weatherData ? getWeatherIcon(weatherData.condition) : { icon: Cloud, color: 'text-slate-400', bg: 'bg-slate-50', text: '로딩 중' };
  const WeatherIcon = weatherInfo.icon;
  
  // 이전 산행 기록 (HikingHistory Context로 이동 권장)
  // 지난 산행 기록
  const pastEvents = [
    {
      id: 'past-1',
      title: '설악산 대청봉 등반',
      date: '2025-12-15',
      participants: 22,
    },
    {
      id: 'past-2',
      title: '지리산 노고단 산행',
      date: '2025-11-20',
      participants: 25,
    },
    {
      id: 'past-3',
      title: '설악산 대청봉 등반',
      date: '2025-10-18',
      participants: 20,
    },
  ];
  
  const getDifficultyBadge = (difficulty: '하' | '중하' | '중' | '중상' | '상') => {
    switch (difficulty) {
      case '하':
        return <Badge variant="success">하</Badge>;
      case '중하':
        return <Badge variant="info">중하</Badge>;
      case '중':
        return <Badge variant="warning">중</Badge>;
      case '중상':
        return <Badge variant="danger">중상</Badge>;
      case '상':
        return <Badge variant="danger">상</Badge>;
      default:
        return <Badge variant="warning">중</Badge>;
    }
  };
  
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  // 참석자 모달 열기 (최신 데이터 로드 후 표시)
  const handleOpenParticipantsModal = async () => {
    setShowParticipantsModal(true);
    // 모달 열 때 Firestore에서 최신 참가 데이터 로드
    await refreshParticipations();
    if (selectedEvent) {
      refreshEventParticipants(selectedEvent.id);
    }
  };
  
  // 신청 마감일 정보 계산 (개발 모드 상태 반영)
  const applicationDeadline = event ? formatDeadline(event.date, event.applicationDeadline) : '';
  const daysUntilDeadline = useMemo(() => {
    if (!event) return 0;
    if (!isDevMode) return getDaysUntilDeadline(event.date, event.applicationDeadline);
    
    // 개발 모드에서는 currentApplicationStatus에 따라 강제 설정
    if (currentApplicationStatus === 'closed') return -1;
    return getDaysUntilDeadline(event.date, event.applicationDeadline);
  }, [isDevMode, currentApplicationStatus, event]);
  
  const applicationClosed = useMemo(() => {
    if (!event) return false;
    if (!isDevMode) {
      // 관리자가 수동으로 마감했거나, 날짜 기반 마감일이 지났으면 마감 처리
      return event.status === 'closed' || event.status === 'ongoing' || event.status === 'completed' || isApplicationClosed(event.date, event.applicationDeadline);
    }
    return currentApplicationStatus === 'closed';
  }, [isDevMode, currentApplicationStatus, event]);
  
  // URL 파라미터로 신청 모달 자동 열기
  useEffect(() => {
    const apply = searchParams.get('apply');
    if (apply === 'true' && !applicationClosed && !isUserApplied && event && event.currentParticipants < activeMemberCount) {
      setShowCourseModal(true);
    }
  }, [searchParams, applicationClosed, isUserApplied, event]);
  
  const handleRegister = () => {
    if (isUserApplied) {
      alert('이미 참석 신청이 완료되었습니다.');
      return;
    }
    if (applicationClosed) {
      alert('신청 기간이 마감되었습니다.');
      return;
    }
    if (isDevMode && currentApplicationStatus === 'full') {
      alert('정원이 마감되었습니다.');
      return;
    }
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    // 코스 선택 모달 표시
    setShowCourseModal(true);
  };
  
  const handleCourseSelect = async (course: string) => {
    if (isSubmitting || !user || !event) return;
    
    // 중복 신청 방지: 이미 신청된 경우 차단
    if (isUserApplied) {
      alert('이미 참석 신청이 완료되었습니다.');
      setShowCourseModal(false);
      return;
    }
    
    setIsSubmitting(true);
    setSelectedCourse(course);
    
    try {
      await addParticipation({
        eventId: event.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email || '',
        userPhone: user.phoneNumber || '',
        userCompany: user.company || '',
        userPosition: user.position || '',
        course: course || undefined,
        status: 'pending',
        paymentStatus: 'pending',
        isGuest: false,
        registeredAt: new Date().toISOString(),
      });
      
      setShowCourseModal(false);
      // 입금 정보 모달 표시
      setShowPaymentModal(true);
    } catch (error) {
      console.error('참석 신청 실패:', error);
      alert('신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };
  
  const handleCancel = async () => {
    if (!userParticipation) {
      alert('신청 내역을 찾을 수 없습니다.');
      return;
    }

    if (!confirm('참석 신청을 취소하시겠습니까?\n\n이미 입금하신 경우 담당자에게 문의해주세요.')) {
      return;
    }
    
    try {
      await cancelParticipation(userParticipation.id, '사용자 취소');
      
      alert('참석 신청이 취소되었습니다.\n\n이미 입금하신 경우 담당자에게 문의해주세요.\n담당자: ' + (event?.paymentInfo?.managerName || '') + '\n연락처: ' + (event?.paymentInfo?.managerPhone || ''));
    } catch (error) {
      console.error('신청 취소 실패:', error);
      alert('신청 취소에 실패했습니다. 담당자에게 문의해주세요.');
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8 overflow-x-hidden">
      <SEOHead
        title="산행 일정"
        description="시애라 등산 커뮤니티 정기 산행 일정 및 신청 페이지."
        path="/home/events"
        noindex
      />
      
      {/* 산행 미정 상태 */}
      {(isDevMode && applicationStatus === 'no-event') || !event ? (
        <div>
          <div className="relative h-[400px] md:h-[500px] rounded-2xl overflow-hidden mb-12 shadow-xl">
            <img 
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&h=500&fit=crop" 
              alt="Mountain" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/50 to-black/30" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
              <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/20">
                <CalendarX className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">다음 산행 일정 준비 중</h2>
              <p className="text-white/90 text-lg mb-8 max-w-md text-center">
                이번 달 정기 산행이 완료되었습니다.<br />
                다음 산행 일정은 곧 공지될 예정입니다.
              </p>
              
              <div className="flex gap-4">
                <Link 
                  to="/home/gallery"
                  className="px-8 py-4 bg-white/20 backdrop-blur-md text-white rounded-xl font-bold hover:bg-white/30 transition-colors border border-white/30"
                >
                  사진 갤러리 보기
                </Link>
                <Link 
                  to="/home/hiking-history"
                  className="px-8 py-4 bg-white/20 backdrop-blur-md text-white rounded-xl font-bold hover:bg-white/30 transition-colors border border-white/30"
                >
                  이전 산행 보기
                </Link>
              </div>
            </div>
          </div>

          {/* 이달의 시 섹션 */}
          {currentPoem && (
            <div className="mb-12">
              <Card className="relative overflow-hidden">
                {/* 배경 그라데이션 */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20" />
                
                {/* 장식 요소 */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-100/20 to-purple-100/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-slate-100/30 to-blue-100/20 rounded-full blur-2xl" />
                
                <div className="relative p-8 md:p-12">
                  {/* 헤더 */}
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-slate-800">이달의 詩</h3>
                    <p className="text-sm text-slate-500 mt-2">
                      {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
                    </p>
                  </div>

                  {/* 시 제목과 작가 */}
                  <div className="mb-8 text-center">
                    <h4 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
                      {currentPoem.title}
                    </h4>
                    <p className="text-lg text-slate-600 italic">
                      — {currentPoem.author}
                    </p>
                  </div>

                  {/* 구분선 */}
                  <div className="flex items-center gap-4 mb-8">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                  </div>

                  {/* 시 본문 */}
                  <div className="max-w-3xl mx-auto">
                    <div className={`text-slate-700 leading-relaxed whitespace-pre-line text-center ${
                      currentPoem.content.length <= 200 ? 'text-lg md:text-xl' :
                      currentPoem.content.length <= 400 ? 'text-base md:text-lg' :
                      'text-sm md:text-base'
                    }`}>
                      {currentPoem.content}
                    </div>
                  </div>

                  {/* 하단 장식 */}
                  <div className="flex items-center gap-4 mt-8">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div>

      {/* ── 특별산행 배너 (정기산행과 함께 표시) ── */}
      {specialEvent && !isSpecialEvent && (
        <div className="mb-6 sm:mb-8">
          <Link
            to={`/home/events?eventId=${specialEvent.id}`}
            className="block group"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-lg border border-purple-200 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900">
              {/* 배경 장식 */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

              <div className="relative p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* 뱃지 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-400 text-amber-900 rounded-full text-xs font-bold">
                        {specialEvent.specialType === 'overseas' ? (
                          <><Globe className="w-3 h-3" />해외산행</>
                        ) : (
                          <><Star className="w-3 h-3" />특별산행</>
                        )}
                      </span>
                      <span className="text-purple-300 text-xs font-medium">제{specialEvent.eventNumber}차</span>
                    </div>

                    {/* 제목 */}
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-purple-200 transition-colors">
                      {specialEvent.mountain || specialEvent.location}
                    </h3>

                    {/* 날짜 & 장소 */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                      <div className="flex items-center gap-1.5 text-purple-200 text-sm">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {specialEvent.date}
                          {specialEvent.endDate && ` ~ ${specialEvent.endDate}`}
                          {specialEvent.endDate && (() => {
                            const s = new Date(specialEvent.date);
                            const e = new Date(specialEvent.endDate!);
                            const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            return ` (${diff}일)`;
                          })()}
                        </span>
                      </div>
                      {specialEvent.location && (
                        <div className="flex items-center gap-1.5 text-purple-200 text-sm">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{specialEvent.location}</span>
                        </div>
                      )}
                      {specialEvent.maxParticipants && (
                        <div className="flex items-center gap-1.5 text-purple-200 text-sm">
                          <Users className="w-4 h-4 flex-shrink-0" />
                          <span>정원 {specialEvent.maxParticipants}명</span>
                        </div>
                      )}
                    </div>

                    {/* 경비 정보 */}
                    {(specialEvent.memberCost || specialEvent.guestCost) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {specialEvent.memberCost && (
                          <span className="px-2.5 py-1 bg-white/10 text-white text-xs rounded-lg font-medium">
                            회원 {specialEvent.memberCost.toLocaleString()}원
                          </span>
                        )}
                        {specialEvent.guestCost && (
                          <span className="px-2.5 py-1 bg-white/10 text-white text-xs rounded-lg font-medium">
                            게스트 {specialEvent.guestCost.toLocaleString()}원
                          </span>
                        )}
                      </div>
                    )}

                    {/* 신청 기간 */}
                    {specialEvent.memberApplicationStart && (
                      <div className="flex items-center gap-1.5 text-amber-300 text-xs font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>신청 {specialEvent.memberApplicationStart} ~ {specialEvent.memberApplicationEnd || ''}</span>
                        {specialEvent.depositAmount && (
                          <span className="ml-1 text-purple-300">· 예약금 {specialEvent.depositAmount.toLocaleString()}원</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 화살표 */}
                  <div className="flex-shrink-0 flex items-center gap-2 text-purple-300 group-hover:text-white transition-colors">
                    <span className="hidden sm:block text-sm font-medium">자세히 보기</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ── 특별산행 상세 뷰 (특별산행 클릭 시) ── */}
      {isSpecialEvent && event && (
        <div className="mb-8 sm:mb-12">
          {/* 헤더 배너 */}
          <div className="relative overflow-hidden rounded-2xl shadow-xl bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 mb-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl" />
            <div className="relative p-6 sm:p-8">
              {/* 뒤로 가기 + 뱃지 */}
              <div className="flex items-center justify-between mb-4">
                <Link
                  to="/home/events"
                  className="flex items-center gap-1.5 text-purple-300 hover:text-white transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  정기산행으로 돌아가기
                </Link>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 text-amber-900 rounded-full text-sm font-bold">
                    {event.specialType === 'overseas' ? (
                      <><Globe className="w-3.5 h-3.5" />해외산행</>
                    ) : (
                      <><Star className="w-3.5 h-3.5" />특별산행</>
                    )}
                  </span>
                </div>
              </div>

              {/* 제목 */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">{event.title}</h1>
              <p className="text-purple-200 text-base sm:text-lg mb-5">{event.location}</p>

              {/* 핵심 정보 그리드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                  <p className="text-purple-300 text-xs mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />날짜</p>
                  <p className="text-white font-bold text-sm">
                    {event.date}
                    {event.endDate && <><br /><span className="text-purple-200">~ {event.endDate}</span></>}
                    {event.endDate && (() => {
                      const s = new Date(event.date);
                      const e2 = new Date(event.endDate!);
                      const diff = Math.round((e2.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      return <span className="text-amber-300 text-xs ml-1">{diff}박{diff-1}일</span>;
                    })()}
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                  <p className="text-purple-300 text-xs mb-1 flex items-center gap-1"><Users className="w-3 h-3" />정원</p>
                  <p className="text-white font-bold text-sm">
                    {event.maxParticipants}명
                    <span className="text-purple-300 text-xs ml-1">({event.currentParticipants || 0}명 신청)</span>
                  </p>
                </div>
                {event.memberCost && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                    <p className="text-purple-300 text-xs mb-1 flex items-center gap-1"><Wallet className="w-3 h-3" />회원 경비</p>
                    <p className="text-white font-bold text-sm">{event.memberCost.toLocaleString()}원</p>
                  </div>
                )}
                {event.guestCost && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                    <p className="text-purple-300 text-xs mb-1 flex items-center gap-1"><Wallet className="w-3 h-3" />게스트 경비</p>
                    <p className="text-white font-bold text-sm">{event.guestCost.toLocaleString()}원</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 신청 안내 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* 신청 정보 */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                신청 안내
              </h3>
              <div className="space-y-3">
                {event.memberApplicationStart && (
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
                    <UserCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-900">회원 신청 기간</p>
                      <p className="text-sm text-blue-700">{event.memberApplicationStart} ~ {event.memberApplicationEnd || '추후 공지'}</p>
                    </div>
                  </div>
                )}
                {event.depositAmount && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
                    <CreditCard className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">예약금</p>
                      <p className="text-sm text-amber-700">
                        {event.depositAmount.toLocaleString()}원 입금
                        {event.depositDeadline && ` (마감: ${event.depositDeadline})`}
                      </p>
                      {event.balanceDeadline && (
                        <p className="text-xs text-amber-600 mt-0.5">잔금 마감: {event.balanceDeadline}</p>
                      )}
                    </div>
                  </div>
                )}
                {event.guestApplicationStart && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                    <Users className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">비회원 모집</p>
                      <p className="text-sm text-slate-600">
                        {event.guestApplicationStart} ~ {event.guestApplicationEnd || '추후 공지'}
                        <span className="text-xs text-slate-400 ml-1">(회원 미달 시)</span>
                      </p>
                    </div>
                  </div>
                )}
                {event.specialPaymentNote && (
                  <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
                    <Bell className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-purple-800">{event.specialPaymentNote}</p>
                  </div>
                )}
                {event.description && (
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{event.description}</p>
                )}
              </div>
            </div>

            {/* 신청 버튼 패널 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base mb-3">신청 현황</h3>
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-slate-600 mb-2">
                    <span>신청 인원</span>
                    <span className="font-semibold">{event.currentParticipants || 0} / {event.maxParticipants}명</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((event.currentParticipants || 0) / event.maxParticipants) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {isUserApplied ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold mb-2">
                      <CheckCircle className="w-4 h-4" />
                      신청 완료
                    </div>
                    <button
                      onClick={handleCancel}
                      className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
                    >
                      신청 취소
                    </button>
                  </>
                ) : applicationClosed ? (
                  <button disabled className="w-full py-3 bg-slate-100 text-slate-400 rounded-xl font-semibold text-sm cursor-not-allowed">
                    신청 마감
                  </button>
                ) : !user ? (
                  <Link to="/login" className="block w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm text-center hover:bg-purple-700 transition-colors">
                    로그인 후 신청
                  </Link>
                ) : (
                  <button
                    onClick={handleRegister}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? '신청 중...' : '참가 신청'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 일차별 상세 일정 */}
          {event.dailySchedule && event.dailySchedule.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-6">
              <h3 className="font-bold text-slate-900 text-base mb-5 flex items-center gap-2">
                <Plane className="w-5 h-5 text-purple-600" />
                상세 일정
              </h3>
              <div className="space-y-4">
                {event.dailySchedule.map((dayItem) => (
                  <div key={dayItem.day} className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-purple-50 border-b border-purple-100">
                      <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-bold rounded-full">{dayItem.day}일차</span>
                      <span className="text-sm font-semibold text-slate-800">{dayItem.title || `${dayItem.day}일차`}</span>
                      {dayItem.date && <span className="text-xs text-slate-500 ml-auto">{dayItem.date}</span>}
                    </div>
                    <div className="divide-y divide-slate-50">
                      {dayItem.items.map((item, idx) => (
                        <div key={idx} className="flex gap-4 px-4 py-2.5">
                          {item.time ? (
                            <span className="text-sm font-mono text-purple-600 font-semibold w-12 flex-shrink-0">{item.time}</span>
                          ) : (
                            <span className="w-12 flex-shrink-0" />
                          )}
                          <p className="text-sm text-slate-700">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 참가자 목록 */}
          {participants.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-600" />
                신청자 목록 ({participants.length}명)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {participants.map((p, idx) => (
                  <div key={p.id || idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      {p.profileImage ? (
                        <img src={p.profileImage} alt={p.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-purple-600 text-xs font-bold">{p.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                      {(p.company || p.position) && (
                        <p className="text-xs text-slate-500 truncate">{[p.company, p.position].filter(Boolean).join(' ')}</p>
                      )}
                    </div>
                    {p.isGuest && <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded ml-auto">게스트</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 정기산행 (특별산행 상세가 아닐 때만 표시) ── */}
      {!isSpecialEvent && (
      <div>
      {/* Current Event */}
      <div className="mb-8 sm:mb-12">
        {/* Hero Image */}
        <div className="relative h-48 sm:h-64 md:h-80 rounded-2xl overflow-hidden">
          <img 
            src={event.imageUrl || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&h=500&fit=crop"} 
            alt={event.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
          
          {/* 날씨 정보 - 태블릿 이상에서만 표시 (산행이 있을 때만) */}
          {event && (
            <div className="hidden md:block absolute top-6 right-6">
              <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-4 min-w-[280px]">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-200">
                  <div className={`p-2 ${weatherInfo.bg} rounded-xl`}>
                    <WeatherIcon className={`w-6 h-6 ${weatherInfo.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-600 font-medium">산행 당일 날씨</p>
                    <p className="text-lg font-bold text-slate-900">{weatherInfo.text}</p>
                  </div>
                </div>
                
                {weatherData ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-50 rounded-lg">
                          <Thermometer className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">기온</p>
                          <p className="text-sm font-bold text-slate-900">{weatherData.temperature}°C</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 rounded-lg">
                          <Wind className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">풍속</p>
                          <p className="text-sm font-bold text-slate-900">{weatherData.windSpeed}m/s</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-50 rounded-lg">
                          <Droplets className="w-4 h-4 text-cyan-500" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">습도</p>
                          <p className="text-sm font-bold text-slate-900">{weatherData.humidity}%</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-50 rounded-lg">
                          <CloudRain className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">강수확률</p>
                          <p className="text-sm font-bold text-slate-900">{weatherData.precipitation}%</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* 체감온도 및 자외선 */}
                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        체감온도 <span className="font-semibold text-slate-900">{weatherData.feelsLike}°C</span>
                      </span>
                      <Badge variant={weatherData.uvIndex === 'low' ? 'success' : weatherData.uvIndex === 'high' || weatherData.uvIndex === 'very-high' ? 'danger' : 'warning'}>
                        자외선 {weatherData.uvIndex === 'low' ? '낮음' : weatherData.uvIndex === 'high' || weatherData.uvIndex === 'very-high' ? '높음' : '보통'}
                      </Badge>
                    </div>
                    
                    {weatherData.lastUpdated && (
                      <p className="text-xs text-slate-400 mt-3 text-center">
                        업데이트: {weatherData.lastUpdated}
                      </p>
                    )}
                  </>
                ) : isWeatherLoading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-3"></div>
                    <p className="text-sm text-slate-600">날씨 정보를 불러오는 중...</p>
                    <p className="text-xs text-slate-500 mt-1">기상청 API 호출 중</p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Cloud className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-600">날씨 정보 없음</p>
                    <p className="text-xs text-slate-500 mt-1">데이터를 불러올 수 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8">
            {/* 히어로 산행 신청 버튼 - 타이틀 위 배치 */}
            <div className="mb-3 sm:mb-4">
              {isUserApplied ? (
                <button className="inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-500/90 backdrop-blur-sm text-white rounded-xl font-bold text-sm sm:text-base border border-emerald-400/50 cursor-default shadow-lg shadow-emerald-500/25">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  신청 완료
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={applicationClosed || (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl font-bold text-sm sm:text-base transition-all ${
                    applicationClosed || (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount
                      ? 'bg-slate-500/60 text-white/60 border border-slate-400/30 cursor-not-allowed'
                      : 'bg-emerald-500 text-white hover:bg-emerald-400 active:scale-95 shadow-lg shadow-emerald-500/30 border border-emerald-400/50'
                  }`}
                >
                  {applicationClosed ? '신청 마감' : (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount ? '정원 마감' : '산행 신청하기'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              {(() => {
                const displayDifficulty = event.courses?.[0]?.difficulty || event.difficulty;
                return (
                  <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-semibold text-xs sm:text-sm ${
                    displayDifficulty === '하' ? 'bg-emerald-500/90 text-white border border-emerald-300' :
                    displayDifficulty === '중하' ? 'bg-blue-500/90 text-white border border-blue-300' :
                    displayDifficulty === '중' ? 'bg-amber-500/90 text-white border border-amber-300' :
                    displayDifficulty === '중상' ? 'bg-orange-500/90 text-white border border-orange-300' :
                    'bg-red-500/90 text-white border border-red-300'
                  }`}>
                    {displayDifficulty}
                  </span>
                );
              })()}
            </div>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">{event.title}</h2>
            <div className="flex items-center gap-3 sm:gap-4 text-white/90 text-sm sm:text-base">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Mountain className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>{event.altitude}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>{event.location}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Event Details */}
        <div className="pt-6 sm:pt-8">
          {/* 신청 마감일 안내 */}
          {applicationClosed ? (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-red-500 rounded-full flex items-center justify-center">
                  <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base sm:text-lg font-bold text-red-900 mb-0.5 sm:mb-1">신청 마감</h4>
                  <p className="text-xs sm:text-sm text-red-700">
                    신청 기간이 종료되었습니다. ({applicationDeadline} 마감)
                  </p>
                </div>
              </div>
            </div>
          ) : daysUntilDeadline <= 3 ? (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-amber-500 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base sm:text-lg font-bold text-amber-900 mb-0.5 sm:mb-1">마감 임박!</h4>
                  <p className="text-xs sm:text-sm text-amber-700">
                    신청 마감까지 <strong className="text-amber-900">{daysUntilDeadline}일</strong> 남았습니다. 
                    <span className="ml-1 sm:ml-2 text-amber-600">({applicationDeadline} 까지)</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base sm:text-lg font-bold text-blue-900 mb-0.5 sm:mb-1">신청 기간</h4>
                  <p className="text-xs sm:text-sm text-blue-700">
                    <strong className="text-blue-900">{applicationDeadline}</strong>까지 신청 가능합니다.
                    {!event?.applicationDeadline && <span className="ml-1 sm:ml-2 text-blue-600">(출발일 7일 전 마감)</span>}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div>
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  산행 정보
                </h3>
                {/* 관리자 전용: 상태 변경 버튼 */}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin/events"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <Edit className="w-4 h-4" />
                    수정
                  </Link>
                )}
              </div>
              <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg text-sm sm:text-base">
                  <span className="text-slate-600">일정</span>
                  <span className="font-semibold text-slate-900">{formatDate(event.date)}</span>
                </div>
                
                {/* 산 이름 표시 */}
                {event.mountain && (
                  <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg text-sm sm:text-base">
                    <span className="text-slate-600">산 이름</span>
                    <span className="font-semibold text-slate-900">
                      {event.mountain}
                    </span>
                  </div>
                )}
                
                {/* 주소 및 지도 연결 */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg gap-2 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-600 block mb-1 text-sm sm:text-base">장소</span>
                    <span className="text-slate-900 font-semibold text-sm sm:text-base break-words">
                      {event.address || event.location}
                    </span>
                    {/* 좌표 정보 표시 (좌표가 있을 때만) */}
                    {event.coordinates && (
                      <p className="text-xs text-slate-500 mt-1">
                        📍 {event.coordinates.latitude.toFixed(6)}, {event.coordinates.longitude.toFixed(6)}
                      </p>
                    )}
                  </div>
                  
                  {/* 지도 앱 연결 버튼 */}
                  <button
                    onClick={() => {
                      const destination = event.mountain || event.location;
                      
                      // 좌표가 있으면 좌표 사용, 없으면 주소 검색
                      if (event.coordinates) {
                        const { latitude, longitude } = event.coordinates;
                        
                        // 모바일 기기 감지
                        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                        
                        if (isMobile) {
                          // iOS: Apple Maps 또는 Google Maps
                          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                            // iOS - Apple Maps 우선
                            window.location.href = `maps://maps.apple.com/?q=${encodeURIComponent(destination)}&ll=${latitude},${longitude}`;
                            
                            // Apple Maps 앱이 없으면 Google Maps 웹으로 fallback
                            setTimeout(() => {
                              window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
                            }, 1000);
                          } else {
                            // Android - Google Maps
                            window.location.href = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(destination)})`;
                          }
                        } else {
                          // 데스크톱 - Google Maps 웹
                          window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
                        }
                      } else {
                        // 좌표가 없으면 주소로 검색
                        const searchQuery = encodeURIComponent(destination);
                        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                        
                        if (isMobile) {
                          if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                            // iOS - Apple Maps
                            window.location.href = `maps://maps.apple.com/?q=${searchQuery}`;
                            setTimeout(() => {
                              window.open(`https://www.google.com/maps/search/?api=1&query=${searchQuery}`, '_blank');
                            }, 1000);
                          } else {
                            // Android - Google Maps
                            window.location.href = `geo:0,0?q=${searchQuery}`;
                          }
                        } else {
                          // 데스크톱 - Google Maps 웹
                          window.open(`https://www.google.com/maps/search/?api=1&query=${searchQuery}`, '_blank');
                        }
                      }
                    }}
                    className="px-3 py-2 sm:px-4 sm:py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs sm:text-sm font-medium shadow-sm flex-shrink-0 w-full sm:w-auto justify-center"
                    title="지도 앱에서 길찾기"
                  >
                    <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>길찾기</span>
                  </button>
                </div>
                
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg text-sm sm:text-base">
                  <span className="text-slate-600">신청 인원</span>
                  <span className="font-semibold text-slate-900">{event.currentParticipants}/{activeMemberCount}명</span>
                </div>
                
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg text-sm sm:text-base">
                  <span className="text-slate-600">신청 마감</span>
                  <span className="font-semibold text-slate-900">{applicationDeadline}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 sm:p-3 bg-slate-50 rounded-lg text-sm sm:text-base">
                  <span className="text-slate-600">참가비</span>
                  <span className="font-semibold text-slate-900">{event.cost}</span>
                </div>
                {event.paymentInfo && (
                  <div className="p-2.5 sm:p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm sm:text-base">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-blue-800 text-xs sm:text-sm">입금 정보</span>
                    </div>
                    <div className="space-y-1 text-xs sm:text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">계좌</span>
                        <span className="font-medium text-slate-900">{event.paymentInfo.bankName} {event.paymentInfo.accountNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">예금주</span>
                        <span className="font-medium text-slate-900">{event.paymentInfo.accountHolder}</span>
                      </div>
                      {event.paymentInfo.managerName && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">담당자</span>
                          <span className="font-medium text-slate-900">{event.paymentInfo.managerName} {event.paymentInfo.managerPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                {event.description}
              </p>
            </div>
            
            {/* Schedule */}
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 sm:mb-6">
                당일 동선
              </h3>
              <div className="relative">
                {/* 타임라인 선 - 모바일에서 더 좁게 */}
                <div className="absolute left-4 sm:left-6 top-4 bottom-4 w-0.5 bg-slate-200"></div>
                
                <div className="space-y-3 sm:space-y-4">
                  {event.schedule.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === event.schedule.length - 1;
                    
                    return (
                      <div key={index} className="relative pl-10 sm:pl-14">
                        {/* 타임라인 도트 - 모바일에서 더 작게 */}
                        <div className={`absolute left-[10px] sm:left-[18px] top-3 sm:top-5 w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-md ${
                          item.type === 'departure' ? 'bg-success-500' :
                          item.type === 'arrival' ? 'bg-info-500' :
                          item.type === 'return' ? 'bg-warning-500' :
                          item.type === 'lunch' ? 'bg-orange-500' :
                          item.type === 'networking' ? 'bg-purple-500' :
                          item.type === 'lunch_networking' ? 'bg-orange-500' :
                          item.type === 'hiking_start' ? 'bg-green-600' :
                          item.type === 'hiking_end' ? 'bg-teal-500' :
                          'bg-primary-500'
                        }`}></div>
                        
                        <div className="bg-white rounded-lg border border-slate-200 hover:border-primary-300 transition-all p-3 sm:p-4 shadow-sm">
                          {/* 모바일: 세로 레이아웃, 태블릿 이상: 가로 레이아웃 */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            {/* 타입 배지 */}
                            <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold flex-shrink-0 w-fit sm:min-w-[80px] text-center ${
                              item.type === 'departure' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              item.type === 'arrival' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              item.type === 'return' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              item.type === 'lunch' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                              item.type === 'networking' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                              item.type === 'lunch_networking' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                              item.type === 'hiking_start' ? 'bg-green-100 text-green-800 border border-green-300' :
                              item.type === 'hiking_end' ? 'bg-teal-100 text-teal-800 border border-teal-300' :
                              'bg-slate-100 text-slate-800 border border-slate-300'
                            }`}>
                              {item.type === 'departure' && '출발'}
                              {item.type === 'stop' && '정차'}
                              {item.type === 'hiking_start' && '입산'}
                              {item.type === 'lunch' && '점심'}
                              {item.type === 'lunch_networking' && '점심/네트워킹'}
                              {item.type === 'hiking_end' && '하산'}
                              {item.type === 'networking' && '네트워킹'}
                              {item.type === 'return' && '복귀'}
                              {item.type === 'arrival' && '도착'}
                            </span>
                            
                            <div className="flex items-baseline gap-2 sm:gap-4">
                              {/* 시간 */}
                              <span className="text-base sm:text-lg font-bold text-primary-700 flex-shrink-0">{item.time}</span>
                              
                              {/* 장소 */}
                              <p className="text-sm sm:text-base text-slate-800 font-medium flex-1">{item.location}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          
          {/* 답사 사진은 참가자 현황 위 슬라이드로 이동 */}

          {/* 답사 사진 라이트박스 */}
          {lightboxOpen && event.surveyPhotos && event.surveyPhotos.length > 0 && (
            <div
              className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
              onClick={closeLightbox}
            >
              {/* 닫기 버튼 */}
              <button
                onClick={closeLightbox}
                className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* 사진 카운터 */}
              <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                {lightboxIndex + 1} / {event.surveyPhotos.length}
              </div>

              {/* 이전 버튼 */}
              {event.surveyPhotos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev - 1 + event.surveyPhotos!.length) % event.surveyPhotos!.length);
                  }}
                  className="absolute left-2 sm:left-4 z-10 w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* 다음 버튼 */}
              {event.surveyPhotos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev + 1) % event.surveyPhotos!.length);
                  }}
                  className="absolute right-2 sm:right-4 z-10 w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              {/* 메인 이미지 */}
              <img
                src={event.surveyPhotos[lightboxIndex]}
                alt={`답사 사진 ${lightboxIndex + 1}`}
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg select-none"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
              />
            </div>
          )}

          {/* Courses Section */}
          {event.courses && event.courses.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-slate-900 mb-6">산행 코스</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {event.courses.map((course) => (
                  <Card key={course.id} className="bg-slate-50 border-2 hover:border-primary-600 transition-all">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-300">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                          {course.name}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{course.name} 코스</p>
                          <p className="text-sm text-slate-600">{course.distance}</p>
                        </div>
                      </div>
                      {course.difficulty && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          course.difficulty === '하' ? 'bg-emerald-100 text-emerald-700' :
                          course.difficulty === '중하' ? 'bg-blue-100 text-blue-700' :
                          course.difficulty === '중' ? 'bg-amber-100 text-amber-700' :
                          course.difficulty === '중상' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          난이도 {course.difficulty}
                        </span>
                      )}
                    </div>
                    
                    <div className="mb-4">
                      <p className="text-sm font-bold text-slate-700 mb-2">코스 안내</p>
                      <p className="text-sm text-slate-600 leading-relaxed">{course.description}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-bold text-slate-700 mb-2">코스 정보</p>
                      <div className="text-sm text-slate-600 space-y-1">
                        {course.difficulty && <p>• 난이도: {course.difficulty}</p>}
                        <p>• 소요 시간: {course.duration}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* 답사 사진 가로 스크롤 */}
          {event.surveyPhotos && event.surveyPhotos.length > 0 && (
            <div className="mb-8 overflow-hidden">
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-4 h-4 text-blue-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">답사 사진</h3>
                <span className="text-xs text-slate-500">({event.surveyPhotos.length}장)</span>
              </div>

              {/* 한 줄 가로 스크롤 */}
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6">
                <div className="flex gap-2 sm:gap-2.5" style={{ width: 'max-content' }}>
                  {event.surveyPhotos.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => openLightbox(idx)}
                      className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden group cursor-pointer bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <img
                        src={url}
                        alt={`답사 사진 ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-slate-900">참가자 현황</span>
              <span className="font-bold text-primary-600 text-lg">
                {event.currentParticipants}/{activeMemberCount}명
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-primary-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((event.currentParticipants / activeMemberCount) * 100, 100)}%` }}
              />
            </div>
            <p className="text-sm text-slate-600 mt-2">
              {Math.min(Math.round((event.currentParticipants / activeMemberCount) * 100), 100)}% 신청 완료
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-4">
            {isUserApplied ? (
              <>
                <button className="flex-1 px-8 py-4 bg-primary-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2">
                  <CheckCircle className="w-6 h-6" />
                  참석 신청 완료
                </button>
                <button
                  onClick={handleCancel}
                  className="px-8 py-4 bg-slate-200 text-slate-700 rounded-xl font-bold text-lg hover:bg-slate-300 transition-colors"
                >
                  신청 취소
                </button>
              </>
            ) : (
              <button 
                onClick={handleRegister}
                className={`flex-1 text-lg py-4 rounded-xl font-bold transition-all ${
                  isSubmitting || applicationClosed || (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'btn-primary'
                }`}
                disabled={isSubmitting || applicationClosed || (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount}
              >
                {applicationClosed 
                  ? '신청 마감' 
                  : (isDevMode && currentApplicationStatus === 'full') || event.currentParticipants >= activeMemberCount 
                    ? '정원 마감' 
                    : '참석 신청하기'}
              </button>
            )}
            
            {/* View Participants Button */}
            <button 
              onClick={handleOpenParticipantsModal}
              className="px-8 py-4 border-2 border-slate-300 text-slate-900 rounded-xl font-bold text-lg hover:bg-slate-50 hover:border-primary-600 transition-all flex items-center justify-center gap-2"
            >
              <Users className="w-6 h-6" />
              참석자 명단 ({participants.length}명)
            </button>
          </div>
        </div>
      </div>
      
      {/* Course Selection Modal */}
      {showCourseModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCourseModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-900">코스 선택</h3>
                <button 
                  onClick={() => setShowCourseModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-slate-600 mt-2">참여하실 코스를 선택해주세요</p>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {isSubmitting && (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mr-3"></div>
                  <span className="text-slate-600">신청 처리 중...</span>
                </div>
              )}
              {event.courses.map((course, index) => (
                <button
                  key={index}
                  onClick={() => handleCourseSelect(course.name)}
                  disabled={isSubmitting}
                  className={`w-full p-6 border-2 border-slate-200 rounded-xl transition-all text-left group ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-600 hover:bg-primary-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-xl font-bold text-slate-900 group-hover:text-primary-600 transition-colors">
                      {course.name}
                    </h4>
                    <Badge variant={index === 0 ? "success" : "info"}>
                      {course.difficulty}
                    </Badge>
                  </div>
                  <p className="text-slate-600 mb-4">{course.description}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-600 mb-1">거리</p>
                      <p className="text-sm font-bold text-slate-900">{course.distance}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-600 mb-1">소요시간</p>
                      <p className="text-sm font-bold text-slate-900">{course.duration}</p>
                    </div>
                  </div>
                </button>
              ))}
              
              {/* 현장 결정 옵션 */}
              <button
                onClick={() => handleCourseSelect('현장 결정')}
                disabled={isSubmitting}
                className={`w-full p-6 border-2 border-slate-200 rounded-xl transition-all text-left group ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:border-amber-600 hover:bg-amber-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                    현장 결정
                  </h4>
                  <Badge variant="warning">선택</Badge>
                </div>
                <p className="text-slate-600">
                  현장에서 참가 코스를 결정하겠습니다
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Participants Modal */}
      {showParticipantsModal && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShowParticipantsModal(false)}
        >
          <div 
            className="bg-white w-full sm:max-w-2xl sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모바일 드래그 핸들 */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            
            {/* Modal Header */}
            <div className="flex-shrink-0 px-5 sm:px-8 pt-4 sm:pt-6 pb-5 border-b">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">참석자 명단</h3>
                <button 
                  onClick={() => setShowParticipantsModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="h-6 w-6 sm:h-7 sm:w-7 text-slate-600" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm sm:text-base font-semibold">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  입금완료 {participants.filter(p => p.status === 'confirmed').length}명
                </span>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-700 rounded-full text-sm sm:text-base font-semibold">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  입금대기 {participants.filter(p => p.status === 'pending').length}명
                </span>
                <span className="text-base sm:text-lg text-slate-500 ml-auto font-medium">
                  총 {participants.length}명
                </span>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto">
              {participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Users className="w-14 h-14 mb-4" />
                  <p className="text-lg">아직 참석자가 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {participants.map((participant, index) => (
                    <div 
                      key={participant.id} 
                      className="flex items-center gap-4 px-5 sm:px-8 py-4 sm:py-5 hover:bg-slate-50 transition-colors"
                    >
                      {/* 번호 */}
                      <span className="text-sm sm:text-base font-bold text-slate-400 min-w-[24px] text-right">{index + 1}</span>
                      
                      {/* 프로필 사진 */}
                      {getMemberPhoto(participant.name, participant.profileImage, participant.phoneNumber) ? (
                        <img 
                          src={getMemberPhoto(participant.name, participant.profileImage, participant.phoneNumber)!} 
                          alt={participant.name}
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover object-top flex-shrink-0 ring-2 ring-white shadow-sm"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm">
                          <span className="text-lg sm:text-xl font-bold text-slate-500">
                            {participant.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      
                      {/* 회원 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base sm:text-lg text-slate-900 truncate">
                          {participant.name}
                          {participant.isGuest && (
                            <span className="ml-2 text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded font-semibold align-middle">게스트</span>
                          )}
                        </p>
                        <p className="text-sm sm:text-base text-slate-500 truncate mt-0.5">
                          {participant.company && participant.position 
                            ? `${participant.company} · ${participant.position}`
                            : participant.company 
                              ? participant.company
                              : participant.position || ''}
                        </p>
                      </div>
                      
                      {/* 상태 배지 */}
                      <span className={`flex-shrink-0 text-sm sm:text-base font-bold px-3 sm:px-4 py-1.5 rounded-full ${
                        participant.status === 'confirmed' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {participant.status === 'confirmed' ? '입금완료' : '입금대기'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="flex-shrink-0 px-5 sm:px-8 py-4 sm:py-5 border-t bg-slate-50">
              <button 
                onClick={() => setShowParticipantsModal(false)}
                className="w-full px-6 py-3 sm:py-3.5 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors text-base sm:text-lg"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Teams Section - 조편성이 등록되어 있고, 신청 마감 또는 정원 마감 상태일 때만 표시 */}
      {teams.length > 0 && (applicationClosed || (isDevMode && currentApplicationStatus === 'full')) && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary-600" />
            이달의 참석자 조 편성
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Card key={team.id} className="hover:shadow-lg hover:border-primary-600 transition-all">
                {/* Team Header */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
                  <div className="w-12 h-12 bg-primary-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                    {team.name}
                  </div>
                  <div className="flex-1">
                    <Badge variant="info">조장</Badge>
                    <p className="font-bold text-slate-900 mt-1">{team.leaderName}</p>
                    <p className="text-sm text-slate-600">{team.leaderOccupation}</p>
                  </div>
                </div>
                
                {/* Team Members */}
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-3">
                    조원 {team.members.length}명
                  </p>
                  <div className="space-y-2">
                    {team.members.map((member, idx) => (
                      <div 
                        key={member.id} 
                        className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0"
                      >
                        <span className="text-xs text-slate-500 mt-0.5 min-w-[16px]">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">
                            {member.name}
                            {member.isGuest && (
                              <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-semibold align-middle">게스트</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-600">
                            {member.company && member.position
                              ? `${member.company} · ${member.position}`
                              : member.company || member.position || member.occupation || ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 안전 수칙 & 장비 체크리스트 */}
      <div className="space-y-8 mt-12">
        {/* 안전 수칙 */}
        <Card className="hover:shadow-xl transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertTriangle className="w-7 h-7 text-red-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">안전 수칙</h2>
              <p className="text-slate-600 text-sm">안전한 산행을 위해 꼭 지켜주세요</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
              <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-red-600">📋</span>
                등산 전 준비사항
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">일기예보를 꼭 확인하세요</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">등산화, 등산복, 스틱 준비</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">충분한 물과 간식 챙기기</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">휴대폰 배터리 충전</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
              <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-green-600">⛰️</span>
                등산 중 주의사항
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">자신의 체력에 맞는 페이스 유지</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">일행과 떨어지지 않기</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">표지판과 리본 확인하며 이동</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">쓰레기는 반드시 되가져가기</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">🌦️</span>
                기상 변화 대응
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">보온 의류 여벌 준비</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">비옷이나 우산 챙기기</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">급격한 기상 변화 시 하산 고려</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">체온 유지에 신경 쓰기</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* 등산 장비 체크리스트 */}
        <Card className="hover:shadow-xl transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Backpack className="w-7 h-7 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">등산 장비 체크리스트</h2>
              <p className="text-slate-600 text-sm">산행 전 꼭 챙겨야 할 필수 장비</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">👟</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">등산화</p>
              <p className="text-slate-600 text-xs text-center">발목 보호 & 미끄럼 방지</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">👕</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">등산복</p>
              <p className="text-slate-600 text-xs text-center">땀 배출 & 보온성</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">🎒</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">배낭</p>
              <p className="text-slate-600 text-xs text-center">20-30L 용량</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">🥾</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">등산 스틱</p>
              <p className="text-slate-600 text-xs text-center">무릎 보호 & 균형 유지</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">💧</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">물</p>
              <p className="text-slate-600 text-xs text-center">0.5L 이상 식수</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">🍫</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">간식</p>
              <p className="text-slate-600 text-xs text-center">초콜릿, 견과류 등</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">🏥</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">구급약</p>
              <p className="text-slate-600 text-xs text-center">밴드, 소독약, 진통제</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-purple-400 transition-all">
              <div className="text-center mb-2 text-3xl">🔦</div>
              <p className="font-bold text-slate-900 text-center text-sm mb-1">헤드랜턴</p>
              <p className="text-slate-600 text-xs text-center">비상시 조명</p>
            </div>
          </div>
        </Card>
      </div>
        </div>
      )}
      
      {/* 입금 정보 모달 */}
      {showPaymentModal && event.paymentInfo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="p-6 border-b">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-2xl font-bold text-slate-900">신청 완료</h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6 text-slate-600" />
                </button>
              </div>
              <p className="text-slate-600 mt-2">
                {event.title} 산행 신청이 완료되었습니다.
              </p>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <p className="text-lg font-bold text-green-900">
                    신청이 완료되었습니다!
                  </p>
                </div>
                <p className="text-sm text-green-800">
                  아래 계좌로 참가비를 입금해주시면 최종 확정됩니다.
                </p>
              </div>
              
              {/* 입금 정보 */}
              <div className="space-y-4">
                <h4 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-primary-600" />
                  입금 정보
                </h4>
                
                {/* 참가비 */}
                <Card className="bg-primary-50 border-2 border-primary-200">
                  <p className="text-sm text-primary-700 mb-1 font-medium">참가비</p>
                  <p className="text-3xl font-bold text-primary-900">{event.cost}</p>
                </Card>
                
                {/* 계좌 정보 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-xl hover:border-primary-600 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">은행명</p>
                      <p className="text-lg font-bold text-slate-900">{event.paymentInfo.bankName}</p>
                    </div>
                    <button
                      onClick={() => handleCopyToClipboard(event.paymentInfo.bankName, '은행명')}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      title="복사"
                    >
                      <Copy className="h-5 w-5 text-slate-600" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-xl hover:border-primary-600 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">계좌번호</p>
                      <p className="text-lg font-bold text-slate-900">{event.paymentInfo.accountNumber}</p>
                    </div>
                    <button
                      onClick={() => handleCopyToClipboard(event.paymentInfo.accountNumber, '계좌번호')}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      title="복사"
                    >
                      <Copy className="h-5 w-5 text-slate-600" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-xl hover:border-primary-600 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm text-slate-600">예금주</p>
                      <p className="text-lg font-bold text-slate-900">{event.paymentInfo.accountHolder}</p>
                    </div>
                    <button
                      onClick={() => handleCopyToClipboard(event.paymentInfo.accountHolder, '예금주')}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      title="복사"
                    >
                      <Copy className="h-5 w-5 text-slate-600" />
                    </button>
                  </div>
                  
                  <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <p className="text-sm text-yellow-700 font-medium">입금 기한</p>
                    </div>
                    <p className="text-lg font-bold text-yellow-900">{event.paymentInfo.deadline}</p>
                  </div>
                </div>
                
                {/* 전체 정보 복사 버튼 - 메인 영역에 배치 */}
                <button
                  onClick={() => {
                    if (event.paymentInfo) {
                      const copyText = `[산행 신청 완료]
산행명: ${event.title}
참가비: ${event.cost}

[입금 정보]
은행명: ${event.paymentInfo.bankName}
계좌번호: ${event.paymentInfo.accountNumber}
예금주: ${event.paymentInfo.accountHolder}
입금 기한: ${event.paymentInfo.deadline}

[담당자 연락처]
담당자: ${event.paymentInfo.managerName}
연락처: ${event.paymentInfo.managerPhone}`.trim();
                      
                      navigator.clipboard.writeText(copyText)
                        .then(() => {
                          alert('입금 정보가 클립보드에 복사되었습니다.');
                          setShowPaymentModal(false);
                        })
                        .catch(() => {
                          alert('복사에 실패했습니다. 다시 시도해주세요.');
                        });
                    }
                  }}
                  className="w-full px-6 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl font-bold hover:from-primary-700 hover:to-primary-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <Copy className="w-5 h-5" />
                  전체 정보 복사하기
                </button>
                
                {/* 담당자 정보 */}
                <Card className="bg-blue-50 border-blue-200">
                  <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-blue-600" />
                    담당자 문의
                  </h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">이름</span>
                      <span className="font-semibold text-slate-900">{event.paymentInfo.managerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">연락처</span>
                      <a 
                        href={`tel:${event.paymentInfo.managerPhone}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {event.paymentInfo.managerPhone}
                      </a>
                    </div>
                  </div>
                </Card>
                
                {/* 입금 시 주의사항 */}
                <Card className="bg-amber-50 border-2 border-amber-200">
                  <h5 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    입금 시 주의사항
                  </h5>
                  <ul className="space-y-1 text-sm text-amber-800">
                    <li>• 입금자명은 본인 이름으로 해주세요</li>
                    <li>• 입금 확인 후 참석이 최종 확정됩니다</li>
                    <li>• 문의사항은 담당자에게 연락주세요</li>
                  </ul>
                </Card>
                
                {copiedText && (
                  <div className="fixed top-4 right-4 px-4 py-2 bg-primary-600 text-white rounded-xl shadow-lg animate-fade-in z-50">
                    ✓ {copiedText} 복사됨
                  </div>
                )}
              </div>
            </div>

            {/* 푸터 */}
            <div className="p-6 border-t">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
};

export default Events;
