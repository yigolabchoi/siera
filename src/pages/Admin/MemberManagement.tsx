import { useState, useEffect, useMemo, useCallback } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import { Users, Shield, UserCog, Search, UserCheck, UserPlus, Check, X, Eye, Calendar, Briefcase, Building2, Phone, Mail, Mountain, MessageSquare, AlertCircle, UserX, Power, Edit2, Save, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMembers } from '../../contexts/MemberContext';
import { useGuestApplications } from '../../contexts/GuestApplicationContext';
import { useExecutives, Executive } from '../../contexts/ExecutiveContext';
import { useParticipations } from '../../contexts/ParticipationContext';
import { useEvents } from '../../contexts/EventContext';
import { sortByPosition } from '../../utils/executiveOrder';
import { useAuth } from '../../contexts/AuthContextEnhanced';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import StatCard from '../../components/ui/StatCard';
import FilterGroup from '../../components/ui/FilterGroup';
import { UserRole, Member } from '../../types';
import { formatDate } from '../../utils/format';
import { auth } from '../../lib/firebase/config';
import { setDocument } from '../../lib/firebase/firestore';
import { 
  getAuthProvider, 
  reauthenticateWithGoogle, 
  reauthenticateWithPassword, 
  sendReauthPhoneCode, 
  verifyReauthPhoneCode, 
  cleanupReauthSession 
} from '../../lib/firebase/auth';

const MemberManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { members, refreshMembers, updateMember } = useMembers(); // updateMember 추가
  const { guestApplications } = useGuestApplications(); // 게스트 신청 이력 조회(레거시 백필용)
  const { executives, addExecutive, updateExecutive, deleteExecutive, isLoading: isExecutivesLoading } = useExecutives(); // 운영진 정보 추가
  const { participations, cancelParticipation, deleteParticipation } = useParticipations();
  const { getEventById } = useEvents();

  // 특정 사용자의 산행 참여 횟수 계산 (취소 제외, 지난 산행만)
  const getHikingCount = useCallback((userId: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return participations.filter(p => {
      if (p.userId !== userId || p.status === 'cancelled') return false;
      const event = getEventById(p.eventId);
      if (!event?.date) return false;
      const eventDate = new Date(event.date);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate < now; // 지난 산행만 카운트
    }).length;
  }, [participations, getEventById]);

  const [activeTab, setActiveTab] = useState<'members' | 'executives'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');

  // 재인증 모달 상태
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyAction, setVerifyAction] = useState<(() => void) | null>(null);
  const [verifyProvider, setVerifyProvider] = useState<'google' | 'phone' | 'email' | 'unknown'>('unknown');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // 이메일/비밀번호 재인증용
  const [passwordInput, setPasswordInput] = useState('');
  
  // SMS 재인증용
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneCodeInput, setPhoneCodeInput] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  
  // Rate limiting 상태
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntil, setLockUntil] = useState<Date | null>(null);

  // 회원 상세 모달 상태
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isMemberDetailModalOpen, setIsMemberDetailModalOpen] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [editMemberForm, setEditMemberForm] = useState<{ company: string; position: string; name: string; phoneNumber: string }>({ company: '', position: '', name: '', phoneNumber: '' });
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 운영진 관리 상태
  const [editingExecutiveId, setEditingExecutiveId] = useState<string | null>(null);
  const [editExecutiveForm, setEditExecutiveForm] = useState<Executive | null>(null);
  const [isAddingExecutive, setIsAddingExecutive] = useState(false);
  const [newExecutive, setNewExecutive] = useState<Omit<Executive, 'id' | 'createdAt' | 'updatedAt'>>({
    memberId: undefined,
    name: '',
    position: '',
    phoneNumber: '',
    email: '',
    category: 'chairman',
    company: '',
    startTerm: '',
    endTerm: '',
    bio: '',
  });
  const [executiveSearchQuery, setExecutiveSearchQuery] = useState('');
  const [showExecutiveSearchResults, setShowExecutiveSearchResults] = useState(false);
  const [editExecutiveSearchQuery, setEditExecutiveSearchQuery] = useState('');
  const [showEditExecutiveSearchResults, setShowEditExecutiveSearchResults] = useState(false);

  // 탭 변경 시 데이터 새로고침
  useEffect(() => {
    if (activeTab === 'members') {
      refreshMembers();
    } else if (activeTab === 'executives') {
      refreshMembers(); // 운영진 탭에서도 members 데이터 필요
    }
  }, [activeTab]);

  // 관리자 재인증 요청 (인증 제공자 자동 감지)
  const requestPasswordVerification = (action: () => void) => {
    const provider = getAuthProvider();
    setVerifyProvider(provider);
    setVerifyAction(() => action);
    setPasswordInput('');
    setPhoneCodeInput('');
    setPhoneCodeSent(false);
    setIsVerifying(false);
    setIsSendingCode(false);
    
    // Google: 즉시 팝업 실행 (모달 없이)
    if (provider === 'google') {
      handleGoogleReauth(action);
    } else {
      setIsVerifyModalOpen(true);
    }
  };

  // Google 재인증 처리
  const handleGoogleReauth = async (action: () => void) => {
    setIsVerifying(true);
    try {
      const result = await reauthenticateWithGoogle();
      if (result.success) {
        setFailedAttempts(0);
        setIsVerifyModalOpen(false);
        action();
        setVerifyAction(null);
      } else {
        alert(result.error || 'Google 재인증에 실패했습니다.');
      }
    } catch {
      alert('Google 재인증에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsVerifying(false);
    }
  };

  // SMS 인증코드 전송
  const handleSendPhoneCode = async () => {
    if (!auth.currentUser?.phoneNumber) {
      alert('등록된 전화번호가 없습니다.');
      return;
    }
    
    setIsSendingCode(true);
    try {
      const result = await sendReauthPhoneCode(
        auth.currentUser.phoneNumber,
        'reauth-recaptcha-container'
      );
      if (result.success) {
        setPhoneCodeSent(true);
      } else {
        alert(result.error || 'SMS 전송에 실패했습니다.');
      }
    } catch {
      alert('SMS 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSendingCode(false);
    }
  };

  // SMS 인증코드 확인
  const handleVerifyPhoneCode = async () => {
    if (!phoneCodeInput.trim()) {
      alert('인증코드를 입력해주세요.');
      return;
    }

    if (checkLocked()) return;

    setIsVerifying(true);
    try {
      const result = await verifyReauthPhoneCode(phoneCodeInput);
      if (result.success) {
        setFailedAttempts(0);
        setIsVerifyModalOpen(false);
        setPhoneCodeInput('');
        setPhoneCodeSent(false);
        cleanupReauthSession();
        if (verifyAction) verifyAction();
        setVerifyAction(null);
      } else {
        handleVerifyFailed(result.error || '인증코드 확인에 실패했습니다.');
      }
    } catch {
      handleVerifyFailed('인증코드 확인에 실패했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 이메일/비밀번호 재인증 확인
  const handlePasswordConfirm = async () => {
    if (!user || !auth.currentUser) {
      alert('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    if (checkLocked()) return;

    setIsVerifying(true);
    try {
      const result = await reauthenticateWithPassword(user.email, passwordInput);
      if (result.success) {
        setFailedAttempts(0);
        setIsVerifyModalOpen(false);
        setPasswordInput('');
        if (verifyAction) verifyAction();
        setVerifyAction(null);
      } else {
        if (result.error === 'wrong-password') {
          handleVerifyFailed('wrong-password');
        } else if (result.error === 'too-many-requests') {
          handleVerifyFailed('too-many-requests');
        } else {
          handleVerifyFailed(result.error || '비밀번호 확인에 실패했습니다.');
        }
      }
    } catch {
      handleVerifyFailed('비밀번호 확인에 실패했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 잠금 상태 확인
  const checkLocked = (): boolean => {
    if (isLocked) {
      const remainingTime = lockUntil
        ? Math.ceil((lockUntil.getTime() - Date.now()) / 1000 / 60)
        : 5;
      alert(`계정이 일시적으로 잠겼습니다. ${remainingTime}분 후 다시 시도해주세요.`);
      return true;
    }

    if (failedAttempts >= 3) {
      const lockTime = new Date(Date.now() + 5 * 60 * 1000);
      setIsLocked(true);
      setLockUntil(lockTime);
      setTimeout(() => { setIsLocked(false); setFailedAttempts(0); setLockUntil(null); }, 5 * 60 * 1000);
      alert('계정이 5분간 잠겼습니다. 잠시 후 다시 시도해주세요.');
      return true;
    }
    return false;
  };

  // 인증 실패 처리
  const handleVerifyFailed = (errorType: string) => {
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    if (errorType === 'wrong-password') {
      const remaining = 3 - newAttempts;
      alert(`비밀번호가 올바르지 않습니다. (${remaining}회 남음)`);
    } else if (errorType === 'too-many-requests') {
      alert('너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.');
      setIsLocked(true);
      setTimeout(() => setIsLocked(false), 5 * 60 * 1000);
    } else {
      alert(errorType);
    }
    setPasswordInput('');
    setPhoneCodeInput('');
  };

  // 재인증 모달 취소
  const handleVerifyCancel = () => {
    setIsVerifyModalOpen(false);
    setPasswordInput('');
    setPhoneCodeInput('');
    setPhoneCodeSent(false);
    setVerifyAction(null);
    setIsVerifying(false);
    setIsSendingCode(false);
    cleanupReauthSession();
  };

  // ===== 운영진 관리 함수들 =====
  
  // 운영진과 members 데이터 병합
  const executivesWithMemberBio = useMemo(() => {
    return executives.map(exec => {
      const memberData = members.find(m => m.id === exec.memberId);
      return {
        ...exec,
        displayBio: memberData?.bio || exec.bio,
      };
    });
  }, [executives, members]);

  // 임기 활성화 여부 확인
  const isTermActive = (startTerm?: string, endTerm?: string) => {
    if (!startTerm || !endTerm) return false;
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return currentYearMonth >= startTerm && currentYearMonth <= endTerm;
  };

  // 회원 검색 필터링 (운영진용)
  const getFilteredMembersForExecutive = (query: string) => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    return members.filter(member =>
      member.name.toLowerCase().includes(lowerQuery) ||
      (member.company?.toLowerCase().includes(lowerQuery)) ||
      (member.position?.toLowerCase().includes(lowerQuery))
    );
  };

  // 운영진 수정 시작
  const handleEditExecutive = (executive: Executive) => {
    setEditingExecutiveId(executive.id);
    setEditExecutiveForm({ ...executive });
    setEditExecutiveSearchQuery('');
    setShowEditExecutiveSearchResults(false);
  };

  // 운영진 수정 취소
  const handleCancelEditExecutive = () => {
    setEditingExecutiveId(null);
    setEditExecutiveForm(null);
    setEditExecutiveSearchQuery('');
    setShowEditExecutiveSearchResults(false);
  };

  // 운영진 수정 저장
  const handleSaveEditExecutive = async () => {
    if (editExecutiveForm) {
      if (!editExecutiveForm.startTerm || !editExecutiveForm.endTerm) {
        alert('임기를 모두 입력해주세요.');
        return;
      }
      
      requestPasswordVerification(async () => {
        try {
          await updateExecutive(editExecutiveForm.id, editExecutiveForm);
          
          // 해당 회원의 members 컬렉션 role도 동기화
          if (editExecutiveForm.memberId) {
            const newRole = editExecutiveForm.category === 'chairman' ? 'chairman' : 'committee';
            await updateMember(editExecutiveForm.memberId, { role: newRole as UserRole });
          }
          
          setEditingExecutiveId(null);
          setEditExecutiveForm(null);
          setEditExecutiveSearchQuery('');
          setShowEditExecutiveSearchResults(false);
          await refreshMembers();
          alert('운영진 정보가 수정되었습니다.');
        } catch (error) {
          console.error('운영진 수정 실패:', error);
          alert('운영진 수정에 실패했습니다.');
        }
      });
    }
  };

  // 새 운영진 추가
  const handleAddNewExecutive = async () => {
    if (!newExecutive.position || !newExecutive.startTerm || !newExecutive.endTerm) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    if (!newExecutive.memberId) {
      alert('회원을 선택해주세요.');
      return;
    }

    requestPasswordVerification(async () => {
      try {
        await addExecutive(newExecutive);
        
        // 해당 회원의 members 컬렉션 role도 동기화
        if (newExecutive.memberId) {
          const newRole = newExecutive.category === 'chairman' ? 'chairman' : 'committee';
          await updateMember(newExecutive.memberId, { role: newRole as UserRole });
        }
        
        setNewExecutive({
          memberId: undefined,
          name: '',
          position: '',
          phoneNumber: '',
          email: '',
          category: 'chairman',
          company: '',
          startTerm: '',
          endTerm: '',
          bio: '',
        });
        setExecutiveSearchQuery('');
        setShowExecutiveSearchResults(false);
        setIsAddingExecutive(false);
        await refreshMembers();
        alert('운영진이 추가되었습니다.');
      } catch (error) {
        console.error('운영진 추가 실패:', error);
        alert('운영진 추가에 실패했습니다.');
      }
    });
  };

  // 운영진 삭제
  const handleDeleteExecutive = async (id: string) => {
    requestPasswordVerification(async () => {
      if (confirm('정말 삭제하시겠습니까?')) {
        try {
          // 삭제 전에 해당 임원의 memberId를 확인
          const execToDelete = executives.find(e => e.id === id);
          
          await deleteExecutive(id);
          
          // 해당 회원의 members 컬렉션 role을 'member'로 복원
          // (단, 다른 임원 직책이 남아있는지 확인)
          if (execToDelete?.memberId) {
            const hasOtherExecRole = executives.some(
              e => e.id !== id && e.memberId === execToDelete.memberId
            );
            if (!hasOtherExecRole) {
              await updateMember(execToDelete.memberId, { role: 'member' as UserRole });
            }
          }
          
          await refreshMembers();
          alert('운영진이 삭제되었습니다.');
        } catch (error) {
          console.error('운영진 삭제 실패:', error);
          alert('운영진 삭제에 실패했습니다.');
        }
      }
    });
  };

  // 회원 선택 시 정보 자동 입력 (새 운영진 추가)
  const handleMemberSelectNewExecutive = (member: Member) => {
    setNewExecutive({
      ...newExecutive,
      memberId: String(member.id),
      name: member.name,
      phoneNumber: member.phoneNumber || '',
      email: member.email,
      company: member.company || '',
    });
    setExecutiveSearchQuery(member.name);
    setShowExecutiveSearchResults(false);
  };

  // 회원 선택 시 정보 자동 입력 (기존 운영진 수정)
  const handleMemberSelectEditExecutive = (member: Member) => {
    if (editExecutiveForm) {
      setEditExecutiveForm({
        ...editExecutiveForm,
        memberId: String(member.id),
        name: member.name,
        phoneNumber: member.phoneNumber || '',
        email: member.email,
        company: member.company || '',
      });
      setEditExecutiveSearchQuery(member.name);
      setShowEditExecutiveSearchResults(false);
    }
  };

  // 검색창 초기화 (운영진)
  const resetExecutiveSearch = (isNew: boolean) => {
    if (isNew) {
      setExecutiveSearchQuery('');
      setShowExecutiveSearchResults(false);
      setNewExecutive({
        ...newExecutive,
        memberId: undefined,
        name: '',
        phoneNumber: '',
        email: '',
        company: '',
      });
    } else {
      setEditExecutiveSearchQuery('');
      setShowEditExecutiveSearchResults(false);
    }
  };

  // 운영진 카드 렌더링
  const renderExecutiveCard = (executive: Executive & { displayBio?: string }) => {
    const isEditing = editingExecutiveId === executive.id;
    const data = isEditing ? editExecutiveForm! : executive;

    return (
      <div
        key={executive.id}
        className="p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all"
      >
        {isEditing ? (
          // 수정 모드
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                회원 검색 *
              </label>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={editExecutiveSearchQuery || data.name}
                    onChange={(e) => {
                      setEditExecutiveSearchQuery(e.target.value);
                      setShowEditExecutiveSearchResults(true);
                    }}
                    onFocus={() => setShowEditExecutiveSearchResults(true)}
                    className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="회원 이름, 직급, 회사 검색..."
                  />
                  {editExecutiveSearchQuery && (
                    <button
                      onClick={() => resetExecutiveSearch(false)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {showEditExecutiveSearchResults && editExecutiveSearchQuery && getFilteredMembersForExecutive(editExecutiveSearchQuery).length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {getFilteredMembersForExecutive(editExecutiveSearchQuery).map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleMemberSelectEditExecutive(member)}
                        className="w-full px-3 py-2 text-left hover:bg-primary-50 transition-colors border-b border-slate-100 last:border-b-0"
                      >
                        <p className="text-sm font-medium text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-600">
                          {member.company} {member.position}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                구분 *
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="edit-category"
                    value="chairman"
                    checked={data.category === 'chairman'}
                    onChange={(e) => setEditExecutiveForm({ ...data, category: e.target.value as 'chairman' | 'committee' })}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">회장단</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="edit-category"
                    value="committee"
                    checked={data.category === 'committee'}
                    onChange={(e) => setEditExecutiveForm({ ...data, category: e.target.value as 'chairman' | 'committee' })}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700">운영위원회</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                직책 *
              </label>
              <input
                type="text"
                value={data.position}
                onChange={(e) => setEditExecutiveForm({ ...data, position: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="직책"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  임기 시작 *
                </label>
                <input
                  type="month"
                  value={data.startTerm || ''}
                  onChange={(e) => setEditExecutiveForm({ ...data, startTerm: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  임기 종료 *
                </label>
                <input
                  type="month"
                  value={data.endTerm || ''}
                  onChange={(e) => setEditExecutiveForm({ ...data, endTerm: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEditExecutive}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                저장
              </button>
              <button
                onClick={handleCancelEditExecutive}
                className="flex-1 px-4 py-2 bg-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-400 transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                취소
              </button>
            </div>
          </div>
        ) : (
          // 보기 모드
          <>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-lg font-bold text-slate-900">{data.name}</h4>
                  <Badge variant={data.category === 'chairman' ? 'success' : 'info'}>
                    {data.position}
                  </Badge>
                </div>
                {data.company && (
                  <p className="text-sm text-slate-600">
                    {data.company}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditExecutive(executive)}
                  className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteExecutive(executive.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {executive.displayBio && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-sm text-slate-600 leading-relaxed">{executive.displayBio}</p>
              </div>
            )}
            <div className="space-y-2 text-sm text-slate-600">
              {data.phoneNumber && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{data.phoneNumber}</span>
                </div>
              )}
              {data.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>{data.email}</span>
                </div>
              )}
              {data.startTerm && data.endTerm && (
                <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-200">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-xs">
                    {data.startTerm} ~ {data.endTerm}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ===== 운영진 관리 함수 끝 =====

  // 회원 활성화/비활성화 토글
  const handleToggleMemberStatus = async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    
    const newStatus = member.isActive === false ? true : false;
    const statusText = newStatus ? '활성화' : '비활성화';

    // 비활성화 시 진행중인 산행 참여 정보 확인
    let upcomingParticipations: typeof participations = [];
    if (!newStatus) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      upcomingParticipations = participations.filter(p => {
        if (p.userId !== memberId || p.status === 'cancelled') return false;
        const event = getEventById(p.eventId);
        if (!event?.date) return false;
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= now; // 오늘 이후 산행만
      });
    }

    const confirmMessage = !newStatus && upcomingParticipations.length > 0
      ? `${member.name} 회원을 비활성화하시겠습니까?\n\n⚠️ 진행중인 산행 참여 ${upcomingParticipations.length}건이 함께 취소됩니다.\n(참여 신청, 조편성, 결제 정보가 정리됩니다)`
      : `${member.name} 회원을 ${statusText}하시겠습니까?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    requestPasswordVerification(async () => {
      try {
        // 비활성화 시 진행중인 산행 관련 데이터 정리
        if (!newStatus && upcomingParticipations.length > 0) {
          let cancelledCount = 0;
          for (const participation of upcomingParticipations) {
            try {
              // cancelParticipation은 내부적으로 팀, 결제 등 캐스케이드 정리를 수행
              await cancelParticipation(participation.id, '계정 비활성화로 인한 자동 취소');
              cancelledCount++;
            } catch (err) {
              console.error(`참여 취소 실패 (${participation.id}):`, err);
            }
          }
          console.log(`${member.name} 회원의 산행 참여 ${cancelledCount}건 취소 완료`);
        }

        await updateMember(memberId, { 
          isActive: newStatus,
          updatedAt: new Date().toISOString()
        });

        const resultMessage = !newStatus && upcomingParticipations.length > 0
          ? `${member.name} 회원이 비활성화되었습니다.\n\n진행중인 산행 참여 ${upcomingParticipations.length}건이 취소되었습니다.`
          : `${member.name} 회원이 ${statusText}되었습니다.`;
        alert(resultMessage);
      } catch (error: any) {
        console.error('회원 상태 변경 실패:', error);
        alert(`회원 상태 변경에 실패했습니다: ${error.message}`);
      }
    });
  };

  // 운영진을 회원으로 동기화하는 함수
  const handleSyncExecutivesToMembers = async () => {
    if (!confirm('운영진 정보를 회원 목록에 동기화하시겠습니까?\n\n• 회원 목록에 없는 운영진은 추가됩니다.\n• 이미 있는 회원의 직급(role)이 운영진에 맞게 업데이트됩니다.')) {
      return;
    }

    try {
      // 이메일 → memberId 매핑, memberId → member 매핑
      const memberByEmail = new Map(members.map(m => [m.email, m]));
      const memberById = new Map(members.map(m => [m.id, m]));
      
      let addedCount = 0;
      let updatedCount = 0;

      for (const exec of executives) {
        const newRole = (exec.category === 'chairman' ? 'chairman' : 'committee') as UserRole;
        
        // 1) memberId로 먼저 찾기
        const existingByMemberId = exec.memberId ? memberById.get(exec.memberId) : undefined;
        // 2) 이메일로 찾기
        const existingByEmail = memberByEmail.get(exec.email);
        const existingMember = existingByMemberId || existingByEmail;
        
        if (existingMember) {
          // 기존 회원의 role 업데이트
          if (existingMember.role !== newRole) {
            await updateMember(existingMember.id, { role: newRole });
            updatedCount++;
          }
          continue;
        }

        // 회원 목록에 없는 경우 새로 추가
        const memberId = exec.memberId || `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const memberData: Member = {
          id: memberId,
          name: exec.name,
          email: exec.email,
          phoneNumber: exec.phoneNumber,
          occupation: '',
          company: exec.company || '',
          position: exec.position,
          role: newRole,
          joinDate: new Date().toISOString().split('T')[0],
          isApproved: true,
          isActive: true,
          bio: exec.bio,
          createdAt: exec.createdAt || new Date().toISOString(),
        };

        const result = await setDocument('members', memberId, memberData);
        
        if (result.success) {
          addedCount++;
        }
      }

      // 회원 목록 새로고침
      await refreshMembers();

      alert(`운영진 동기화 완료!\n\n추가됨: ${addedCount}명\n직급 업데이트: ${updatedCount}명`);
    } catch (error: any) {
      console.error('❌ 동기화 중 오류 발생:', error);
      alert(`동기화에 실패했습니다: ${error.message}`);
    }
  };

  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      // 병합된 계정은 목록에서 제외
      if ((member as any).mergedInto) return false;
      
      const matchesSearch = 
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.occupation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.company || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (member.position || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || member.role === roleFilter;
      const matchesStatus = 
        (statusFilter === 'active' && (member.isActive !== false)) ||
        (statusFilter === 'inactive' && (member.isActive === false));
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [members, searchTerm, roleFilter, statusFilter]);

  // 검색/필터 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const memberStats = useMemo(() => {
    // 병합된 계정 제외
    const nonMerged = members.filter(m => !(m as any).mergedInto);
    const activeAll = nonMerged.filter(m => m.isActive !== false);
    return {
      total: activeAll.length, // 전체 회원 = 정회원+운영진+게스트(활성)
      active: activeAll.length,
      inactive: nonMerged.filter(m => m.isActive === false).length,
      member: activeAll.filter(m => m.role !== 'guest').length, // 정회원 = 운영진 포함, 게스트 제외
      guest: activeAll.filter(m => m.role === 'guest').length,
    };
  }, [members]);

  // '가입 승인' 탭 제거 이전에 신청되어 아직 회원명부에 없는 게스트(레거시) — 한 번에 백필
  const orphanedGuestApplications = useMemo(() => {
    const memberIds = new Set(members.map(m => m.id));
    const seen = new Set<string>();
    const result = [];
    for (const app of guestApplications) {
      if (!app.userId || memberIds.has(app.userId) || seen.has(app.userId)) continue;
      seen.add(app.userId);
      result.push(app);
    }
    return result;
  }, [guestApplications, members]);

  const [isBackfillingGuests, setIsBackfillingGuests] = useState(false);

  const handleBackfillLegacyGuests = async () => {
    if (!confirm(`이전에 신청된 게스트 ${orphanedGuestApplications.length}명을 회원명부에 등록하시겠습니까?`)) return;
    setIsBackfillingGuests(true);
    let successCount = 0;
    try {
      for (const app of orphanedGuestApplications) {
        if (!app.userId) continue;
        const result = await setDocument('members', app.userId, {
          id: app.userId,
          name: app.name,
          email: app.email || '',
          phoneNumber: app.phoneNumber || app.phone || '',
          company: app.company || '',
          position: app.position || '',
          role: 'guest' as const,
          isApproved: true,
          isActive: true,
          joinDate: app.appliedAt ? app.appliedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          referredBy: app.referredBy || '',
        });
        if (result.success) successCount++;
      }
      await refreshMembers();
      alert(`${successCount}명을 회원명부에 등록했습니다.`);
    } catch (error) {
      console.error('레거시 게스트 백필 실패:', error);
      alert('일부 등록에 실패했습니다. 콘솔을 확인해주세요.');
    } finally {
      setIsBackfillingGuests(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'chairman':
        return <Badge variant="danger">회장단</Badge>;
      case 'committee':
        return <Badge variant="info">운영위원</Badge>;
      case 'member':
        return <Badge variant="success">정회원</Badge>;
      case 'guest':
        return <Badge variant="warning">게스트</Badge>;
      case 'admin':
        return <Badge variant="success">정회원</Badge>;
      default:
        return <Badge variant="primary">회원</Badge>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'members', label: '회원 관리', count: memberStats.total },
          { key: 'executives', label: '운영진 관리', count: executives.length },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as typeof activeTab)}
        className="mb-8"
      />

      {/* Members Tab */}
      {activeTab === 'members' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard icon={<Users className="w-8 h-8" />} label="전체 회원" value={memberStats.total} unit="명" iconColor="text-slate-600" />
            <StatCard icon={<UserCheck className="w-8 h-8" />} label="정회원" value={memberStats.member} unit="명" iconColor="text-emerald-600" />
            <StatCard icon={<UserPlus className="w-8 h-8" />} label="게스트" value={memberStats.guest} unit="명" iconColor="text-amber-600" />
            <StatCard icon={<UserCog className="w-8 h-8" />} label="운영진" value={executives.length} unit="명" iconColor="text-purple-600" />
            <StatCard icon={<UserX className="w-8 h-8" />} label="비활성" value={memberStats.inactive} unit="명" iconColor="text-slate-500" />
          </div>

          {/* 레거시 게스트 백필 안내 배너 (가입 승인 탭 제거 이전 신청 건) */}
          {orphanedGuestApplications.length > 0 && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  이전 방식(가입 승인 대기)으로 신청되어 아직 회원명부에 없는 게스트가{' '}
                  <strong>{orphanedGuestApplications.length}명</strong> 있습니다. ({orphanedGuestApplications.map(a => a.name).join(', ')})
                </p>
              </div>
              <button
                onClick={handleBackfillLegacyGuests}
                disabled={isBackfillingGuests}
                className="shrink-0 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isBackfillingGuests ? '등록 중...' : '회원명부에 등록'}
              </button>
            </div>
          )}

          {/* Search and Filter */}
          <div className="space-y-6 mb-8">
            {/* 검색 필드 - 개선된 디자인 */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="이름, 소속, 직책으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all shadow-sm hover:border-slate-300"
              />
            </div>
            
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">직급별</p>
                <FilterGroup
                  options={[
                    { key: 'all', label: '전체' },
                    { key: 'chairman', label: '회장단' },
                    { key: 'committee', label: '운영위원' },
                    { key: 'member', label: '정회원' },
                    { key: 'guest', label: '게스트', count: memberStats.guest > 0 ? memberStats.guest : undefined },
                  ]}
                  selected={roleFilter}
                  onChange={(key) => setRoleFilter(key as typeof roleFilter)}
                  size="sm"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">활성화 상태</p>
                <FilterGroup
                  options={[
                    { key: 'active', label: '활성', count: memberStats.active },
                    { key: 'inactive', label: '비활성', count: memberStats.inactive },
                  ]}
                  selected={statusFilter}
                  onChange={(key) => setStatusFilter(key as typeof statusFilter)}
                  size="sm"
                />
              </div>
            </div>
          </div>

      {/* Member List - 한줄 리스트 형태 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* 테이블 헤더 (데스크톱) */}
        <div className="hidden sm:grid sm:grid-cols-[40px_1fr_80px_50px_130px_90px_90px] gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <span className="text-center">#</span>
          <span>이름</span>
          <span>직급</span>
          <span className="text-center">산행</span>
          <span>소속</span>
          <span>직책</span>
          <span className="text-center">입회일</span>
        </div>

        {paginatedMembers.length > 0 ? (
          <>
            {paginatedMembers.map((member, index) => (
              <div
                key={member.id}
                onClick={() => {
                  setSelectedMember(member);
                  setIsMemberDetailModalOpen(true);
                }}
                className={`cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 ${
                  member.isActive === false
                    ? 'bg-slate-50/50 hover:bg-slate-100/50'
                    : 'hover:bg-primary-50/50'
                }`}
              >
                {/* 데스크톱 */}
                <div className="hidden sm:grid sm:grid-cols-[40px_1fr_80px_50px_130px_90px_90px] gap-3 px-5 py-3.5 items-center">
                  <span className="text-sm text-slate-400 text-center font-mono">
                    {(currentPage - 1) * itemsPerPage + index + 1}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-semibold truncate ${member.isActive === false ? 'text-slate-400' : 'text-slate-900'}`}>
                      {member.name}
                    </span>
                  </div>
                  <div>
                    {member.isActive === false ? (
                      <Badge variant="default">비활성</Badge>
                    ) : (
                      getRoleBadge(member.role)
                    )}
                  </div>
                  <div className="text-center">
                    {(() => {
                      const total = member.hikingCount ?? getHikingCount(member.id);
                      return total > 0 ? (
                        <div>
                          <span className="text-xs font-semibold text-blue-600">{total}회</span>
                          {(() => {
                            const currentYear = new Date().getFullYear().toString();
                            const yearCount = member.hikingCountByYear?.[currentYear];
                            return yearCount !== undefined && yearCount > 0 ? (
                              <div className="text-[10px] text-emerald-600">'{currentYear.slice(2)} {yearCount}회</div>
                            ) : null;
                          })()}
                        </div>
                      ) : <span className="text-xs text-slate-400">-</span>;
                    })()}
                  </div>
                  <span className={`text-sm truncate ${member.isActive === false ? 'text-slate-400' : 'text-slate-600'}`}>
                    {member.company || '-'}
                  </span>
                  <span className={`text-sm truncate ${member.isActive === false ? 'text-slate-400' : 'text-slate-600'}`}>
                    {member.position || member.occupation || '-'}
                  </span>
                  <span className={`text-xs text-center ${member.isActive === false ? 'text-slate-400' : 'text-slate-500'}`}>
                    {member.joinDate || '-'}
                  </span>
                </div>
                {/* 모바일 */}
                <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-slate-400 font-mono w-5 text-center flex-shrink-0">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold truncate ${member.isActive === false ? 'text-slate-400' : 'text-slate-900'}`}>
                          {member.name}
                        </span>
                        {(() => {
                          const total = member.hikingCount ?? getHikingCount(member.id);
                          return total > 0 ? (
                            <span className="text-[10px] font-semibold text-blue-600 flex-shrink-0">{total}회</span>
                          ) : null;
                        })()}
                      </div>
                      <span className={`text-xs ${member.isActive === false ? 'text-slate-400' : 'text-slate-500'}`}>
                        {member.company ? `${member.company}` : ''}{member.position ? ` · ${member.position}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {member.isActive === false ? (
                      <Badge variant="default">비활성</Badge>
                    ) : (
                      getRoleBadge(member.role)
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg text-slate-500">해당하는 회원이 없습니다.</p>
            {(roleFilter !== 'all' || statusFilter !== 'active' || searchTerm.trim()) && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-400">
                  적용된 필터:
                  {' '}
                  {{ all: '전체', chairman: '회장단', committee: '운영위원', member: '정회원', guest: '게스트' }[roleFilter] || roleFilter}
                  {' · '}
                  {statusFilter === 'inactive' ? '비활성' : '활성'}
                  {searchTerm.trim() && ` · 검색어 "${searchTerm}"`}
                </p>
                <button
                  onClick={() => { setRoleFilter('all'); setStatusFilter('active'); setSearchTerm(''); }}
                  className="text-sm text-primary-600 hover:text-primary-700 font-semibold underline"
                >
                  필터 초기화
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-slate-500">
            전체 {filteredMembers.length}명 중 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredMembers.length)}명
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:text-slate-300 disabled:cursor-not-allowed text-slate-600 hover:bg-slate-100"
            >
              이전
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - currentPage) <= 1) return true;
                return false;
              })
              .map((page, idx, arr) => (
                <span key={page}>
                  {idx > 0 && arr[idx - 1] !== page - 1 && (
                    <span className="px-1 text-slate-400">...</span>
                  )}
                  <button
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      currentPage === page
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {page}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:text-slate-300 disabled:cursor-not-allowed text-slate-600 hover:bg-slate-100"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {/* 회원 상세정보 모달 */}
      {isMemberDetailModalOpen && selectedMember && (
        <Modal
          onClose={() => {
            setIsMemberDetailModalOpen(false);
            setSelectedMember(null);
            setIsEditingMember(false);
          }}
          title="회원 상세정보"
          maxWidth="max-w-lg"
        >
          <div className="p-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">{selectedMember.name}</h3>
                <p className="text-sm text-slate-500 mt-1">ID: {selectedMember.id.slice(0, 12)}...</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedMember.isActive === false ? (
                  <Badge variant="default">비활성</Badge>
                ) : (
                  getRoleBadge(selectedMember.role)
                )}
                {!isEditingMember && (
                  <button
                    onClick={() => {
                      setIsEditingMember(true);
                      setEditMemberForm({
                        name: selectedMember.name || '',
                        company: selectedMember.company || '',
                        position: selectedMember.position || selectedMember.occupation || '',
                        phoneNumber: selectedMember.phoneNumber || '',
                      });
                    }}
                    className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    title="정보 수정"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {isEditingMember ? (
              /* 수정 모드 */
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">이름</label>
                  <input
                    type="text"
                    value={editMemberForm.name}
                    onChange={(e) => setEditMemberForm({ ...editMemberForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">연락처</label>
                  <input
                    type="text"
                    value={editMemberForm.phoneNumber}
                    onChange={(e) => setEditMemberForm({ ...editMemberForm, phoneNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">소속 (회사)</label>
                  <input
                    type="text"
                    value={editMemberForm.company}
                    onChange={(e) => setEditMemberForm({ ...editMemberForm, company: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="회사명"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">직책</label>
                  <input
                    type="text"
                    value={editMemberForm.position}
                    onChange={(e) => setEditMemberForm({ ...editMemberForm, position: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="직책"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={async () => {
                      try {
                        await updateMember(selectedMember.id, {
                          name: editMemberForm.name,
                          company: editMemberForm.company,
                          position: editMemberForm.position,
                          phoneNumber: editMemberForm.phoneNumber,
                        });
                        setSelectedMember({
                          ...selectedMember,
                          name: editMemberForm.name,
                          company: editMemberForm.company,
                          position: editMemberForm.position,
                          phoneNumber: editMemberForm.phoneNumber,
                        });
                        setIsEditingMember(false);
                        refreshMembers();
                        alert('회원 정보가 수정되었습니다.');
                      } catch (error) {
                        console.error('회원 정보 수정 실패:', error);
                        alert('회원 정보 수정에 실패했습니다.');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    저장
                  </button>
                  <button
                    onClick={() => setIsEditingMember(false)}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    취소
                  </button>
                </div>
              </div>
            ) : (
              /* 조회 모드 */
              <>
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">이메일</p>
                      <p className="text-sm text-slate-900 font-medium">{selectedMember.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">연락처</p>
                      <p className="text-sm text-slate-900 font-medium">{selectedMember.phoneNumber || '-'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">소속</p>
                      <p className="text-sm text-slate-900 font-medium">{selectedMember.company || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">직책</p>
                      <p className="text-sm text-slate-900 font-medium">{selectedMember.position || selectedMember.occupation || '-'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">입회일</p>
                      <p className="text-sm text-slate-900 font-medium">{selectedMember.joinDate || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">상태</p>
                      <p className="text-sm font-medium">
                        {selectedMember.isActive === false ? (
                          <span className="text-slate-400">비활성</span>
                        ) : (
                          <span className="text-emerald-600">활성</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* 산행 참여 횟수 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">산행 참여</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                          <TrendingUp className="w-3.5 h-3.5" />
                          총 {selectedMember.hikingCount ?? getHikingCount(selectedMember.id)}회
                        </span>
                        {(() => {
                          const currentYear = new Date().getFullYear().toString();
                          const yearCount = selectedMember.hikingCountByYear?.[currentYear];
                          return yearCount !== undefined ? (
                            <span className="inline-flex items-center px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                              {currentYear}년 {yearCount}회
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">역할</p>
                      <p className="text-sm font-medium">{getRoleBadge(selectedMember.role)}</p>
                    </div>
                  </div>
                  {selectedMember.bio && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">자기소개</p>
                      <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{selectedMember.bio}</p>
                    </div>
                  )}
                </div>

                {/* 게스트 → 정회원 승격 버튼 */}
                {selectedMember.role === 'guest' && (
                  <div className="pt-4 border-t border-slate-200 mb-3">
                    <button
                      onClick={async () => {
                        if (!confirm(`${selectedMember.name}님을 정회원으로 승격하시겠습니까?`)) return;
                        try {
                          await updateMember(selectedMember.id, { role: 'member' });
                          setSelectedMember({ ...selectedMember, role: 'member' as any });
                          refreshMembers();
                          alert(`${selectedMember.name}님이 정회원으로 승격되었습니다.`);
                        } catch (error) {
                          console.error('정회원 승격 실패:', error);
                          alert('정회원 승격에 실패했습니다.');
                        }
                      }}
                      className="w-full py-3 px-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <UserCheck className="w-5 h-5" />
                      정회원으로 승격
                    </button>
                  </div>
                )}

                {/* 활성화/비활성화 버튼 */}
                <div className={`${selectedMember.role !== 'guest' ? 'pt-4 border-t border-slate-200' : ''}`}>
                  <button
                    onClick={() => {
                      handleToggleMemberStatus(selectedMember.id);
                      setIsMemberDetailModalOpen(false);
                      setSelectedMember(null);
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                      selectedMember.isActive !== false
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-2 border-slate-300'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    <Power className="w-5 h-5" />
                    {selectedMember.isActive !== false ? '비활성화' : '활성화'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
        </>
      )}

      {/* Executives Tab */}
      {activeTab === 'executives' && (
        <>
          {/* 중요 안내 */}
          <div className="mb-8 p-5 bg-warning-50 border-2 border-warning-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-warning-700 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-warning-900 mb-2 text-lg">중요 안내</h3>
                <p className="text-warning-800 leading-relaxed">
                  운영진 정보의 추가, 수정, 삭제는 <strong>회장의 승인이 필요</strong>합니다. 
                  변경 사항 저장 시 본인 인증(Google/SMS/비밀번호)이 진행됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* 운영진 목록 상단 */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-slate-600">총 {executivesWithMemberBio.length}명</p>
            <button
              onClick={() => setIsAddingExecutive(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              추가
            </button>
          </div>

          {isExecutivesLoading ? (
            <Card className="mb-8">
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                <p className="text-slate-600 mt-4">운영진 정보를 불러오는 중...</p>
              </div>
            </Card>
          ) : executivesWithMemberBio.length === 0 ? (
            <Card className="mb-8">
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-xl text-slate-500">등록된 운영진이 없습니다.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 회장단 섹션 */}
              {executivesWithMemberBio.filter(e => e.category === 'chairman').length > 0 && (
                <Card className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="danger">회장단</Badge>
                    <span className="text-sm text-slate-500">
                      {executivesWithMemberBio.filter(e => e.category === 'chairman').length}명
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortByPosition(executivesWithMemberBio, 'chairman')
                      .map(exec => renderExecutiveCard(exec))}
                  </div>
                </Card>
              )}

              {/* 운영위원회 섹션 */}
              {executivesWithMemberBio.filter(e => e.category === 'committee').length > 0 && (
                <Card className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="info">운영위원회</Badge>
                    <span className="text-sm text-slate-500">
                      {executivesWithMemberBio.filter(e => e.category === 'committee').length}명
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortByPosition(executivesWithMemberBio, 'committee')
                      .map(exec => renderExecutiveCard(exec))}
                  </div>
                </Card>
              )}
            </>
          )}

          {/* 새 운영진 추가 모달 */}
          {isAddingExecutive && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="max-w-md w-full max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">
                  새 운영진 추가
                </h3>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      회원 검색
                    </label>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="text"
                          value={executiveSearchQuery}
                          onChange={(e) => {
                            setExecutiveSearchQuery(e.target.value);
                            setShowExecutiveSearchResults(true);
                          }}
                          onFocus={() => setShowExecutiveSearchResults(true)}
                          className="w-full pl-11 pr-10 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="회원 이름, 직급, 회사 검색..."
                        />
                        {executiveSearchQuery && (
                          <button
                            onClick={() => resetExecutiveSearch(true)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                      
                      {showExecutiveSearchResults && executiveSearchQuery && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {getFilteredMembersForExecutive(executiveSearchQuery).length > 0 ? (
                            getFilteredMembersForExecutive(executiveSearchQuery).map((member) => (
                              <button
                                key={member.id}
                                onClick={() => handleMemberSelectNewExecutive(member)}
                                className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors border-b border-slate-100 last:border-b-0"
                              >
                                <p className="font-medium text-slate-900">{member.name}</p>
                                <p className="text-sm text-slate-600">
                                  {member.company} {member.position}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">{member.phoneNumber}</p>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-center text-slate-500">
                              검색 결과가 없습니다.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      회원 DB에서 검색하여 선택하세요. 선택 시 정보가 자동으로 입력됩니다.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      구분
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="category"
                          value="chairman"
                          checked={newExecutive.category === 'chairman'}
                          onChange={(e) => setNewExecutive({ ...newExecutive, category: e.target.value as 'chairman' | 'committee' })}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-slate-700">회장단</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="category"
                          value="committee"
                          checked={newExecutive.category === 'committee'}
                          onChange={(e) => setNewExecutive({ ...newExecutive, category: e.target.value as 'chairman' | 'committee' })}
                          className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-slate-700">운영위원회</span>
                      </label>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      직책
                    </label>
                    <input
                      type="text"
                      value={newExecutive.position}
                      onChange={(e) =>
                        setNewExecutive({ ...newExecutive, position: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="예: 회장, 부위원장, 재무"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        임기 시작
                      </label>
                      <input
                        type="month"
                        value={newExecutive.startTerm}
                        onChange={(e) =>
                          setNewExecutive({ ...newExecutive, startTerm: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        임기 종료
                      </label>
                      <input
                        type="month"
                        value={newExecutive.endTerm}
                        onChange={(e) =>
                          setNewExecutive({ ...newExecutive, endTerm: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  {newExecutive.memberId && (
                    <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg">
                      <p className="text-sm font-medium text-primary-900 mb-1">선택된 회원 정보</p>
                      <div className="text-xs text-primary-700 space-y-1">
                        <p>이름: {newExecutive.name}</p>
                        <p>연락처: {newExecutive.phoneNumber}</p>
                        {newExecutive.email && <p>이메일: {newExecutive.email}</p>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleAddNewExecutive}
                    disabled={!newExecutive.memberId || !newExecutive.position || !newExecutive.startTerm || !newExecutive.endTerm}
                    className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingExecutive(false);
                      setNewExecutive({
                        memberId: undefined,
                        name: '',
                        position: '',
                        phoneNumber: '',
                        email: '',
                        category: 'chairman',
                        company: '',
                        startTerm: '',
                        endTerm: '',
                        bio: '',
                      });
                      setExecutiveSearchQuery('');
                      setShowExecutiveSearchResults(false);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    취소
                  </button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* 관리자 재인증 모달 (인증 방식별 분기) */}
      {isVerifyModalOpen && (
        <Modal
          onClose={handleVerifyCancel}
          maxWidth="max-w-md"
        >
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-slate-900" />
            </div>
            
            <h3 className="text-xl font-bold text-slate-900 mb-2">관리자 본인 인증</h3>
            <p className="text-slate-600 mb-6">
              중요한 작업을 수행하기 위해 본인 인증이 필요합니다
            </p>

            {/* 이메일/비밀번호 인증 */}
            {verifyProvider === 'email' && (
              <div className="text-left mb-6">
                <label className="block text-slate-700 font-semibold mb-2">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isVerifying) {
                      handlePasswordConfirm();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg border-2 border-slate-300 focus:border-slate-500 focus:ring-4 focus:ring-slate-200 outline-none transition-all text-base"
                  placeholder="현재 로그인한 계정의 비밀번호"
                  autoFocus
                  disabled={isVerifying}
                />
                <p className="text-xs text-slate-500 mt-2">
                  {user?.email}
                </p>
              </div>
            )}

            {/* 휴대폰 SMS 인증 */}
            {verifyProvider === 'phone' && (
              <div className="text-left mb-6">
                {!phoneCodeSent ? (
                  <div>
                    <p className="text-sm text-slate-600 mb-3">
                      등록된 휴대폰 번호로 인증코드를 전송합니다.
                    </p>
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
                      <Phone className="w-5 h-5 text-slate-500" />
                      <span className="text-slate-700 font-medium">{auth.currentUser?.phoneNumber || '번호 없음'}</span>
                    </div>
                    <div id="reauth-recaptcha-container"></div>
                    <button
                      onClick={handleSendPhoneCode}
                      disabled={isSendingCode}
                      className="w-full py-3 rounded-lg font-bold text-base bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {isSendingCode ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          전송 중...
                        </>
                      ) : (
                        <>
                          <Phone className="w-5 h-5" />
                          인증코드 전송
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-2">
                      인증코드 입력
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={phoneCodeInput}
                      onChange={(e) => setPhoneCodeInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isVerifying) {
                          handleVerifyPhoneCode();
                        }
                      }}
                      className="w-full px-4 py-3 rounded-lg border-2 border-slate-300 focus:border-slate-500 focus:ring-4 focus:ring-slate-200 outline-none transition-all text-xl text-center tracking-[0.3em]"
                      placeholder="6자리 인증코드"
                      maxLength={6}
                      autoFocus
                      disabled={isVerifying}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      {auth.currentUser?.phoneNumber}(으)로 전송된 코드를 입력하세요
                    </p>
                    <button
                      onClick={() => { setPhoneCodeSent(false); setPhoneCodeInput(''); cleanupReauthSession(); }}
                      className="text-sm text-primary-600 hover:text-primary-700 mt-2 font-medium"
                    >
                      인증코드 다시 받기
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Google 인증 (팝업이 닫혔을 때 폴백) */}
            {verifyProvider === 'google' && (
              <div className="text-left mb-6">
                <p className="text-sm text-slate-600 mb-4">
                  Google 계정으로 재인증합니다. 버튼을 클릭하면 Google 로그인 팝업이 표시됩니다.
                </p>
                <button
                  onClick={() => verifyAction && handleGoogleReauth(verifyAction)}
                  disabled={isVerifying}
                  className="w-full py-3 rounded-lg font-bold text-base bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                >
                  {isVerifying ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-600 border-t-transparent"></div>
                      인증 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google 계정으로 인증
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 알 수 없는 인증 방식 */}
            {verifyProvider === 'unknown' && (
              <div className="text-left mb-6">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    인증 제공자를 확인할 수 없습니다. 로그아웃 후 다시 로그인해주세요.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleVerifyCancel}
                className="flex-1 py-3 rounded-lg font-bold text-base text-slate-700 border-2 border-slate-300 hover:bg-slate-50 transition-all"
                disabled={isVerifying}
              >
                취소
              </button>
              {/* 이메일/비밀번호: 확인 버튼 */}
              {verifyProvider === 'email' && (
                <button
                  onClick={handlePasswordConfirm}
                  disabled={isVerifying || !passwordInput}
                  className="flex-1 py-3 rounded-lg font-bold text-base bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      확인 중...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      확인
                    </>
                  )}
                </button>
              )}
              {/* SMS: 인증코드 확인 버튼 */}
              {verifyProvider === 'phone' && phoneCodeSent && (
                <button
                  onClick={handleVerifyPhoneCode}
                  disabled={isVerifying || phoneCodeInput.length < 6}
                  className="flex-1 py-3 rounded-lg font-bold text-base bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      확인 중...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      인증 확인
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MemberManagement;
