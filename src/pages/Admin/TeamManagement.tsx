import React, { useState, useEffect } from 'react';
import { Plus, Edit, Save, X, Users, Shield, CheckCircle, Calendar, MapPin, AlertCircle, Copy, Check, Trash2 } from 'lucide-react';
import { useEvents } from '../../contexts/EventContext';
import { useMembers } from '../../contexts/MemberContext';
import { usePayments } from '../../contexts/PaymentContext';
import { useParticipations } from '../../contexts/ParticipationContext';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import FilterGroup from '../../components/ui/FilterGroup';
import { Team, TeamMember, HikingEvent, Payment } from '../../types';

const TeamManagement = () => {
  const { 
    events: contextEvents, 
    getParticipantsByEventId, 
    setTeamsForEvent,
    teams: contextTeams,
    getTeamsByEventId,
    refreshParticipants
  } = useEvents();
  const { members } = useMembers();
  const { payments, getPaymentsByEvent } = usePayments();
  const { participations, getParticipationsByEvent } = useParticipations();
  
  // 산행 목록 (오늘 이후만)
  const [events, setEvents] = useState<HikingEvent[]>([]);
  const [selectedEventIdForTeam, setSelectedEventIdForTeam] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [isSelectingLeader, setIsSelectingLeader] = useState(false);
  const [selectedMembersForAdd, setSelectedMembersForAdd] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [teamFormData, setTeamFormData] = useState<Team>({
    id: '',
    name: '',
    eventId: '',
    eventTitle: '',
    leaderId: '',
    leaderName: '',
    leaderOccupation: '',
    members: [],
  });

  // Load events from context (오늘 이후만) + 첫 번째 산행 자동 선택
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingEvents = contextEvents
      .filter(event => new Date(event.date) >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setEvents(upcomingEvents);

    if (!selectedEventIdForTeam && upcomingEvents.length > 0) {
      setSelectedEventIdForTeam(upcomingEvents[0].id);
    }
  }, [contextEvents]);

  // Load teams from context when eventId changes
  useEffect(() => {
    if (selectedEventIdForTeam) {
      // 참가자 데이터 새로고침
      refreshParticipants(selectedEventIdForTeam);
      
      const existingTeams = getTeamsByEventId(selectedEventIdForTeam);
      
      if (existingTeams.length > 0) {
        // 환불된 사용자 필터링
        const eventPayments = getPaymentsByEvent(selectedEventIdForTeam);
        const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
        
        // 환불된 사용자 ID 목록
        const refundedUserIds = new Set(
          eventPayments
            .filter(payment => payment.refundStatus === 'completed')
            .map(payment => payment.userId)
        );
        
        // 현재 유효한 참가 신청 ID 목록 (취소되지 않은 것만)
        const validParticipationIds = new Set(
          eventParticipations
            .filter(p => p.status !== 'cancelled')
            .map(p => p.id)
        );
        
        // participationId → userId 매핑 (members DB 조회용)
        const participationUserMap = new Map(
          eventParticipations.map(p => [p.id, p.userId])
        );
        
        // 환불된 사용자를 조원 목록에서 제거 + members DB에서 최신 정보 보강
        const filteredTeams = existingTeams.map(team => {
          // 조장 확인: 참가 신청이 유효하고 환불되지 않았는지
          const leaderPayment = eventPayments.find(p => p.participationId === team.leaderId);
          const isLeaderRefunded = leaderPayment ? refundedUserIds.has(leaderPayment.userId) : false;
          const isLeaderParticipationValid = validParticipationIds.has(team.leaderId);
          const shouldRemoveLeader = isLeaderRefunded || !isLeaderParticipationValid;
          
          // 조장 정보를 members DB에서 보강
          let leaderName = team.leaderName;
          let leaderCompany = team.leaderCompany || '';
          let leaderPosition = team.leaderPosition || '';
          let leaderOccupation = team.leaderOccupation || '';
          
          if (!shouldRemoveLeader && team.leaderId) {
            const leaderUserId = participationUserMap.get(team.leaderId);
            const leaderMember = leaderUserId ? members.find(m => m.id === leaderUserId) : null;
            if (leaderMember) {
              leaderName = leaderMember.name || leaderName;
              leaderCompany = leaderMember.company || '';
              leaderPosition = leaderMember.position || '';
              leaderOccupation = [leaderMember.company, leaderMember.position].filter(Boolean).join(' ');
            }
          }
          
          return {
            ...team,
            // 조장이 환불되었거나 신청 취소되었으면 제거
            leaderId: shouldRemoveLeader ? '' : team.leaderId,
            leaderName: shouldRemoveLeader ? '' : leaderName,
            leaderOccupation: shouldRemoveLeader ? '' : leaderOccupation,
            leaderCompany: shouldRemoveLeader ? '' : leaderCompany,
            leaderPosition: shouldRemoveLeader ? '' : leaderPosition,
            // 환불되었거나 신청 취소된 조원 제거 + members DB에서 최신 정보 보강
            members: team.members?.filter(member => {
              const payment = eventPayments.find(p => p.participationId === member.id);
              const isRefunded = payment ? refundedUserIds.has(payment.userId) : false;
              const isParticipationValid = validParticipationIds.has(member.id);
              const shouldRemove = isRefunded || !isParticipationValid;
              
              return !shouldRemove;
            }).map(member => {
              // members DB에서 최신 정보 보강
              const memberUserId = participationUserMap.get(member.id);
              const memberData = memberUserId ? members.find(m => m.id === memberUserId) : null;
              if (memberData) {
                return {
                  ...member,
                  name: memberData.name || member.name,
                  company: memberData.company || '',
                  position: memberData.position || '',
                  occupation: [memberData.company, memberData.position].filter(Boolean).join(' '),
                  phoneNumber: memberData.phoneNumber || member.phoneNumber,
                };
              }
              return member;
            }) || []
          };
        });
        
        setTeams(filteredTeams);
      } else {
        // 기존 팀이 없으면 기본 3개 조 생성
        const selectedEvent = events.find(e => e.id === selectedEventIdForTeam);
        const newTeams: Team[] = [];
        
        for (let i = 1; i <= 3; i++) {
          // @ts-ignore
          newTeams.push({
            id: `${selectedEventIdForTeam}-team-${i}`,
            name: `${i}조`,
            number: i,
            eventId: selectedEventIdForTeam,
            eventTitle: selectedEvent?.title || '',
            leaderId: '',
            leaderName: '',
            leaderOccupation: '',
            members: [],
          });
        }
        
        setTeams(newTeams);
      }
    }
  }, [selectedEventIdForTeam, contextTeams, events, refreshParticipants, members, participations]);

  // 선택된 산행의 조 편성 — 번호 오름차순 정렬
  const filteredTeams = [...teams].sort((a, b) => {
    const numA = (a as any).number ?? parseInt(a.name) ?? 0;
    const numB = (b as any).number ?? parseInt(b.name) ?? 0;
    return numA - numB;
  });

  // 선택된 산행의 참가 신청자 반환 (취소/환불 제외, 결제 상태 포함)
  const getApplicantsForEvent = (eventId: string): TeamMember[] => {
    if (!eventId) return [];
    
    const eventPayments = getPaymentsByEvent(eventId);
    const eventParticipations = getParticipationsByEvent(eventId);
    
    // 환불 완료된 사용자 ID 목록
    const refundedUserIds = new Set(
      eventPayments
        .filter(payment => payment.refundStatus === 'completed')
        .map(payment => payment.userId)
    );
    
    // 참가자별 결제 상태 매핑 (participationId 또는 userId+eventId로 매칭)
    const paymentStatusMap = new Map<string, Payment['paymentStatus']>();
    
    eventPayments.forEach(payment => {
      if (payment.refundStatus === 'completed') return; // 환불 완료된 결제 제외
      
      // participationId로 매칭 (우선)
      if (payment.participationId) {
        const existing = paymentStatusMap.get(payment.participationId);
        // 더 높은 상태로 업데이트 (confirmed > completed > pending > cancelled)
        if (!existing || getPaymentPriority(payment.paymentStatus) > getPaymentPriority(existing)) {
          paymentStatusMap.set(payment.participationId, payment.paymentStatus);
        }
      }
      
      // userId로도 매칭 (participationId가 없는 레거시 데이터 대응)
      const matchingParticipation = eventParticipations.find(
        p => p.userId === payment.userId && p.status !== 'cancelled'
      );
      if (matchingParticipation && !paymentStatusMap.has(matchingParticipation.id)) {
        paymentStatusMap.set(matchingParticipation.id, payment.paymentStatus);
      }
    });
    
    // 취소되지 않은 + 환불되지 않은 모든 참가자
    const activeParticipations = eventParticipations.filter(p => {
      if (p.status === 'cancelled') return false;
      if (refundedUserIds.has(p.userId)) return false;
      return true;
    });
    
    // members DB에서 실시간 소속/직책 정보 보강
    return activeParticipations.map(p => {
      const member = members.find(m => m.id === p.userId);
      const pStatus = paymentStatusMap.get(p.id) || 'none';

      const company = member?.company || (p as any).userCompany || '';
      const position = member?.position || (p as any).userPosition || '';

      return {
        id: p.id,
        name: member?.name || p.userName,
        company,
        position,
        occupation: company && position ? `${company} ${position}` : company || position || '',
        phone: member?.phoneNumber || p.userPhone || '',
        phoneNumber: member?.phoneNumber || p.userPhone || '',
        isGuest: p.isGuest,
        status: p.status,
        course: p.course,
        paymentStatus: pStatus,
      };
    });
  };
  
  // 결제 상태 우선순위 (높을수록 우선)
  const getPaymentPriority = (status: string): number => {
    switch (status) {
      case 'confirmed': return 4;
      case 'completed': return 3;
      case 'pending': return 2;
      case 'failed': return 1;
      case 'cancelled': return 0;
      default: return -1;
    }
  };

  // 이미 다른 조에 배정된 회원 제외
  const getAvailableMembers = (eventId: string): TeamMember[] => {
    const applicants = getApplicantsForEvent(eventId);
    
    const assignedMemberIds = new Set<string>();
    teams.forEach(team => {
      assignedMemberIds.add(team.leaderId);
      team.members.forEach(member => assignedMemberIds.add(member.id));
    });
    
    if (editingTeam) {
      assignedMemberIds.delete(editingTeam.leaderId);
      editingTeam.members.forEach(member => assignedMemberIds.delete(member.id));
    }
    
    return applicants
      .filter(member => !assignedMemberIds.has(member.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  };

  const availableMembers = getAvailableMembers(selectedEventIdForTeam);

  // Context와 동기화
  const syncTeamsToContext = async (updatedTeams: Team[]) => {
    if (selectedEventIdForTeam) {
      await setTeamsForEvent(selectedEventIdForTeam, updatedTeams);
    }
  };

  // 참석자 이름 목록 클립보드 복사
  const handleCopyAttendeeList = () => {
    const applicants = getApplicantsForEvent(selectedEventIdForTeam);
    if (applicants.length === 0) return;
    const names = applicants.map(a => a.name).join(', ');
    navigator.clipboard.writeText(names).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // 산행 선택
  const handleSelectEventForTeam = (eventId: string) => {
    setSelectedEventIdForTeam(eventId);
  };

  // 조 추가
  const handleAddNewTeam = async () => {
    if (!selectedEventIdForTeam) {
      alert('먼저 산행을 선택해주세요.');
      return;
    }

    const selectedEvent = events.find(e => e.id === selectedEventIdForTeam);
    const currentEventTeams = teams;
    // 현재 가장 큰 조 번호 + 1 (중간 삭제 후 재추가해도 중복 없음)
    const existingNumbers = currentEventTeams.map(t => (t as any).number ?? parseInt(t.name) ?? 0);
    const nextTeamNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

    if (nextTeamNumber > 10) {
      alert('조는 최대 10개까지만 생성할 수 있습니다.');
      return;
    }

    // @ts-ignore
    const newTeam: Team = {
      id: `${selectedEventIdForTeam}-team-${Date.now()}`,
      name: `${nextTeamNumber}조`,
      number: nextTeamNumber,
      eventId: selectedEventIdForTeam,
      eventTitle: selectedEvent?.title || '',
      leaderId: '',
      leaderName: '',
      leaderOccupation: '',
      members: [],
    };

    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    try {
      await syncTeamsToContext(updatedTeams);
      alert(`${nextTeamNumber}조가 추가되었습니다.`);
    } catch (err: any) {
      alert(`조 추가 저장 실패: ${err.message}`);
    }
  };

  const handleEditTeam = (team: Team) => {
    // 조장 정보를 members DB에서 보강
    const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
    let enrichedTeam = { ...team };
    
    if (team.leaderId) {
      const leaderParticipation = eventParticipations.find(p => p.id === team.leaderId);
      const leaderMember = leaderParticipation ? members.find(m => m.id === leaderParticipation.userId) : null;
      if (leaderMember) {
        enrichedTeam = {
          ...enrichedTeam,
          leaderName: leaderMember.name || team.leaderName,
          leaderCompany: leaderMember.company || '',
          leaderPosition: leaderMember.position || '',
          leaderOccupation: [leaderMember.company, leaderMember.position].filter(Boolean).join(' '),
        };
      }
    }
    
    setEditingTeam(enrichedTeam);
    setTeamFormData(enrichedTeam);
    setIsEditingTeam(true);
  };

  const handleDeleteTeam = async (id: string) => {
    const teamToDelete = teams.find(t => t.id === id);
    const memberCount = teamToDelete ? (teamToDelete.members.length + (teamToDelete.leaderId ? 1 : 0)) : 0;
    const confirmMsg = memberCount > 0
      ? `이 조를 삭제하시겠습니까?\n\n조장과 조원 ${memberCount}명의 조 배정 정보도 함께 삭제됩니다.`
      : '이 조를 삭제하시겠습니까?';

    if (confirm(confirmMsg)) {
      const updatedTeams = teams.filter(t => t.id !== id);
      setTeams(updatedTeams);
      try {
        await syncTeamsToContext(updatedTeams);
        alert('조가 삭제되었습니다.');
      } catch (err: any) {
        // 롤백
        setTeams(teams);
        alert(`삭제 실패: ${err.message}`);
      }
    }
  };

  const handleRemoveLeader = () => {
    setTeamFormData({
      ...teamFormData,
      leaderId: '',
      leaderName: '',
      leaderCompany: '',
      leaderPosition: '',
      leaderOccupation: '',
    });
  };

  const handleSaveTeam = async () => {
    const selectedEvent = events.find(e => e.id === teamFormData.eventId);
    const updatedTeamData = {
      ...teamFormData,
      eventTitle: selectedEvent?.title || '',
    };

    try {
      if (editingTeam) {
        const updatedTeams = teams.map(t => t.id === editingTeam.id ? updatedTeamData : t);
        setTeams(updatedTeams);
        await syncTeamsToContext(updatedTeams);
        alert('조 편성이 수정되었습니다.');
      } else {
        const updatedTeams = [...teams, updatedTeamData];
        setTeams(updatedTeams);
        await syncTeamsToContext(updatedTeams);
        alert('조 편성이 저장되었습니다.');
      }
    } catch (err: any) {
      alert(`저장 실패: ${err.message}\n\n브라우저 콘솔(F12)에서 자세한 오류를 확인하세요.`);
      return;
    }
    
    setIsEditingTeam(false);
    setEditingTeam(null);
    setTeamFormData({
      id: '',
      name: '',
      eventId: '',
      eventTitle: '',
      leaderId: '',
      leaderName: '',
      leaderOccupation: '',
      members: [],
    });
  };

  const handleCancelTeam = () => {
    setIsEditingTeam(false);
    setEditingTeam(null);
    setTeamFormData({
      id: '',
      name: '',
      eventId: '',
      eventTitle: '',
      leaderId: '',
      leaderName: '',
      leaderOccupation: '',
      members: [],
    });
  };

  const handleSetLeader = (member: TeamMember) => {
    const existingLeader = teamFormData.leaderId ? teamFormData.members.find(m => m.id === teamFormData.leaderId) : null;
    
    let updatedMembers = [...teamFormData.members];
    
    if (existingLeader) {
      updatedMembers = updatedMembers.filter(m => m.id !== teamFormData.leaderId);
      updatedMembers.push(existingLeader);
    }
    
    updatedMembers = updatedMembers.filter(m => m.id !== member.id);
    
    setTeamFormData({
      ...teamFormData,
      leaderId: member.id,
      leaderName: member.name,
      leaderCompany: member.company || '',
      leaderPosition: member.position || '',
      leaderOccupation: member.occupation || `${member.company} ${member.position}`,
      leaderIsGuest: member.isGuest || false,
      members: updatedMembers,
    } as any);
    
    setShowMemberSelectModal(false);
    setIsSelectingLeader(false);
  };

  const handleAddMember = (member: TeamMember) => {
    if (member.id === teamFormData.leaderId) {
      alert('해당 회원은 이미 조장으로 지정되어 있습니다.');
      return;
    }
    
    if (teamFormData.members.some(m => m.id === member.id)) {
      alert('이미 조원 목록에 추가된 회원입니다.');
      return;
    }
    
    setTeamFormData({
      ...teamFormData,
      members: [...teamFormData.members, member],
    });
  };

  const handleRemoveMember = (memberId: string) => {
    setTeamFormData({
      ...teamFormData,
      members: teamFormData.members.filter(m => m.id !== memberId),
    });
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembersForAdd(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleAddSelectedMembers = () => {
    const membersToAdd = availableMembers.filter(m => selectedMembersForAdd.includes(m.id));
    
    setTeamFormData({
      ...teamFormData,
      members: [...teamFormData.members, ...membersToAdd],
    });
    
    setShowMemberSelectModal(false);
    setSelectedMembersForAdd([]);
    alert(`${membersToAdd.length}명의 조원이 추가되었습니다.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {isEditingTeam ? (
        /* 조 편성 폼 */
        <Card>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-slate-900">{editingTeam ? '조 편성 수정' : '조 편성 추가'}</h2>
            </div>
            
            <div className="space-y-6">
              {/* 조명 (수정 불가 — 자동 부여) */}
              <div>
                <label className="block text-slate-700 font-bold mb-2">조명</label>
                <div className="input-field bg-slate-100 text-slate-600 cursor-not-allowed select-none">
                  {teamFormData.name}
                </div>
              </div>

              {/* 조장 선택 */}
              <div>
                <label className="block text-slate-700 font-bold mb-2">
                  조장 <span className="text-red-500">*</span>
                </label>
                {teamFormData.leaderId ? (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{teamFormData.leaderName}</p>
                      <p className="text-sm text-slate-600">
                        {teamFormData.leaderCompany && teamFormData.leaderPosition
                          ? `${teamFormData.leaderCompany} / ${teamFormData.leaderPosition}`
                          : teamFormData.leaderCompany
                          ? teamFormData.leaderCompany
                          : teamFormData.leaderPosition
                          ? teamFormData.leaderPosition
                          : teamFormData.leaderOccupation || '소속/직책 미등록'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsSelectingLeader(true);
                          setShowMemberSelectModal(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        변경
                      </button>
                      <button
                        onClick={handleRemoveLeader}
                        className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                        title="조장 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setIsSelectingLeader(true);
                      setShowMemberSelectModal(true);
                    }}
                    className="w-full p-4 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-slate-600 hover:text-blue-600"
                  >
                    <Shield className="w-5 h-5" />
                    <span>조장 선택</span>
                  </button>
                )}
              </div>

              {/* 조원 목록 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-slate-700 font-bold">
                    조원 ({teamFormData.members.length}명)
                  </label>
                  <button
                    onClick={() => {
                      setIsSelectingLeader(false);
                      setShowMemberSelectModal(true);
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>조원 추가</span>
                  </button>
                </div>

                {teamFormData.members.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {teamFormData.members.map((member) => {
                      // members DB에서 최신 정보 조회
                      const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
                      const participation = eventParticipations.find(p => p.id === member.id);
                      const memberData = participation ? members.find(m => m.id === participation.userId) : null;
                      
                      const displayName = memberData?.name || member.name;
                      const displayCompany = memberData?.company || member.company || '';
                      const displayPosition = memberData?.position || member.position || '';
                      const displayInfo = displayCompany && displayPosition
                        ? `${displayCompany} / ${displayPosition}`
                        : displayCompany || displayPosition || member.occupation || '소속/직책 미등록';
                      
                      return (
                        <div key={member.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900">{displayName}</p>
                              {member.isGuest && (
                                <Badge variant="warning" className="text-xs">게스트</Badge>
                              )}
                              {member.course && (
                                <Badge variant="info" className="text-xs">
                                  {member.course}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600">{displayInfo}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="p-1.5 hover:bg-red-100 rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                    <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">조원이 없습니다</p>
                    <p className="text-sm text-slate-400 mt-1">조원 추가 버튼을 눌러 회원을 추가하세요</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-4 pt-6 mt-6 border-t">
              <button
                onClick={handleCancelTeam}
                className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-medium text-lg hover:bg-slate-300 transition-colors flex items-center justify-center space-x-2"
              >
                <X className="h-5 w-5" />
                <span>취소</span>
              </button>
              <button
                onClick={handleSaveTeam}
                className="flex-1 btn-primary flex items-center justify-center space-x-2"
              >
                <Save className="h-5 w-5" />
                <span>저장</span>
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* 산행 선택 */}
          <FilterGroup
            options={events.map(event => ({
              key: event.id,
              label: `${event.title} (${event.date})`,
            }))}
            selected={selectedEventIdForTeam}
            onChange={(key) => handleSelectEventForTeam(key)}
            className="mb-6"
          />

          {selectedEventIdForTeam ? (
            <>
              {/* 참석자 리스트 복사 버튼 */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={handleCopyAttendeeList}
                  disabled={getApplicantsForEvent(selectedEventIdForTeam).length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                    isCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4" />
                      복사 완료!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      참석자 리스트 복사 ({getApplicantsForEvent(selectedEventIdForTeam).length}명)
                    </>
                  )}
                </button>
              </div>

              {/* 조 편성 통계 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatCard icon={<CheckCircle className="w-8 h-8" />} label="입금 확인 (조편성 대상)" value={getApplicantsForEvent(selectedEventIdForTeam).length} unit="명" iconColor="text-blue-600" />
                <StatCard icon={<Users className="w-8 h-8" />} label="생성된 조" value={teams.length} unit="개" iconColor="text-emerald-600" />
                <StatCard icon={<CheckCircle className="w-8 h-8" />} label="배정 완료" value={teams.reduce((sum, team) => sum + (team.leaderId ? team.members.length + 1 : 0), 0)} unit="명" iconColor="text-purple-600" />
              </div>

              {/* 조 리스트 */}
              <div className="space-y-6">
                {filteredTeams.length > 0 ? (
                  <>
                    {filteredTeams.map((team) => (
                      <Card key={team.id}>
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-2xl font-bold text-slate-900">{team.name}</h3>
                            {(team.leaderId || team.members.length > 0) ? (
                              <Badge variant="primary">{team.members.length + (team.leaderId ? 1 : 0)}명</Badge>
                            ) : (
                              <Badge variant="default">편성 대기</Badge>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEditTeam(team)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="조 편성 수정"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="조 삭제"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        {(team.leaderId || team.members.length > 0) ? (
                          <>
                            {/* Leader */}
                            {team.leaderId ? (
                              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center space-x-2 mb-2">
                                  <Shield className="h-5 w-5 text-blue-600" />
                                  <span className="text-sm font-bold text-blue-900">조장</span>
                                </div>
                                <div className="ml-7">
                                  <p className="font-bold text-slate-900">{team.leaderName}</p>
                                  <p className="text-sm text-slate-600">
                                    {team.leaderCompany && team.leaderPosition
                                      ? `${team.leaderCompany} / ${team.leaderPosition}`
                                      : team.leaderCompany
                                      ? team.leaderCompany
                                      : team.leaderPosition
                                      ? team.leaderPosition
                                      : team.leaderOccupation || '소속/직책 미등록'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <span className="text-sm text-amber-700">조장이 아직 지정되지 않았습니다</span>
                              </div>
                            )}

                            {/* Members */}
                            {team.members.length > 0 && (
                              <div>
                                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center space-x-2">
                                  <Users className="h-4 w-4" />
                                  <span>조원 ({team.members.length}명)</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {team.members.map((member) => (
                                    <div key={member.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="font-bold text-slate-900">
                                          {member.name}
                                          {member.isGuest && (
                                            <span className="ml-2 text-amber-600 font-bold">(G)</span>
                                          )}
                                        </p>
                                        {member.course && (
                                          <Badge variant="info" className="text-xs">
                                            {member.course}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-slate-600">
                                        {member.company && member.position
                                          ? `${member.company} / ${member.position}`
                                          : member.company
                                          ? member.company
                                          : member.position
                                          ? member.position
                                          : member.occupation || '소속/직책 미등록'}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                            <Users className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                            <p className="text-slate-600 font-medium">아직 편성되지 않은 조입니다</p>
                            <p className="text-sm text-slate-500 mt-1">조장과 조원을 배정해주세요</p>
                          </div>
                        )}
                      </Card>
                    ))}

                    {/* 조 추가 버튼 */}
                    {teams.length < 10 && (
                      <Card className="border-2 border-dashed border-primary-300 bg-primary-50/50 hover:bg-primary-50 transition-colors">
                        <button
                          onClick={handleAddNewTeam}
                          className="w-full py-8 flex flex-col items-center justify-center gap-3 text-primary-700 hover:text-primary-800 transition-colors"
                        >
                          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                            <Plus className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-lg font-bold">조 추가</p>
                            <p className="text-sm text-primary-600 mt-1">
                              현재 {teams.length}개 조 (최대 10개)
                            </p>
                          </div>
                        </button>
                      </Card>
                    )}
                  </>
                ) : (
                  <Card className="text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-xl text-slate-500">산행을 먼저 선택해주세요</p>
                    <p className="text-sm text-slate-400 mt-2">
                      산행을 선택하면 기본 3개 조가 자동으로 생성됩니다
                    </p>
                  </Card>
                )}
              </div>

              {/* Info Notice */}
              {selectedEventIdForTeam && (
                <Card className="mt-8 bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-3">
                    <Users className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-2">조 편성 안내</h3>
                      <ul className="text-sm text-slate-700 space-y-1">
                        <li>• 먼저 조 편성할 산행을 선택해주세요.</li>
                        <li>• <strong>입금이 확인된 참가자만</strong> 조편성 대상으로 표시됩니다.</li>
                        <li>• 프로세스: 산행 신청 → 입금 확인 → 조편성 대상</li>
                        <li>• 각 조에는 반드시 조장이 지정되어야 합니다.</li>
                        <li>• 조원은 여러 조에 중복으로 배치될 수 없습니다.</li>
                      </ul>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Card className="text-center py-12 bg-amber-50 border-amber-200">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
              <p className="text-xl font-bold text-slate-900 mb-2">산행을 먼저 선택해주세요</p>
              <p className="text-slate-600">
                조 편성을 시작하려면 위에서 산행을 선택하세요.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Member Select Modal */}
      {showMemberSelectModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowMemberSelectModal(false);
            setIsSelectingLeader(false);
            setSelectedMembersForAdd([]);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {isSelectingLeader ? '조장 선택' : '조원 추가'}
                  </h3>
                  <p className="text-sm text-slate-600 mt-2">
                    {isSelectingLeader 
                      ? '조장으로 지정할 회원을 선택하세요. 기존 조장은 자동으로 조원으로 이동합니다.'
                      : '조원으로 추가할 회원을 선택하세요. 여러 명을 선택한 후 확인 버튼을 눌러주세요.'
                    }
                  </p>
                  {!isSelectingLeader && selectedMembersForAdd.length > 0 && (
                    <p className="text-sm text-primary-600 font-semibold mt-2">
                      {selectedMembersForAdd.length}명 선택됨
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowMemberSelectModal(false);
                    setIsSelectingLeader(false);
                    setSelectedMembersForAdd([]);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6 text-slate-600" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {availableMembers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-xl text-slate-500 mb-2">배정 가능한 신청자가 없습니다</p>
                  <p className="text-sm text-slate-400">
                    {(() => {
                      const allApplicants = getApplicantsForEvent(selectedEventIdForTeam);
                      if (allApplicants.length === 0) {
                        return '선택한 산행에 참가 신청한 회원이 없습니다.';
                      }
                      return `전체 신청자 ${allApplicants.length}명이 모두 조에 배정되었습니다.`;
                    })()}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availableMembers.map((member) => {
                    const isLeader = member.id === teamFormData.leaderId;
                    const isMember = teamFormData.members.some(m => m.id === member.id);
                    const isSelected = isLeader || isMember;
                    const isChecked = selectedMembersForAdd.includes(member.id);
                    
                    // 회사 및 직책 정보 구성
                    const companyInfo = member.company || '회사 미등록';
                    const positionInfo = member.position || member.occupation || '직책 미등록';
                    const displayInfo = `${companyInfo} · ${positionInfo}`;
                    
                    // 결제 상태 레이블
                    const paymentLabel = (() => {
                      switch (member.paymentStatus) {
                        case 'confirmed': return { text: '입금확인', variant: 'success' as const };
                        case 'completed': return { text: '결제완료', variant: 'success' as const };
                        case 'pending': return { text: '입금대기', variant: 'warning' as const };
                        case 'cancelled': return { text: '결제취소', variant: 'danger' as const };
                        case 'failed': return { text: '결제실패', variant: 'danger' as const };
                        default: return { text: '미결제', variant: 'default' as const };
                      }
                    })();
                    
                    return (
                      <button
                        key={member.id}
                        onClick={() => {
                          if (isSelectingLeader) {
                            handleSetLeader(member);
                          } else {
                            if (isSelected) {
                              alert(isLeader ? '해당 회원은 이미 조장으로 지정되어 있습니다.' : '이미 조원 목록에 추가된 회원입니다.');
                              return;
                            }
                            toggleMemberSelection(member.id);
                          }
                        }}
                        disabled={!isSelectingLeader && isSelected}
                        className={`p-4 text-left rounded-lg border-2 transition-all ${
                          !isSelectingLeader && isSelected
                            ? 'bg-slate-100 border-slate-300 cursor-not-allowed opacity-60'
                            : isChecked
                            ? 'bg-primary-50 border-primary-600 shadow-md'
                            : 'bg-white border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-bold text-lg ${
                                !isSelectingLeader && isSelected 
                                  ? 'text-slate-500' 
                                  : isChecked 
                                  ? 'text-primary-900'
                                  : 'text-slate-900'
                              }`}>
                                {member.name}
                              </p>
                              {member.isGuest && (
                                <Badge variant="warning" className="text-xs">게스트</Badge>
                              )}
                              {member.course && (
                                <Badge variant="info" className="text-xs">
                                  {member.course}
                                </Badge>
                              )}
                              <Badge variant={paymentLabel.variant} className="text-xs">
                                {paymentLabel.text}
                              </Badge>
                            </div>
                            <p className={`text-sm font-medium ${
                              !isSelectingLeader && isSelected 
                                ? 'text-slate-400' 
                                : isChecked
                                ? 'text-primary-700'
                                : 'text-slate-600'
                            }`}>
                              {displayInfo}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isLeader && (
                              <Badge variant="primary">현재 조장</Badge>
                            )}
                            {isMember && (
                              <Badge variant="success">조원</Badge>
                            )}
                            {!isSelectingLeader && !isSelected && (
                              <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                                isChecked 
                                  ? 'bg-primary-600 border-primary-600' 
                                  : 'border-slate-300'
                              }`}>
                                {isChecked && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 조원 추가 모드일 때만 확인 버튼 표시 */}
            {!isSelectingLeader && availableMembers.length > 0 && (
              <div className="p-6 border-t bg-slate-50">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowMemberSelectModal(false);
                      setSelectedMembersForAdd([]);
                    }}
                    className="flex-1 px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddSelectedMembers}
                    disabled={selectedMembersForAdd.length === 0}
                    className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
                      selectedMembersForAdd.length === 0
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    확인 ({selectedMembersForAdd.length}명 추가)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;
