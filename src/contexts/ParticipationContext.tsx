import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { getDocuments, setDocument, updateDocument as firestoreUpdate, deleteDocument, queryDocuments } from '../lib/firebase/firestore';
import { logError, ErrorLevel, ErrorCategory } from '../utils/errorHandler';
import { Participation, Team, Payment } from '../types';

// ==================== 타입 정의 ====================

interface ParticipationContextType {
  participations: Participation[];
  isLoading: boolean;
  error: string | null;
  addParticipation: (participation: Omit<Participation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateParticipation: (id: string, participation: Partial<Participation>) => Promise<void>;
  deleteParticipation: (id: string) => Promise<void>;
  getParticipationById: (id: string) => Participation | undefined;
  getParticipationsByEvent: (eventId: string) => Participation[];
  getParticipationsByUser: (userId: string) => Participation[];
  getUserParticipationForEvent: (userId: string, eventId: string) => Participation | undefined;
  registerForEvent: (
    eventId: string,
    userId: string,
    userName: string,
    userEmail: string,
    isGuest?: boolean,
    onPaymentCreate?: (participationId: string, eventId: string) => Promise<void>,
  ) => Promise<void>;
  cancelParticipation: (id: string, reason?: string) => Promise<void>;
  updateParticipationStatus: (id: string, status: Participation['status']) => Promise<void>;
  assignTeam: (id: string, teamId: string, teamName: string) => Promise<void>;
  refreshParticipations: () => Promise<void>;
}

const ParticipationContext = createContext<ParticipationContextType | undefined>(undefined);

// ==================== 유틸리티 ====================

const generateId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

const nowISO = () => new Date().toISOString();

// ==================== 캐스케이드 삭제 유틸리티 ====================

/**
 * 참가 신청과 관련된 결제 정보 삭제
 * queryDocuments를 사용하여 필요한 데이터만 조회
 */
const cleanupRelatedPayments = async (participationId: string, eventId: string, userId: string) => {
  try {
    // participationId로 직접 조회 (가장 정확한 매칭)
    const byParticipation = await queryDocuments<Payment>('payments', [
      { field: 'participationId', operator: '==', value: participationId },
    ]);

    // eventId + userId로 조회 (participationId가 없는 레거시 데이터 대응)
    const byEventUser = await queryDocuments<Payment>('payments', [
      { field: 'eventId', operator: '==', value: eventId },
      { field: 'userId', operator: '==', value: userId },
    ]);

    // 중복 제거 후 삭제
    const paymentIds = new Set<string>();
    const allPayments = [
      ...(byParticipation.data || []),
      ...(byEventUser.data || []),
    ];

    for (const payment of allPayments) {
      if (!paymentIds.has(payment.id)) {
        paymentIds.add(payment.id);
        await deleteDocument('payments', payment.id);
      }
    }
  } catch {
    // 결제 정리 실패해도 참가 삭제는 진행
  }
};

/**
 * 참가 신청과 관련된 조편성에서 회원 제거
 * eventId로 필터링하여 해당 이벤트의 팀만 조회
 */
const cleanupRelatedTeams = async (participationId: string, eventId: string, userId: string) => {
  try {
    const teamsResult = await queryDocuments<Team>('teams', [
      { field: 'eventId', operator: '==', value: eventId },
    ]);

    if (!teamsResult.success || !teamsResult.data?.length) return;

    for (const team of teamsResult.data) {
      let modified = false;
      let updatedTeam = { ...team };

      // 조장인 경우 제거
      if (team.leaderId === userId || team.leaderId === participationId) {
        updatedTeam = {
          ...updatedTeam,
          leaderId: '', leaderName: '', leaderCompany: '',
          leaderPosition: '', leaderOccupation: '',
        };
        modified = true;
      }

      // 조원인 경우 제거
      const originalCount = team.members?.length ?? 0;
      const filteredMembers = (team.members ?? []).filter(
        m => m.id !== userId && m.id !== participationId,
      );
      if (filteredMembers.length !== originalCount) {
        updatedTeam = { ...updatedTeam, members: filteredMembers };
        modified = true;
      }

      if (modified) {
        await setDocument('teams', team.id, updatedTeam);
      }
    }
  } catch {
    // 조편성 정리 실패해도 참가 삭제는 진행
  }
};

/**
 * 참가 취소/삭제 시 관련 데이터 캐스케이드 정리
 */
const cascadeCleanup = async (participationId: string, eventId: string, userId: string) => {
  await Promise.allSettled([
    cleanupRelatedTeams(participationId, eventId, userId),
    cleanupRelatedPayments(participationId, eventId, userId),
  ]);
};

// ==================== Provider ====================

export const ParticipationProvider = ({ children }: { children: ReactNode }) => {
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // 초기 데이터 로드 (Auth 독립적 - 간편 신청 페이지용)
  useEffect(() => {
    if (!hasLoadedOnce) {
      loadParticipations();
      setHasLoadedOnce(true);
    }
  }, [hasLoadedOnce]);

  const loadParticipations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getDocuments<Participation>('participations');
      setParticipations(result.success && result.data ? result.data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setParticipations([]);
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, {
        context: 'ParticipationContext.loadParticipations',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 동시 호출 방지 락
  const addingRef = useRef(false);

  const addParticipation = useCallback(async (data: Omit<Participation, 'id' | 'createdAt' | 'updatedAt'>) => {
    // 동시 호출 방지 (더블클릭 등)
    if (addingRef.current) throw new Error('신청 처리 중입니다. 잠시만 기다려주세요.');
    addingRef.current = true;

    try {
      // 1차 검사: 메모리(state) 기준
      const existing = participations.find(
        p => p.eventId === data.eventId && p.userId === data.userId && p.status !== 'cancelled'
      );
      if (existing) throw new Error('이미 이 산행에 신청하셨습니다.');

      // 2차 검사: Firestore 직접 쿼리 (race condition 방지)
      const firestoreCheck = await queryDocuments<Participation>('participations', [
        { field: 'eventId', operator: '==', value: data.eventId },
        { field: 'userId', operator: '==', value: data.userId },
      ]);
      if (firestoreCheck.success && firestoreCheck.data) {
        const activeInFirestore = firestoreCheck.data.find(p => p.status !== 'cancelled');
        if (activeInFirestore) throw new Error('이미 이 산행에 신청하셨습니다.');
      }

      const id = generateId('participation');
      const now = nowISO();
      const participation: Participation = { ...data, id, createdAt: now, updatedAt: now };

      const result = await setDocument('participations', id, participation);
      if (!result.success) throw new Error(result.error || '참가 신청 추가 실패');
      setParticipations(prev => [...prev, participation]);
    } finally {
      addingRef.current = false;
    }
  }, [participations]);

  const updateParticipation = useCallback(async (id: string, updates: Partial<Participation>) => {
    const updateData = { ...updates, updatedAt: nowISO() };
    const result = await firestoreUpdate('participations', id, updateData);
    if (!result.success) throw new Error(result.error || '참가 신청 수정 실패');
    setParticipations(prev =>
      prev.map(p => (p.id === id ? { ...p, ...updateData } : p)),
    );
  }, []);

  const deleteParticipation = useCallback(async (id: string) => {
    // 삭제 전 참가 정보로 캐스케이드 정리
    const participation = participations.find(p => p.id === id);
    if (participation) {
      await cascadeCleanup(id, participation.eventId, participation.userId);
    }

    const result = await deleteDocument('participations', id);
    if (!result.success) throw new Error(result.error || '참가 신청 삭제 실패');
    setParticipations(prev => prev.filter(p => p.id !== id));
  }, [participations]);

  const registerForEvent = useCallback(async (
    eventId: string,
    userId: string,
    userName: string,
    userEmail: string,
    isGuest = false,
    onPaymentCreate?: (participationId: string, eventId: string) => Promise<void>,
  ) => {
    // 중복 검사 (취소된 참가는 제외 — 재신청 허용)
    const existing = participations.find(p => p.eventId === eventId && p.userId === userId && p.status !== 'cancelled');
    if (existing) throw new Error('이미 이 산행에 신청하셨습니다.');

    const participationId = generateId('participation');
    const now = nowISO();
    const participation: Participation = {
      id: participationId, eventId, userId, userName, userEmail,
      isGuest, status: 'pending', registeredAt: now, createdAt: now, updatedAt: now,
    };

    const result = await setDocument('participations', participationId, participation);
    if (!result.success) throw new Error(result.error || '참가 신청 추가 실패');
    setParticipations(prev => [...prev, participation]);

    if (onPaymentCreate) {
      await onPaymentCreate(participationId, eventId);
    }
  }, [participations]);

  const cancelParticipation = useCallback(async (id: string, reason?: string) => {
    // 취소 전 캐스케이드 정리
    const participation = participations.find(p => p.id === id);
    if (participation) {
      await cascadeCleanup(id, participation.eventId, participation.userId);
    }

    await updateParticipation(id, {
      status: 'cancelled',
      cancelledAt: nowISO(),
      cancellationReason: reason,
    });
  }, [updateParticipation, participations]);

  const updateParticipationStatus = useCallback(async (id: string, status: Participation['status']) => {
    await updateParticipation(id, { status });
  }, [updateParticipation]);

  const assignTeam = useCallback(async (id: string, teamId: string, teamName: string) => {
    await updateParticipation(id, { teamId, teamName });
  }, [updateParticipation]);

  const refreshParticipations = useCallback(async () => {
    await loadParticipations();
  }, [loadParticipations]);

  // ==================== Selectors (읽기 전용) ====================

  const getParticipationById = useCallback(
    (id: string) => participations.find(p => p.id === id),
    [participations],
  );

  const getParticipationsByEvent = useCallback(
    (eventId: string) => {
      const eventParticipations = participations.filter(p => p.eventId === eventId);
      // 동일 userId 중복 제거: 활성(non-cancelled) 우선, 같으면 최신 createdAt 우선
      const userMap = new Map<string, Participation>();
      for (const p of eventParticipations) {
        const key = p.userId;
        if (!key) { userMap.set(p.id, p); continue; } // userId 없으면 그대로 유지
        const existing = userMap.get(key);
        if (!existing) { userMap.set(key, p); continue; }
        const pActive = p.status !== 'cancelled';
        const eActive = existing.status !== 'cancelled';
        if (pActive && !eActive) { userMap.set(key, p); continue; }
        if (!pActive && eActive) continue;
        // 둘 다 활성 또는 둘 다 취소 → 최신 우선
        if ((p.createdAt || '') > (existing.createdAt || '')) userMap.set(key, p);
      }
      return Array.from(userMap.values());
    },
    [participations],
  );

  const getParticipationsByUser = useCallback(
    (userId: string) => participations.filter(p => p.userId === userId),
    [participations],
  );

  const getUserParticipationForEvent = useCallback(
    (userId: string, eventId: string) =>
      participations.find(p => p.userId === userId && p.eventId === eventId),
    [participations],
  );

  // ==================== Context Value ====================

  const value = useMemo(() => ({
    participations, isLoading, error,
    addParticipation, updateParticipation, deleteParticipation,
    getParticipationById, getParticipationsByEvent, getParticipationsByUser,
    getUserParticipationForEvent, registerForEvent, cancelParticipation,
    updateParticipationStatus, assignTeam, refreshParticipations,
  }), [
    participations, isLoading, error,
    addParticipation, updateParticipation, deleteParticipation,
    getParticipationById, getParticipationsByEvent, getParticipationsByUser,
    getUserParticipationForEvent, registerForEvent, cancelParticipation,
    updateParticipationStatus, assignTeam, refreshParticipations,
  ]);

  return <ParticipationContext.Provider value={value}>{children}</ParticipationContext.Provider>;
};

export const useParticipations = () => {
  const context = useContext(ParticipationContext);
  if (!context) {
    throw new Error('useParticipations must be used within a ParticipationProvider');
  }
  return context;
};
