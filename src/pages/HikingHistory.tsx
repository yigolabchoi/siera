import { Calendar, MapPin, Users, Mountain, ChevronRight, MessageSquare, Plus, Edit2, Trash2, X, CalendarX, UserCheck, Phone } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { useHikingHistory } from '../contexts/HikingHistoryContext';
import { useEvents } from '../contexts/EventContext';
import { useGallery } from '../contexts/GalleryContext';
import { formatPhoneNumber } from '../utils/format';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import FilterGroup from '../components/ui/FilterGroup';
import { Team } from '../types';

const HikingHistory = () => {
  const { user, isAdmin } = useAuth();
  const { history, isLoading, getHistoryByYear, addComment, updateComment, deleteComment, getCommentsByHikeId } = useHikingHistory();
  const { events, getParticipantsByEventId, getTeamsByEventId } = useEvents();
  const { photos } = useGallery();
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedHikeId, setSelectedHikeId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<Team[]>([]);
  const [selectedTeamEventTitle, setSelectedTeamEventTitle] = useState('');
  
  // 완료된 이벤트를 산행 이력으로 변환
  const completedEvents = useMemo(() => {
    return events
      .filter(event => event.status === 'completed')
      .map(event => {
        const eventDate = new Date(event.date);
        const isValidDate = !isNaN(eventDate.getTime());
        const participants = getParticipantsByEventId(event.id);
        
        // 해당 이벤트의 사진 개수 계산
        const photoCount = photos.filter(photo => photo.eventId === event.id).length;

        // 날짜가 유효하지 않은 경우 date 문자열에서 직접 파싱
        let year = '';
        let month = '';
        if (isValidDate) {
          year = eventDate.getFullYear().toString();
          month = (eventDate.getMonth() + 1).toString().padStart(2, '0');
        } else if (event.date) {
          // "2026-02-22" 또는 "2026-02" 형태에서 직접 추출
          const parts = event.date.split('-');
          year = parts[0] || new Date().getFullYear().toString();
          month = (parts[1] || '01').padStart(2, '0');
        } else {
          year = new Date().getFullYear().toString();
          month = '01';
        }
        
        return {
          id: event.id,
          eventId: event.id,
          year,
          month,
          date: event.date,
          mountain: event.mountain || event.location || event.title,
          location: event.location,
          difficulty: event.difficulty,
          distance: event.courses?.[0]?.distance || '',
          duration: event.courses?.[0]?.duration || '',
          participants: participants.length || event.currentParticipants || 0,
          summary: event.description,
          imageUrl: event.imageUrl,
          isSpecial: event.isSpecial || false,
          photoCount: photoCount,
          eventNumber: event.eventNumber,
        };
      });
  }, [events, getParticipantsByEventId, photos]);
  
  // 기존 산행 이력과 완료된 이벤트 병합
  const combinedHistory = useMemo(() => {
    // 산 이름 정규화: 공백 제거 + 소문자 (예: "주금산" == "주 금산" 방지)
    const normalize = (s: string) => (s || '').trim().replace(/\s+/g, '');

    // hikingHistory 항목의 ID 집합
    const historyIds = new Set(history.map(h => h.id));
    // month 필드가 없는 경우 date에서 추출 (수동 등록 항목 대응)
    const getMonth = (h: { month?: string; date?: string }) =>
      h.month || (h.date ? h.date.split('-')[1] || '01' : '01');

    // hikingHistory 항목의 연도+월+산이름 집합 (ID가 달라도 같은 산행이면 중복 방지)
    const historyKeys = new Set(
      history.map(h => `${h.year}-${getMonth(h)}-${normalize(h.mountain)}`)
    );

    // completedEvents 중 hikingHistory에 없는 것만 추가
    const newEvents = completedEvents.filter(e => {
      if (historyIds.has(e.id)) return false; // 같은 ID
      if (historyIds.has(e.eventId || '')) return false; // eventId로 연결된 경우
      const key = `${e.year}-${e.month}-${normalize(e.mountain)}`;
      if (historyKeys.has(key)) return false; // 같은 연도+월+산이름
      return true;
    });

    return [...history, ...newEvents].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [history, completedEvents]);
  
  // 연도 목록 생성
  const years = useMemo(() => {
    const uniqueYears = Array.from(new Set(combinedHistory.map(h => h.year)));
    return uniqueYears.sort((a, b) => parseInt(b) - parseInt(a));
  }, [combinedHistory]);

  // 선택된 연도의 산행 이력
  const yearHistory = useMemo(() => {
    return combinedHistory.filter(h => h.year === selectedYear);
  }, [selectedYear, combinedHistory]);
  
  // 월별로 그룹화
  const groupedByMonth = useMemo(() => {
    const grouped: Record<string, typeof yearHistory> = {};
    yearHistory.forEach(hike => {
      const key = `${hike.year}-${hike.month}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(hike);
    });
    return grouped;
  }, [yearHistory]);

  const months = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  // 후기 추가
  const handleAddComment = async () => {
    if (!selectedHikeId || !newComment.trim() || !user) return;
    
    try {
      await addComment(selectedHikeId, newComment.trim(), user.id, user.name);
      setNewComment('');
      setShowCommentModal(false);
      setSelectedHikeId(null);
    } catch (error) {
      alert('후기 작성에 실패했습니다.');
    }
  };
  
  // 후기 수정
  const handleEditComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;
    
    try {
      await updateComment(commentId, editCommentText.trim());
      setEditingCommentId(null);
      setEditCommentText('');
    } catch (error) {
      alert('후기 수정에 실패했습니다.');
    }
  };
  
  // 후기 삭제
  const handleDeleteComment = async (hikeId: string, commentId: string) => {
    if (!confirm('이 후기를 삭제하시겠습니까?')) return;
    
    try {
      await deleteComment(hikeId, commentId);
    } catch (error) {
      alert('후기 삭제에 실패했습니다.');
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case '하': return <Badge variant="success">하</Badge>;
      case '중하': return <Badge variant="info">중하</Badge>;
      case '중': return <Badge variant="warning">중</Badge>;
      case '중상': return <Badge variant="warning">중상</Badge>;
      case '상': return <Badge variant="danger">상</Badge>;
      default: return <Badge>{difficulty}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">산행 이력을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 산행 이력이 전혀 없는 경우
  if (combinedHistory.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Empty State */}
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <CalendarX className="w-20 h-20 text-slate-300 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-slate-900 mb-3">
              아직 등록된 산행 이력이 없습니다
            </h3>
            <p className="text-slate-600 mb-6">
              시애라클럽의 첫 번째 산행을 완료하고 기록을 남겨보세요.<br />
              관리자가 산행을 완료하면 이곳에서 확인할 수 있습니다.
            </p>
            {isAdmin && (
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 font-medium mb-2">
                  관리자 안내
                </p>
                <p className="text-sm text-blue-700">
                  산행이 완료되면 관리자 페이지에서 산행 이력을 등록할 수 있습니다.
                </p>
                <Link
                  to="/admin/events"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  이벤트 관리로 이동
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-slate-900 mx-auto mb-4"></div>
            <p className="text-xl text-slate-600 font-medium">산행 이력을 불러오는 중...</p>
          </div>
        </div>
      ) : combinedHistory.length === 0 ? (
        <Card className="p-12 text-center">
          <Mountain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-xl text-slate-600 mb-2">아직 등록된 산행 이력이 없습니다</p>
          <p className="text-slate-500">첫 번째 산행에 참여해보세요!</p>
        </Card>
      ) : (
        <>

      {/* 연도 선택 */}
      {years.length > 0 && (
        <FilterGroup
          options={years.map(year => ({
            key: year,
            label: `${year}년`,
            count: combinedHistory.filter(h => h.year === year).length,
          }))}
          selected={selectedYear}
          onChange={setSelectedYear}
          className="mb-6"
        />
      )}

      {/* 산행 이력 */}
      {yearHistory.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <Mountain className="w-20 h-20 text-slate-300 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-slate-900 mb-3">
              {selectedYear}년 산행 이력이 없습니다
            </h3>
            <p className="text-slate-600 mb-6">
              {selectedYear}년에는 등록된 산행 기록이 없습니다.<br />
              다른 연도를 선택해주세요.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {years.filter(y => y !== selectedYear).slice(0, 3).map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg font-medium transition-colors"
                >
                  {year}년 보기
                </button>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {months.map((monthKey) => {
            const [year, month] = monthKey.split('-');
            const monthHikes = groupedByMonth[monthKey];
            
            return (
              <div key={monthKey}>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">
                  {parseInt(month) || 0}월
                </h2>
                
                <div className="space-y-4">
                  {monthHikes.map((hike) => {
                    const comments = getCommentsByHikeId(hike.id);
                    
                    return (
                      <Card key={hike.id} className="overflow-hidden">
                        <div className="flex flex-col md:flex-row">
                          {/* 이미지 */}
                          <div className="md:w-1/3 relative aspect-video md:aspect-square bg-slate-200">
                            {hike.imageUrl ? (
                              <img
                                src={hike.imageUrl}
                                alt={hike.mountain}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Mountain className="w-16 h-16" />
                              </div>
                            )}
                            {hike.isSpecial && (
                              <div className="absolute top-4 left-4">
                                <Badge variant="danger">특별산행</Badge>
                              </div>
                            )}
                          </div>
                          
                          {/* 내용 */}
                          <div className="flex-1 p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <div className="flex items-center gap-3 mb-2">
                                  {hike.eventNumber && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white flex-shrink-0">
                                      제{hike.eventNumber}회
                                    </span>
                                  )}
                                  <h3 className="text-2xl font-bold text-slate-900">{hike.mountain}</h3>
                                  {getDifficultyBadge(hike.difficulty)}
                                </div>
                                <p className="text-slate-600 flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  {hike.location}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div>
                                <p className="text-sm text-slate-600">날짜</p>
                                <p className="font-medium">{hike.date}</p>
                              </div>
                              <div>
                                <p className="text-sm text-slate-600">참가자</p>
                                <p className="font-medium">{hike.participants}명</p>
                              </div>
                              <div>
                                <p className="text-sm text-slate-600">거리</p>
                                <p className="font-medium">{hike.distance}</p>
                              </div>
                              <div>
                                <p className="text-sm text-slate-600">소요시간</p>
                                <p className="font-medium">{hike.duration}</p>
                              </div>
                            </div>
                            
                            {hike.summary && (
                              <p className="text-slate-700 mb-4">{hike.summary}</p>
                            )}
                            
                            {/* 액션 버튼 */}
                            <div className="flex flex-wrap gap-2 mt-4">
                              {(() => {
                                const eventTeams = getTeamsByEventId(hike.id);
                                if (eventTeams.length > 0) {
                                  return (
                                    <button
                                      onClick={() => {
                                        setSelectedTeams(eventTeams);
                                        setSelectedTeamEventTitle(hike.mountain);
                                        setShowTeamModal(true);
                                      }}
                                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors border border-indigo-200"
                                    >
                                      <Users className="w-4 h-4" />
                                      조편성 보기 ({eventTeams.length}조)
                                    </button>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* 후기 섹션 */}
                            <div className="border-t pt-4 mt-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                  <MessageSquare className="w-5 h-5" />
                                  후기 ({comments.length})
                                </h4>
                                {user?.isApproved && (
                                  <button
                                    onClick={() => {
                                      setSelectedHikeId(hike.id);
                                      setShowCommentModal(true);
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    후기 작성
                                  </button>
                                )}
                              </div>
                              
                              {comments.length > 0 && (
                                <div className="space-y-3">
                                  {comments.map((comment) => (
                                    <div key={comment.id} className="bg-slate-50 rounded-lg p-3">
                                      {editingCommentId === comment.id ? (
                                        <div className="space-y-2">
                                          <textarea
                                            value={editCommentText}
                                            onChange={(e) => setEditCommentText(e.target.value)}
                                            className="w-full p-2 border rounded-lg resize-none"
                                            rows={3}
                                          />
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => handleEditComment(comment.id)}
                                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                            >
                                              저장
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingCommentId(null);
                                                setEditCommentText('');
                                              }}
                                              className="px-3 py-1 border rounded text-sm hover:bg-slate-50"
                                            >
                                              취소
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-start justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                              <p className="font-medium text-slate-900">{comment.authorName}</p>
                                              <p className="text-xs text-slate-500">
                                                {new Date(comment.createdAt).toLocaleDateString()}
                                              </p>
                                            </div>
                                            {(user?.id === comment.authorId || isAdmin) && (
                                              <div className="flex gap-1">
                                                <button
                                                  onClick={() => {
                                                    setEditingCommentId(comment.id);
                                                    setEditCommentText(comment.content);
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-slate-600"
                                                >
                                                  <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteComment(hike.id, comment.id)}
                                                  className="p-1 text-slate-400 hover:text-red-600"
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                          <p className="text-slate-700 text-sm">{comment.content}</p>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 조편성 보기 모달 */}
      {showTeamModal && selectedTeams.length > 0 && (
        <Modal
          onClose={() => {
            setShowTeamModal(false);
            setSelectedTeams([]);
            setSelectedTeamEventTitle('');
          }}
          title={`${selectedTeamEventTitle} - 조편성`}
          maxWidth="max-w-3xl"
        >
          <div className="p-6">
            <div className="space-y-6">
              {selectedTeams
                .sort((a, b) => (a.number || 0) - (b.number || 0))
                .map((team) => (
                <div key={team.id} className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
                  {/* 조 헤더 */}
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-bold text-indigo-900">{team.name}</h4>
                      <Badge variant="info">{team.members.length + 1}명</Badge>
                    </div>
                  </div>
                  
                  {/* 조장 */}
                  <div className="px-5 py-3 bg-amber-50/50 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <UserCheck className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{team.leaderName}</span>
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">조장</span>
                        </div>
                        <div className="text-sm text-slate-500">
                          {team.leaderCompany || team.leaderOccupation || ''}
                          {team.leaderPosition ? ` / ${team.leaderPosition}` : ''}
                        </div>
                      </div>
                      {team.leaderPhone && (
                        <div className="text-sm text-slate-500 flex items-center gap-1 flex-shrink-0">
                          <Phone className="w-3.5 h-3.5" />
                          {formatPhoneNumber(team.leaderPhone)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 조원 목록 */}
                  <div className="divide-y divide-slate-100">
                    {team.members.map((member, idx) => (
                      <div key={member.id || idx} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-500">{idx + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{member.name}</span>
                            {member.isGuest && (
                              <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">게스트</span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">
                            {member.company || member.occupation || ''}
                            {member.position ? ` / ${member.position}` : ''}
                          </div>
                        </div>
                        {member.phoneNumber && (
                          <div className="text-sm text-slate-500 flex items-center gap-1 flex-shrink-0">
                            <Phone className="w-3.5 h-3.5" />
                            {formatPhoneNumber(member.phoneNumber)}
                          </div>
                        )}
                      </div>
                    ))}
                    {team.members.length === 0 && (
                      <div className="px-5 py-4 text-center text-sm text-slate-400">조원이 없습니다.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowTeamModal(false);
                  setSelectedTeams([]);
                  setSelectedTeamEventTitle('');
                }}
                className="px-5 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 후기 작성 모달 */}
      {showCommentModal && (
        <Modal
          onClose={() => {
            setShowCommentModal(false);
            setSelectedHikeId(null);
            setNewComment('');
          }}
          title="산행 후기 작성"
        >
          <div className="p-6">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="산행 후기를 작성해주세요..."
              className="w-full p-4 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowCommentModal(false);
                  setSelectedHikeId(null);
                  setNewComment('');
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                작성 완료
              </button>
            </div>
          </div>
        </Modal>
      )}
      </>
      )}
    </div>
  );
};

export default HikingHistory;
