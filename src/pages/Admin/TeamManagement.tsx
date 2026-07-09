import React, { useState, useEffect } from 'react';
import { Plus, Edit, Save, X, Users, Shield, CheckCircle, Calendar, MapPin, AlertCircle, Copy, Check, Trash2, Lock, Search, Upload, Loader2, Download, UserPlus } from 'lucide-react';
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
    refreshParticipants,
    updateEvent
  } = useEvents();
  const { members } = useMembers();
  const { payments, getPaymentsByEvent, createPaymentForParticipation } = usePayments();
  const { participations, getParticipationsByEvent, addParticipation } = useParticipations();
  
  // 산행 목록 (오늘 이후만)
  const [events, setEvents] = useState<HikingEvent[]>([]);
  const [selectedEventIdForTeam, setSelectedEventIdForTeam] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [isSelectingLeader, setIsSelectingLeader] = useState(false);
  const [selectedMembersForAdd, setSelectedMembersForAdd] = useState<string[]>([]);
  const [memberModalSearchQuery, setMemberModalSearchQuery] = useState('');
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

  // 모달 열릴 때마다 검색어 초기화
  useEffect(() => {
    if (showMemberSelectModal) setMemberModalSearchQuery('');
  }, [showMemberSelectModal]);

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

        // 이 이벤트에 유효한(환불/취소 아닌) 결제가 있는 userId 목록
        // — 환불 후 재신청한 회원이 userId 기반 조회로 잘못 제거되는 것을 방지
        const activePaymentUserIds = new Set(
          eventPayments
            .filter(payment => payment.refundStatus !== 'completed' && payment.paymentStatus !== 'cancelled')
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
        // participationId → participation 매핑 (게스트 userCompany/userPosition fallback용)
        const participationDataMap = new Map(
          eventParticipations.map(p => [p.id, p])
        );

        // 회사/직책 보강 헬퍼: members DB 우선, 없으면 participation fallback (게스트는 participation에만 있음)
        const enrichCompanyPosition = (participationId: string, fallbackCompany = '', fallbackPosition = '') => {
          const userId = participationUserMap.get(participationId);
          const memberData = userId ? members.find(m => m.id === userId) : null;
          const p = participationDataMap.get(participationId);
          return {
            company: memberData?.company || (p as any)?.userCompany || fallbackCompany,
            position: memberData?.position || (p as any)?.userPosition || fallbackPosition,
          };
        };

        // 환불된 사용자를 조원 목록에서 제거 + members DB에서 최신 정보 보강
        const filteredTeams = existingTeams.map(team => {
          // 조장 확인: 참가 신청이 유효하고 환불되지 않았는지
          // participationId 기반 결제 조회 + userId 직접 조회(participationId 없는 레거시 결제 대응)
          const leaderPayment = eventPayments.find(p => p.participationId === team.leaderId);
          const leaderUserId = participationUserMap.get(team.leaderId);
          const isLeaderRefunded =
            (leaderPayment ? refundedUserIds.has(leaderPayment.userId) : false) ||
            (leaderUserId ? refundedUserIds.has(leaderUserId) && !activePaymentUserIds.has(leaderUserId) : false);
          const isLeaderParticipationValid = validParticipationIds.has(team.leaderId);
          const shouldRemoveLeader = isLeaderRefunded || !isLeaderParticipationValid;

          // 조장 정보 보강 (members → participation 순서로 fallback)
          let leaderName = team.leaderName;
          let leaderCompany = team.leaderCompany || '';
          let leaderPosition = team.leaderPosition || '';
          let leaderOccupation = team.leaderOccupation || '';

          if (!shouldRemoveLeader && team.leaderId) {
            const enriched = enrichCompanyPosition(team.leaderId, leaderCompany, leaderPosition);
            const leaderUserId = participationUserMap.get(team.leaderId);
            const leaderMember = leaderUserId ? members.find(m => m.id === leaderUserId) : null;
            if (leaderMember) leaderName = leaderMember.name || leaderName;
            leaderCompany = enriched.company;
            leaderPosition = enriched.position;
            leaderOccupation = [enriched.company, enriched.position].filter(Boolean).join(' ');
          }

          return {
            ...team,
            leaderId: shouldRemoveLeader ? '' : team.leaderId,
            leaderName: shouldRemoveLeader ? '' : leaderName,
            leaderOccupation: shouldRemoveLeader ? '' : leaderOccupation,
            leaderCompany: shouldRemoveLeader ? '' : leaderCompany,
            leaderPosition: shouldRemoveLeader ? '' : leaderPosition,
            // 환불되었거나 신청 취소된 조원 제거 + 정보 보강
            members: team.members?.filter(member => {
              // participationId 기반 결제 조회 + userId 직접 조회(participationId 없는 레거시 결제 대응)
              const payment = eventPayments.find(p => p.participationId === member.id);
              const memberUserId = participationUserMap.get(member.id);
              const isRefunded =
                (payment ? refundedUserIds.has(payment.userId) : false) ||
                (memberUserId ? refundedUserIds.has(memberUserId) && !activePaymentUserIds.has(memberUserId) : false);
              const isParticipationValid = validParticipationIds.has(member.id);
              return !isRefunded && isParticipationValid;
            }).map(member => {
              const memberUserId = participationUserMap.get(member.id);
              const memberData = memberUserId ? members.find(m => m.id === memberUserId) : null;
              const enriched = enrichCompanyPosition(member.id, member.company || '', member.position || '');
              return {
                ...member,
                name: memberData?.name || member.name,
                company: enriched.company,
                position: enriched.position,
                occupation: [enriched.company, enriched.position].filter(Boolean).join(' '),
                phoneNumber: memberData?.phoneNumber || member.phoneNumber,
              };
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

  // 현재 선택된 산행
  const selectedEventForTeam = events.find(e => e.id === selectedEventIdForTeam) || null;
  const isEventClosed = selectedEventForTeam
    ? (selectedEventForTeam.status === 'closed' || selectedEventForTeam.status === 'ongoing' || selectedEventForTeam.status === 'completed')
    : false;

  // 조 편성 완료 → 산행 신청 마감 (status='closed')
  const handleFinalizeTeams = async () => {
    if (!selectedEventForTeam) return;
    const assignedCount = teams.reduce((sum, t) => sum + (t.leaderId ? t.members.length + 1 : t.members.length), 0);
    if (assignedCount === 0) {
      alert('아직 배정된 인원이 없습니다. 조 편성을 먼저 진행해주세요.');
      return;
    }
    if (!confirm(`조 편성을 완료하고 산행 신청을 마감하시겠습니까?\n\n현재 ${teams.length}개 조 · ${assignedCount}명 배정\n\n마감 후에는 추가 신청을 받을 수 없습니다.`)) return;
    try {
      await updateEvent(selectedEventForTeam.id, { status: 'closed' });
      alert('조 편성이 완료되어 산행 신청이 마감되었습니다.');
    } catch (error: any) {
      console.error('산행 마감 실패:', error);
      alert(`산행 마감에 실패했습니다: ${error.message}`);
    }
  };

  // 신청 재오픈 (closed → open)
  const handleReopenApplication = async () => {
    if (!selectedEventForTeam) return;
    if (!confirm('산행 신청을 다시 오픈하시겠습니까?\n추가 신청을 받을 수 있습니다.')) return;
    try {
      await updateEvent(selectedEventForTeam.id, { status: 'open' });
      alert('산행 신청이 다시 오픈되었습니다.');
    } catch (error: any) {
      console.error('신청 재오픈 실패:', error);
      alert(`신청 재오픈에 실패했습니다: ${error.message}`);
    }
  };

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

  // 조원/조장 선택 모달 내 검색 필터링 (이름/회사/직책)
  const filteredModalMembers = (() => {
    const q = memberModalSearchQuery.trim();
    if (!q) return availableMembers;
    return availableMembers.filter(m =>
      m.name.includes(q) || (m.company || '').includes(q) || (m.position || '').includes(q)
    );
  })();

  // Context와 동기화
  const syncTeamsToContext = async (updatedTeams: Team[]) => {
    if (selectedEventIdForTeam) {
      await setTeamsForEvent(selectedEventIdForTeam, updatedTeams);
    }
  };

  // ===== 조편성 엑셀 업로드 =====
  const [showExcelUploadModal, setShowExcelUploadModal] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelParseError, setExcelParseError] = useState('');
  const [excelRows, setExcelRows] = useState<any[]>([]); // 매칭 처리된 행 목록
  const [excelAmbiguousSelections, setExcelAmbiguousSelections] = useState<Record<number, string>>({});
  const [isApplyingExcelTeams, setIsApplyingExcelTeams] = useState(false);
  const [excelFileInputKey, setExcelFileInputKey] = useState(0);

  const closeExcelUploadModal = () => {
    setShowExcelUploadModal(false);
    setExcelRows([]);
    setExcelParseError('');
    setExcelAmbiguousSelections({});
    setExcelFileInputKey(k => k + 1);
  };

  // 조편성 엑셀 템플릿 다운로드
  // 조가 열(컬럼)로 배치되고 이름을 세로로 나열하는 가로형 양식
  // (구분 | 1조 | 2조 | 3조 | 4조 ... / 첫 데이터 행=조장, 이후=조원)
  const handleDownloadExcelTemplate = async () => {
    const XLSX = await import('xlsx');
    const data = [
      ['구분', '1조', '2조', '3조', '4조'],
      ['조장', '홍길동', '', '', ''],
      [1, '김철수', '', '', ''],
      [2, '이영희', '', '', ''],
      [3, '박민수', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '조편성');
    XLSX.writeFile(wb, '조편성_업로드양식.xlsx');
  };

  // 조장 여부로 인정하는 값들 (첫 열 라벨이 이 중 하나면 해당 행은 조장 행)
  const LEADER_FLAG_VALUES = ['O', 'o', '조장', '예', 'Y', 'y', 'true', 'TRUE'];

  // 엑셀 파일 선택 → 파싱(가로형: 조가 열, 이름이 세로) + 신청자 매칭
  const handleExcelFileSelected = async (file: File) => {
    setIsParsingExcel(true);
    setExcelParseError('');
    setExcelRows([]);
    setExcelAmbiguousSelections({});

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('시트를 찾을 수 없습니다.');
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const applicants = getApplicantsForEvent(selectedEventIdForTeam);
      const approvedMembers = members.filter(m => m.isApproved && m.isActive !== false);

      if (rawRows.length === 0) {
        throw new Error('엑셀에서 데이터를 찾을 수 없습니다. 템플릿 양식을 확인해주세요.');
      }

      // 첫 행 = 헤더 (구분 | 1조 | 2조 | ...) — 각 열이 어느 조번호인지 추출
      const headerRow = rawRows[0];
      const teamColumns: { colIndex: number; teamNumber: number }[] = [];
      for (let i = 1; i < headerRow.length; i++) {
        const label = String(headerRow[i] ?? '').trim();
        const match = label.match(/\d+/);
        if (match) teamColumns.push({ colIndex: i, teamNumber: parseInt(match[0], 10) });
      }

      if (teamColumns.length === 0) {
        throw new Error('조 번호를 찾을 수 없습니다. 첫 행이 "구분 | 1조 | 2조 ..." 형식인지 확인해주세요.');
      }

      // 데이터 행을 순회하며 각 조 열에서 이름을 추출 (빈 칸은 건너뜀)
      const parsedRows: any[] = [];
      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        const rowLabel = String(row[0] ?? '').trim();
        const isLeaderFlag = LEADER_FLAG_VALUES.includes(rowLabel);

        for (const tc of teamColumns) {
          const name = String(row[tc.colIndex] ?? '').trim();
          if (!name) continue; // 빈 칸 (조원 수가 적은 조)

          let rowError = '';
          if (tc.teamNumber < 1 || tc.teamNumber > 10) {
            rowError = '조번호가 올바르지 않습니다 (1~10 사이 숫자).';
          }

          const applicantCandidates = rowError ? [] : applicants.filter(a => a.name.trim() === name);

          let matchStatus: string;
          let candidates: any[];
          let candidateSource: 'applicant' | 'member' | null;

          if (rowError) {
            matchStatus = 'error'; candidates = []; candidateSource = null;
          } else if (applicantCandidates.length === 1) {
            matchStatus = 'matched'; candidates = applicantCandidates; candidateSource = 'applicant';
          } else if (applicantCandidates.length > 1) {
            matchStatus = 'ambiguous'; candidates = applicantCandidates; candidateSource = 'applicant';
          } else {
            // 이 산행 신청자 명단엔 없지만, 클럽 회원 중에 이름이 일치하는 사람이 있는지 확인
            // (있으면 적용 시 자동으로 이 산행에 신청 처리)
            const memberCandidates = approvedMembers.filter(m => m.name.trim() === name);
            if (memberCandidates.length === 1) {
              matchStatus = 'member_pending'; candidates = memberCandidates; candidateSource = 'member';
            } else if (memberCandidates.length > 1) {
              matchStatus = 'member_ambiguous'; candidates = memberCandidates; candidateSource = 'member';
            } else {
              matchStatus = 'not_found'; candidates = []; candidateSource = null;
            }
          }

          parsedRows.push({
            rowIndex: parsedRows.length,
            excelRowNumber: r + 1, // 실제 엑셀 시트 행 번호(1-based, 헤더=1행)
            teamNumber: tc.teamNumber,
            name,
            isLeaderFlag,
            rowError,
            matchStatus,
            candidates,
            candidateSource,
            autoResolvedId: (matchStatus === 'matched' || matchStatus === 'member_pending') ? candidates[0].id : null,
          });
        }
      }

      if (parsedRows.length === 0) {
        throw new Error('엑셀에서 데이터를 찾을 수 없습니다. 템플릿 양식을 확인해주세요.');
      }

      setExcelRows(parsedRows);
    } catch (err: any) {
      setExcelParseError(err.message || '엑셀 파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      setIsParsingExcel(false);
    }
  };

  // 각 행의 최종 배정 ID (매칭 자동 or 동명이인 수동 선택)
  // 반환값은 candidateSource==='applicant'면 participationId, candidateSource==='member'면 memberId
  // (member인 경우 실제 적용 시점에 신청이 먼저 생성되고 participationId로 치환됨 — handleApplyExcelTeams 참고)
  const getResolvedIdForRow = (row: any): string | null => {
    if (row.matchStatus === 'matched' || row.matchStatus === 'member_pending') return row.autoResolvedId;
    if (row.matchStatus === 'ambiguous' || row.matchStatus === 'member_ambiguous') return excelAmbiguousSelections[row.rowIndex] || null;
    return null;
  };

  // 조번호별 그룹 (조장 미지정/중복 검증 및 팀 배정에 사용)
  const excelTeamGroups = (() => {
    const groups = new Map<number, { leaderRows: any[]; memberRows: any[] }>();
    excelRows.forEach(row => {
      if (row.rowError) return; // 기본 검증 실패 행은 그룹핑에서 제외 (전체 검증 단계에서 별도로 오류 표시됨)
      if (!groups.has(row.teamNumber)) groups.set(row.teamNumber, { leaderRows: [], memberRows: [] });
      const g = groups.get(row.teamNumber)!;
      if (row.isLeaderFlag) g.leaderRows.push(row);
      else g.memberRows.push(row);
    });
    return groups;
  })();

  // 전체 검증: 업로드 적용이 가능한 상태인지
  const excelValidation = (() => {
    if (excelRows.length === 0) {
      return { isValid: false, issues: ['엑셀 파일을 먼저 업로드해주세요.'], notFoundRows: [], ambiguousRows: [], formatErrorRows: [], pendingMemberRows: [] };
    }
    const issues: string[] = [];

    // 신청자 명단·회원 어디에도 없는 행 — 오타이거나 정말 등록되지 않은 사람 (적용 차단)
    const notFoundRows = excelRows.filter(r => r.matchStatus === 'not_found');
    // 동명이인인데 아직 수동으로 선택되지 않은 행 (신청자 동명이인 + 회원 동명이인 모두 포함, 적용 차단)
    const ambiguousRows = excelRows.filter(r => (r.matchStatus === 'ambiguous' || r.matchStatus === 'member_ambiguous') && !getResolvedIdForRow(r));
    // 조번호/이름 형식 자체가 잘못된 행 (적용 차단)
    const formatErrorRows = excelRows.filter(r => r.matchStatus === 'error');
    // 회원이지만 이 산행에 아직 신청 안 된 사람 — 차단하지 않고 적용 시 자동으로 산행 신청 처리
    const pendingMemberRows = excelRows.filter(r => r.matchStatus === 'member_pending' || (r.matchStatus === 'member_ambiguous' && getResolvedIdForRow(r)));

    // 중복 배정 (같은 사람이 여러 조/행에 등장)
    const idLocations = new Map<string, string[]>();
    excelRows.forEach(r => {
      const id = getResolvedIdForRow(r);
      if (!id) return;
      if (!idLocations.has(id)) idLocations.set(id, []);
      idLocations.get(id)!.push(`${r.teamNumber}조(${r.excelRowNumber}행)`);
    });
    const duplicateEntries = [...idLocations.entries()].filter(([, locs]) => locs.length > 1);
    if (duplicateEntries.length > 0) {
      issues.push(`동일 인물이 여러 곳(${duplicateEntries.map(([, locs]) => locs.join(', ')).join(' / ')})에 중복 배정되었습니다.`);
    }

    // 조별 조장 검증
    excelTeamGroups.forEach((group, teamNumber) => {
      if (group.leaderRows.length === 0) issues.push(`${teamNumber}조: 조장이 지정되지 않았습니다.`);
      if (group.leaderRows.length > 1) issues.push(`${teamNumber}조: 조장이 ${group.leaderRows.length}명 지정되었습니다.`);
    });

    // 전체 조 개수 상한 (기존 + 신규)
    const existingNumbers = new Set(teams.map(t => (t as any).number ?? parseInt(t.name) ?? 0));
    const newNumbers = new Set(excelTeamGroups.keys());
    const totalTeamCount = new Set([...existingNumbers, ...newNumbers]).size;
    if (totalTeamCount > 10) {
      issues.push(`조는 최대 10개까지만 생성할 수 있습니다 (현재 ${totalTeamCount}개).`);
    }

    return {
      isValid: issues.length === 0 && notFoundRows.length === 0 && ambiguousRows.length === 0 && formatErrorRows.length === 0,
      issues,
      notFoundRows,
      ambiguousRows,
      formatErrorRows,
      pendingMemberRows,
    };
  })();

  // 엑셀 업로드 결과를 실제 조편성에 적용
  const handleApplyExcelTeams = async () => {
    if (!excelValidation.isValid) return;

    const autoRegisterCount = excelValidation.pendingMemberRows.length;
    const confirmMsg = autoRegisterCount > 0
      ? `엑셀 명단대로 조 편성을 적용하시겠습니까?\n\n${excelTeamGroups.size}개 조, ${excelRows.length}명이 배정됩니다.\n` +
        `(이 중 ${autoRegisterCount}명은 아직 이 산행에 신청되지 않은 회원으로, 자동으로 산행 신청 처리됩니다.)`
      : `엑셀 명단대로 조 편성을 적용하시겠습니까?\n\n${excelTeamGroups.size}개 조, ${excelRows.length}명이 배정됩니다.`;
    if (!confirm(confirmMsg)) return;

    setIsApplyingExcelTeams(true);
    try {
      const selectedEvent = events.find(e => e.id === selectedEventIdForTeam);
      const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
      const isAlreadyRegistered = (memberId: string) =>
        eventParticipations.some(p => p.userId === memberId && p.status !== 'cancelled');

      // 1. 회원이지만 이 산행에 아직 신청되지 않은 사람 먼저 자동 등록 (중복 인물은 1회만)
      const memberIdsToRegister = [...new Set(
        excelRows
          .filter(r => r.candidateSource === 'member')
          .map(r => getResolvedIdForRow(r))
          .filter((id): id is string => !!id && !isAlreadyRegistered(id))
      )];

      const newParticipationIdByMemberId = new Map<string, string>();
      let paymentCreationFailedCount = 0;

      for (const memberId of memberIdsToRegister) {
        const member = members.find(m => m.id === memberId);
        if (!member) continue;
        const participation = await addParticipation({
          eventId: selectedEventIdForTeam,
          userId: member.id,
          userName: member.name,
          userEmail: member.email || '',
          userPhone: member.phoneNumber || '',
          userCompany: member.company || '',
          userPosition: member.position || '',
          status: 'pending',
          paymentStatus: 'pending',
          isGuest: false,
        });
        newParticipationIdByMemberId.set(memberId, participation.id);

        try {
          await createPaymentForParticipation({
            id: participation.id,
            eventId: selectedEventIdForTeam,
            userId: member.id,
            userName: member.name,
            userEmail: member.email || '',
            userPhone: member.phoneNumber || '',
            userCompany: member.company || '',
            userPosition: member.position || '',
            isGuest: false,
          }, selectedEvent?.paymentInfo?.cost || selectedEvent?.cost);
        } catch (paymentErr) {
          paymentCreationFailedCount++;
          console.warn('결제 레코드 생성 실패 (참가 신청은 완료됨):', memberId, paymentErr);
        }
      }

      // 회원 자동등록 이후 최신 신청자 목록 재조회 (방금 등록된 사람 포함)
      const applicants = getApplicantsForEvent(selectedEventIdForTeam);
      const findApplicant = (id: string) => applicants.find(a => a.id === id);

      // 각 행의 최종 participationId 계산 (member 출처는 방금 생성했거나 이미 있던 participationId로 치환)
      const resolveFinalId = (row: any): string | null => {
        const id = getResolvedIdForRow(row);
        if (!id) return null;
        if (row.candidateSource === 'member') {
          if (newParticipationIdByMemberId.has(id)) return newParticipationIdByMemberId.get(id)!;
          const existing = eventParticipations.find(p => p.userId === id && p.status !== 'cancelled');
          return existing ? existing.id : null;
        }
        return id;
      };

      // 미리보기 확인 중(동명이인 선택 등) 신청 취소/환불 등으로 대상자가 바뀌었는지 재검증
      // — 조용히 누락시키지 않고 명확히 중단 (방금 자동등록한 회원은 이미 반영되어 있으므로 제외)
      const staleRows = excelRows.filter(r => {
        if (r.candidateSource === 'member') return false; // 방금 처리했거나 처리 대상이 아님
        const id = getResolvedIdForRow(r);
        return id && !findApplicant(id);
      });
      if (staleRows.length > 0) {
        alert(
          `일부 신청자 정보가 업로드 검토 중에 변경되었습니다(취소/환불 등).\n` +
          `해당 인원(${staleRows.map(r => `${r.teamNumber}조(${r.excelRowNumber}행) ${r.name}`).join(', ')})을 확인 후 엑셀을 다시 업로드해주세요.`
        );
        return;
      }

      // 참가자 id → 목표 조번호 매핑
      const assignmentMap = new Map<string, number>();
      excelRows.forEach(r => {
        const id = resolveFinalId(r);
        if (id) assignmentMap.set(id, r.teamNumber);
      });

      // 1. 기존 팀에서 "다른 조로 재배정된" 인원 제거 (중복 배정 방지)
      let updatedTeams: Team[] = teams.map(t => {
        const teamNum = (t as any).number ?? parseInt(t.name) ?? 0;
        let leaderId = t.leaderId, leaderName = t.leaderName, leaderCompany = t.leaderCompany, leaderPosition = t.leaderPosition, leaderOccupation = t.leaderOccupation;

        if (leaderId && assignmentMap.has(leaderId) && assignmentMap.get(leaderId) !== teamNum) {
          leaderId = ''; leaderName = ''; leaderCompany = ''; leaderPosition = ''; leaderOccupation = '';
        }
        const members = (t.members || []).filter(m => !(assignmentMap.has(m.id) && assignmentMap.get(m.id) !== teamNum));

        return { ...t, leaderId, leaderName, leaderCompany, leaderPosition, leaderOccupation, members };
      });

      // 2. 엑셀에 등장하는 조번호별로 팀을 찾거나 새로 생성 후 leader/members 설정
      excelTeamGroups.forEach((group, teamNumber) => {
        let team = updatedTeams.find(t => ((t as any).number ?? parseInt(t.name) ?? 0) === teamNumber);
        if (!team) {
          // @ts-ignore
          team = {
            id: `${selectedEventIdForTeam}-team-${Date.now()}-${teamNumber}`,
            name: `${teamNumber}조`,
            number: teamNumber,
            eventId: selectedEventIdForTeam,
            eventTitle: events.find(e => e.id === selectedEventIdForTeam)?.title || '',
            leaderId: '',
            leaderName: '',
            leaderOccupation: '',
            members: [],
          };
          updatedTeams.push(team);
        }

        const leaderRow = group.leaderRows[0];
        const leaderId = resolveFinalId(leaderRow);
        const leaderApplicant = leaderId ? findApplicant(leaderId) : null;
        if (leaderApplicant) {
          team.leaderId = leaderApplicant.id;
          team.leaderName = leaderApplicant.name;
          team.leaderCompany = leaderApplicant.company;
          team.leaderPosition = leaderApplicant.position;
          team.leaderOccupation = [leaderApplicant.company, leaderApplicant.position].filter(Boolean).join(' ');
          team.leaderIsGuest = leaderApplicant.isGuest || false;
        }

        team.members = group.memberRows
          .map(r => {
            const id = resolveFinalId(r);
            const applicant = id ? findApplicant(id) : null;
            if (!applicant) return null;
            // 수동으로 조원을 추가할 때(handleAddMember)와 동일하게 신청자 전체 정보를 저장
            // (phoneNumber/status/paymentStatus/course 등 화면에서 참조할 수 있는 필드 누락 방지)
            return { ...applicant } as TeamMember;
          })
          .filter((m): m is TeamMember => m !== null);
      });

      setTeams(updatedTeams);
      await syncTeamsToContext(updatedTeams);
      alert(
        `엑셀 업로드로 ${excelTeamGroups.size}개 조, ${excelRows.length}명이 배정되었습니다.` +
        (memberIdsToRegister.length > 0 ? `\n(${memberIdsToRegister.length}명 자동 산행 신청 처리됨)` : '') +
        (paymentCreationFailedCount > 0 ? `\n\n⚠️ ${paymentCreationFailedCount}명의 결제 레코드 생성에 실패했습니다. 결제관리 페이지에서 확인해주세요.` : '')
      );
      closeExcelUploadModal();
    } catch (err: any) {
      setTeams(teams); // 롤백
      alert(`조 편성 적용 실패: ${err.message || '다시 시도해주세요.'}`);
    } finally {
      setIsApplyingExcelTeams(false);
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
    // 조장 정보를 members DB 또는 participation(게스트)에서 보강
    const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
    let enrichedTeam = { ...team };

    if (team.leaderId) {
      const leaderParticipation = eventParticipations.find(p => p.id === team.leaderId);
      const leaderMember = leaderParticipation ? members.find(m => m.id === leaderParticipation.userId) : null;
      const leaderCompany = leaderMember?.company || (leaderParticipation as any)?.userCompany || team.leaderCompany || '';
      const leaderPosition = leaderMember?.position || (leaderParticipation as any)?.userPosition || team.leaderPosition || '';
      enrichedTeam = {
        ...enrichedTeam,
        leaderName: leaderMember?.name || team.leaderName,
        leaderCompany,
        leaderPosition,
        leaderOccupation: [leaderCompany, leaderPosition].filter(Boolean).join(' '),
        leaderIsGuest: leaderParticipation?.isGuest ?? team.leaderIsGuest ?? false,
      };
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
                      <p className="font-bold text-slate-900">
                        {teamFormData.leaderName}
                        {teamFormData.leaderIsGuest && (
                          <span className="ml-2 text-amber-600 font-bold">(G)</span>
                        )}
                      </p>
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
                      // members DB 또는 participation(게스트)에서 최신 정보 조회
                      const eventParticipations = getParticipationsByEvent(selectedEventIdForTeam);
                      const participation = eventParticipations.find(p => p.id === member.id);
                      const memberData = participation ? members.find(m => m.id === participation.userId) : null;

                      const displayName = memberData?.name || member.name;
                      const displayCompany = memberData?.company || (participation as any)?.userCompany || member.company || '';
                      const displayPosition = memberData?.position || (participation as any)?.userPosition || member.position || '';
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
              {/* 조 편성 완료 / 산행 마감 액션 바 */}
              <div className={`mb-6 rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                isEventClosed ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-start gap-3">
                  {isEventClosed ? (
                    <Lock className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-bold ${isEventClosed ? 'text-red-900' : 'text-emerald-900'}`}>
                      {isEventClosed ? '신청 마감됨 (조 편성 완료)' : '신청 접수 중'}
                    </p>
                    <p className={`text-sm mt-0.5 ${isEventClosed ? 'text-red-700' : 'text-emerald-700'}`}>
                      {isEventClosed
                        ? '추가 신청이 중단된 상태입니다. 필요하면 신청을 다시 열 수 있습니다.'
                        : '조 편성이 모두 끝나면 아래 버튼으로 산행 신청을 마감하세요.'}
                    </p>
                  </div>
                </div>
                {isEventClosed ? (
                  <button
                    onClick={handleReopenApplication}
                    className="flex-shrink-0 px-5 py-2.5 bg-white border border-red-300 text-red-700 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors"
                  >
                    신청 다시 열기
                  </button>
                ) : (
                  <button
                    onClick={handleFinalizeTeams}
                    className="flex-shrink-0 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    조 편성 완료 · 산행 마감
                  </button>
                )}
              </div>

              {/* 참석자 리스트 복사 / 엑셀 업로드 버튼 */}
              <div className="flex justify-end gap-2 mb-4">
                <button
                  onClick={() => setShowExcelUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400"
                >
                  <Upload className="w-4 h-4" />
                  엑셀 업로드
                </button>
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
                                  <p className="font-bold text-slate-900">
                                    {team.leaderName}
                                    {team.leaderIsGuest && (
                                      <span className="ml-2 text-amber-600 font-bold">(G)</span>
                                    )}
                                  </p>
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
                <>
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberModalSearchQuery}
                      onChange={(e) => setMemberModalSearchQuery(e.target.value)}
                      placeholder="이름, 회사, 직책으로 검색"
                      className="input-field pl-10"
                      autoFocus
                    />
                  </div>

                  {filteredModalMembers.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-10">검색 결과가 없습니다.</p>
                  ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredModalMembers.map((member) => {
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
                </>
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

      {/* 조편성 엑셀 업로드 모달 */}
      {showExcelUploadModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={closeExcelUploadModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">조편성 엑셀 업로드</h3>
                <p className="text-sm text-slate-600 mt-1">양식(조번호 / 이름 / 조장여부)에 맞춰 작성한 엑셀을 업로드하세요.</p>
              </div>
              <button onClick={closeExcelUploadModal} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="h-6 w-6 text-slate-600" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button
                  onClick={handleDownloadExcelTemplate}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  템플릿 다운로드
                </button>
                <label className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {excelRows.length > 0 ? '다른 파일 선택' : '엑셀 파일 선택'}
                  <input
                    key={excelFileInputKey}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExcelFileSelected(file);
                    }}
                  />
                </label>
                {isParsingExcel && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
              </div>

              {excelParseError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{excelParseError}</p>
                </div>
              )}

              {excelRows.length > 0 && (
                <>
                  {excelValidation.notFoundRows.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-300 rounded-xl">
                      <p className="text-sm font-bold text-red-900 mb-1.5 flex items-center gap-1.5">
                        <X className="w-4 h-4" />
                        시스템(이 산행 신청자 명단)에 없는 이름 {excelValidation.notFoundRows.length}명
                      </p>
                      <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                        {excelValidation.notFoundRows.map((r: any) => (
                          <li key={r.rowIndex}>{r.teamNumber}조 · {r.name} ({r.excelRowNumber}행)</li>
                        ))}
                      </ul>
                      <p className="text-xs text-red-700 mt-2">
                        오타이거나, 이 산행에 아직 참가 신청되지 않은 사람입니다. 엑셀의 이름을 수정하거나,
                        먼저 "참가자 추가"로 해당 인원을 이 산행에 등록한 뒤 다시 업로드해주세요.
                      </p>
                    </div>
                  )}

                  {excelValidation.ambiguousRows.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl">
                      <p className="text-sm font-bold text-amber-900 mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        동명이인 확인이 필요한 이름 {excelValidation.ambiguousRows.length}명
                      </p>
                      <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                        {excelValidation.ambiguousRows.map((r: any) => (
                          <li key={r.rowIndex}>{r.teamNumber}조 · {r.name} ({r.excelRowNumber}행) — 아래 목록에서 선택해주세요</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {excelValidation.formatErrorRows.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-300 rounded-xl">
                      <p className="text-sm font-bold text-red-900 mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        형식 오류가 있는 행 {excelValidation.formatErrorRows.length}개
                      </p>
                      <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                        {excelValidation.formatErrorRows.map((r: any) => (
                          <li key={r.rowIndex}>{r.teamNumber}조 · {r.name || '(이름 없음)'} ({r.excelRowNumber}행) — {r.rowError}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {excelValidation.pendingMemberRows.length > 0 && (
                    <div className="p-4 bg-blue-50 border border-blue-300 rounded-xl">
                      <p className="text-sm font-bold text-blue-900 mb-1.5 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4" />
                        아직 이 산행에 신청되지 않은 회원 {excelValidation.pendingMemberRows.length}명
                      </p>
                      <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        {excelValidation.pendingMemberRows.map((r: any) => (
                          <li key={r.rowIndex}>{r.teamNumber}조 · {r.name} ({r.excelRowNumber}행)</li>
                        ))}
                      </ul>
                      <p className="text-xs text-blue-700 mt-2">
                        클럽 회원 명단과는 일치하지만 이 산행 신청자 명단엔 없는 사람입니다.
                        "적용"을 누르면 이 산행에 자동으로 신청 처리된 뒤 조 편성됩니다.
                      </p>
                    </div>
                  )}

                  {excelValidation.issues.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm font-bold text-amber-900 mb-1.5 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        그 외 확인이 필요합니다
                      </p>
                      <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                        {excelValidation.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-4">
                    {[...excelTeamGroups.keys()].sort((a, b) => a - b).map(teamNumber => {
                      const group = excelTeamGroups.get(teamNumber)!;
                      const rowsForTeam = [...group.leaderRows, ...group.memberRows];
                      return (
                        <div key={teamNumber} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-800 text-sm">
                            {teamNumber}조 ({rowsForTeam.length}명)
                          </div>
                          <div className="divide-y divide-slate-100">
                            {rowsForTeam.map(row => {
                              const resolvedId = getResolvedIdForRow(row);
                              return (
                                <div key={row.rowIndex} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {row.matchStatus === 'matched' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                                    {(row.matchStatus === 'ambiguous' || row.matchStatus === 'member_ambiguous') && <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                                    {row.matchStatus === 'member_pending' && <UserPlus className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                                    {(row.matchStatus === 'not_found' || row.matchStatus === 'error') && <X className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                    <span className="font-semibold text-slate-900 truncate">
                                      {row.name || `(${row.excelRowNumber}행)`}
                                    </span>
                                    {row.isLeaderFlag && <Badge variant="primary" className="text-xs flex-shrink-0">조장</Badge>}
                                  </div>

                                  <div className="flex-shrink-0 text-right">
                                    {row.matchStatus === 'matched' && (
                                      <span className="text-xs text-slate-500">
                                        {[row.candidates[0].company, row.candidates[0].position].filter(Boolean).join(' / ') || '매칭됨'}
                                      </span>
                                    )}
                                    {row.matchStatus === 'member_pending' && (
                                      <span className="text-xs text-blue-600">
                                        회원 · {[row.candidates[0].company, row.candidates[0].position].filter(Boolean).join(' / ') || ''} (자동 신청됨)
                                      </span>
                                    )}
                                    {row.matchStatus === 'not_found' && (
                                      <span className="text-xs text-red-600">신청자 목록에서 찾을 수 없음</span>
                                    )}
                                    {row.matchStatus === 'error' && (
                                      <span className="text-xs text-red-600">{row.rowError}</span>
                                    )}
                                    {(row.matchStatus === 'ambiguous' || row.matchStatus === 'member_ambiguous') && (
                                      <select
                                        value={resolvedId || ''}
                                        onChange={(e) => setExcelAmbiguousSelections(prev => ({ ...prev, [row.rowIndex]: e.target.value }))}
                                        className="text-xs border border-amber-300 rounded-lg px-2 py-1 bg-amber-50"
                                      >
                                        <option value="">
                                          {row.matchStatus === 'member_ambiguous' ? '동명이인 회원' : '동명이인'} {row.candidates.length}명 — 선택
                                        </option>
                                        {row.candidates.map((c: any) => (
                                          <option key={c.id} value={c.id}>
                                            {[c.company, c.position].filter(Boolean).join(' / ') || c.id}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {excelRows.length > 0 && (
              <div className="p-6 border-t bg-slate-50">
                <button
                  onClick={handleApplyExcelTeams}
                  disabled={!excelValidation.isValid || isApplyingExcelTeams}
                  className={`w-full py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 ${
                    !excelValidation.isValid || isApplyingExcelTeams
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-primary-600 text-white hover:bg-primary-700'
                  }`}
                >
                  {isApplyingExcelTeams ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  이 명단대로 조 편성 적용
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;
