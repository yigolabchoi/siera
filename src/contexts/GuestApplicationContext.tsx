import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getDocuments, setDocument, updateDocument, deleteDocument, queryDocuments } from '../lib/firebase/firestore';
import { logError, ErrorLevel, ErrorCategory } from '../utils/errorHandler';
import { GuestApplication } from '../types';
import { waitForFirebase } from '../lib/firebase/config';
import { useAuth } from './AuthContextEnhanced';
import { sanitizeText } from '../utils/sanitize';

interface GuestApplicationContextType {
  guestApplications: GuestApplication[];
  isLoading: boolean;
  error: string | null;
  addGuestApplication: (application: Omit<GuestApplication, 'id' | 'appliedAt' | 'status'>) => Promise<void>;
  approveGuestApplication: (applicationId: string) => Promise<void>;
  rejectGuestApplication: (applicationId: string, reason?: string) => Promise<void>;
  refreshGuestApplications: () => Promise<void>;
  getApplicationsByStatus: (status: GuestApplication['status']) => GuestApplication[];
  getApplicationsByEvent: (eventId: string) => GuestApplication[];
  _activate: () => void;
}

const GuestApplicationContext = createContext<GuestApplicationContextType | undefined>(undefined);

export const GuestApplicationProvider = ({ children }: { children: ReactNode }) => {
  const [guestApplications, setGuestApplications] = useState<GuestApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Lazy loading
  const [_activated, _setActivated] = useState(false);
  const _activate = useCallback(() => _setActivated(true), []);
  
  // 🔥 AuthContext 사용
  const auth = useAuth();

  const loadApplications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔄 [GuestApplicationContext] guestApplications 데이터 로드 시작');

      const result = await getDocuments<GuestApplication>('guestApplications');
      if (result.success && result.data) {
        // 최신 신청순 정렬
        const sortedApplications = result.data.sort((a, b) => 
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
        );
        setGuestApplications(sortedApplications);
        console.log('✅ Firebase에서 게스트 신청 데이터 로드:', sortedApplications.length, '명');
      } else {
        console.log('ℹ️ Firebase에서 로드된 게스트 신청 데이터가 없습니다.');
        setGuestApplications([]);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Firebase 게스트 신청 데이터 로드 실패:', message);
      setError(message);
      logError(error, ErrorLevel.ERROR, ErrorCategory.DATABASE, {
        context: 'GuestApplicationContext.loadApplications',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Firebase에서 게스트 신청 데이터 로드 - 로그인 상태 변경 시 재로드
  useEffect(() => {
    if (!_activated) return;
    const initializeData = async () => {
      console.log('🔄 [GuestApplicationContext] 데이터 로드 시작, 인증 상태:', {
        isAuthenticated: !!auth.firebaseUser,
        email: auth.firebaseUser?.email,
        hasLoadedOnce
      });
      
      // 로그인 상태이거나 아직 한 번도 로드하지 않았을 때만 로드
      if (auth.firebaseUser || !hasLoadedOnce) {
        await loadApplications();
        setHasLoadedOnce(true);
      }
    };
    
    // Auth 로딩이 완료된 후에만 실행
    if (!auth.isLoading) {
      initializeData();
    }
  }, [_activated, auth.firebaseUser, auth.isLoading, loadApplications]);

  // 게스트 신청 추가
  const addGuestApplication = async (
    applicationData: Omit<GuestApplication, 'id' | 'appliedAt' | 'status'>
  ) => {
    try {
      // 필수 필드 검증 및 기본값 설정
      if (!applicationData.name || applicationData.name.trim() === '') {
        throw new Error('이름은 필수 입력 항목입니다.');
      }
      if (!applicationData.phoneNumber || applicationData.phoneNumber.trim() === '') {
        throw new Error('전화번호는 필수 입력 항목입니다.');
      }
      if (!applicationData.eventId) {
        throw new Error('이벤트 ID가 필요합니다.');
      }

      const newApplication: Omit<GuestApplication, 'id'> = {
        ...applicationData,
        name: sanitizeText(applicationData.name.trim()),
        email: sanitizeText(applicationData.email.trim()),
        phoneNumber: sanitizeText(applicationData.phoneNumber.trim()),
        company: sanitizeText(applicationData.company?.trim() || ''),
        position: sanitizeText(applicationData.position?.trim() || ''),
        eventTitle: sanitizeText(applicationData.eventTitle || ''),
        eventDate: applicationData.eventDate || '',
        appliedAt: new Date().toISOString(),
        status: 'pending',
      };

      console.log('📤 게스트 신청 추가:', newApplication);

      // ID 생성
      const id = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const applicationWithId: GuestApplication = {
        ...newApplication,
        id,
      };

      const result = await setDocument('guestApplications', id, applicationWithId);

      if (result.success) {
        setGuestApplications(prev => [applicationWithId, ...prev]);
        console.log('✅ 게스트 신청 추가 완료:', id);
      } else {
        throw new Error(result.error || '게스트 신청 추가 실패');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ 게스트 신청 추가 실패:', message, error);
      logError(error, ErrorLevel.ERROR, ErrorCategory.DATABASE, {
        context: 'GuestApplicationContext.addGuestApplication',
        applicationData,
      });
      throw error;
    }
  };

  // 게스트 신청 승인
  const approveGuestApplication = async (applicationId: string) => {
    try {
      console.log('✅ 게스트 신청 승인 처리:', applicationId);
      
      // 1. 게스트 신청 정보 가져오기
      const application = guestApplications.find(app => app.id === applicationId);
      if (!application) {
        throw new Error('게스트 신청 정보를 찾을 수 없습니다.');
      }

      // 2. 게스트 신청 상태 업데이트
      const result = await updateDocument('guestApplications', applicationId, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
      });

      if (!result.success) {
        throw new Error(result.error || '게스트 신청 승인 실패');
      }

      // 3. participations: 기존 participation이 있으면 유지, 없으면 새로 생성 (입금 전이므로 pending)
      const realUserId = application.userId || applicationId;
      const now = new Date().toISOString();
      
      const existingParts = await queryDocuments<any>('participations', [
        { field: 'eventId', operator: '==', value: application.eventId },
        { field: 'userId', operator: '==', value: realUserId },
      ]);
      
      let participationId: string;
      
      if (existingParts.success && existingParts.data && existingParts.data.length > 0) {
        const existing = existingParts.data[0];
        participationId = existing.id;
        // 기존 participation이 이미 있으면 isGuest만 마킹 (status는 payment 상태에 따라 관리)
        if (existing.status === 'cancelled') {
          await updateDocument('participations', participationId, {
            status: 'pending',
            isGuest: true,
            updatedAt: now,
          });
        } else {
          await updateDocument('participations', participationId, {
            isGuest: true,
            updatedAt: now,
          });
        }
        console.log('📤 기존 participation 유지 (status: ' + existing.status + '):', participationId);
      } else {
        participationId = `participation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const participationData = {
          id: participationId,
          eventId: application.eventId,
          userId: realUserId,
          userName: application.name,
          userEmail: application.email || '',
          userPhone: application.phoneNumber || application.phone || '',
          userCompany: application.company || '',
          userPosition: application.position || '',
          isGuest: true,
          status: 'pending',
          registeredAt: now,
          createdAt: now,
          updatedAt: now,
        };

        const participationResult = await setDocument('participations', participationId, participationData);
        
        if (!participationResult.success) {
          throw new Error('참가자 등록 실패');
        }
        console.log('📤 새 participation 생성:', participationId);
      }

      // 4. 로컬 상태 업데이트
      setGuestApplications(prev =>
        prev.map(app =>
          app.id === applicationId
            ? { ...app, status: 'approved' as const, approvedAt: new Date().toISOString() }
            : app
        )
      );
      
      console.log('✅ 게스트 신청 승인 및 참가자 등록 완료:', {
        applicationId,
        participationId,
        eventId: application.eventId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ 게스트 신청 승인 실패:', message);
      logError(error, ErrorLevel.ERROR, ErrorCategory.DATABASE, {
        context: 'GuestApplicationContext.approveGuestApplication',
        applicationId,
      });
      throw error;
    }
  };

  // 게스트 신청 거절
  const rejectGuestApplication = async (applicationId: string, reason?: string) => {
    try {
      console.log('❌ 게스트 신청 거절 처리:', applicationId);
      
      const result = await updateDocument('guestApplications', applicationId, {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
      });

      if (result.success) {
        setGuestApplications(prev =>
          prev.map(app =>
            app.id === applicationId
              ? { 
                  ...app, 
                  status: 'rejected' as const, 
                  rejectedAt: new Date().toISOString(),
                  rejectionReason: reason 
                }
              : app
          )
        );
        
        console.log('✅ 게스트 신청 거절 완료:', applicationId);
      } else {
        throw new Error(result.error || '게스트 신청 거절 실패');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ 게스트 신청 거절 실패:', message);
      logError(error, ErrorLevel.ERROR, ErrorCategory.DATABASE, {
        context: 'GuestApplicationContext.rejectGuestApplication',
        applicationId,
      });
      throw error;
    }
  };

  // 새로고침
  const refreshGuestApplications = async () => {
    await loadApplications();
  };

  // 상태별 필터링
  const getApplicationsByStatus = (status: GuestApplication['status']) => {
    return guestApplications.filter(app => app.status === status);
  };

  // 산행별 필터링
  const getApplicationsByEvent = (eventId: string) => {
    return guestApplications.filter(app => app.eventId === eventId);
  };

  const value: GuestApplicationContextType = {
    guestApplications,
    isLoading,
    error,
    addGuestApplication,
    approveGuestApplication,
    rejectGuestApplication,
    refreshGuestApplications,
    getApplicationsByStatus,
    getApplicationsByEvent,
    _activate,
  };

  return (
    <GuestApplicationContext.Provider value={value}>
      {children}
    </GuestApplicationContext.Provider>
  );
};

export const useGuestApplications = () => {
  const context = useContext(GuestApplicationContext);
  if (!context) {
    throw new Error('useGuestApplications must be used within GuestApplicationProvider');
  }
  useEffect(() => { context._activate(); }, [context._activate]);
  return context;
};
