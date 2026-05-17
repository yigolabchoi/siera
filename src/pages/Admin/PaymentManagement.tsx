import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, CreditCard, CheckCircle, Clock, Users, AlertCircle, Calendar, Filter, Loader2, XCircle, RotateCcw, Ban } from 'lucide-react';
import { formatPhoneNumber } from '../../utils/format';
import { Link } from 'react-router-dom';
import { useEvents } from '../../contexts/EventContext';
import { usePayments } from '../../contexts/PaymentContext';
import { useParticipations } from '../../contexts/ParticipationContext';
import { useMembers } from '../../contexts/MemberContext';
import { usePendingUsers } from '../../contexts/PendingUserContext';
import { useGuestApplications } from '../../contexts/GuestApplicationContext';
import { useDevMode } from '../../contexts/DevModeContext';
import { updateDocument } from '../../lib/firebase/firestore';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import StatCard from '../../components/ui/StatCard';
import FilterGroup from '../../components/ui/FilterGroup';

interface HikingEvent {
  id: string;
  title: string;
  mountain: string;
  date: string;
  cost: number;
  maxParticipants: number;
  currentParticipants: number;
  status: string;
}

const PaymentManagement = () => {
  const { currentEvent, specialEvent, events: allEvents, getTeamsByEventId, setTeamsForEvent } = useEvents();
  const { payments, isLoading: isPaymentsLoading, confirmPayment, cancelPayment, getPaymentsByEvent, createPaymentForParticipation, updatePayment, deletePayment, refreshPayments } = usePayments();
  const participationCtx = useParticipations();
  const { participations, getParticipationsByEvent } = participationCtx;
  const { members, getMemberById } = useMembers();
  const { pendingUsers } = usePendingUsers();
  const { guestApplications } = useGuestApplications();
  const { specialApplicationStatus } = useDevMode();
  
  // 회원 DB 매핑 헬퍼: payment의 userId 또는 email로 실시간 회원 정보 조회
  const getMemberInfo = (payment: { userId?: string; userName: string; email?: string; company?: string; position?: string; phoneNumber?: string; phone?: string; occupation?: string }) => {
    let member = null;
    
    // 1차: userId로 members 컬렉션 조회
    if (payment.userId) {
      member = getMemberById(payment.userId);
    }
    
    // 2차: userId로 못 찾으면 email로 members 조회
    if (!member && payment.email) {
      member = members.find(m => m.email === payment.email) || null;
    }
    
    if (member) {
      return {
        name: member.name || payment.userName,
        email: member.email || payment.email || '',
        company: member.company || payment.company || '',
        position: member.position || payment.position || payment.occupation || '',
        phoneNumber: member.phoneNumber || payment.phoneNumber || payment.phone || '',
      };
    }
    
    // 3차: pendingUsers (미승인 사용자) 컬렉션에서 조회
    let pendingUser = null;
    if (payment.userId) {
      pendingUser = pendingUsers.find(p => p.id === payment.userId) || null;
    }
    if (!pendingUser && payment.email) {
      pendingUser = pendingUsers.find(p => p.email === payment.email) || null;
    }
    
    if (pendingUser) {
      return {
        name: pendingUser.name || payment.userName,
        email: pendingUser.email || payment.email || '',
        company: pendingUser.company || payment.company || '',
        position: pendingUser.position || payment.position || payment.occupation || '',
        phoneNumber: pendingUser.phoneNumber || payment.phoneNumber || payment.phone || '',
      };
    }
    
    // 4차: guestApplications (게스트 신청) 컬렉션에서 조회
    let guestApp = null;
    if (payment.userId) {
      guestApp = guestApplications.find(g => g.id === payment.userId) || null;
    }
    if (!guestApp && payment.email) {
      guestApp = guestApplications.find(g => g.email === payment.email) || null;
    }
    
    if (guestApp) {
      return {
        name: guestApp.name || payment.userName,
        email: guestApp.email || payment.email || '',
        company: guestApp.company || payment.company || '',
        position: guestApp.position || payment.position || payment.occupation || '',
        phoneNumber: guestApp.phoneNumber || guestApp.phone || payment.phoneNumber || payment.phone || '',
      };
    }
    
    // 5차: payment 자체 데이터 사용 (fallback)
    return {
      name: payment.userName,
      email: payment.email || '',
      company: payment.company || '',
      position: payment.position || payment.occupation || '',
      phoneNumber: payment.phoneNumber || payment.phone || '',
    };
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'completed' | 'pending' | 'confirmed' | 'cancelled' | 'refunded'>('all');
  const isSyncingRef = useRef(false);
  
  // 모달 상태
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  
  // 모집 중인 이벤트만 필터링 (완료되지 않은 산행)
  const events = useMemo(() => {
    const filtered = allEvents
      .filter(event => {
        const isPublished = event.isPublished;
        const notDraft = !event.isDraft;
        const notCompleted = event.status !== 'completed';
        const notPast = new Date(event.date) >= new Date(new Date().setHours(0, 0, 0, 0));
        
        return isPublished && notDraft && notCompleted && notPast;
      })
      .map(event => ({
        id: event.id,
        title: event.title,
        mountain: event.mountain || event.location,
        date: event.date,
        cost: parseInt((event.paymentInfo?.cost || event.cost).replace(/[^0-9]/g, '')),
        maxParticipants: event.maxParticipants,
        currentParticipants: event.currentParticipants || 0,
        status: event.status || 'draft',
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // 날짜순 (가까운 순)
    
    return filtered;
  }, [allEvents]);

  // 첫 번째 이벤트를 기본 선택 (useEffect로 이동하여 무한 루프 방지)
  useMemo(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // participations를 확인하고 payments가 없으면 자동 생성 (이벤트 선택 시 1회만 실행)
  const syncedEventRef = useRef<string>('');
  
  useEffect(() => {
    if (!selectedEventId || isSyncingRef.current) return;
    if (syncedEventRef.current === selectedEventId) return;
    
    const syncPaymentsFromParticipations = async () => {
      isSyncingRef.current = true;
      syncedEventRef.current = selectedEventId;
      
      try {
        const eventParticipations = getParticipationsByEvent(selectedEventId);
        const eventPayments = getPaymentsByEvent(selectedEventId);
        
        const existingParticipationIds = new Set(
          eventPayments.map(p => p.participationId).filter(Boolean)
        );
        const existingUserIds = new Set(
          eventPayments.map(p => p.userId).filter(Boolean)
        );
        
        const missingPayments = eventParticipations.filter(participation => {
          if (existingParticipationIds.has(participation.id)) return false;
          if (existingUserIds.has(participation.userId)) return false;
          if (participation.status === 'cancelled') return false;
          // pre_ 계정: 이미 머지되어 비활성화된 경우만 스킵, 활성 회원은 payment 생성
          if (participation.userId.startsWith('pre_')) {
            const preMember = getMemberById(participation.userId);
            if (!preMember || preMember.isActive === false || (preMember as any).mergedInto) {
              return false;
            }
          }
          return true;
        });
        
        for (const participation of missingPayments) {
          try {
            await createPaymentForParticipation(
              {
                id: participation.id,
                eventId: participation.eventId,
                userId: participation.userId,
                userName: participation.userName,
                userEmail: participation.userEmail,
                userPhone: participation.userPhone || '',
                userCompany: participation.userCompany || '',
                userPosition: participation.userPosition || '',
                isGuest: participation.isGuest || false,
              },
              selectedEvent?.cost ? `${selectedEvent.cost}원` : '50,000원'
            );
          } catch (error) {
            console.error(`❌ payment 생성 실패:`, participation.userName, error);
          }
        }
      } finally {
        isSyncingRef.current = false;
      }
    };
    
    syncPaymentsFromParticipations();
  }, [selectedEventId]);

  // 선택된 이벤트의 결제 목록 (userId 기준 중복 제거, 유효한 participation과 매칭)
  const eventPayments = useMemo(() => {
    if (!selectedEventId) return [];
    
    const eventPaymentsList = getPaymentsByEvent(selectedEventId);
    const eventParticipations = getParticipationsByEvent(selectedEventId);
    
    // 유효한 (취소되지 않은) participation의 ID 목록
    const validParticipationIds = new Set(
      eventParticipations
        .filter(p => p.status !== 'cancelled')
        .map(p => p.id)
    );
    
    // userId 기준으로 중복 제거: 같은 유저에 대해 가장 적합한 payment 하나만 유지
    // 우선순위: 1) 유효한 participation과 연결된 것 2) 입금완료 상태 3) 최신 생성일
    const userPaymentMap = new Map<string, any>();
    
    eventPaymentsList.forEach(payment => {
      const userId = payment.userId;
      if (!userId) return;
      
      const isLinkedToValidParticipation = payment.participationId && validParticipationIds.has(payment.participationId);
      const isConfirmed = payment.paymentStatus === 'confirmed' || payment.paymentStatus === 'completed';
      const isRefunded = payment.refundStatus === 'completed';
      
      if (userPaymentMap.has(userId)) {
        const existing = userPaymentMap.get(userId);
        const existingIsLinked = existing.participationId && validParticipationIds.has(existing.participationId);
        const existingIsConfirmed = existing.paymentStatus === 'confirmed' || existing.paymentStatus === 'completed';
        const existingIsRefunded = existing.refundStatus === 'completed';
        
        // 비교 우선순위:
        // 1. 환불되지 않은 것 우선
        if (!isRefunded && existingIsRefunded) {
          userPaymentMap.set(userId, payment);
          return;
        }
        if (isRefunded && !existingIsRefunded) return;
        
        // 2. 유효한 participation에 연결된 것 우선
        if (isLinkedToValidParticipation && !existingIsLinked) {
          userPaymentMap.set(userId, payment);
          return;
        }
        if (!isLinkedToValidParticipation && existingIsLinked) return;
        
        // 3. 입금 확인된 것 우선
        if (isConfirmed && !existingIsConfirmed) {
          userPaymentMap.set(userId, payment);
          return;
        }
        if (!isConfirmed && existingIsConfirmed) return;
        
        // 4. 최신 생성일 우선
        const existingDate = new Date(existing.createdAt || existing.applicationDate);
        const currentDate = new Date(payment.createdAt || payment.applicationDate);
        if (currentDate > existingDate) {
          userPaymentMap.set(userId, payment);
        }
      } else {
        userPaymentMap.set(userId, payment);
      }
    });
    
    const uniquePayments = Array.from(userPaymentMap.values());

    // 2차 중복 제거: 같은 이름이 다른 userId로 두 번 등장하는 경우 (병합된 계정 등)
    // 활성 계정(isApproved=true, isActive≠false, mergedInto 없음) 우선 유지
    const userNamePaymentMap = new Map<string, any>();
    uniquePayments.forEach(payment => {
      const name = payment.userName;
      if (!name) { userNamePaymentMap.set(payment.id, payment); return; }
      const existing = userNamePaymentMap.get(name);
      if (!existing) { userNamePaymentMap.set(name, payment); return; }

      // 각각의 member 활성 상태 비교
      const memberA = getMemberById(payment.userId);
      const memberB = getMemberById(existing.userId);
      const aActive = memberA && memberA.isApproved && memberA.isActive !== false && !(memberA as any).mergedInto;
      const bActive = memberB && memberB.isApproved && memberB.isActive !== false && !(memberB as any).mergedInto;

      if (aActive && !bActive) { userNamePaymentMap.set(name, payment); return; }
      if (!aActive && bActive) return;
      // 둘 다 활성 또는 둘 다 비활성 → 최신 payment 유지
      const aDate = new Date(payment.createdAt || payment.applicationDate || 0);
      const bDate = new Date(existing.createdAt || existing.applicationDate || 0);
      if (aDate > bDate) userNamePaymentMap.set(name, payment);
    });
    const deduplicatedPayments = Array.from(userNamePaymentMap.values());

    // participation에서 isGuest, 회사, 연락처 등 보강 (기존 payment에 없는 경우)
    const participationMap = new Map(
      eventParticipations.map(p => [p.userId, p])
    );
    
    return deduplicatedPayments.map(payment => {
      const participation = participationMap.get(payment.userId);
      if (!participation) return payment;
      
      return {
        ...payment,
        // isGuest: payment에 없으면 participation에서 가져옴
        isGuest: payment.isGuest ?? participation.isGuest ?? false,
        // 회사/직책/연락처가 비어있으면 participation에서 보강
        company: payment.company || participation.userCompany || '',
        position: payment.position || participation.userPosition || '',
        phoneNumber: payment.phoneNumber || payment.phone || participation.userPhone || '',
      };
    });
  }, [selectedEventId, getPaymentsByEvent, getParticipationsByEvent, payments, participations]);

  // 필터링된 결제 목록 (입금대기 우선 정렬)
  const filteredPayments = useMemo(() => {
    const statusOrder: Record<string, number> = {
      pending: 0,
      refunded: 1,
      completed: 2,
      confirmed: 3,
      cancelled: 4,
      failed: 5,
    };
    
    return eventPayments
      .filter(payment => {
        const info = getMemberInfo(payment);
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = info.name.toLowerCase().includes(searchLower) ||
                             info.company.toLowerCase().includes(searchLower) ||
                             info.phoneNumber.includes(searchTerm);
        let matchesFilter = paymentFilter === 'all' || payment.paymentStatus === paymentFilter;
        if (paymentFilter === 'refunded') {
          matchesFilter = payment.paymentStatus === 'refunded' || payment.refundStatus === 'completed';
        }
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        const aOrder = statusOrder[a.paymentStatus] ?? 9;
        const bOrder = statusOrder[b.paymentStatus] ?? 9;
        return aOrder - bOrder;
      });
  }, [eventPayments, searchTerm, paymentFilter, members, pendingUsers]);

  // 통계 계산 (선택된 이벤트 기준)
  const stats = useMemo(() => ({
    total: eventPayments.length,
    confirmed: eventPayments.filter(a => a.paymentStatus === 'completed' || a.paymentStatus === 'confirmed').length,
    pending: eventPayments.filter(a => a.paymentStatus === 'pending').length,
    refunded: eventPayments.filter(a => a.paymentStatus === 'refunded' || a.refundStatus === 'completed').length,
    totalAmount: eventPayments
      .filter(a => a.paymentStatus !== 'refunded' && a.refundStatus !== 'completed' && a.paymentStatus !== 'cancelled')
      .reduce((sum, a) => sum + a.amount, 0),
  }), [eventPayments]);

  // 입금 확인 처리
  const handleConfirmPayment = async (payment: any) => {
    setSelectedPayment(payment);
    setIsConfirmModalOpen(true);
  };

  const confirmPaymentAction = async () => {
    if (!selectedPayment) return;
    
    try {
      await confirmPayment(selectedPayment.id);
      setIsConfirmModalOpen(false);
      setSelectedPayment(null);
    } catch (error) {
      alert('입금 확인 처리 중 오류가 발생했습니다.');
    }
  };

  // 환불 처리
  const handleRefund = async (payment: any) => {
    setSelectedPayment(payment);
    setRefundReason('');
    setIsRefundModalOpen(true);
  };

  const confirmRefund = async () => {
    if (!selectedPayment || !refundReason.trim()) {
      alert('환불 사유를 입력해주세요.');
      return;
    }

    try {
      // 1. payment 상태를 refunded로 변경
      await updatePayment(selectedPayment.id, {
        refundStatus: 'completed',
        refundDate: new Date().toISOString(),
        refundAmount: selectedPayment.amount,
        refundReason: refundReason,
        paymentStatus: 'refunded',
        updatedAt: new Date().toISOString(),
      });

      // 2. participation 상태를 cancelled로 변경 (환불 처리 시 자동 산행 취소)
      //    ⚠️ cancelParticipation() 호출 금지 — cascade cleanup이 payment 레코드를 삭제함
      //    Firestore 직접 업데이트로 안전하게 처리
      if (selectedPayment.participationId) {
        try {
          await updateDocument('participations', selectedPayment.participationId, {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancellationReason: '환불 처리에 의한 자동 취소',
            updatedAt: new Date().toISOString(),
          });
          // 로컬 상태도 동기화
          participationCtx.updateParticipationStatus(selectedPayment.participationId, 'cancelled').catch(() => {});
        } catch {
          // Firestore 직접 업데이트 실패 시 로그만 출력
          console.error('participation 상태 변경 실패 (환불 처리는 완료됨)');
        }
      }
      
      setIsRefundModalOpen(false);
      setSelectedPayment(null);
      setRefundReason('');
    } catch (error) {
      alert('환불 처리 중 오류가 발생했습니다.');
    }
  };

  // 환불 취소 → 입금확인으로 되돌리기
  const handleReverseRefund = async (payment: any) => {
    if (!confirm(`${getMemberInfo(payment).name}님의 환불을 취소하고 입금확인 상태로 되돌리시겠습니까?`)) return;
    
    try {
      await updatePayment(payment.id, {
        paymentStatus: 'confirmed',
        paymentDate: new Date().toISOString(),
        refundStatus: 'none',
        refundDate: '',
        refundAmount: 0,
        refundReason: '',
        updatedAt: new Date().toISOString(),
      });

      // participation 상태도 confirmed로 복구 (Firestore 직접 업데이트)
      if (payment.participationId) {
        try {
          await updateDocument('participations', payment.participationId, {
            status: 'confirmed',
            updatedAt: new Date().toISOString(),
          });
          participationCtx.updateParticipationStatus(payment.participationId, 'confirmed').catch(() => {});
        } catch {
          console.error('participation 상태 변경 실패 (입금확인 복구는 완료됨)');
        }
      }
    } catch (error) {
      alert('환불 취소 처리 중 오류가 발생했습니다.');
    }
  };

  // 강제 취소
  const handleForceCancel = (payment: any) => {
    setSelectedPayment(payment);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const confirmForceCancel = async () => {
    if (!selectedPayment || !cancelReason.trim()) {
      alert('취소 사유를 입력해주세요.');
      return;
    }
    const memberInfo = getMemberInfo(selectedPayment);
    try {
      // 1. payment 취소
      await updatePayment(selectedPayment.id, {
        paymentStatus: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelReason: cancelReason,
        updatedAt: new Date().toISOString(),
      });

      // 2. participation 취소 (⚠️ cascade 삭제 방지 — Firestore 직접 업데이트)
      if (selectedPayment.participationId) {
        try {
          await updateDocument('participations', selectedPayment.participationId, {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancellationReason: cancelReason,
            updatedAt: new Date().toISOString(),
          });
          participationCtx.updateParticipationStatus(selectedPayment.participationId, 'cancelled').catch(() => {});
        } catch {
          console.error('participation 상태 변경 실패 (취소 처리는 완료됨)');
        }

        // 3. 조편성에서 해당 참가자 제거
        try {
          const eventTeams = getTeamsByEventId(selectedPayment.eventId);
          if (eventTeams.length > 0) {
            const participationId = selectedPayment.participationId;
            const updatedTeams = eventTeams.map((team: any) => ({
              ...team,
              leaderId: team.leaderId === participationId ? '' : team.leaderId,
              leaderName: team.leaderId === participationId ? '' : team.leaderName,
              leaderOccupation: team.leaderId === participationId ? '' : team.leaderOccupation,
              members: (team.members || []).filter((m: any) => m.id !== participationId),
            }));
            await setTeamsForEvent(selectedPayment.eventId, updatedTeams);
          }
        } catch {
          console.error('조편성 제거 실패 (취소 처리는 완료됨)');
        }
      }

      setIsCancelModalOpen(false);
      setSelectedPayment(null);
      setCancelReason('');
      alert(`${memberInfo.name}님의 산행 신청이 취소되었습니다.`);
    } catch (error) {
      alert('취소 처리 중 오류가 발생했습니다.');
    }
  };

  const getStatusBadge = (status: string, refundStatus?: string) => {
    if (refundStatus === 'completed' || status === 'refunded') {
      return <Badge variant="danger"><RotateCcw className="w-3 h-3 mr-1" />환불</Badge>;
    }
    switch (status) {
      case 'completed':
      case 'confirmed':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />입금완료</Badge>;
      case 'pending':
        return <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />입금대기</Badge>;
      case 'cancelled':
        return <Badge variant="danger"><AlertCircle className="w-3 h-3 mr-1" />취소</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  // DB 중복 데이터 정리 함수
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  
  const cleanDuplicatePayments = async () => {
    if (!selectedEventId) return;
    
    const eventPaymentsList = getPaymentsByEvent(selectedEventId);
    const eventParticipations = getParticipationsByEvent(selectedEventId);
    
    // 유효한 participation ID 목록
    const validParticipationIds = new Set(
      eventParticipations.filter(p => p.status !== 'cancelled').map(p => p.id)
    );
    
    // userId별 payment 그룹화
    const userPayments = new Map<string, any[]>();
    eventPaymentsList.forEach(payment => {
      const userId = payment.userId;
      if (!userId) return;
      if (!userPayments.has(userId)) userPayments.set(userId, []);
      userPayments.get(userId)!.push(payment);
    });
    
    const toDelete: string[] = [];
    
    userPayments.forEach((paymentsForUser, userId) => {
      if (paymentsForUser.length <= 1) return;
      
      // 우선순위로 정렬: 유효한 participation 연결 > 입금 확인 > 최신
      const sorted = [...paymentsForUser].sort((a, b) => {
        const aLinked = a.participationId && validParticipationIds.has(a.participationId);
        const bLinked = b.participationId && validParticipationIds.has(b.participationId);
        const aRefunded = a.refundStatus === 'completed';
        const bRefunded = b.refundStatus === 'completed';
        const aConfirmed = a.paymentStatus === 'confirmed' || a.paymentStatus === 'completed';
        const bConfirmed = b.paymentStatus === 'confirmed' || b.paymentStatus === 'completed';
        
        // 환불되지 않은 것 우선
        if (!aRefunded && bRefunded) return -1;
        if (aRefunded && !bRefunded) return 1;
        // 유효 participation 연결된 것 우선
        if (aLinked && !bLinked) return -1;
        if (!aLinked && bLinked) return 1;
        // 입금 확인된 것 우선
        if (aConfirmed && !bConfirmed) return -1;
        if (!aConfirmed && bConfirmed) return 1;
        // 최신 우선
        return new Date(b.createdAt || b.applicationDate).getTime() - new Date(a.createdAt || a.applicationDate).getTime();
      });
      
      // 첫 번째(가장 우선순위 높은) 것만 유지, 나머지 삭제
      for (let i = 1; i < sorted.length; i++) {
        toDelete.push(sorted[i].id);
      }
    });
    
    if (toDelete.length === 0) {
      alert('중복 데이터가 없습니다.');
      return;
    }
    
    if (!confirm(`${toDelete.length}개의 중복 결제 레코드를 삭제하시겠습니까?\n(각 사용자별 가장 유효한 1개만 유지됩니다)`)) {
      return;
    }
    
    setIsCleaningDuplicates(true);
    let deletedCount = 0;
    
    for (const id of toDelete) {
      try {
        await deletePayment(id);
        deletedCount++;
      } catch (error) {
        console.error('중복 결제 삭제 실패:', id, error);
      }
    }
    
    setIsCleaningDuplicates(false);
    await refreshPayments();
    alert(`${deletedCount}개의 중복 결제 레코드가 정리되었습니다.`);
  };

  // 현재 이벤트에 중복이 있는지 확인
  const duplicateCount = useMemo(() => {
    if (!selectedEventId) return 0;
    const eventPaymentsList = getPaymentsByEvent(selectedEventId);
    const userIds = eventPaymentsList.map(p => p.userId).filter(Boolean);
    const uniqueUserIds = new Set(userIds);
    return userIds.length - uniqueUserIds.size;
  }, [selectedEventId, getPaymentsByEvent, payments]);

  if (isPaymentsLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">결제 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {events.length === 0 ? (
        <Card className="text-center py-16">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">진행 중인 산행이 없습니다</h3>
          <p className="text-slate-600 mb-6">새로운 산행을 등록하면 결제 관리를 시작할 수 있습니다.</p>
          <Link 
            to="/admin/events" 
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            산행 관리로 이동
          </Link>
        </Card>
      ) : (
        <>
          {/* Event Selector */}
          <FilterGroup
            options={events.map(event => ({
              key: event.id,
              label: `${event.title} (${new Date(event.date).toLocaleDateString('ko-KR')})`,
            }))}
            selected={selectedEventId}
            onChange={setSelectedEventId}
            className="mb-6"
          />

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard icon={<Users className="w-8 h-8" />} label="총 신청자" value={stats.total} unit="명" iconColor="text-slate-600" />
            <StatCard icon={<CheckCircle className="w-8 h-8" />} label="입금완료" value={stats.confirmed} unit="명" iconColor="text-emerald-600" />
            <StatCard icon={<Clock className="w-8 h-8" />} label="입금대기" value={stats.pending} unit="명" iconColor="text-amber-600" />
            <StatCard icon={<RotateCcw className="w-8 h-8" />} label="환불" value={stats.refunded} unit="명" iconColor="text-red-600" />
            <StatCard icon={<CreditCard className="w-8 h-8" />} label="총 금액" value={`${(stats.totalAmount / 10000).toFixed(0)}만원`} iconColor="text-slate-600" />
          </div>

          {/* Filters */}
          <Card className="p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="이름, 회사명, 연락처로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-slate-600" />
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as any)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="all">전체</option>
                  <option value="confirmed">입금완료</option>
                  <option value="pending">입금대기</option>
                  <option value="refunded">환불</option>
                  <option value="cancelled">취소</option>
                </select>
              </div>
            </div>
          </Card>

          {/* 중복 데이터 경고 및 정리 */}
          {duplicateCount > 0 && (
            <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-900">
                      DB에 중복 결제 레코드 {duplicateCount}개가 감지되었습니다
                    </p>
                    <p className="text-sm text-amber-700">
                      동일 사용자에 대해 여러 결제 레코드가 존재합니다. 정리하면 유효한 데이터만 남습니다.
                    </p>
                  </div>
                </div>
                <button
                  onClick={cleanDuplicatePayments}
                  disabled={isCleaningDuplicates}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {isCleaningDuplicates ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  {isCleaningDuplicates ? '정리 중...' : '중복 정리'}
                </button>
              </div>
            </Card>
          )}

          {/* Payments Table */}
          {filteredPayments.length === 0 ? (
            <Card className="text-center py-16">
              <CreditCard className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">결제 내역이 없습니다</h3>
              <p className="text-slate-600">
                {searchTerm || paymentFilter !== 'all' 
                  ? '검색 조건에 맞는 결제 내역이 없습니다.' 
                  : '이 산행에 대한 결제 내역이 아직 없습니다.'}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {/* 모바일 리스트 */}
              <div className="sm:hidden divide-y divide-slate-200">
                {filteredPayments.map((payment) => {
                  const memberInfo = getMemberInfo(payment);
                  return (
                    <div key={payment.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 truncate">{memberInfo.name}</span>
                          {payment.isGuest && (
                            <span className="text-xs text-amber-600 font-bold flex-shrink-0">(G)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {getStatusBadge(payment.paymentStatus, payment.refundStatus)}
                          <span className="text-sm text-slate-500">{payment.amount.toLocaleString()}원</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {payment.paymentStatus === 'pending' && (
                          <button
                            onClick={() => handleConfirmPayment(payment)}
                            className="px-4 py-2 bg-success-600 text-white text-sm font-semibold rounded-lg hover:bg-success-700 transition-colors"
                          >
                            입금확인
                          </button>
                        )}
                        {(payment.paymentStatus === 'completed' || payment.paymentStatus === 'confirmed') && !payment.refundStatus && (
                          <button
                            onClick={() => handleRefund(payment)}
                            className="px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            환불
                          </button>
                        )}
                        {(payment.paymentStatus === 'refunded' || payment.refundStatus === 'completed') && (
                          <button
                            onClick={() => handleReverseRefund(payment)}
                            className="px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            입금확인
                          </button>
                        )}
                        {payment.paymentStatus !== 'cancelled' && payment.refundStatus !== 'completed' && payment.paymentStatus !== 'refunded' && (
                          <button
                            onClick={() => handleForceCancel(payment)}
                            className="px-3 py-2 bg-slate-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            취소
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 데스크톱 테이블 */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                        이름
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                        회사/직책
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                        연락처
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                        구분
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                        금액
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                        신청일
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                        상태
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredPayments.map((payment) => {
                      const memberInfo = getMemberInfo(payment);
                      return (
                      <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{memberInfo.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-slate-900">{memberInfo.company}</div>
                          <div className="text-sm text-slate-500">{memberInfo.position}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900">
                          {formatPhoneNumber(memberInfo.phoneNumber)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <Badge variant={payment.isGuest ? 'warning' : 'info'}>
                            {payment.isGuest ? '게스트' : '회원'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-slate-900 font-semibold">
                          {payment.amount.toLocaleString()}원
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                          {new Date(payment.applicationDate).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {getStatusBadge(payment.paymentStatus, payment.refundStatus)}
                          {payment.paymentDate && payment.paymentStatus !== 'refunded' && !payment.refundStatus && (
                            <div className="text-xs text-slate-500 mt-1">
                              {new Date(payment.paymentDate).toLocaleDateString('ko-KR')}
                            </div>
                          )}
                          {payment.refundDate && (payment.paymentStatus === 'refunded' || payment.refundStatus === 'completed') && (
                            <div className="text-xs text-red-400 mt-1">
                              {new Date(payment.refundDate).toLocaleDateString('ko-KR')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            {payment.paymentStatus === 'pending' && (
                              <button
                                onClick={() => handleConfirmPayment(payment)}
                                className="px-3 py-1 bg-success-600 text-white text-sm rounded hover:bg-success-700 transition-colors"
                              >
                                입금확인
                              </button>
                            )}
                            {(payment.paymentStatus === 'completed' || payment.paymentStatus === 'confirmed') && !payment.refundStatus && (
                              <button
                                onClick={() => handleRefund(payment)}
                                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                환불
                              </button>
                            )}
                            {(payment.paymentStatus === 'refunded' || payment.refundStatus === 'completed') && (
                              <button
                                onClick={() => handleReverseRefund(payment)}
                                className="px-3 py-1 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" />
                                입금확인
                              </button>
                            )}
                            {payment.paymentStatus !== 'cancelled' && payment.refundStatus !== 'completed' && payment.paymentStatus !== 'refunded' && (
                              <button
                                onClick={() => handleForceCancel(payment)}
                                className="px-3 py-1 bg-slate-600 text-white text-sm rounded hover:bg-slate-700 transition-colors flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" />
                                취소
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* 입금 확인 모달 */}
      {isConfirmModalOpen && selectedPayment && (() => {
        const modalMemberInfo = getMemberInfo(selectedPayment);
        return (
        <Modal onClose={() => setIsConfirmModalOpen(false)} title="입금 확인">
          <div className="p-6">
            <div className="mb-6">
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">이름:</span>
                  <span className="font-semibold text-slate-900">{modalMemberInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">회사/직책:</span>
                  <span className="font-semibold text-slate-900">
                    {modalMemberInfo.company && modalMemberInfo.position
                      ? `${modalMemberInfo.company} / ${modalMemberInfo.position}`
                      : modalMemberInfo.company || modalMemberInfo.position || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">연락처:</span>
                  <span className="text-slate-900">{formatPhoneNumber(modalMemberInfo.phoneNumber)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">입금 금액:</span>
                  <span className="font-bold text-primary-600 text-lg">{selectedPayment.amount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">신청일:</span>
                  <span className="text-slate-900">{new Date(selectedPayment.applicationDate).toLocaleDateString('ko-KR')}</span>
                </div>
              </div>
            </div>

            <p className="text-slate-700 mb-6">
              위 회원의 입금을 확인하시겠습니까?<br />
              입금 확인 후에는 참가자 관리에서 확정 상태로 표시됩니다.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmPaymentAction}
                className="flex-1 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                입금 확인
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* 강제 취소 모달 */}
      {isCancelModalOpen && selectedPayment && (() => {
        const cancelMemberInfo = getMemberInfo(selectedPayment);
        const isPaid = selectedPayment.paymentStatus === 'completed' || selectedPayment.paymentStatus === 'confirmed';
        return (
          <Modal onClose={() => setIsCancelModalOpen(false)} title="산행 신청 취소">
            <div className="p-6">
              <div className="mb-6">
                <div className="bg-slate-50 p-4 rounded-lg space-y-2 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-600">이름:</span>
                    <span className="font-semibold text-slate-900">{cancelMemberInfo.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">회사/직책:</span>
                    <span className="font-semibold text-slate-900">
                      {cancelMemberInfo.company && cancelMemberInfo.position
                        ? `${cancelMemberInfo.company} / ${cancelMemberInfo.position}`
                        : cancelMemberInfo.company || cancelMemberInfo.position || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">결제 상태:</span>
                    <span className="font-semibold">{getStatusBadge(selectedPayment.paymentStatus, selectedPayment.refundStatus)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">금액:</span>
                    <span className="font-bold text-slate-900">{selectedPayment.amount.toLocaleString()}원</span>
                  </div>
                </div>
              </div>

              {isPaid && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      <span className="font-semibold">이미 입금이 확인된 신청자입니다.</span><br />
                      취소 후 환불은 별도로 직접 처리해주세요.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  취소 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="취소 사유를 입력해주세요 (예: 개인 사정, 연락 두절 등)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                  rows={3}
                  autoFocus
                />
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
                <p className="text-xs text-red-700">
                  취소 처리 시 참가 신청이 취소되고, 조편성에서도 자동으로 제거됩니다.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsCancelModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={confirmForceCancel}
                  disabled={!cancelReason.trim()}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  신청 취소
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* 환불 모달 */}
      {isRefundModalOpen && selectedPayment && (() => {
        const refundMemberInfo = getMemberInfo(selectedPayment);
        return (
        <Modal onClose={() => setIsRefundModalOpen(false)} title="환불 처리">
          <div className="p-6">
            <div className="mb-6">
              <div className="bg-red-50 p-4 rounded-lg space-y-2 border border-red-200">
                <div className="flex justify-between">
                  <span className="text-slate-600">이름:</span>
                  <span className="font-semibold text-slate-900">{refundMemberInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">회사/직책:</span>
                  <span className="font-semibold text-slate-900">
                    {refundMemberInfo.company && refundMemberInfo.position
                      ? `${refundMemberInfo.company} / ${refundMemberInfo.position}`
                      : refundMemberInfo.company || refundMemberInfo.position || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">연락처:</span>
                  <span className="text-slate-900">{formatPhoneNumber(refundMemberInfo.phoneNumber)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">환불 금액:</span>
                  <span className="font-bold text-red-600 text-lg">{selectedPayment.amount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">입금 확인일:</span>
                  <span className="text-slate-900">
                    {selectedPayment.paymentDate 
                      ? new Date(selectedPayment.paymentDate).toLocaleDateString('ko-KR')
                      : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                환불 사유 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="환불 사유를 입력해주세요 (예: 개인 사정으로 인한 참석 취소)"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                rows={4}
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">환불 처리 안내</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>환불 처리 시 결제 상태가 '환불'로 변경됩니다</li>
                    <li>환불 후에도 목록에 유지되며, 다시 입금확인으로 전환 가능합니다</li>
                    <li>실제 환불은 별도로 진행해주세요</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmRefund}
                disabled={!refundReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                환불 처리
              </button>
            </div>
          </div>
        </Modal>
        );
      })()}
    </div>
  );
};

export default PaymentManagement;
