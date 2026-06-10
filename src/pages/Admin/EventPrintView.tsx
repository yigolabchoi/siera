import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEvents } from '../../contexts/EventContext';
import { useMembers } from '../../contexts/MemberContext';
import { usePoems } from '../../contexts/PoemContext';
import { usePayments } from '../../contexts/PaymentContext';
import { useParticipations } from '../../contexts/ParticipationContext';
import { Team, TeamMember } from '../../types';
import { X, Download } from 'lucide-react';
import { formatPhoneNumber } from '../../utils/format';

const EventPrintView = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { events, getEventById, getTeamsByEventId, refreshTeams, isLoading } = useEvents();
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 페이지 로드 시 최신 조편성 데이터를 Firestore에서 즉시 새로고침
  useEffect(() => {
    if (eventId) {
      refreshTeams(eventId);
    }
  }, [eventId]);
  const { getMembersByPosition } = useMembers();
  const { getPoemByMonth, getCurrentMonthPoem } = usePoems();
  const { payments, getPaymentsByEvent } = usePayments();
  const { getParticipationsByEvent } = useParticipations();
  
  let event = getEventById(eventId || '');
  let teams = getTeamsByEventId(eventId || '');
  
  // 환불된 사용자 필터링 + 번호 오름차순 정렬 + 게스트/회사/직책 정보 보강
  const filteredTeams = useMemo(() => {
    const sortFn = (a: any, b: any) => {
      const numA = (a as any).number ?? parseInt(a.name) ?? 0;
      const numB = (b as any).number ?? parseInt(b.name) ?? 0;
      return numA - numB;
    };

    const eventParticipations = eventId ? getParticipationsByEvent(eventId) : [];

    // participationId → participation 맵 (회사/직책 fallback용)
    const participationDataMap = new Map(
      eventParticipations.map(p => [p.id, p])
    );
    // participationId → isGuest 맵
    const participationGuestMap = new Map<string, boolean>(
      eventParticipations.map(p => [p.id, p.isGuest === true])
    );
    // userId → isGuest 맵 (조장 매칭용)
    const userIdGuestMap = new Map<string, boolean>(
      eventParticipations.map(p => [p.userId, p.isGuest === true])
    );
    // userId → participation 맵 (조장 회사/직책 fallback용)
    const userIdParticipationMap = new Map(
      eventParticipations.map(p => [p.userId, p])
    );

    // 회사/직책 보강: members 컬렉션 우선, 없으면 participation userCompany/userPosition
    const enrichMember = (member: TeamMember, participationId: string) => {
      const p = participationDataMap.get(participationId);
      const company = member.company || (p as any)?.userCompany || '';
      const position = member.position || member.occupation || (p as any)?.userPosition || '';
      return {
        ...member,
        company,
        position,
        isGuest: member.isGuest || participationGuestMap.get(participationId) || false,
      };
    };

    const enrichLeader = (team: Team) => {
      // leaderId is a participationId, NOT a userId — use participationDataMap
      const leaderParticipationId = team.leaderId || '';
      const p = participationDataMap.get(leaderParticipationId);
      return {
        leaderCompany: (team as any).leaderCompany || (p as any)?.userCompany || '',
        leaderPosition: (team as any).leaderPosition || (p as any)?.userPosition || '',
        leaderIsGuest: (team as any).leaderIsGuest || participationGuestMap.get(leaderParticipationId) || false,
      };
    };

    if (!eventId) {
      return [...teams].sort(sortFn).map(team => ({
        ...team,
        ...enrichLeader(team),
        members: (team.members || []).map(m => enrichMember(m, m.id)),
      }));
    }

    const eventPayments = getPaymentsByEvent(eventId);
    const refundedUserIds = new Set(
      eventPayments
        .filter(payment => payment.refundStatus === 'completed')
        .map(payment => payment.userId)
    );

    return teams.map(team => ({
      ...team,
      ...enrichLeader(team),
      members: (team.members?.filter(member => {
        const payment = eventPayments.find(p => p.participationId === member.id);
        return payment ? !refundedUserIds.has(payment.userId) : true;
      }) || []).map(m => enrichMember(m, m.id)),
    })).sort(sortFn);
  }, [teams, eventId, payments, getParticipationsByEvent]);
  
  // 🔥 임시 데이터: 이벤트가 없으면 샘플 데이터 생성
  if (!event && !isLoading) {
    event = {
      id: eventId || 'sample-event',
      title: '시애라 정기 산행',
      date: new Date().toISOString().split('T')[0],
      mountain: '북한산',
      altitude: '836m',
      difficulty: '중',
      location: '서울시 강북구',
      address: '서울시 강북구 우이동',
      meetingPoint: '종합운동장역 2번 출구 앞',
      schedule: [
        { id: 's1', time: '07:00', location: '종합운동장역 2번 출구 집결', type: 'gathering' as const },
        { id: 's2', time: '07:30', location: '출발', type: 'departure' as const },
        { id: 's3', time: '09:00', location: '등산 시작', type: 'activity' as const },
        { id: 's4', time: '12:00', location: '점심 식사', type: 'meal' as const },
        { id: 's5', time: '15:00', location: '하산 완료', type: 'activity' as const },
        { id: 's6', time: '16:00', location: '종합운동장역 도착 및 해산', type: 'arrival' as const }
      ],
      courses: [
        {
          id: 'c1',
          name: 'A코스',
          distance: '8.5km',
          description: '백운대 → 만경대 → 노적봉 (일반 코스)'
        },
        {
          id: 'c2',
          name: 'B코스',
          distance: '6.2km',
          description: '대동문 → 백운대 → 하산 (초보자 코스)'
        }
      ],
      emergencyContactName: '김철수 회장',
      emergencyContactPhone: '010-1234-5678',
      status: 'open' as const,
      paymentInfo: {
        cost: '30000',
        bankName: '신한은행',
        accountNumber: '110-123-456789',
        accountHolder: '시애라클럽',
        managerName: '김철수',
        managerPhone: '010-1234-5678'
      }
    } as any;
  }
  
  // 🔥 임시 데이터: 조편성이 없으면 샘플 데이터 생성
  if (teams.length === 0 && event && !isLoading) {
    teams = [
      {
        id: 'team-1',
        eventId: event.id,
        eventTitle: event.title,
        number: 1,
        name: '1조',
        leaderId: 'leader-1',
        leaderName: '김철수',
        leaderCompany: '삼성전자',
        leaderPosition: '부장',
        leaderOccupation: '삼성전자 부장',
        members: [
          { id: 'm1', name: '이영희', company: 'LG전자', position: '과장', occupation: 'LG전자 과장' },
          { id: 'm2', name: '박민수', company: '현대자동차', position: '대리', occupation: '현대자동차 대리' },
          { id: 'm3', name: '최지연', company: 'SK텔레콤', position: '차장', occupation: 'SK텔레콤 차장' }
        ]
      },
      {
        id: 'team-2',
        eventId: event.id,
        eventTitle: event.title,
        number: 2,
        name: '2조',
        leaderId: 'leader-2',
        leaderName: '정수진',
        leaderCompany: '네이버',
        leaderPosition: '팀장',
        leaderOccupation: '네이버 팀장',
        members: [
          { id: 'm4', name: '강민호', company: '카카오', position: '선임', occupation: '카카오 선임' },
          { id: 'm5', name: '윤서연', company: '쿠팡', position: '책임', occupation: '쿠팡 책임' }
        ]
      },
      {
        id: 'team-3',
        eventId: event.id,
        eventTitle: event.title,
        number: 3,
        name: '3조',
        leaderId: 'leader-3',
        leaderName: '한동훈',
        leaderCompany: '포스코',
        leaderPosition: '차장',
        leaderOccupation: '포스코 차장',
        members: [
          { id: 'm6', name: '송미래', company: '롯데', position: '과장', occupation: '롯데 과장' },
          { id: 'm7', name: '임준혁', company: 'GS건설', position: '부장', occupation: 'GS건설 부장' },
          { id: 'm8', name: '노현정', company: '한화', position: '대리', occupation: '한화 대리' }
        ]
      }
    ];
  }
  
  // 디버깅 로그
  console.log('[프린트 페이지] 데이터 확인:', {
    eventId,
    event: event ? {
      id: event.id,
      title: event.title,
      date: event.date,
      mountain: event.mountain
    } : null,
    teamsCount: filteredTeams.length,
    teams: filteredTeams.map(t => ({
      id: t.id,
      name: t.name,
      number: t.number,
      leaderId: t.leaderId,
      leaderName: t.leaderName,
      membersCount: t.members?.length || 0
    })),
    eventsCount: events.length,
    isLoading
  });
  
  // 🔥 산행 날짜의 월에 해당하는 시를 가져옴 (없으면 임시 데이터)
  let monthlyPoem;
  if (event) {
    const eventDate = new Date(event.date);
    const eventMonth = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
    monthlyPoem = getPoemByMonth(eventMonth) || getCurrentMonthPoem();
  }
  
  // 시 데이터가 없으면 임시 시 생성
  if (!monthlyPoem) {
    monthlyPoem = {
      id: 'temp-poem',
      title: '산',
      author: '작자 미상',
      content: `푸른 산이 높이 솟아\n하늘을 향해 올라가네\n\n한 걸음 한 걸음\n정상을 향한 발걸음\n\n땀방울이 흘러내려도\n포기하지 않는 마음\n\n마침내 정상에 서서\n세상을 내려다보니\n\n모든 것이 작아 보이고\n마음은 더욱 넓어지네`,
      month: new Date().toISOString().slice(0, 7)
    };
  }
  
  // 비상연락처 (실제 데이터 사용)
  const emergencyContact = event?.emergencyContactName && event?.emergencyContactPhone 
    ? {
        name: event.emergencyContactName,
        phoneNumber: formatPhoneNumber(event.emergencyContactPhone)
      }
    : {
        name: '비상연락처 미지정',
        phoneNumber: '-'
      };
  
  // 운영진 정보 가져오기
  const chairmanMembers = getMembersByPosition('chairman');
  const committeeMembers = getMembersByPosition('committee');
  
  const executives = {
    chairman: chairmanMembers.map(m => ({
      name: m.name,
      position: m.occupation ? m.occupation.split(' ')[0] : '회장단',
      phoneNumber: formatPhoneNumber(m.phoneNumber || ''),
    })),
    committee: committeeMembers.map(m => ({
      name: m.name,
      position: m.occupation ? m.occupation.split(' ')[0] : '운영위원',
      phoneNumber: formatPhoneNumber(m.phoneNumber || ''),
    })),
  };
  
  // 로딩 중
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-xl text-slate-600">산행 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    if (!printContainerRef.current) return;
    setIsDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const pages = printContainerRef.current.querySelectorAll('.page');
      const canvases: HTMLCanvasElement[] = [];
      for (const page of Array.from(pages)) {
        const canvas = await html2canvas(page as HTMLElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: (page as HTMLElement).offsetWidth,
          height: (page as HTMLElement).offsetHeight,
        });
        canvases.push(canvas);
      }
      // 각 페이지를 별도 파일로 다운로드
      const eventRound = event?.eventNumber ? `제${event.eventNumber}회` : '';
      const baseFileName = `시애라${eventRound ? `_${eventRound}` : ''}_조편성표`;
      canvases.forEach((canvas, idx) => {
        const link = document.createElement('a');
        link.download = canvases.length > 1 ? `${baseFileName}_${idx + 1}페이지.png` : `${baseFileName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    } catch (err) {
      console.error('이미지 다운로드 실패:', err);
      alert('이미지 다운로드에 실패했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 프린트 버튼 */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => {
            if (window.opener) {
              window.close();
            } else if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/admin/events');
            }
          }}
          className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          닫기
        </button>
        <button
          onClick={handleDownloadImage}
          disabled={isDownloading}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {isDownloading ? '다운로드 중...' : '이미지 저장'}
        </button>
        <button
          onClick={handlePrint}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold"
        >
          프린트
        </button>
      </div>

      {/* A4 용지 */}
      <div ref={printContainerRef} className="print-container mx-auto bg-white">
        {/* 1페이지 - 산행 정보 */}
        <div className="page page-1">
          {/* 헤더 - 좌우 배치 */}
          <div className="header">
            <div className="header-left">
              <h1 className="main-title">시애라 (詩愛羅) 클럽</h1>
              <div className="subtitle">Sierra Hiking Club</div>
            </div>
            <div className="header-right">
              <div className="event-number">
                {event.title}
              </div>
              <div className="event-date">
                {new Date(event.date).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long'
                })}
                {event.endDate && event.endDate !== event.date && (
                  <> ~ {new Date(event.endDate).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                  })}
                  {(() => {
                    const diff = Math.round((new Date(event.endDate).getTime() - new Date(event.date).getTime()) / 86400000);
                    return diff > 0 ? <span className="trip-nights"> ({diff}박{diff + 1}일)</span> : null;
                  })()}
                  </>
                )}
              </div>
              <div className="mountain-info">
                <span className="mountain-name">{event.mountain || event.location}</span>
                {event.altitude && (
                  <>
                    <span className="divider">·</span>
                    <span className="altitude">
                      {event.altitude.toLowerCase().includes('m') ? event.altitude : `${event.altitude}m`}
                    </span>
                  </>
                )}
                <span className="divider">·</span>
                <span className="difficulty">{event.difficulty}</span>
              </div>
              {event.address && (
                <div className="location">{event.address}</div>
              )}
              {!event.address && event.location && (
                <div className="location">{event.location}</div>
              )}
              {/* 당일 비상연락처 - 헤더 우측 하단 */}
              <div className="emergency-header">
                당일 비상연락처: <span className="emergency-name-header">{emergencyContact.name}</span> <span className="emergency-phone-header">{emergencyContact.phoneNumber}</span>
              </div>
            </div>
          </div>

          {/* 일정 - 특별산행(일차별)은 일자별로, 정기산행은 한 줄로 표시 */}
          {event.dailySchedule && event.dailySchedule.some(d => d.items?.some(it => it.time || it.description)) ? (
            <div className="section">
              <h2 className="section-title">상세 일정</h2>
              <div className="daily-schedule">
                {event.dailySchedule.map((day, di) => {
                  const items = (day.items || []).filter(it => it.time || it.description);
                  if (items.length === 0) return null;
                  return (
                    <div key={di} className="day-block">
                      <div className="day-title">
                        {day.title || `${day.day}일차`}
                        {day.date && <span className="day-date"> · {new Date(day.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</span>}
                      </div>
                      <div className="schedule-compact">
                        {items.map((it, ii) => (
                          <span key={ii} className="schedule-item">
                            {it.time && <span className="schedule-time">{it.time}</span>}
                            <span className="schedule-location">{it.description}</span>
                            {ii < items.length - 1 && <span className="schedule-divider">→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="section-inline">
              <h2 className="section-inline-title">당일 일정</h2>
              {event.schedule && event.schedule.length > 0 ? (
                <div className="schedule-compact">
                  {event.schedule.map((item, index) => (
                    <span key={index} className="schedule-item">
                      <span className="schedule-time">{item.time}</span>
                      <span className="schedule-location">{item.location}</span>
                      {index < event.schedule.length - 1 && <span className="schedule-divider">→</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">일정 정보가 없습니다.</p>
              )}
            </div>
          )}

          {/* 산행 코스 - 각 코스별 한 줄씩 표시 */}
          {event.courses && event.courses.length > 0 && (
            <div className="section">
              <h2 className="section-title">산행 코스</h2>
              <div className="course-list">
                {event.courses.map((course, index) => (
                  <div key={course.id || index} className="course-line">
                    <span className="course-name-line">{course.name}</span>
                    <span className="course-distance-line">{course.distance}</span>
                    <span className="course-desc-line">{course.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 조편성 */}
          {filteredTeams && filteredTeams.length > 0 && (
            <div className="section">
              <h2 className="section-title">조편성</h2>
              <div className={`teams-grid ${filteredTeams.length <= 6 ? 'teams-grid-3col' : 'teams-grid-4col'}`}>
                {filteredTeams.map((team, index) => {
                  const leaderCompany = team.leaderCompany || '';
                  const leaderPosition = team.leaderPosition || '';
                  const leaderDetail = leaderCompany && leaderPosition
                    ? `${leaderCompany} · ${leaderPosition}`
                    : leaderCompany || leaderPosition || '';

                  return (
                    <div key={team.id} className="team-box">
                      {/* 헤더: 조 번호(좌) + 조장 정보(우) */}
                      <div className="team-header">
                        <span className="team-num">{team.name || `${(team as any).number || (index + 1)}조`}</span>
                        <div className="team-leader-header">
                          <div className="team-leader-name-row">
                            <span className="leader-badge">조장</span>
                            <span className="leader-header-name">
                              {team.leaderName || '미배정'}
                              {(team as any).leaderIsGuest && <span className="guest-badge">게스트</span>}
                            </span>
                          </div>
                          {leaderDetail && team.leaderName && (
                            <div className="leader-header-detail">{leaderDetail}</div>
                          )}
                        </div>
                      </div>
                      {/* 조원 목록 */}
                      {team.members && team.members.length > 0 && (
                        <div className="team-members">
                          {team.members.map((member, idx) => {
                            const companyInfo = member.company || '';
                            const positionInfo = member.position || member.occupation || '';
                            const displayInfo = companyInfo && positionInfo
                              ? `(${companyInfo} · ${positionInfo})`
                              : companyInfo ? `(${companyInfo})`
                              : positionInfo ? `(${positionInfo})`
                              : '';
                            const infoLength = displayInfo.length;
                            const infoClass = infoLength > 20 ? 'member-info-small' : infoLength > 15 ? 'member-info-medium' : 'member-info';
                            return (
                              <div key={idx} className="member-item-inline">
                                <span className="member-name">
                                  {member.name}
                                  {member.isGuest && <span className="guest-badge">게스트</span>}
                                </span>
                                {displayInfo && <span className={infoClass}>{displayInfo}</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 조편성 안내 메시지 (조편성이 없을 때) */}
          {(!filteredTeams || filteredTeams.length === 0) && (
            <div className="section">
              <h2 className="section-title">조편성</h2>
              <div className="no-teams-message">
                <p>조편성 정보가 아직 등록되지 않았습니다.</p>
                <p className="text-sm">조 편성 관리 메뉴에서 조편성을 진행해주세요.</p>
              </div>
            </div>
          )}
        </div>

        {/* 2페이지 - 이달의 시 */}
        {monthlyPoem && (
          <div className="page page-2">
            <div className="poem-page">
              <div className="poem-top">
                {/* 장식 상단 */}
                <div className="poem-decoration-top">
                  <div className="decoration-line"></div>
                  <div className="decoration-circle"></div>
                  <div className="decoration-line"></div>
                </div>

                {/* 시 제목 */}
                <div className="poem-title-section">
                  <div className="poem-label">
                    {new Date(event.date).toLocaleDateString('ko-KR', { month: 'long' })}의 詩
                  </div>
                  <div className="poem-title-row">
                    <h1 className="poem-title">{monthlyPoem.title}</h1>
                    <div className="poem-author">— {monthlyPoem.author}</div>
                  </div>
                </div>

                {/* 시 내용 */}
                <div className="poem-content">
                  <div className={`poem-text ${
                    monthlyPoem.content.length <= 200 ? 'poem-size-xlarge' :
                    monthlyPoem.content.length <= 400 ? 'poem-size-large' :
                    monthlyPoem.content.length <= 600 ? 'poem-size-medium' :
                    monthlyPoem.content.length <= 900 ? 'poem-size-small' :
                    monthlyPoem.content.length <= 1200 ? 'poem-size-tiny' :
                    'poem-size-mini'
                  }`}>
                    {monthlyPoem.content}
                  </div>
                </div>
              </div>

              {/* 푸터 */}
              <div className="poem-footer">
                <div className="footer-content">
                  <span className="footer-logo">시애라 (詩愛羅) 클럽</span>
                  <span className="footer-divider">·</span>
                  <span className="footer-date">
                    {new Date(event.date).toLocaleDateString('ko-KR', { 
                      year: 'numeric',
                      month: 'long'
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* 프린트 설정 */
        @media print {
          .no-print {
            display: none !important;
          }
          
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          .print-container {
            width: 210mm;
            margin: 0 auto;
          }
          
          .page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            page-break-inside: avoid;
            background: white;
            box-sizing: border-box;
            overflow: hidden;
          }

          .page:last-child {
            page-break-after: auto;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          @page {
            size: A4;
            margin: 0;
          }
        }
        
        @media screen {
          .print-container {
            max-width: 210mm;
            margin: 40px auto;
          }
          
          .page {
            width: 210mm;
            height: 297mm;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            box-sizing: border-box;
            overflow: hidden;
          }
        }

        /* 페이지 기본 */
        .page {
          font-family: 'Malgun Gothic', sans-serif;
          color: #1a1a1a;
          line-height: 1.6;
          position: relative;
        }

        .page-1 {
          padding: 15mm 15mm;
        }

        .page-2 {
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* 헤더 - 심플한 디자인 */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #333;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }

        .header-left {
          flex: 0 0 auto;
        }

        .main-title {
          font-size: 32px;
          font-weight: 900;
          margin: 0 0 4px 0;
          letter-spacing: 1px;
          color: #1a1a1a;
          line-height: 1;
        }

        .subtitle {
          font-size: 11px;
          color: #666;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .header-right {
          flex: 0 0 auto;
          text-align: right;
        }

        .event-number {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 4px;
          color: #1a1a1a;
        }

        .event-date {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          color: #333;
        }

        .mountain-info {
          font-size: 15px;
          font-weight: 800;
          margin-bottom: 2px;
          color: #1a1a1a;
        }

        .mountain-name {
          font-size: 16px;
        }

        .divider {
          margin: 0 6px;
          color: #999;
        }

        .location {
          font-size: 12px;
          color: #666;
          font-weight: 600;
        }

        /* 비상연락처 - 헤더 내부 */
        .emergency-header {
          font-size: 13px;
          color: #666;
          margin-top: 8px;
          font-weight: 600;
        }

        .emergency-name-header {
          font-weight: 800;
          color: #1a1a1a;
        }

        .emergency-phone-header {
          font-weight: 700;
          color: #d32f2f;
        }

        /* 섹션 */
        .section {
          margin-bottom: 10px;
        }

        .section-inline {
          display: flex;
          align-items: baseline;
          gap: 16px;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 2px solid #333;
        }

        .section-inline-title {
          font-size: 16px;
          font-weight: 900;
          margin: 0;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .section-inline .schedule-compact {
          margin: 0;
          padding: 0;
        }

        .section-title {
          font-size: 16px;
          font-weight: 900;
          margin: 0 0 6px 0;
          padding-bottom: 4px;
          border-bottom: 2px solid #333;
          color: #1a1a1a;
        }

        .subsection-title {
          font-size: 14px;
          font-weight: 800;
          margin: 0 0 6px 0;
          padding-bottom: 4px;
          border-bottom: 1px solid #666;
          color: #1a1a1a;
        }

        /* 테이블 */
        .info-table {
          width: 100%;
          border-collapse: collapse;
        }

        .info-table td {
          padding: 3px 6px;
          border-bottom: 1px solid #e0e0e0;
          font-size: 13px;
        }

        .time-cell {
          font-weight: 800;
          color: #1a1a1a;
          width: 30%;
          font-size: 14px;
        }

        .location-cell {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .meeting-cell {
          font-weight: 700;
          color: #1a1a1a;
          background: #f5f5f5;
          text-align: center;
          padding: 6px 8px !important;
          font-size: 14px;
        }

        /* 일정 - 컴팩트 (한 줄) */
        .schedule-compact {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          line-height: 1.6;
        }

        .schedule-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .schedule-time {
          font-weight: 800;
          color: #1a1a1a;
        }

        .schedule-location {
          font-weight: 600;
          color: #555;
        }

        .schedule-divider {
          font-weight: 700;
          color: #999;
          margin: 0 4px;
        }

        /* 특별산행 - 일차별 일정 */
        .daily-schedule {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .day-block {
          border-left: 3px solid #333;
          padding: 2px 0 2px 8px;
        }

        .day-title {
          font-size: 12px;
          font-weight: 800;
          color: #1a1a1a;
          margin-bottom: 2px;
        }

        .day-date {
          font-size: 11px;
          font-weight: 600;
          color: #666;
        }

        .trip-nights {
          font-size: 12px;
          font-weight: 700;
          color: #666;
        }

        /* 코스 */
        .course-info {
          margin-bottom: 6px;
          padding: 6px;
          border: 1px solid #d0d0d0;
        }

        .course-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }

        .course-name {
          font-weight: 800;
          font-size: 14px;
          color: #1a1a1a;
        }

        .course-distance {
          font-weight: 700;
          font-size: 13px;
          color: #333;
        }

        .course-desc {
          font-size: 13px;
          color: #333;
          line-height: 1.5;
          font-weight: 500;
        }

        /* 코스 - 컴팩트 (한 줄) */
        .course-compact {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          line-height: 1.6;
        }

        .course-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .course-name-compact {
          font-weight: 800;
          color: #1a1a1a;
        }

        .course-distance-compact {
          font-weight: 700;
          color: #555;
        }

        .course-desc-compact {
          font-weight: 600;
          color: #666;
        }

        .course-divider {
          font-weight: 700;
          color: #ccc;
          margin: 0 6px;
        }

        /* 코스 - 각 코스별 한 줄씩 */
        .course-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .course-line {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          line-height: 1.6;
        }

        .course-name-line {
          font-weight: 800;
          color: #1a1a1a;
          min-width: 40px;
        }

        .course-distance-line {
          font-weight: 700;
          color: #555;
          min-width: 60px;
        }

        .course-desc-line {
          font-weight: 600;
          color: #666;
          flex: 1;
        }

        /* 조편성 - 동적 레이아웃 */
        .teams-grid {
          display: grid;
          gap: 8px;
        }
        
        /* 6개조 이하: 3열 레이아웃 (더 큰 크기) */
        .teams-grid-3col {
          grid-template-columns: repeat(3, 1fr);
        }
        
        /* 7개조 이상: 4열 레이아웃 */
        .teams-grid-4col {
          grid-template-columns: repeat(4, 1fr);
        }

        .team-box {
          border: 1.5px solid #333;
          padding: 10px;
          min-height: 140px;
          background: white;
        }
        
        /* 3열 레이아웃일 때 더 큰 폰트와 여백 */
        .teams-grid-3col .team-box {
          padding: 12px;
          min-height: 150px;
        }
        
        .teams-grid-3col .team-num {
          font-size: 17px;
        }

        .teams-grid-3col .leader-header-name {
          font-size: 15px;
        }

        .teams-grid-3col .leader-header-detail {
          font-size: 10px;
        }

        .teams-grid-3col .leader-badge {
          font-size: 9px;
        }

        .teams-grid-3col .team-header {
          margin: -12px -12px 10px -12px;
          padding: 8px 12px 8px 12px;
        }

        .team-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 6px;
          margin-bottom: 7px;
          padding-bottom: 6px;
          border-bottom: 1.5px solid #333;
          background: #f4f4f4;
          margin: -10px -10px 8px -10px;
          padding: 7px 10px 7px 10px;
        }

        .team-num {
          font-weight: 900;
          font-size: 15px;
          color: #1a1a1a;
          white-space: nowrap;
          padding-top: 1px;
        }

        .team-leader-header {
          text-align: right;
          min-width: 0;
        }

        .team-leader-name-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
        }

        .leader-header-name {
          font-weight: 800;
          font-size: 13px;
          color: #1a1a1a;
        }

        .leader-header-detail {
          font-size: 9px;
          color: #555;
          font-weight: 600;
          margin-top: 1px;
        }

        .leader-badge {
          display: inline-block;
          font-size: 8px;
          font-weight: 700;
          color: #fff;
          background: #1a1a1a;
          border-radius: 2px;
          padding: 1px 4px;
          vertical-align: middle;
          line-height: 1.5;
          flex-shrink: 0;
        }

        .team-members {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        /* 한 줄로 표시 */
        .member-item-inline {
          display: flex;
          align-items: baseline;
          gap: 4px;
          font-size: 11px;
          line-height: 1.6;
          margin-bottom: 2px;
        }

        .member-name {
          font-weight: 700;
          color: #1a1a1a;
          font-size: 13px;
          flex-shrink: 0;
        }

        .guest-badge {
          display: inline-block;
          margin-left: 3px;
          font-size: 8px;
          font-weight: 700;
          color: #b45309;
          background: #fef3c7;
          border: 0.5px solid #d97706;
          border-radius: 2px;
          padding: 0 3px;
          vertical-align: middle;
          line-height: 1.5;
        }

        .member-info {
          font-size: 9px;
          color: #666;
          font-weight: 600;
        }
        
        /* 중간 길이 (15-20자) */
        .member-info-medium {
          font-size: 8px;
          color: #666;
          font-weight: 600;
        }
        
        /* 긴 소속명 (20자 이상) */
        .member-info-small {
          font-size: 7px;
          color: #666;
          font-weight: 600;
        }
        
        /* 3열 레이아웃일 때 */
        .teams-grid-3col .member-name {
          font-size: 14px;
        }
        
        .teams-grid-3col .member-info {
          font-size: 10px;
        }
        
        .teams-grid-3col .member-info-medium {
          font-size: 9px;
        }
        
        .teams-grid-3col .member-info-small {
          font-size: 8px;
        }

        /* 조편성 없을 때 메시지 */
        .no-teams-message {
          padding: 30px;
          text-align: center;
          background: #f9f9f9;
          border: 1px dashed #ccc;
          border-radius: 4px;
        }

        .no-teams-message p {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #666;
          font-weight: 600;
        }

        .no-teams-message .text-sm {
          font-size: 12px;
          color: #999;
          font-weight: 500;
        }

        /* 2페이지 - 시 (심플한 디자인) */
        .poem-page {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          padding: 15mm 30mm;
          background: white;
          position: relative;
          box-sizing: border-box;
        }

        /* 상단 영역 - 고정 */
        .poem-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 550px;
          flex-shrink: 0;
        }

        /* 장식 요소 - 심플하게 */
        .poem-decoration-top,
        .poem-decoration-bottom {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin: 10px 0;
        }

        .decoration-line {
          width: 80px;
          height: 1px;
          background: #333;
        }

        .decoration-circle {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #333;
        }

        /* 시 제목 섹션 - 고정 */
        .poem-title-section {
          text-align: center;
          margin-bottom: 15px;
          width: 100%;
        }

        .poem-label {
          font-size: 14px;
          font-weight: 700;
          color: #666;
          letter-spacing: 4px;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .poem-title-row {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 16px;
        }

        .poem-title {
          font-size: 40px;
          font-weight: 900;
          color: #1a1a1a;
          margin: 0;
          letter-spacing: -1px;
          line-height: 1.1;
        }

        .poem-author {
          font-size: 18px;
          font-weight: 600;
          color: #555;
          font-style: italic;
          margin: 0;
          flex-shrink: 0;
        }

        /* 시 내용 - 가변 */
        .poem-content {
          width: 100%;
          max-width: 550px;
          background: white;
          padding: 30px 40px;
          border-radius: 0;
          box-shadow: none;
          border: 1px solid #ddd;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          height: 850px;
          margin-bottom: 15px;
        }

        .poem-text {
          white-space: pre-line;
          color: #1a1a1a;
          font-weight: 500;
          text-align: center;
          width: 100%;
          max-height: 100%;
          overflow: hidden;
        }

        /* 시 길이에 따른 크기 조정 */
        .poem-size-xlarge {
          font-size: 16px;
          line-height: 2.4;
        }

        .poem-size-large {
          font-size: 14px;
          line-height: 2.2;
        }

        .poem-size-medium {
          font-size: 13px;
          line-height: 2.0;
        }

        .poem-size-small {
          font-size: 12px;
          line-height: 1.8;
        }

        .poem-size-tiny {
          font-size: 11px;
          line-height: 1.7;
        }

        .poem-size-mini {
          font-size: 10px;
          line-height: 1.6;
        }

        /* 푸터 - 하단 고정, 한 줄 (심플) */
        .poem-footer {
          text-align: center;
          position: absolute;
          bottom: 5mm;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          padding: 8px 0;
          border-top: 1px solid #ddd;
        }

        .footer-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .footer-logo {
          font-size: 16px;
          font-weight: 900;
          color: #1a1a1a;
          letter-spacing: 1px;
        }

        .footer-divider {
          font-size: 16px;
          color: #999;
          font-weight: 400;
        }

        .footer-date {
          font-size: 14px;
          color: #666;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default EventPrintView;
