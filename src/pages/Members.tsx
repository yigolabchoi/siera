import { Users, Search, Mail, Briefcase, Award, X, Shield, TrendingUp, UserCheck, Calendar, Phone, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { useState, useMemo, useRef, useCallback } from 'react';
import { useMembers } from '../contexts/MemberContext';
import { useExecutives } from '../contexts/ExecutiveContext';
import { sortExecutives } from '../utils/executiveOrder';
import Modal from '../components/ui/Modal';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import StatCard from '../components/ui/StatCard';
import { getMemberPhoto } from '../utils/memberPhoto';
import { formatPhoneNumber } from '../utils/format';

// Fisher-Yates 셔플 알고리즘
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const Members = () => {
  const { members, isLoading } = useMembers();
  const { executives, isLoading: isExecutivesLoading } = useExecutives();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const memberListRef = useRef<HTMLDivElement>(null);
  const itemsPerPage = 27;

  // 페이지 변경 시 리스트 상단으로 스크롤
  const handlePageChange = useCallback((page: number | ((prev: number) => number)) => {
    setCurrentPage(page);
    // 다음 렌더 후 리스트 상단으로 스크롤
    setTimeout(() => {
      memberListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);
  
  // 활성화된 정회원만 필터링 (비활성, 게스트, 병합된 계정 제외)
  const activeMembers = useMemo(() => {
    return members.filter(m => m.isActive !== false && m.role !== 'guest' && !(m as any).mergedInto);
  }, [members]);

  // 회원을 운영진과 일반 회원으로 분리
  // executives 컬렉션의 데이터를 사용하고, members 데이터와 병합
  const executivesWithMemberData = useMemo(() => {
    const merged = executives
      .filter(exec => exec.memberId) // memberId가 있는 운영진만
      .map(exec => {
        const memberData = activeMembers.find(m => m.id === exec.memberId);
        return {
          ...exec,
          ...memberData,
          // executive의 position을 우선 사용 (시애라 직책)
          executivePosition: exec.position,
          // member의 position은 직장 직책
          jobPosition: memberData?.position,
          // members에 매칭되는 데이터가 있는지
          hasMemberData: !!memberData,
        };
      })
      .filter(exec => exec.hasMemberData); // 비활성 회원의 운영진 데이터도 제외

    // 직책 순서로 정렬 (회장단: 회장→운영위원장→등산대장→운영감사→재무감사 / 운영위원회: 부위원장→재무→기획→홍보/청년)
    return sortExecutives(merged.map(e => ({ ...e, position: e.executivePosition })))
      .map(e => ({ ...e, executivePosition: e.position }));
  }, [executives, activeMembers]);
  
  const regularMembers = useMemo(() => {
    // executives에 포함되지 않은 회원만 일반 회원으로 표시
    // memberId가 유효하고 실제 members에 존재하는 경우만 제외
    const executiveMemberIds = new Set(
      executives
        .map(e => e.memberId)
        .filter((id): id is string => !!id)
    );
    const filtered = activeMembers.filter(m => !executiveMemberIds.has(m.id));
    // 매번 랜덤 순서로 표시
    return shuffleArray(filtered);
  }, [activeMembers, executives]);
  
  // 검색 필터링 — 운영진 포함 전체 활성 회원 대상
  const filteredMembers = useMemo(() => {
    if (!searchTerm) return activeMembers;
    const term = searchTerm.toLowerCase();
    return activeMembers.filter(
      m => m.name.toLowerCase().includes(term) ||
           m.company?.toLowerCase().includes(term) ||
           m.position?.toLowerCase().includes(term)
    );
  }, [activeMembers, searchTerm]);

  // 페이지네이션
  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMembers.slice(start, start + itemsPerPage);
  }, [filteredMembers, currentPage]);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'chairman': return '회장단';
      case 'committee': return '운영위원';
      case 'guest': return '게스트';
      default: return '정회원'; // admin, member 모두 '정회원'으로 표시
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'chairman': return 'primary';
      case 'committee': return 'info';
      default: return 'default'; // admin도 기본 뱃지로 표시
    }
  };

  if (isLoading || isExecutivesLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">회원 명부를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 로딩 상태 */}
      {(isLoading || isExecutivesLoading) ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-slate-900 mx-auto mb-4"></div>
            <p className="text-xl text-slate-600 font-medium">회원 정보를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users className="w-8 h-8" />} label="전체 회원" value={activeMembers.length} unit="명" iconColor="text-blue-600" />
        <StatCard icon={<UserCheck className="w-8 h-8" />} label="정회원" value={regularMembers.length} unit="명" iconColor="text-blue-600" />
        <StatCard icon={<Shield className="w-8 h-8" />} label="회장단" value={executives.filter(e => e.category === 'chairman').length} unit="명" iconColor="text-amber-600" />
        <StatCard icon={<Award className="w-8 h-8" />} label="운영위원" value={executives.filter(e => e.category === 'committee').length} unit="명" iconColor="text-emerald-600" />
      </div>

      {/* 운영진 섹션 */}
      {executivesWithMemberData.length > 0 && (
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6">운영진</h2>
          
          {/* 회장단 */}
          {executivesWithMemberData.filter(e => e.category === 'chairman').length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                회장단
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {executivesWithMemberData.filter(e => e.category === 'chairman').map((exec) => (
                  <div
                    key={exec.id}
                    className="text-center p-4 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedMember(exec)}
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-3 bg-slate-200">
                      {getMemberPhoto(exec.name, exec.profileImage, exec.phoneNumber) ? (
                        <img
                          src={getMemberPhoto(exec.name, exec.profileImage, exec.phoneNumber)!}
                          alt={exec.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Users className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{exec.name}</h3>
                    <Badge variant="primary" size="sm">
                      {exec.executivePosition}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 운영위원회 */}
          {executivesWithMemberData.filter(e => e.category === 'committee').length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4" />
                운영위원회
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {executivesWithMemberData.filter(e => e.category === 'committee').map((exec) => (
                  <div
                    key={exec.id}
                    className="text-center p-4 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedMember(exec)}
                  >
                    <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-3 bg-slate-200">
                      {getMemberPhoto(exec.name, exec.profileImage, exec.phoneNumber) ? (
                        <img
                          src={getMemberPhoto(exec.name, exec.profileImage, exec.phoneNumber)!}
                          alt={exec.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <Users className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{exec.name}</h3>
                    <Badge variant="info" size="sm">
                      {exec.executivePosition}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 검색 */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="이름, 회사, 직책으로 검색..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 회원 목록 */}
      <div ref={memberListRef} />
      {filteredMembers.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            {searchTerm ? '검색 결과가 없습니다' : '등록된 회원이 없습니다'}
          </h3>
          <p className="text-slate-600">
            {searchTerm ? '다른 검색어를 입력해보세요.' : '첫 번째 회원을 등록해보세요.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedMembers.map((member) => (
              <Card
                key={member.id}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedMember(member)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                    {getMemberPhoto(member.name, member.profileImage, member.phoneNumber) ? (
                      <img
                        src={getMemberPhoto(member.name, member.profileImage, member.phoneNumber)!}
                        alt={member.name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 truncate">{member.name}</h3>
                      <Badge variant={getRoleBadgeVariant(member.role)} size="sm">
                        {getRoleLabel(member.role)}
                      </Badge>
                    </div>
                    
                    {(member.company || member.position) && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                        <Briefcase className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">
                          {[member.company, member.position].filter(Boolean).join(' / ')}
                        </span>
                      </div>
                    )}

                    {member.bio && (
                      <p className="text-xs text-slate-400 truncate">
                        {member.bio.length > 15 ? member.bio.slice(0, 15) + '…' : member.bio}
                      </p>
                    )}
                    
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-3 mt-8">
              <p className="text-sm text-slate-500">
                전체 {filteredMembers.length}명 중 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredMembers.length)}명
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(p => Math.max(1, p - 1))}
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
                        onClick={() => handlePageChange(page)}
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
                  onClick={() => handlePageChange(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:text-slate-300 disabled:cursor-not-allowed text-slate-600 hover:bg-slate-100"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 회원 상세 모달 */}
      {selectedMember && (
        <Modal
          onClose={() => setSelectedMember(null)}
          title="회원 정보"
        >
          <div className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div className="w-56 h-56 rounded-full overflow-hidden mb-4 bg-slate-200 ring-4 ring-slate-100 shadow-lg">
                {getMemberPhoto(selectedMember.name, selectedMember.profileImage, selectedMember.phoneNumber) ? (
                  <img
                    src={getMemberPhoto(selectedMember.name, selectedMember.profileImage, selectedMember.phoneNumber)!}
                    alt={selectedMember.name}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Users className="w-24 h-24" />
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedMember.name}</h2>
              {selectedMember.executivePosition ? (
                <Badge variant={selectedMember.category === 'chairman' ? 'primary' : 'info'}>
                  {selectedMember.executivePosition}
                </Badge>
              ) : (
                <Badge variant={getRoleBadgeVariant(selectedMember.role)}>
                  {getRoleLabel(selectedMember.role)}
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              {selectedMember.executivePosition && (
                <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Shield className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-emerald-700 font-semibold">시애라 클럽 직책</p>
                    <p className="font-medium text-emerald-900">{selectedMember.executivePosition}</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      {selectedMember.category === 'chairman' ? '회장단' : '운영위원회'}
                    </p>
                  </div>
                </div>
              )}

              {selectedMember.company && (
                <div className="flex items-start gap-3">
                  <Briefcase className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">회사</p>
                    <p className="font-medium text-slate-900">{selectedMember.company}</p>
                  </div>
                </div>
              )}

              {(selectedMember.jobPosition || selectedMember.position) && (
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">직책</p>
                    <p className="font-medium text-slate-900">
                      {selectedMember.jobPosition || selectedMember.position}
                    </p>
                  </div>
                </div>
              )}

              {(selectedMember.phoneNumber || selectedMember.phone) && (
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">연락처</p>
                    <p className="font-medium text-slate-900">{formatPhoneNumber(selectedMember.phoneNumber || selectedMember.phone)}</p>
                  </div>
                </div>
              )}

              {selectedMember.joinDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">가입일</p>
                    <p className="font-medium text-slate-900">{selectedMember.joinDate}</p>
                  </div>
                </div>
              )}

              {selectedMember.hikingCount !== undefined && (
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">참여 횟수</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-blue-600">총 {selectedMember.hikingCount}회</p>
                      {(() => {
                        const currentYear = new Date().getFullYear().toString();
                        const yearCount = selectedMember.hikingCountByYear?.[currentYear];
                        return yearCount !== undefined ? (
                          <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            {currentYear}년 {yearCount}회
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {selectedMember.bio && (
                <div className="flex items-start gap-3 pt-4 border-t">
                  <MessageSquare className="w-5 h-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-slate-600">자기소개</p>
                    <p className="font-medium text-slate-900 whitespace-pre-line">{selectedMember.bio}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      
      </>
      )}
    </div>
  );
};

export default Members;
