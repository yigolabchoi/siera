import { useState, useMemo, useEffect } from 'react';
import { 
  BookOpen, 
  Award, 
  FileText, 
  Users, 
  Calendar,
  Shield,
  Mountain,
  TrendingUp,
  CheckCircle,
  Mail,
  Phone,
  Briefcase,
  Building2
} from 'lucide-react';
import { useRules } from '../contexts/RulesContext';
import { useExecutives } from '../contexts/ExecutiveContext';
import { useMembers } from '../contexts/MemberContext';
import { useHistories } from '../contexts/HistoryContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import { sortByPosition } from '../utils/executiveOrder';

type TabType = 'rules' | 'history' | 'organization' | 'membership';

const ClubInfo = () => {
  const [activeTab, setActiveTab] = useState<TabType>('rules');
  const { rulesData } = useRules();
  const { executives, isLoading: executivesLoading } = useExecutives();
  const { members, isLoading: membersLoading } = useMembers();
  const { histories, isLoading: historiesLoading, _activate: activateHistories } = useHistories();

  // 운영진과 members 데이터 병합 (members의 bio 우선 사용)
  const executivesWithMemberData = useMemo(() => {
    return executives.map(exec => {
      const memberData = members.find(m => m.id === exec.memberId);
      return {
        ...exec,
        displayBio: memberData?.bio || exec.bio,
      };
    });
  }, [executives, members]);

  // 연혁 탭 활성화 시 데이터 로드
  useEffect(() => {
    if (activeTab === 'history') {
      activateHistories();
    }
  }, [activeTab, activateHistories]);

  // 회장단과 운영위원회 분리 (직책 순서 정렬: 회원명부와 동일)
  const chairmanGroup = sortByPosition(executivesWithMemberData, 'chairman');
  const committeeGroup = sortByPosition(executivesWithMemberData, 'committee');

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* 로딩 상태 */}
      {(executivesLoading || membersLoading) ? (
        <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-16 sm:w-16 border-b-4 border-slate-900 mx-auto mb-3 sm:mb-4"></div>
            <p className="text-base sm:text-xl text-slate-600 font-medium">동아리 정보를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'rules', label: '회칙' },
          { key: 'history', label: '연혁' },
          { key: 'organization', label: '조직 구성' },
          { key: 'membership', label: '회원 혜택' },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as TabType)}
        className="mb-4 sm:mb-8"
      />

      {/* ========== 회칙 탭 ========== */}
      {activeTab === 'rules' && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            {/* 헤더: 모바일에서 세로 스택 */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-slate-100 rounded-lg sm:rounded-xl flex-shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-900">시애라 클럽 회칙</h2>
                  <p className="text-sm sm:text-base text-slate-600 mt-0.5 sm:mt-1">클럽 운영의 기본 규정</p>
                </div>
              </div>
              <div className="flex items-center sm:flex-col sm:items-end gap-2 sm:gap-1 ml-10 sm:ml-0">
                <Badge variant="primary">버전 {rulesData.version}</Badge>
                <span className="text-xs text-slate-500">시행일: {rulesData.effectiveDate}</span>
              </div>
            </div>
            
            <div className="prose prose-slate max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-xs sm:text-sm bg-slate-50 p-3 sm:p-6 rounded-lg border border-slate-200">
{rulesData.content}
              </pre>
            </div>
          </Card>

          {/* 개정 이력 */}
          {rulesData.amendments.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="p-2 sm:p-3 bg-blue-100 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-slate-900">개정 이력</h3>
                  <p className="text-xs sm:text-sm text-slate-600">회칙 변경 내역</p>
                </div>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {[...rulesData.amendments].reverse().map((amendment, index) => {
                  const isLatest = index === 0;
                  return (
                    <div
                      key={`${amendment.version}-${index}`}
                      className={`p-3 sm:p-5 rounded-lg sm:rounded-xl border-2 transition-all ${
                        isLatest 
                          ? 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2 sm:mb-3">
                        <Badge variant={isLatest ? "primary" : "default"}>
                          버전 {amendment.version}
                        </Badge>
                        {isLatest && (
                          <Badge variant="success">최신</Badge>
                        )}
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="font-semibold">{amendment.date}</span>
                        </div>
                      </div>
                      <p className="text-sm sm:text-base text-slate-700 leading-relaxed">{amendment.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs sm:text-sm text-slate-600">
                  <strong className="text-slate-900">📌 안내:</strong> 회칙 개정은 대의원회의 의결을 거쳐 진행됩니다. 
                  최신 버전이 현재 시행 중인 회칙입니다.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ========== 연혁 탭 ========== */}
      {activeTab === 'history' && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-6">시애라 클럽 연혁</h2>
            <p className="text-sm sm:text-base text-slate-600 mb-5 sm:mb-8">2005년 창립 이래 걸어온 발자취</p>

            {historiesLoading ? (
              <div className="text-center py-8 sm:py-12">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-primary-600 mx-auto mb-3 sm:mb-4"></div>
                <p className="text-sm sm:text-base text-slate-600">로딩 중...</p>
              </div>
            ) : histories.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-slate-500">
                등록된 연혁이 없습니다.
              </div>
            ) : (
              <div className="space-y-6 sm:space-y-8">
                {histories.map((entry, index) => {
                  const isFirst = index === 0;
                  const isLast = index === histories.length - 1;
                  return (
                    <div key={entry.id} className={`relative pl-6 sm:pl-8 ${isLast ? '' : 'border-l-2 border-slate-200'}`}>
                      <div className={`absolute -left-[7px] sm:-left-[9px] top-0 w-3.5 h-3.5 sm:w-4 sm:h-4 ${isFirst ? 'bg-slate-900' : 'bg-slate-700'} rounded-full`}></div>
                      <div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                          <span className="text-sm font-bold text-slate-900">{entry.year}</span>
                          <Badge variant="primary">{entry.badge}</Badge>
                        </div>
                        <ul className="space-y-1.5 sm:space-y-2 text-slate-700">
                          {entry.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5 sm:gap-2">
                              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <span className="text-sm sm:text-base">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 주요 성과 */}
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">주요 성과</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-6">
              {[
                { value: '240+', label: '누적 산행 횟수' },
                { value: '150+', label: '현재 회원 수' },
                { value: '15+', label: '해외 산행 횟수' },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-3 sm:p-6 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
                  <p className="text-2xl sm:text-4xl font-bold text-slate-900 mb-1 sm:mb-2">{stat.value}</p>
                  <p className="text-xs sm:text-base text-slate-600 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ========== 조직 구성 탭 ========== */}
      {activeTab === 'organization' && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-6">시애라 운영진</h2>
            <p className="text-sm sm:text-base text-slate-600 mb-5 sm:mb-8">2026 시애라 운영진을 소개합니다.</p>

            {executivesLoading ? (
              <div className="text-center py-8 sm:py-12">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-primary-600 mx-auto mb-3 sm:mb-4"></div>
                <p className="text-sm sm:text-base text-slate-600">로딩 중...</p>
              </div>
            ) : (
              <>
                {/* 회장단 */}
                <div className="mb-6 sm:mb-8">
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-xl font-bold text-slate-900">회장단</h3>
                    <Badge variant="primary">최고 의사 결정 기구</Badge>
                  </div>
                  {chairmanGroup.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {chairmanGroup.map((exec) => (
                        <div key={exec.id} className="p-3 sm:p-5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl">
                          <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                            <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                              exec.position === '회장' ? 'bg-slate-900' : 'bg-slate-700'
                            }`}>
                              <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm text-slate-500">{exec.position}</p>
                              <p className="font-bold text-sm sm:text-base text-slate-900">{exec.name}</p>
                              {exec.company && (
                                <p className="text-xs sm:text-sm text-slate-600 truncate">{exec.company}</p>
                              )}
                            </div>
                          </div>
                          
                          {exec.displayBio && (
                            <div className="mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-slate-200">
                              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{exec.displayBio}</p>
                            </div>
                          )}
                          
                          <div className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-slate-600">
                            {exec.email && (
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{exec.email}</span>
                              </div>
                            )}
                            {exec.phoneNumber && (
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                                <span>{exec.phoneNumber}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-slate-500">
                      등록된 회장단이 없습니다.
                    </div>
                  )}
                </div>

                {/* 운영위원 */}
                <div>
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-xl font-bold text-slate-900">운영위원회</h3>
                    <Badge variant="primary">실무 운영 조직</Badge>
                  </div>
                  {committeeGroup.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {committeeGroup.map((exec) => (
                        <div key={exec.id} className="p-3 sm:p-5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl">
                          <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                            <div className="w-9 h-9 sm:w-12 sm:h-12 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <Users className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm text-slate-500">{exec.position}</p>
                              <p className="font-bold text-sm sm:text-base text-slate-900">{exec.name}</p>
                              {exec.company && (
                                <p className="text-xs sm:text-sm text-slate-600 truncate">{exec.company}</p>
                              )}
                            </div>
                          </div>
                          
                          {exec.displayBio && (
                            <div className="mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-slate-200">
                              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{exec.displayBio}</p>
                            </div>
                          )}
                          
                          <div className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-slate-600">
                            {exec.email && (
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                                <span className="truncate">{exec.email}</span>
                              </div>
                            )}
                            {exec.phoneNumber && (
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 flex-shrink-0" />
                                <span>{exec.phoneNumber}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 sm:py-8 text-sm sm:text-base text-slate-500">
                      등록된 운영위원이 없습니다.
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* 조직 운영 방식 */}
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">조직 운영 방식</h2>
            <div className="space-y-2.5 sm:space-y-4">
              {[
                { title: '정기 운영위원회', desc: '매월 첫째 주 개최, 주요 안건 논의 및 의결' },
                { title: '정기 총회', desc: '연 1회 개최, 전년도 결산 및 당해 연도 운영 계획 승인' },
                { title: '임원 선출', desc: '2년 임기, 총회에서 선출 (연임 가능)' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
                  <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-0.5 sm:mb-1">{item.title}</h3>
                    <p className="text-xs sm:text-base text-slate-700">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ========== 회원 혜택 탭 ========== */}
      {activeTab === 'membership' && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-6">회원 혜택</h2>
            <p className="text-sm sm:text-base text-slate-600 mb-5 sm:mb-8">시애라 클럽 회원만의 특별한 혜택</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
              {[
                {
                  icon: Mountain,
                  title: '월 1회 정기 산행',
                  items: [
                    '매월 둘째 주 토요일 정기 산행',
                    '전문 등산대장의 안전한 산행 진행',
                    '다양한 난이도의 코스 선택 가능',
                  ],
                },
                {
                  icon: Users,
                  title: '네트워킹',
                  items: [
                    '다양한 분야 임원들과의 친목 도모',
                    '비즈니스 네트워크 확장 기회',
                    '정기 친목 행사 참여',
                  ],
                },
                {
                  icon: Award,
                  title: '특별 산행',
                  items: [
                    '연 2회 1박 이상 특별 산행',
                    '국내외 명산 등반 기회',
                    '힐링과 친목을 겸한 특별 프로그램',
                  ],
                },
                {
                  icon: FileText,
                  title: '회원 서비스',
                  items: [
                    '온라인 산행 신청 시스템',
                    '사진 갤러리 및 후기 공유',
                    '회원 전용 게시판 이용',
                  ],
                },
              ].map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div key={benefit.title} className="p-4 sm:p-6 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl">
                    <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                      <div className="p-2 sm:p-3 bg-slate-900 rounded-lg sm:rounded-xl flex-shrink-0">
                        <Icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                      </div>
                      <h3 className="text-base sm:text-xl font-bold text-slate-900">{benefit.title}</h3>
                    </div>
                    <ul className="space-y-1.5 sm:space-y-2 text-slate-700">
                      {benefit.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 sm:gap-2">
                          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span className="text-sm sm:text-base">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 가입 안내 */}
          <Card>
            <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">가입 안내</h2>
            <div className="space-y-2.5 sm:space-y-4">
              {[
                {
                  step: 1,
                  title: '가입 자격',
                  content: '건전한 등산 문화를 추구하며, 본 회의 목적에 찬동하는 만 25세 이상 성인',
                },
                {
                  step: 2,
                  title: '가입 절차',
                  content: '기존 회원 추천 → 게스트 참가 (최대 3회) → 가입 신청 → 운영위원회 심의 → 승인',
                },
                {
                  step: 3,
                  title: '회비 안내',
                  content: null,
                  details: [
                    '연회비: ₩250,000 (매년 1월)',
                    '월별 산행비: ₩60,000',
                    '특별 산행비: 별도 책정',
                  ],
                },
                {
                  step: 4,
                  title: '문의',
                  content: '가입 문의: 운영위원장 이응정 (010-8876-0605)',
                },
              ].map((item) => (
                <div key={item.step} className="p-3 sm:p-5 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 bg-slate-900 text-white rounded-full text-xs sm:text-sm font-bold flex-shrink-0 mt-0.5 sm:mt-1">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-1 sm:mb-2">{item.title}</h3>
                      {item.content && (
                        <p className="text-xs sm:text-base text-slate-700">{item.content}</p>
                      )}
                      {item.details && (
                        <div className="text-xs sm:text-base text-slate-700 space-y-0.5 sm:space-y-1">
                          {item.details.map((d, i) => (
                            <p key={i}>• {d}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default ClubInfo;
