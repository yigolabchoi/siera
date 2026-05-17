import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo, useCallback } from 'react';
import { collection, onSnapshot, getDocsFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import { HikingEvent, Participant, Team, TeamMember, Participation, EventWeather, User } from '../types';
import { getDocuments, setDocument, updateDocument as firestoreUpdate, deleteDocument, queryDocuments } from '../lib/firebase/firestore';
import { logError, ErrorLevel, ErrorCategory } from '../utils/errorHandler';
import { getEventWeather } from '../utils/weather';

interface EventContextType {
  events: HikingEvent[];
  currentEvent: HikingEvent | null;
  specialEvent: HikingEvent | null; // 특별 산행 추가
  participants: Record<string, Participant[]>;
  teams: Record<string, Team[]>; // eventId를 키로 하는 조 편성 데이터
  isLoading: boolean;
  error: string | null;
  addEvent: (event: HikingEvent) => Promise<void>;
  updateEvent: (id: string, event: Partial<HikingEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  getEventById: (id: string) => HikingEvent | undefined;
  getParticipantsByEventId: (eventId: string) => Participant[];
  addParticipant: (eventId: string, participant: Participant) => Promise<void>;
  updateParticipantStatus: (eventId: string, participantId: string, status: 'confirmed' | 'pending') => Promise<void>;
  getTeamsByEventId: (eventId: string) => Team[];
  setTeamsForEvent: (eventId: string, teams: Team[]) => Promise<void>;
  refreshTeams: (eventId: string) => Promise<void>;
  refreshEvents: () => Promise<void>;
  refreshParticipants: (eventId: string) => Promise<void>;
  updateEventWeather: (eventId: string) => Promise<void>;
  checkAndUpdateWeather: (eventId: string) => Promise<void>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

// EventProvider 내부에서만 useAuth 사용
export const EventProvider = ({ children }: { children: ReactNode }) => {
  const [events, setEvents] = useState<HikingEvent[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
  const [teams, setTeams] = useState<Record<string, Team[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // events 초기화: 서버에서 직접 로드 (IndexedDB 캐시 우회) + onSnapshot으로 실시간 업데이트
  useEffect(() => {
    let isMounted = true;

    const finishInitialization = (eventsData: HikingEvent[]) => {
      if (!isMounted || initializedRef.current) return;
      initializedRef.current = true;
      setEvents(eventsData);
      setIsLoading(false);
      loadInitialData();
    };

    // 1) 서버에서 직접 최신 데이터 로드 (캐시 완전 우회, 5초 타임아웃)
    const serverLoad = async () => {
      try {
        const snapshot = await Promise.race([
          getDocsFromServer(collection(db, 'events')),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000)
          ),
        ]);
        if (!isMounted) return;
        const eventsData: HikingEvent[] = [];
        snapshot.forEach((doc) => {
          eventsData.push({ id: doc.id, ...doc.data() } as HikingEvent);
        });
        finishInitialization(eventsData);
      } catch {
        // 타임아웃 또는 네트워크 오류 → onSnapshot 캐시 데이터로 폴백
        if (isMounted && !initializedRef.current) {
          initializedRef.current = true;
          setIsLoading(false);
          loadInitialData();
        }
      }
    };

    serverLoad();

    // 2) onSnapshot으로 이후 실시간 변경사항 반영
    const unsubscribe = onSnapshot(
      collection(db, 'events'),
      (snapshot) => {
        if (!isMounted) return;
        const eventsData: HikingEvent[] = [];
        snapshot.forEach((doc) => {
          eventsData.push({ id: doc.id, ...doc.data() } as HikingEvent);
        });
        // 초기화 전이면 캐시 데이터로 폴백 초기화, 이후엔 실시간 업데이트
        if (!initializedRef.current) {
          finishInitialization(eventsData);
        } else {
          setEvents(eventsData);
        }
      },
      (err) => {
        console.error('❌ events onSnapshot 실패:', err);
        setError(err.message);
        if (isMounted && !initializedRef.current) {
          initializedRef.current = true;
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []); // 마운트 시 한 번만
  
  const loadInitialData = async () => {
    try {
      setError(null);

      // events는 onSnapshot이 실시간으로 관리하므로 여기서는 teams/participants만 로드
      {
        // Firebase에서 조편성 데이터 로드
        const teamsResult = await getDocuments<Team>('teams');
        if (teamsResult.success && teamsResult.data) {
          // members 컬렉션에서 회사/직책 정보 로드
          const membersResult = await getDocuments<User>('members');
          const membersMap = new Map<string, User>();
          if (membersResult.success && membersResult.data) {
            membersResult.data.forEach(member => {
              membersMap.set(member.id, member);
            });
          }
          
          // eventId별로 그룹화하면서 회사/직책 정보 보강
          const teamsByEvent: Record<string, Team[]> = {};
          teamsResult.data.forEach(team => {
            if (!teamsByEvent[team.eventId]) {
              teamsByEvent[team.eventId] = [];
            }
            
            // 조장 정보 보강
            const leaderInfo = membersMap.get(team.leaderId);
            if (leaderInfo) {
              team.leaderCompany = leaderInfo.company || team.leaderCompany;
              team.leaderPosition = leaderInfo.position || team.leaderPosition;
            }
            
            // 조원 정보 보강
            if (team.members && team.members.length > 0) {
              team.members = team.members.map(member => {
                const memberInfo = membersMap.get(member.id);
                return {
                  ...member,
                  company: memberInfo?.company || member.company || '',
                  position: memberInfo?.position || member.position || ''
                };
              });
            }
            
            teamsByEvent[team.eventId].push(team);
          });
          setTeams(teamsByEvent);
        }
        
        // Firebase에서 participations 컬렉션 로드 (실제 신청 데이터)
        const participationsResult = await getDocuments<Participation>('participations');
        if (participationsResult.success && participationsResult.data) {
          // members 컬렉션에서 회사/직책 정보 로드
          const membersResult = await getDocuments<User>('members');
          const membersMap = new Map<string, User>();
          if (membersResult.success && membersResult.data) {
            membersResult.data.forEach(member => {
              membersMap.set(member.id, member);
            });
          }
          
          // eventId별로 그룹화하여 Participant 형식으로 변환 (취소된 참가자 제외)
          const participantsByEvent: Record<string, Participant[]> = {};
          participationsResult.data
            .filter(p => p.status !== 'cancelled')
            .forEach(participation => {
              if (!participantsByEvent[participation.eventId]) {
                participantsByEvent[participation.eventId] = [];
              }
              
              // members 컬렉션에서 회사/직책 정보 조회
              const memberInfo = membersMap.get(participation.userId);
              
              // Participation을 Participant 형식으로 변환
              participantsByEvent[participation.eventId].push({
                id: participation.userId,
                memberId: participation.userId,
                name: participation.userName,
                email: participation.userEmail,
                company: memberInfo?.company || '',
                position: memberInfo?.position || '',
                phoneNumber: memberInfo?.phoneNumber || '',
                status: participation.status as 'confirmed' | 'pending',
                isGuest: participation.isGuest || false,
              });
            });
          setParticipants(participantsByEvent);
        }
        
        // 레거시 participants 컬렉션도 로드 (호환성 유지)
        const legacyParticipantsResult = await getDocuments<Participant & { eventId: string }>('participants');
        if (legacyParticipantsResult.success && legacyParticipantsResult.data && legacyParticipantsResult.data.length > 0) {
          // eventId별로 그룹화
          const legacyParticipantsByEvent: Record<string, Participant[]> = {};
          legacyParticipantsResult.data.forEach(participant => {
            if (!legacyParticipantsByEvent[participant.eventId]) {
              legacyParticipantsByEvent[participant.eventId] = [];
            }
            legacyParticipantsByEvent[participant.eventId].push(participant);
          });
          
          // participations와 병합 (중복 제거)
          setParticipants(prev => {
            const merged = { ...prev };
            Object.keys(legacyParticipantsByEvent).forEach(eventId => {
              if (!merged[eventId]) {
                merged[eventId] = [];
              }
              legacyParticipantsByEvent[eventId].forEach(participant => {
                // 이미 존재하지 않는 경우만 추가
                // 모던(id=userId)과 레거시(id=doc_id) ID 체계가 달라 memberId도 함께 비교
                const isDuplicate = merged[eventId].some(p =>
                  p.id === participant.id ||
                  p.id === participant.memberId ||
                  (participant.memberId && p.memberId === participant.memberId)
                );
                if (!isDuplicate) {
                  merged[eventId].push(participant);
                }
              });
            });
            return merged;
          });
        }
      }
    } catch (err: any) {
      console.error('❌ Firebase 로드 실패:', err.message);
      setError(err.message);
    }
  };
  
  // 현재 진행 중인 이벤트 (가장 가까운 미래 이벤트) - useMemo로 최적화
  const currentEvent = useMemo(() => {
    const event = events
      .filter(event => 
        new Date(event.date) >= new Date() && 
        !event.isSpecial &&
        event.isDraft !== true && // 임시 저장 제외
        event.isPublished === true // 공개된 이벤트만
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
    
    if (event) {
      // currentParticipants 동적 계산
      const participantCount = participants[event.id]?.length || 0;
      return {
        ...event,
        currentParticipants: participantCount
      };
    }
    return null;
  }, [events, participants]);

  // 특별 산행 (isSpecial이 true이고 가장 가까운 미래 이벤트)
  const specialEvent = useMemo(() => {
    const event = events
      .filter(event =>
        new Date(event.date) >= new Date() &&
        !!event.isSpecial && // 특별산행 플래그 (truthy 비교로 유연하게)
        event.isDraft !== true && // 임시 저장 제외
        (event.isPublished === true || event.status === 'open' || event.status === 'closed') // 공개/접수중/마감 포함
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
    
    if (event) {
      // currentParticipants 동적 계산
      const participantCount = participants[event.id]?.length || 0;
      return {
        ...event,
        currentParticipants: participantCount
      };
    }
    return null;
  }, [events, participants]);

  const addEvent = useCallback(async (event: HikingEvent) => {
    try {
      const result = await setDocument('events', event.id, event);
      if (result.success) {
        setEvents(prev => [...prev, event]);
      } else {
        throw new Error(result.error || '이벤트 추가 실패');
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId: event.id });
      throw err;
    }
  }, []);

  const updateEvent = useCallback(async (id: string, updatedEvent: Partial<HikingEvent>) => {
    try {
      const result = await firestoreUpdate('events', id, updatedEvent);
      if (result.success) {
        // Firebase에서 최신 데이터 다시 로드 (서버에서)
        const refreshResult = await getDocuments<HikingEvent>('events', undefined, true);
        if (refreshResult.success && refreshResult.data) {
          setEvents(refreshResult.data);
        } else {
          // Fallback: 로컬 state만 업데이트
          setEvents(prev => prev.map(event => 
            event.id === id ? { ...event, ...updatedEvent } : event
          ));
        }
      } else {
        throw new Error(result.error || '이벤트 수정 실패');
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId: id });
      throw err;
    }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    try {
      const result = await deleteDocument('events', id);
      if (result.success) {
        setEvents(prev => prev.filter(event => event.id !== id));
      } else {
        throw new Error(result.error || '이벤트 삭제 실패');
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId: id });
      throw err;
    }
  }, []);

  const getEventById = useCallback((id: string) => {
    const event = events.find(event => event.id === id);
    if (event) {
      // currentParticipants 동적 계산
      const participantCount = participants[id]?.length || 0;
      return {
        ...event,
        currentParticipants: participantCount
      };
    }
    return undefined;
  }, [events, participants]);

  const getParticipantsByEventId = useCallback((eventId: string) => {
    return participants[eventId] || [];
  }, [participants]);

  const addParticipant = useCallback(async (eventId: string, participant: Participant) => {
    try {
      const participantData = {
        ...participant,
        eventId,
        createdAt: new Date().toISOString(),
      };
      const result = await setDocument('participants', participant.id, participantData);
      if (result.success) {
        setParticipants(prev => ({
          ...prev,
          [eventId]: [...(prev[eventId] || []), participant],
        }));
        
        // 이벤트의 currentParticipants 업데이트
        setEvents(prev => prev.map(event => 
          event.id === eventId 
            ? { ...event, currentParticipants: (event.currentParticipants || 0) + 1 }
            : event
        ));
      } else {
        throw new Error(result.error || '참석자 추가 실패');
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId, participantId: participant.id });
      throw err;
    }
  }, []);

  const updateParticipantStatus = useCallback(async (eventId: string, participantId: string, status: 'confirmed' | 'pending') => {
    try {
      const result = await firestoreUpdate('participants', participantId, { status });
      if (result.success) {
        setParticipants(prev => ({
          ...prev,
          [eventId]: (prev[eventId] || []).map(p => 
            p.id === participantId ? { ...p, status } : p
          ),
        }));
      } else {
        throw new Error(result.error || '참석자 상태 수정 실패');
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId, participantId });
      throw err;
    }
  }, []);

  // 조 편성 관련 함수
  const getTeamsByEventId = useCallback((eventId: string) => {
    return teams[eventId] || [];
  }, [teams]);

  const setTeamsForEvent = useCallback(async (eventId: string, eventTeams: Team[]) => {
    try {
      // 기존 조 중 제거된 것들의 Firestore 문서 삭제
      const existingTeams = teams[eventId] || [];
      const newTeamIds = new Set(eventTeams.map(t => t.id));
      const deletedTeams = existingTeams.filter(t => !newTeamIds.has(t.id));

      for (const t of deletedTeams) {
        const result = await deleteDocument('teams', t.id);
        if (!result.success) {
          console.error('[setTeamsForEvent] 팀 삭제 실패:', t.id, result.error);
        }
      }

      // 현재 조 목록 저장 (각 팀을 개별 문서로 저장)
      for (const team of eventTeams) {
        // Firestore에 저장 불가한 undefined 값 제거
        const cleanTeam = JSON.parse(JSON.stringify({ ...team, eventId }));
        const result = await setDocument('teams', team.id, cleanTeam);
        if (!result.success) {
          console.error('[setTeamsForEvent] 팀 저장 실패:', team.id, result.error);
          throw new Error(`팀 저장 실패 (${team.name}): ${result.error}`);
        }
      }

      setTeams(prev => ({
        ...prev,
        [eventId]: eventTeams,
      }));
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId });
      throw err;
    }
  }, [teams]);
  
  // 특정 이벤트의 조편성 데이터를 Firestore에서 새로 불러옴
  const refreshTeams = useCallback(async (eventId: string) => {
    try {
      // 1. 해당 이벤트의 팀 문서 조회
      const teamsResult = await queryDocuments<Team>(
        'teams',
        [{ field: 'eventId', operator: '==', value: eventId }]
      );
      if (!teamsResult.success || !teamsResult.data) return;

      // 2. participations 조회 (participationId → userId 매핑)
      const participationsResult = await queryDocuments<Participation>(
        'participations',
        [{ field: 'eventId', operator: '==', value: eventId }]
      );
      const participationMap = new Map<string, Participation>();
      if (participationsResult.success && participationsResult.data) {
        participationsResult.data.forEach(p => participationMap.set(p.id, p));
      }

      // 3. members 조회 (userId → User 매핑)
      const membersResult = await getDocuments<User>('members');
      const membersMap = new Map<string, User>();
      if (membersResult.success && membersResult.data) {
        membersResult.data.forEach(m => membersMap.set(m.id, m));
      }

      // 4. 조장/조원 정보 보강 (participationId → userId → member)
      const enrichedTeams = teamsResult.data.map(team => {
        // 조장: leaderId가 participationId일 수 있으므로 매핑 후 조회
        const leaderParticipation = participationMap.get(team.leaderId);
        const leaderUserId = leaderParticipation?.userId || team.leaderId;
        const leaderMember = membersMap.get(leaderUserId);

        return {
          ...team,
          leaderName: leaderParticipation?.userName || team.leaderName,
          leaderCompany: leaderMember?.company || team.leaderCompany || '',
          leaderPosition: leaderMember?.position || team.leaderPosition || '',
          leaderIsGuest: leaderParticipation?.isGuest ?? (team as any).leaderIsGuest ?? false,
          members: (team.members || []).map(member => {
            // 조원: member.id가 participationId일 수 있음
            const memberParticipation = participationMap.get(member.id);
            const memberUserId = memberParticipation?.userId || member.id;
            const memberInfo = membersMap.get(memberUserId);
            return {
              ...member,
              name: memberParticipation?.userName || member.name,
              company: memberInfo?.company || member.company || '',
              position: memberInfo?.position || member.position || '',
              isGuest: memberParticipation?.isGuest ?? member.isGuest ?? false,
            };
          }),
        };
      });

      setTeams(prev => ({ ...prev, [eventId]: enrichedTeams }));
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId });
    }
  }, []);

  // 이벤트 새로고침
  const refreshEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getDocuments<HikingEvent>('events', undefined, true);
      if (result.success && result.data) {
        setEvents(result.data);
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // 참석자 새로고침 (취소된 참가자 제외)
  const refreshParticipants = useCallback(async (eventId: string) => {
    try {
      // participations 컬렉션에서 로드
      const participationsResult = await getDocuments<Participation>('participations');
      if (participationsResult.success && participationsResult.data) {
        const eventParticipations = participationsResult.data.filter(
          p => p.eventId === eventId && p.status !== 'cancelled'
        );
        const participants: Participant[] = eventParticipations.map(participation => ({
          id: participation.userId,
          memberId: participation.userId,
          name: participation.userName,
          email: participation.userEmail,
          status: participation.status as 'confirmed' | 'pending',
          isGuest: participation.isGuest || false,
        }));
        
        setParticipants(prev => ({
          ...prev,
          [eventId]: participants,
        }));
      }
      
      // 레거시 participants 컬렉션도 확인
      const legacyResult = await getDocuments<Participant & { eventId: string }>('participants');
      if (legacyResult.success && legacyResult.data) {
        const legacyEventParticipants = legacyResult.data.filter(p => p.eventId === eventId);
        if (legacyEventParticipants.length > 0) {
          setParticipants(prev => ({
            ...prev,
            [eventId]: [...(prev[eventId] || []), ...legacyEventParticipants.filter(
              lp => !prev[eventId]?.some(p =>
                p.id === lp.id ||
                p.id === lp.memberId ||
                (lp.memberId && p.memberId === lp.memberId)
              )
            )],
          }));
        }
      }
    } catch (err: any) {
      logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE, { eventId });
    }
  }, []);

  /**
   * 이벤트의 날씨 정보를 강제로 업데이트
   * @param eventId - 이벤트 ID
   */
  const updateEventWeather = useCallback(async (eventId: string) => {
    try {
      const event = events.find(e => e.id === eventId);
      if (!event) {
        throw new Error('이벤트를 찾을 수 없습니다');
      }

      // 기상청 API로 날씨 조회
      const weatherData = await getEventWeather(event.date);
      
      // EventWeather 형식으로 변환
      const eventWeather: EventWeather = {
        temperature: weatherData.temperature,
        feelsLike: weatherData.feelsLike,
        condition: weatherData.condition,
        precipitation: weatherData.precipitation,
        windSpeed: weatherData.windSpeed,
        humidity: weatherData.humidity,
        uvIndex: weatherData.uvIndex,
        lastUpdated: new Date().toISOString(),
      };

      // Firebase에 저장
      const result = await firestoreUpdate('events', eventId, { weather: eventWeather });
      
      if (result.success) {
        // Firebase에서 최신 데이터 다시 로드
        const eventsResult = await getDocuments<HikingEvent>('events');
        if (eventsResult.success && eventsResult.data) {
          setEvents(eventsResult.data);
        }
      } else {
        throw new Error(result.error || '날씨 정보 저장 실패');
      }
    } catch (err: any) {
      console.error('❌ 날씨 정보 업데이트 실패:', err);
      logError(err, ErrorLevel.ERROR, ErrorCategory.API, { eventId });
      throw err;
    }
  }, [events]);

  /**
   * 날씨 정보가 오래되었는지 확인하고 필요시 업데이트
   * @param eventId - 이벤트 ID
   */
  const checkAndUpdateWeather = useCallback(async (eventId: string) => {
    try {
      const event = events.find(e => e.id === eventId);
      if (!event) {
        return;
      }

      const now = new Date();
      const lastUpdated = event.weather?.lastUpdated ? new Date(event.weather.lastUpdated) : null;
      
      // 날씨 정보가 없거나, 마지막 업데이트가 24시간 이전인 경우 업데이트
      if (!lastUpdated || (now.getTime() - lastUpdated.getTime()) > 24 * 60 * 60 * 1000) {
        await updateEventWeather(eventId);
      }
    } catch (err: any) {
      console.error('❌ 날씨 확인 및 업데이트 실패:', err);
      logError(err, ErrorLevel.WARNING, ErrorCategory.API, { eventId });
    }
  }, [events, updateEventWeather]);

  // Context value를 useMemo로 메모이제이션
  const value = useMemo(() => ({
    events,
    currentEvent,
    specialEvent, // 특별 산행 추가
    participants,
    teams,
    isLoading,
    error,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventById,
    getParticipantsByEventId,
    addParticipant,
    updateParticipantStatus,
    getTeamsByEventId,
    setTeamsForEvent,
    refreshTeams,
    refreshEvents,
    refreshParticipants,
    updateEventWeather,
    checkAndUpdateWeather,
  }), [
    events,
    currentEvent,
    specialEvent, // 의존성 추가
    participants,
    teams,
    isLoading,
    error,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventById,
    getParticipantsByEventId,
    addParticipant,
    updateParticipantStatus,
    getTeamsByEventId,
    setTeamsForEvent,
    refreshTeams,
    refreshEvents,
    refreshParticipants,
    updateEventWeather,
    checkAndUpdateWeather,
  ]);

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

export const useEvents = () => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
};
