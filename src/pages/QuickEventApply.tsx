import { useState, useMemo, useEffect } from 'react';
import { Calendar, MapPin, AlertCircle, CheckCircle, Mountain, UserCheck, Clock, ArrowLeft, Search, Building2, X, Copy, Check, XCircle, UserX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import { useEvents } from '../contexts/EventContext';
import { useMembers } from '../contexts/MemberContext';
import { useParticipations } from '../contexts/ParticipationContext';
import { formatDate, formatDeadline, getDaysUntilDeadline, isApplicationClosed } from '../utils/format';
import { User } from '../types';
import SEOHead from '../components/SEOHead';
import { useLoadingSafetyTimeout } from '../hooks/useLoadingSafetyTimeout';

// 개인정보 마스킹 유틸리티
const maskName = (name: string): string => {
  if (!name) return '';
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
};

const maskCompany = (company: string): string => {
  if (!company) return '';
  if (company.length <= 1) return '*';
  if (company.length <= 3) return company[0] + '*'.repeat(company.length - 1);
  return company.slice(0, 2) + '*'.repeat(company.length - 2);
};

const maskEmail = (email: string): string => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length <= 2 ? local[0] + '***' : local.slice(0, 2) + '***';
  const domainParts = domain.split('.');
  const maskedDomain = domainParts[0].length <= 2 
    ? domainParts[0][0] + '***' 
    : domainParts[0].slice(0, 2) + '***';
  return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
};

export default function QuickEventApply() {
  const navigate = useNavigate();
  const { events, isLoading: eventsLoading } = useEvents();
  const { members, isLoading: membersLoading } = useMembers();
  const { addParticipation, getParticipationsByEvent, deleteParticipation, isLoading: participationsLoading } = useParticipations();
  
  const loadingTimedOut = useLoadingSafetyTimeout(undefined, 'QuickEventApply');
  
  // 모드: 'apply' | 'cancel'
  const [mode, setMode] = useState<'apply' | 'cancel'>('apply');
  
  const [name, setName] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);
  const [completedEvent, setCompletedEvent] = useState<typeof currentEvent>(null);
  const [copiedText, setCopiedText] = useState('');

  // 취소 모드 관련 state
  const [cancelName, setCancelName] = useState('');
  const [cancelSelectedMember, setCancelSelectedMember] = useState<User | null>(null);
  const [showCancelSuggestions, setShowCancelSuggestions] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelCompleted, setCancelCompleted] = useState(false);

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const approvedMembers = useMemo(() => {
    return members.filter(m => m.isApproved && m.isActive !== false);
  }, [members]);

  const filteredMembers = useMemo(() => {
    if (!name.trim() || selectedMember) return [];
    const searchName = name.trim().toLowerCase();
    return approvedMembers
      .filter(member => member.name.toLowerCase().includes(searchName))
      .slice(0, 10);
  }, [name, approvedMembers, selectedMember]);

  const handleNameChange = (value: string) => {
    setName(value);
    setSelectedMember(null);
    setShowMemberSuggestions(true);
  };

  const handleSelectMember = (member: User) => {
    setSelectedMember(member);
    setName(member.name);
    setShowMemberSuggestions(false);
  };

  const handleClearSelection = () => {
    setSelectedMember(null);
    setName('');
    setShowMemberSuggestions(false);
  };

  // 모드 전환 시 상태 초기화
  const handleModeChange = (newMode: 'apply' | 'cancel') => {
    setMode(newMode);
    // 신청 모드 초기화
    setName('');
    setSelectedMember(null);
    setShowMemberSuggestions(false);
    setSelectedCourse('');
    // 취소 모드 초기화
    setCancelName('');
    setCancelSelectedMember(null);
    setShowCancelSuggestions(false);
    setCancelCompleted(false);
  };

  // 취소 모드: 이름 검색 필터
  const filteredCancelMembers = useMemo(() => {
    if (!cancelName.trim() || cancelSelectedMember) return [];
    const searchName = cancelName.trim().toLowerCase();
    return approvedMembers
      .filter(member => member.name.toLowerCase().includes(searchName))
      .slice(0, 10);
  }, [cancelName, approvedMembers, cancelSelectedMember]);

  const handleCancelNameChange = (value: string) => {
    setCancelName(value);
    setCancelSelectedMember(null);
    setShowCancelSuggestions(true);
  };

  const handleSelectCancelMember = (member: User) => {
    setCancelSelectedMember(member);
    setCancelName(member.name);
    setShowCancelSuggestions(false);
  };

  const handleClearCancelSelection = () => {
    setCancelSelectedMember(null);
    setCancelName('');
    setShowCancelSuggestions(false);
  };

  const availableEvents = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const twoMonthsLater = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return events
      .filter((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        const isPublished = event.isPublished !== false && event.isDraft !== true;
        const isNotCompleted = event.status !== 'completed';
        const isInDateRange = eventDate >= now && eventDate <= twoMonthsLater;
        return isPublished && isNotCompleted && isInDateRange;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  const currentEvent = useMemo(() => {
    if (selectedEventId) {
      return availableEvents.find(e => e.id === selectedEventId) || availableEvents[0] || null;
    }
    return availableEvents[0] || null;
  }, [availableEvents, selectedEventId]);

  // 취소 모드: 선택된 회원의 현재 이벤트 참가 내역 확인
  const cancelMemberParticipation = useMemo(() => {
    if (!cancelSelectedMember || !currentEvent) return null;
    const participations = getParticipationsByEvent(currentEvent.id);
    return participations.find(p => p.userId === cancelSelectedMember.id) || null;
  }, [cancelSelectedMember, currentEvent, getParticipationsByEvent]);

  // 취소 처리 (deleteParticipation이 결제/조편성 캐스케이드 삭제를 자동 처리)
  const handleCancelParticipation = async () => {
    if (!cancelMemberParticipation || !cancelSelectedMember) return;
    
    const confirmCancel = window.confirm(
      `${cancelSelectedMember.name}님의 산행 신청을 취소하시겠습니까?\n\n관련된 조편성 및 입금 정보도 함께 삭제됩니다.`
    );
    if (!confirmCancel) return;

    setIsCancelling(true);
    try {
      await deleteParticipation(cancelMemberParticipation.id);
      setCancelCompleted(true);
    } catch (error) {
      console.error('산행 취소 실패:', error);
      alert('산행 취소 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (currentEvent && currentEvent.courses && currentEvent.courses.length > 0) {
      setSelectedCourse(currentEvent.courses[0].name);
    } else {
      setSelectedCourse('');
    }
  }, [currentEvent]);

  const applicationDeadline = currentEvent ? formatDeadline(currentEvent.date, currentEvent.applicationDeadline) : '';
  const daysUntilDeadline = currentEvent ? getDaysUntilDeadline(currentEvent.date, currentEvent.applicationDeadline) : 0;
  const applicationClosed = currentEvent
    ? (currentEvent.status === 'closed' || currentEvent.status === 'ongoing' || currentEvent.status === 'completed')
    : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) { alert('등록된 회원을 선택해주세요.'); return; }
    if (!currentEvent) { alert('현재 신청 가능한 산행이 없습니다.'); return; }
    if (currentEvent.courses && currentEvent.courses.length > 0 && !selectedCourse) { alert('코스를 선택해주세요.'); return; }
    if (currentEvent.status === 'closed' || currentEvent.status === 'ongoing' || currentEvent.status === 'completed') { alert('조 편성이 완료되어 신청이 마감되었습니다.'); return; }
    const existingParticipations = getParticipationsByEvent(currentEvent.id);
    // 취소된 참가는 재신청 허용 (환불 처리 후 재신청 가능하도록)
    const alreadyApplied = existingParticipations.some(p => p.userId === selectedMember.id && p.status !== 'cancelled');
    if (alreadyApplied) { alert('이미 신청하신 산행입니다.'); return; }

    setIsSubmitting(true);
    try {
      await addParticipation({
        eventId: currentEvent.id,
        userId: selectedMember.id,
        userName: selectedMember.name,
        userEmail: selectedMember.email || '',
        userPhone: selectedMember.phoneNumber || '',
        userCompany: selectedMember.company || '',
        userPosition: selectedMember.position || '',
        course: selectedCourse || undefined,
        status: 'pending',
        paymentStatus: 'pending',
        isGuest: false,
      });
      setCompletedEvent(currentEvent);
      setShowPaymentInfo(true);
    } catch (error) {
      console.error('산행 신청 실패:', error);
      alert('산행 신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    if (['하', '중하', '중', '중상', '상'].includes(difficulty)) return difficulty;
    const labels: Record<string, string> = { easy: '하', medium: '중', hard: '상' };
    return labels[difficulty] || difficulty;
  };

  const getDifficultyColor = (difficulty: string) => {
    const d = getDifficultyLabel(difficulty);
    switch (d) {
      case '하': return 'success';
      case '중하': return 'info';
      case '중': return 'warning';
      case '중상': case '상': return 'danger';
      default: return 'primary';
    }
  };

  // 로딩 중 (이벤트, 회원, 참여 데이터 모두 확인)
  // 안전 타임아웃 이후에는 로딩을 강제 해제하여 빈 페이지 방지
  const isLoading = !loadingTimedOut && (eventsLoading || membersLoading || participationsLoading);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 산행이 없는 경우
  if (!currentEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <Link to="/" className="inline-flex items-center text-slate-600 hover:text-slate-900 mb-8 transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" />
            메인으로 돌아가기
          </Link>
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">간편 산행 신청</h1>
            <p className="text-slate-600 text-lg">이름만 입력하면 빠르게 산행을 신청할 수 있습니다</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">현재 신청 가능한 산행이 없습니다</h2>
            <p className="text-slate-500 mb-6">다음 산행 일정을 기다려주세요.<br />정기 산행은 매월 진행됩니다.</p>
            <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <SEOHead
        title="간편 산행 신청"
        description="시애라 간편 산행 신청. 회원이라면 이름만으로 빠르게 다음 산행에 신청할 수 있습니다."
        path="/quick-apply"
      />
      <div className="max-w-lg mx-auto">
        {/* 뒤로가기 */}
        <Link to="/" className="inline-flex items-center text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" />
          메인으로 돌아가기
        </Link>

        {/* 헤더 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">간편 산행 신청</h1>
          <p className="text-slate-600 text-lg">이름만 입력하면 빠르게 산행을 신청할 수 있습니다</p>
        </div>

        {/* 신청 / 취소 탭 */}
        <div className="mb-6 flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => handleModeChange('apply')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all ${
              mode === 'apply'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            산행 신청
          </button>
          <button
            onClick={() => handleModeChange('cancel')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all ${
              mode === 'cancel'
                ? 'bg-white text-red-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserX className="w-4 h-4" />
            산행 취소
          </button>
        </div>

        {/* 안내 */}
        <div className={`mb-6 p-4 rounded-xl border ${
          mode === 'apply'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              mode === 'apply' ? 'text-emerald-600' : 'text-red-500'
            }`} />
            <div className={`text-sm ${mode === 'apply' ? 'text-emerald-800' : 'text-red-800'}`}>
              <p className="font-semibold mb-1">
                {mode === 'apply' ? '간편 신청 안내' : '간편 취소 안내'}
              </p>
              <p>
                {mode === 'apply'
                  ? '등록된 회원만 신청 가능합니다. 정확한 이름을 입력하시면 자동으로 회원 정보가 확인됩니다.'
                  : '이름을 입력하면 신청 내역을 확인하고 취소할 수 있습니다.'}
              </p>
            </div>
          </div>
        </div>

        {/* 산행 선택 (여러 산행이 있을 경우) */}
        {availableEvents.length > 1 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">산행 선택</h3>
            <div className="space-y-2">
              {availableEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => { setSelectedEventId(event.id); setSelectedCourse(''); }}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    currentEvent.id === event.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-bold text-slate-900">{event.title}</h4>
                    <Badge variant={getDifficultyColor(event.difficulty)}>
                      {getDifficultyLabel(event.difficulty)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 메인 카드 */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {mode === 'apply' ? (
          <form onSubmit={handleSubmit}>
            {/* 산행 정보 */}
            <div className="p-5 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                {availableEvents.length > 1 ? '선택된 산행' : '이번 달 정기 산행'}
              </h3>

              {/* 마감 상태 */}
              {applicationClosed ? (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-700">신청 마감</p>
                      <p className="text-xs text-red-600">조 편성이 완료되어 신청이 마감되었습니다.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>신청 접수 중 · <strong>조 편성 완료 시 마감</strong></span>
                  </div>
                </div>
              )}

              {/* 산행 상세 */}
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-xl font-bold text-slate-900">{currentEvent.title}</h4>
                  <Badge variant={getDifficultyColor(currentEvent.difficulty)}>
                    {getDifficultyLabel(currentEvent.difficulty)}
                  </Badge>
                </div>
                <div className="space-y-2 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm">{formatDate(currentEvent.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-sm">{currentEvent.location}</span>
                  </div>
                  {currentEvent.mountain && (
                    <div className="flex items-center gap-2">
                      <Mountain className="w-4 h-4 text-slate-400" />
                      <span className="text-sm">
                        {currentEvent.mountain}
                        {currentEvent.altitude && ` (${currentEvent.altitude})`}
                      </span>
                    </div>
                  )}
                  {currentEvent.cost && (
                    <div className="pt-2 mt-2 border-t border-slate-200">
                      <span className="text-base font-bold text-emerald-600">참가비: {currentEvent.cost}</span>
                    </div>
                  )}
                </div>
                {currentEvent.description && (
                  <p className="mt-3 text-sm text-slate-500 leading-relaxed">{currentEvent.description}</p>
                )}
              </div>
            </div>

            {/* 코스 선택 */}
            {currentEvent.courses && currentEvent.courses.length > 0 && (
              <div className="p-5 sm:p-6 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">코스 선택</h3>
                <div className="space-y-2">
                  {currentEvent.courses.map((course, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedCourse(course.name)}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        selectedCourse === course.name
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900">{course.name}</h4>
                          <span className="text-xs text-slate-400">{course.distance}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={index === 0 ? "warning" : "info"}>
                            {course.difficulty}
                          </Badge>
                          {selectedCourse === course.name && (
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-500 leading-relaxed">{course.description}</p>
                    </button>
                  ))}
                  
                  {/* 현장 결정 */}
                  <button
                    type="button"
                    onClick={() => setSelectedCourse('현장 결정')}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      selectedCourse === '현장 결정'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">현장에서 결정하겠습니다</span>
                      {selectedCourse === '현장 결정' && (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                  </button>
                </div>
                
                {!selectedCourse && (
                  <p className="mt-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                    코스를 선택해주세요
                  </p>
                )}
              </div>
            )}

            {/* 신청자 정보 */}
            <div className="p-5 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">신청자 정보</h3>
              
              <div className="relative">
                <label className="block text-slate-700 font-semibold mb-2 text-sm">
                  이름 <span className="text-red-500">*</span>
                </label>
                
                {selectedMember ? (
                  <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                          {selectedMember.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{maskName(selectedMember.name)}</p>
                          {selectedMember.company && (
                            <p className="text-sm text-slate-500 flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {maskCompany(selectedMember.company)}
                            </p>
                          )}
                          <p className="text-xs text-emerald-600 mt-0.5 font-medium">등록된 회원</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="p-2 hover:bg-emerald-100 rounded-lg transition-colors"
                        disabled={isSubmitting}
                      >
                        <X className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onFocus={() => setShowMemberSuggestions(true)}
                        className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all pr-12"
                        placeholder="등록된 회원 이름을 입력하세요"
                        required
                        disabled={isSubmitting}
                        autoComplete="off"
                      />
                      <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    </div>

                    {/* 회원 검색 결과 */}
                    {showMemberSuggestions && filteredMembers.length > 0 && (
                      <div className="absolute z-10 w-full mt-2 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                        <div className="p-2">
                          <p className="text-xs text-slate-400 px-3 py-2">
                            검색 결과 ({filteredMembers.length}명)
                          </p>
                          {filteredMembers.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => handleSelectMember(member)}
                              className="w-full p-3 rounded-lg hover:bg-slate-50 transition-colors text-left flex items-center gap-3"
                            >
                              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold flex-shrink-0 text-sm">
                                {member.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{maskName(member.name)}</p>
                                {member.company && (
                                  <p className="text-sm text-slate-500 flex items-center gap-1 truncate">
                                    <Building2 className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{maskCompany(member.company)}</span>
                                  </p>
                                )}
                                {!member.company && member.email && (
                                  <p className="text-xs text-slate-400 truncate">{maskEmail(member.email)}</p>
                                )}
                              </div>
                              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 검색 결과 없음 */}
                    {showMemberSuggestions && name.trim() && filteredMembers.length === 0 && (
                      <div className="absolute z-10 w-full mt-2 bg-white border-2 border-red-200 rounded-xl shadow-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-red-600 text-sm">등록된 회원을 찾을 수 없습니다</p>
                            <p className="text-sm text-slate-500 mt-1">
                              정확한 이름을 입력하시거나, 회원 가입 후 신청해주세요.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                <p className="mt-2 text-sm text-slate-400">
                  동호회에 등록된 정확한 이름을 입력해주세요
                </p>
              </div>
            </div>

            {/* 입금 안내 */}
            <div className="p-5 sm:p-6 border-b border-slate-100">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">입금 완료 후 신청 확정</p>
                    <p>신청 후 안내받으신 계좌로 참가비를 입금해야 최종 신청이 확정됩니다.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 버튼 */}
            <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-3">
              <Link
                to="/"
                className="flex-1 px-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-center hover:bg-slate-200 transition-colors"
              >
                취소
              </Link>
              <button 
                type="submit" 
                disabled={
                  applicationClosed ||
                  isSubmitting ||
                  !selectedMember ||
                  (currentEvent.courses && currentEvent.courses.length > 0 && !selectedCourse)
                }
                className={`flex-1 px-6 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  applicationClosed || isSubmitting || !selectedMember || (currentEvent.courses && currentEvent.courses.length > 0 && !selectedCourse)
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    처리 중...
                  </>
                ) : applicationClosed ? (
                  '신청 마감'
                ) : (
                  <>
                    <UserCheck className="w-5 h-5" />
                    신청하기
                  </>
                )}
              </button>
            </div>
          </form>
          ) : (
          /* 취소 모드 */
          <div>
            {/* 산행 정보 */}
            <div className="p-5 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                {availableEvents.length > 1 ? '선택된 산행' : '이번 달 정기 산행'}
              </h3>
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="text-xl font-bold text-slate-900">{currentEvent.title}</h4>
                  <Badge variant={getDifficultyColor(currentEvent.difficulty)}>
                    {getDifficultyLabel(currentEvent.difficulty)}
                  </Badge>
                </div>
                <div className="space-y-2 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm">{formatDate(currentEvent.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-sm">{currentEvent.location}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 취소 완료 화면 */}
            {cancelCompleted ? (
              <div className="p-5 sm:p-6">
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">취소가 완료되었습니다</h3>
                  <p className="text-slate-600 mb-6">
                    {cancelSelectedMember?.name}님의 산행 신청이 취소되었습니다.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        setCancelCompleted(false);
                        handleClearCancelSelection();
                      }}
                      className="flex-1 px-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      다른 회원 취소하기
                    </button>
                    <Link
                      to="/"
                      className="flex-1 px-6 py-3.5 bg-slate-900 text-white rounded-xl font-bold text-center hover:bg-slate-800 transition-colors"
                    >
                      홈으로 돌아가기
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* 취소할 회원 검색 */}
                <div className="p-5 sm:p-6 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">취소할 회원 정보</h3>
                  
                  <div className="relative">
                    <label className="block text-slate-700 font-semibold mb-2 text-sm">
                      이름 <span className="text-red-500">*</span>
                    </label>
                    
                    {cancelSelectedMember ? (
                      <div className={`p-4 rounded-xl border-2 ${
                        cancelMemberParticipation
                          ? 'border-red-400 bg-red-50'
                          : 'border-slate-300 bg-slate-50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                              cancelMemberParticipation ? 'bg-red-500' : 'bg-slate-400'
                            }`}>
                              {cancelSelectedMember.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{maskName(cancelSelectedMember.name)}</p>
                              {cancelSelectedMember.company && (
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {maskCompany(cancelSelectedMember.company)}
                                </p>
                              )}
                              <p className={`text-xs mt-0.5 font-medium ${
                                cancelMemberParticipation ? 'text-red-600' : 'text-slate-400'
                              }`}>
                                {cancelMemberParticipation ? '신청 내역 확인됨' : '신청 내역 없음'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearCancelSelection}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            disabled={isCancelling}
                          >
                            <X className="w-5 h-5 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <input
                            type="text"
                            value={cancelName}
                            onChange={(e) => handleCancelNameChange(e.target.value)}
                            onFocus={() => setShowCancelSuggestions(true)}
                            className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 outline-none transition-all pr-12"
                            placeholder="취소할 회원 이름을 입력하세요"
                            disabled={isCancelling}
                            autoComplete="off"
                          />
                          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        </div>

                        {/* 회원 검색 결과 */}
                        {showCancelSuggestions && filteredCancelMembers.length > 0 && (
                          <div className="absolute z-10 w-full mt-2 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                            <div className="p-2">
                              <p className="text-xs text-slate-400 px-3 py-2">
                                검색 결과 ({filteredCancelMembers.length}명)
                              </p>
                              {filteredCancelMembers.map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => handleSelectCancelMember(member)}
                                  className="w-full p-3 rounded-lg hover:bg-slate-50 transition-colors text-left flex items-center gap-3"
                                >
                                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold flex-shrink-0 text-sm">
                                    {member.name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">{maskName(member.name)}</p>
                                    {member.company && (
                                      <p className="text-sm text-slate-500 flex items-center gap-1 truncate">
                                        <Building2 className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{maskCompany(member.company)}</span>
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 검색 결과 없음 */}
                        {showCancelSuggestions && cancelName.trim() && filteredCancelMembers.length === 0 && (
                          <div className="absolute z-10 w-full mt-2 bg-white border-2 border-red-200 rounded-xl shadow-lg p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-red-600 text-sm">등록된 회원을 찾을 수 없습니다</p>
                                <p className="text-sm text-slate-500 mt-1">정확한 이름을 입력해주세요.</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    
                    <p className="mt-2 text-sm text-slate-400">
                      산행 신청을 취소할 회원의 이름을 입력해주세요
                    </p>
                  </div>
                </div>

                {/* 신청 내역 표시 */}
                {cancelSelectedMember && cancelMemberParticipation && (
                  <div className="p-5 sm:p-6 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">신청 내역</h3>
                    <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">신청 상태</span>
                        <Badge variant={
                          cancelMemberParticipation.status === 'confirmed' ? 'success' :
                          cancelMemberParticipation.status === 'cancelled' ? 'danger' : 'warning'
                        }>
                          {cancelMemberParticipation.status === 'confirmed' ? '확정' :
                           cancelMemberParticipation.status === 'cancelled' ? '취소됨' : '대기중'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">입금 상태</span>
                        <Badge variant={
                          cancelMemberParticipation.paymentStatus === 'completed' || cancelMemberParticipation.paymentStatus === 'confirmed' ? 'success' :
                          cancelMemberParticipation.paymentStatus === 'cancelled' ? 'danger' : 'warning'
                        }>
                          {cancelMemberParticipation.paymentStatus === 'completed' || cancelMemberParticipation.paymentStatus === 'confirmed' ? '입금 완료' :
                           cancelMemberParticipation.paymentStatus === 'cancelled' ? '취소됨' : '입금 대기'}
                        </Badge>
                      </div>
                      {cancelMemberParticipation.course && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">선택 코스</span>
                          <span className="text-sm font-medium text-slate-900">{cancelMemberParticipation.course}</span>
                        </div>
                      )}
                    </div>

                    {cancelMemberParticipation.paymentStatus === 'completed' && (
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
                )}

                {/* 신청 내역 없음 */}
                {cancelSelectedMember && !cancelMemberParticipation && (
                  <div className="p-5 sm:p-6 border-b border-slate-100">
                    <div className="p-4 bg-slate-50 rounded-xl text-center">
                      <UserX className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-600">해당 회원의 신청 내역이 없습니다</p>
                      <p className="text-xs text-slate-400 mt-1">이 산행에 신청하지 않은 회원입니다.</p>
                    </div>
                  </div>
                )}

                {/* 버튼 */}
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/"
                    className="flex-1 px-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-center hover:bg-slate-200 transition-colors"
                  >
                    돌아가기
                  </Link>
                  <button
                    type="button"
                    onClick={handleCancelParticipation}
                    disabled={!cancelSelectedMember || !cancelMemberParticipation || isCancelling}
                    className={`flex-1 px-6 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      !cancelSelectedMember || !cancelMemberParticipation || isCancelling
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200'
                    }`}
                  >
                    {isCancelling ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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
            )}
          </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            아직 회원이 아니신가요?{' '}
            <Link to="/register" className="text-slate-900 font-semibold hover:text-slate-700 transition-colors">
              입회 신청하기
            </Link>
          </p>
        </div>
      </div>

      {/* 입금 정보 모달 */}
      {showPaymentInfo && completedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="p-6 sm:p-8 text-center border-b">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">신청이 완료되었습니다!</h2>
              <p className="text-slate-600">
                {selectedMember?.name}님의 산행 신청이 접수되었습니다
              </p>
            </div>

            {/* 본문 */}
            <div className="p-6 sm:p-8">
              {/* 입금 안내 */}
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-900 mb-1">입금 완료 필수</h4>
                    <p className="text-sm text-amber-800">
                      아래 계좌로 참가비를 입금하셔야 최종 신청이 확정됩니다.<br />
                      입금자명은 <strong>{selectedMember?.name}</strong>으로 입력해주세요.
                    </p>
                  </div>
                </div>
              </div>

              {/* 입금 정보 */}
              {completedEvent.paymentInfo && (
                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-bold text-slate-900">입금 정보</h3>
                  
                  {completedEvent.paymentInfo.cost && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <p className="text-sm text-emerald-700 mb-1">참가비</p>
                      <p className="text-2xl font-bold text-emerald-900">{`${String(completedEvent.paymentInfo.cost).replace(/원\s*$/, '')}원`}</p>
                    </div>
                  )}

                  <div className="p-4 bg-slate-50 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">은행명</p>
                        <p className="text-lg font-bold text-slate-900">{completedEvent.paymentInfo.bankName}</p>
                      </div>
                      <button onClick={() => handleCopyToClipboard(completedEvent.paymentInfo?.bankName || '', 'bank')} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                        {copiedText === 'bank' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">계좌번호</p>
                        <p className="text-lg font-bold text-slate-900">{completedEvent.paymentInfo.accountNumber}</p>
                      </div>
                      <button onClick={() => handleCopyToClipboard(completedEvent.paymentInfo?.accountNumber || '', 'account')} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                        {copiedText === 'account' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">예금주</p>
                        <p className="text-lg font-bold text-slate-900">{completedEvent.paymentInfo.accountHolder}</p>
                      </div>
                      <button onClick={() => handleCopyToClipboard(completedEvent.paymentInfo?.accountHolder || '', 'holder')} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                        {copiedText === 'holder' ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                  </div>

                  {completedEvent.paymentInfo.managerName && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <h4 className="font-semibold text-blue-900 mb-1">문의사항</h4>
                      <p className="text-sm text-blue-800">
                        담당자: {completedEvent.paymentInfo.managerName}
                        {completedEvent.paymentInfo.managerPhone && ` (${completedEvent.paymentInfo.managerPhone})`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 버튼 */}
              <button
                onClick={() => { setShowPaymentInfo(false); navigate('/'); }}
                className="w-full px-6 py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
