import { useState, useEffect, useMemo } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import { BookOpen, Plus, Edit, Trash2, Eye, Save, X, Calendar, FileText, ScrollText, History, Bell, Pin, Edit2, ChevronDown, Search, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import { usePoems, Poem } from '../../contexts/PoemContext';
import { useRules } from '../../contexts/RulesContext';
import { useNotices, Notice } from '../../contexts/NoticeContext';
import { useHistories } from '../../contexts/HistoryContext';
import { usePosts } from '../../contexts/PostContext';
import { ClubHistory } from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';

type TabType = 'notice' | 'rules' | 'poem' | 'history';

const ContentManagement = () => {
  const [activeTab, setActiveTab] = useState<TabType>('notice');
  const { poems, currentPoem, addPoem, updatePoem, deletePoem } = usePoems();
  const { rulesData, saveRulesWithAmendment } = useRules();
  const { notices, addNotice, updateNotice, deleteNotice, togglePin } = useNotices();
  const { histories, addHistory, updateHistory, deleteHistory, _activate: activateHistories } = useHistories();
  const { posts } = usePosts();
  
  // 게시판에서 "시" 카테고리 게시물 목록 (최신순)
  const poemPosts = useMemo(() => {
    return posts
      .filter(p => p.category === 'poem')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts]);
  
  // 시 관리 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [editingPoem, setEditingPoem] = useState<Poem | null>(null);
  const [previewPoem, setPreviewPoem] = useState<Poem | null>(null);
  
  const [poemFormData, setPoemFormData] = useState({
    title: '',
    author: '',
    content: '',
    month: '',
  });

  // 회칙 관리 상태
  const [localRulesContent, setLocalRulesContent] = useState(rulesData.content);
  const [isAmendmentModalOpen, setIsAmendmentModalOpen] = useState(false);
  const [amendmentForm, setAmendmentForm] = useState({
    version: '',
    date: '',
    description: ''
  });

  // 공지사항 관리 상태
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    content: '',
    isPinned: false,
  });

  // 연혁 관리 상태
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingHistory, setEditingHistory] = useState<ClubHistory | null>(null);
  const [historyForm, setHistoryForm] = useState({
    year: '',
    badge: '',
    items: [''],
    sortOrder: 0,
  });

  // 연혁 탭 활성화 시 데이터 로드
  useEffect(() => {
    if (activeTab === 'history') {
      activateHistories();
    }
  }, [activeTab, activateHistories]);

  // rulesData 변경 시 localRulesContent 동기화
  useEffect(() => {
    setLocalRulesContent(rulesData.content);
  }, [rulesData.content]);

  // 시 관리 함수들
  const handleOpenPoemModal = (poem?: Poem) => {
    if (poem) {
      setEditingPoem(poem);
      setPoemFormData({
        title: poem.title,
        author: poem.author,
        content: poem.content,
        month: poem.month,
      });
    } else {
      setEditingPoem(null);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setPoemFormData({
        title: '',
        author: '',
        content: '',
        month: currentMonth,
      });
    }
    setIsModalOpen(true);
  };

  const handleClosePoemModal = () => {
    setIsModalOpen(false);
    setEditingPoem(null);
    setPoemFormData({
      title: '',
      author: '',
      content: '',
      month: '',
    });
  };

  const handleSavePoem = async () => {
    if (!poemFormData.title || !poemFormData.author || !poemFormData.content || !poemFormData.month) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      if (editingPoem) {
        await updatePoem(editingPoem.id, poemFormData);
        alert('시가 수정되었습니다.');
      } else {
        await addPoem(poemFormData);
        alert('시가 등록되었습니다.');
      }
      handleClosePoemModal();
    } catch (error) {
      console.error('시 저장 실패:', error);
      alert('시 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleDeletePoem = async (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        await deletePoem(id);
        alert('시가 삭제되었습니다.');
      } catch (error) {
        console.error('시 삭제 실패:', error);
        alert('시 삭제에 실패했습니다.');
      }
    }
  };

  const handlePreview = (poem: Poem) => {
    setPreviewPoem(poem);
    setIsPreviewModalOpen(true);
  };

  const sortedPoems = [...poems].sort((a, b) => b.month.localeCompare(a.month));

  // 공지사항 관리 함수들
  const openNoticeModal = (notice?: Notice) => {
    if (notice) {
      setEditingNotice(notice);
      setNoticeForm({
        title: notice.title,
        content: notice.content,
        isPinned: notice.isPinned,
      });
    } else {
      setEditingNotice(null);
      setNoticeForm({
        title: '',
        content: '',
        isPinned: false,
      });
    }
    setShowNoticeModal(true);
  };

  const handleSaveNotice = async () => {
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }
    
    try {
      if (editingNotice) {
        await updateNotice(editingNotice.id, noticeForm);
        alert('공지사항이 수정되었습니다.');
      } else {
        await addNotice(noticeForm);
        alert('공지사항이 등록되었습니다.');
      }
      
      setShowNoticeModal(false);
      setEditingNotice(null);
      setNoticeForm({ title: '', content: '', isPinned: false });
    } catch (error) {
      console.error('공지사항 저장 실패:', error);
      alert('공지사항 저장에 실패했습니다.');
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm('이 공지사항을 삭제하시겠습니까?')) return;
    
    try {
      await deleteNotice(noticeId);
      alert('공지사항이 삭제되었습니다.');
    } catch (error) {
      console.error('공지사항 삭제 실패:', error);
      alert('공지사항 삭제에 실패했습니다.');
    }
  };

  const pinnedNotices = notices.filter(n => n.isPinned);
  const regularNotices = notices.filter(n => !n.isPinned);

  // 회칙 저장 핸들러 (개정판 생성)
  const handleSaveRules = () => {
    setIsAmendmentModalOpen(true);
  };

  // 개정판 저장
  const handleSaveAmendment = async () => {
    if (!amendmentForm.version || !amendmentForm.date || !amendmentForm.description) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      console.log('📝 회칙 개정 시작:', amendmentForm);
      
      // 회칙 내용 + 개정 이력을 한 번에 저장
      await saveRulesWithAmendment(
        localRulesContent,
        amendmentForm.version,
        amendmentForm.date,
        {
          version: amendmentForm.version,
          date: amendmentForm.date,
          description: amendmentForm.description,
        }
      );

      alert('회칙이 저장되었습니다.');
      setIsAmendmentModalOpen(false);
      setAmendmentForm({ version: '', date: '', description: '' });
      
      console.log('✅ 회칙 개정 완료');
    } catch (error: any) {
      console.error('❌ 회칙 저장 실패:', error);
      alert(`회칙 저장에 실패했습니다.\n\n${error.message || '다시 시도해주세요.'}`);
    }
  };

  // ─── 연혁 관리 함수들 ───
  const openHistoryModal = (history?: ClubHistory) => {
    if (history) {
      setEditingHistory(history);
      setHistoryForm({
        year: history.year,
        badge: history.badge,
        items: history.items.length > 0 ? [...history.items] : [''],
        sortOrder: history.sortOrder,
      });
    } else {
      setEditingHistory(null);
      // 새 항목의 sortOrder: 기존 최대값 + 1
      const maxOrder = histories.length > 0 ? Math.max(...histories.map(h => h.sortOrder)) : -1;
      setHistoryForm({
        year: '',
        badge: '',
        items: [''],
        sortOrder: maxOrder + 1,
      });
    }
    setShowHistoryModal(true);
  };

  const handleSaveHistory = async () => {
    if (!historyForm.year.trim()) {
      alert('연도를 입력해주세요.');
      return;
    }
    if (!historyForm.badge.trim()) {
      alert('배지(태그)를 입력해주세요.');
      return;
    }
    const filteredItems = historyForm.items.filter(item => item.trim() !== '');
    if (filteredItems.length === 0) {
      alert('최소 한 개의 이벤트 항목을 입력해주세요.');
      return;
    }

    try {
      const data = {
        year: historyForm.year.trim(),
        badge: historyForm.badge.trim(),
        items: filteredItems,
        sortOrder: historyForm.sortOrder,
      };

      if (editingHistory) {
        await updateHistory(editingHistory.id, data);
        alert('연혁이 수정되었습니다.');
      } else {
        await addHistory(data);
        alert('연혁이 등록되었습니다.');
      }

      setShowHistoryModal(false);
      setEditingHistory(null);
      setHistoryForm({ year: '', badge: '', items: [''], sortOrder: 0 });
    } catch (error) {
      console.error('연혁 저장 실패:', error);
      alert('연혁 저장에 실패했습니다.');
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (!confirm('이 연혁 항목을 삭제하시겠습니까?')) return;
    try {
      await deleteHistory(id);
      alert('연혁이 삭제되었습니다.');
    } catch (error) {
      console.error('연혁 삭제 실패:', error);
      alert('연혁 삭제에 실패했습니다.');
    }
  };

  const handleHistoryItemChange = (index: number, value: string) => {
    const newItems = [...historyForm.items];
    newItems[index] = value;
    setHistoryForm({ ...historyForm, items: newItems });
  };

  const addHistoryItem = () => {
    setHistoryForm({ ...historyForm, items: [...historyForm.items, ''] });
  };

  const removeHistoryItem = (index: number) => {
    if (historyForm.items.length <= 1) return;
    const newItems = historyForm.items.filter((_, i) => i !== index);
    setHistoryForm({ ...historyForm, items: newItems });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 탭 네비게이션 */}
      <Tabs
        tabs={[
          { key: 'notice', label: '공지사항', count: notices.length },
          { key: 'rules', label: '회칙' },
          { key: 'poem', label: '이달의 시', count: sortedPoems.length },
          { key: 'history', label: '연혁', count: histories.length },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as TabType)}
        className="mb-6"
      />

      {/* ─── 공지사항 관리 ─── */}
      {activeTab === 'notice' && (
        <div className="space-y-5">
          {/* 검색 + 새 공지 버튼 (Board 페이지와 동일한 레이아웃) */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <input
                type="text"
                placeholder="공지사항 검색..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-base sm:text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>
            <button
              onClick={() => openNoticeModal()}
              className="px-5 py-3 bg-primary-600 text-white rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              새 공지
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* 테이블 헤더 - Board 페이지와 동일 */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_120px_120px] gap-4 px-6 py-3.5 bg-slate-50 border-b border-slate-200 text-sm sm:text-base font-semibold text-slate-500 uppercase tracking-wider">
              <span>제목</span>
              <span className="text-center">작성일</span>
              <span className="text-center">관리</span>
            </div>

            {notices.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">등록된 공지사항이 없습니다.</p>
              </div>
            ) : (
              <>
                {/* 고정 공지 */}
                {pinnedNotices.map((notice) => (
                  <div key={notice.id} onClick={() => openNoticeModal(notice)} className="flex items-center gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-red-50/40 hover:bg-red-50 transition-colors group cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 bg-red-600 text-white text-sm font-bold rounded">필독</span>
                        <Pin className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <h3 className="text-xl font-bold text-slate-900 truncate group-hover:text-red-600 transition-colors">
                          {notice.title}
                        </h3>
                      </div>
                    </div>
                    <span className="hidden sm:block text-lg text-slate-400 w-[120px] text-center flex-shrink-0">
                      {notice.date}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap sm:w-[120px] sm:justify-center flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); togglePin(notice.id); }} className="p-2 text-amber-500 hover:bg-amber-100 rounded-lg transition-colors" title="고정 해제">
                        <Pin className="w-5 h-5 fill-current" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openNoticeModal(notice); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="수정">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteNotice(notice.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                {/* 일반 공지 */}
                {regularNotices.map((notice) => (
                  <div key={notice.id} onClick={() => openNoticeModal(notice)} className="flex items-center gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 bg-slate-200 text-slate-600 text-sm font-bold rounded">공지</span>
                        <h3 className="text-xl font-medium text-slate-800 truncate group-hover:text-primary-600 transition-colors">
                          {notice.title}
                        </h3>
                      </div>
                    </div>
                    <span className="hidden sm:block text-lg text-slate-400 w-[120px] text-center flex-shrink-0">
                      {notice.date}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap sm:w-[120px] sm:justify-center flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); togglePin(notice.id); }} className="p-2 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="고정">
                        <Pin className="w-5 h-5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openNoticeModal(notice); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="수정">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteNotice(notice.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── 회칙 관리 ─── */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">클럽 회칙</h2>
                <span className="text-base font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded">v{rulesData.version}</span>
                <span className="text-base text-slate-400">시행일 {rulesData.effectiveDate}</span>
              </div>
              <button
                onClick={handleSaveRules}
                className="px-5 py-3 bg-primary-600 text-white rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                개정판 저장
              </button>
            </div>
            <div className="p-6">
              <textarea
                value={localRulesContent}
                onChange={(e) => setLocalRulesContent(e.target.value)}
                rows={22}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 resize-none font-mono text-base leading-relaxed bg-slate-50"
                placeholder="클럽 회칙을 입력하세요..."
              />
              <p className="text-base text-slate-400 mt-2">
                작성한 회칙은 '시애라 안내' 페이지의 회칙 탭에 표시됩니다.
              </p>
            </div>
          </div>

          {/* 개정 이력 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="hidden sm:grid sm:grid-cols-[140px_1fr_140px] gap-4 px-6 py-3.5 bg-slate-50 border-b border-slate-200 text-sm sm:text-base font-semibold text-slate-500 uppercase tracking-wider">
              <span>버전</span>
              <span>개정 내용</span>
              <span className="text-center">시행일</span>
            </div>
            {[...rulesData.amendments].reverse().map((amendment, index) => (
              <div key={index} className="hidden sm:grid sm:grid-cols-[140px_1fr_140px] gap-4 px-6 py-5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors items-center">
                <span className="text-sm font-mono font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded text-center flex-shrink-0 truncate">v{amendment.version}</span>
                <p className="text-base text-slate-700">{amendment.description}</p>
                <span className="text-sm text-slate-400 text-center flex-shrink-0">{amendment.date}</span>
              </div>
            ))}
            {/* 모바일 */}
            {[...rulesData.amendments].reverse().map((amendment, index) => (
              <div key={`m-${index}`} className="sm:hidden px-4 py-4 border-b border-slate-100 last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">v{amendment.version}</span>
                  <span className="text-base text-slate-400">{amendment.date}</span>
                </div>
                <p className="text-lg text-slate-700">{amendment.description}</p>
              </div>
            ))}
            {rulesData.amendments.length === 0 && (
              <div className="py-16 text-center">
                <History className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">개정 이력이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 이달의 시 ─── */}
      {activeTab === 'poem' && (
        <div className="space-y-5">
          {/* 검색 + 새 시 등록 버튼 */}
          <div className="flex gap-2">
            <div className="flex-1" />
            <button
              onClick={() => handleOpenPoemModal()}
              className="px-5 py-3 bg-primary-600 text-white rounded-lg font-semibold text-lg hover:bg-primary-700 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              새 시 등록
            </button>
          </div>

          {/* 현재 이달의 시 */}
          {currentPoem && (
            <div className="bg-white rounded-xl border-2 border-primary-200 overflow-hidden">
              <div className="px-6 py-4 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary-600" />
                  <span className="text-lg font-semibold text-primary-700">현재 이달의 시</span>
                  <span className="text-base text-primary-500">{currentPoem.month}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handlePreview(currentPoem)} className="p-2 text-primary-500 hover:bg-primary-100 rounded-lg transition-colors" title="미리보기">
                    <Eye className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleOpenPoemModal(currentPoem)} className="p-2 text-primary-500 hover:bg-primary-100 rounded-lg transition-colors" title="수정">
                    <Edit className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-5">
                <h4 className="text-xl font-bold text-slate-900">{currentPoem.title}</h4>
                <p className="text-lg text-slate-500 italic mt-1">— {currentPoem.author}</p>
                <pre className="mt-3 text-lg text-slate-600 whitespace-pre-wrap font-sans leading-relaxed line-clamp-4">
                  {currentPoem.content}
                </pre>
              </div>
            </div>
          )}

          {/* 전체 목록 - Board 스타일 테이블 */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_110px_100px_120px] gap-3 px-6 py-3.5 bg-slate-50 border-b border-slate-200 text-sm sm:text-base font-semibold text-slate-500 uppercase tracking-wider">
              <span>제목</span>
              <span className="text-center">작가</span>
              <span className="text-center">월</span>
              <span className="text-center">관리</span>
            </div>

            {sortedPoems.length === 0 ? (
              <div className="py-16 text-center">
                <ScrollText className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">등록된 시가 없습니다.</p>
                <p className="text-base text-slate-400 mt-1">첫 번째 시를 등록해보세요!</p>
              </div>
            ) : (
              sortedPoems.map((poem) => {
                const isCurrent = currentPoem?.id === poem.id;
                return (
                  <div key={poem.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors group last:border-b-0 ${isCurrent ? 'bg-primary-50/30' : ''}`}>
                    <div className="hidden sm:grid sm:grid-cols-[1fr_110px_100px_120px] gap-3 px-6 py-5 items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 bg-primary-600 text-white text-sm font-bold rounded">현재</span>
                          )}
                          <h3 className="text-xl font-medium text-slate-800 truncate group-hover:text-primary-600 transition-colors">
                            {poem.title}
                          </h3>
                        </div>
                      </div>
                      <span className="text-lg text-slate-500 text-center truncate">{poem.author}</span>
                      <span className="text-lg text-slate-400 text-center">{poem.month}</span>
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => handlePreview(poem)} className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="미리보기">
                          <Eye className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleOpenPoemModal(poem)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="수정">
                          <Edit className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleDeletePoem(poem.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    {/* 모바일 */}
                    <div className="sm:hidden px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            {isCurrent && (
                              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 bg-primary-600 text-white text-xs font-bold rounded">현재</span>
                            )}
                            <h3 className="text-xl font-medium text-slate-800 truncate">
                              {poem.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2.5 text-base text-slate-400">
                            <span className="font-medium text-slate-500">{poem.author}</span>
                            <span>·</span>
                            <span>{poem.month}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleOpenPoemModal(poem)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletePoem(poem.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {sortedPoems.length > 0 && (
            <p className="text-center text-base text-slate-400 mt-4">
              총 {sortedPoems.length}편의 시
            </p>
          )}
        </div>
      )}

      {/* ─── 시 등록/수정 모달 ─── */}
      {isModalOpen && (
        <Modal onClose={handleClosePoemModal} maxWidth="max-w-2xl">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">
              {editingPoem ? '시 수정' : '새 시 등록'}
            </h2>
            
            <div className="space-y-4 mb-6">
              {!editingPoem && poemPosts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">게시판에서 불러오기</label>
                  <select
                    onChange={(e) => {
                      const selectedPost = poemPosts.find(p => p.id === e.target.value);
                      if (selectedPost) {
                        setPoemFormData(prev => ({ ...prev, title: selectedPost.title, author: selectedPost.author, content: selectedPost.content }));
                      }
                    }}
                    defaultValue=""
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-sm"
                  >
                    <option value="" disabled>게시판의 시(詩) 게시물 선택...</option>
                    {poemPosts.map(post => (
                      <option key={post.id} value={post.id}>{post.title} — {post.author} ({post.date})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">제목 *</label>
                  <input type="text" value={poemFormData.title} onChange={(e) => setPoemFormData({ ...poemFormData, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" placeholder="시 제목" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">작가 *</label>
                  <input type="text" value={poemFormData.author} onChange={(e) => setPoemFormData({ ...poemFormData, author: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" placeholder="작가명" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">월 *</label>
                  <input type="month" value={poemFormData.month} onChange={(e) => setPoemFormData({ ...poemFormData, month: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">내용 *</label>
                <textarea value={poemFormData.content} onChange={(e) => setPoemFormData({ ...poemFormData, content: e.target.value })} rows={14} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none font-sans text-sm leading-relaxed" placeholder="시 내용을 입력하세요..." />
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button onClick={handleClosePoemModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={handleSavePoem} className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">{editingPoem ? '수정' : '등록'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 미리보기 모달 */}
      {isPreviewModalOpen && previewPoem && (
        <Modal onClose={() => setIsPreviewModalOpen(false)} maxWidth="max-w-xl">
          <div className="p-8 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">{previewPoem.month}</p>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{previewPoem.title}</h2>
            <p className="text-sm text-slate-500 italic">— {previewPoem.author}</p>
            
            <div className="my-6 border-t border-b border-slate-100 py-6">
              <pre className="text-base text-slate-700 whitespace-pre-wrap font-sans leading-loose">{previewPoem.content}</pre>
            </div>
            
            <button onClick={() => setIsPreviewModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">닫기</button>
          </div>
        </Modal>
      )}

      {/* 개정판 저장 모달 */}
      {isAmendmentModalOpen && (
        <Modal onClose={() => setIsAmendmentModalOpen(false)} maxWidth="max-w-lg">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">회칙 개정판 저장</h2>
            
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">버전 *</label>
                  <input type="date" value={amendmentForm.version.replace(/\./g, '-')} onChange={(e) => { const formatted = e.target.value.replace(/-/g, '.'); setAmendmentForm({ ...amendmentForm, version: formatted }); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" />
                  {amendmentForm.version && <p className="text-xs text-slate-400 mt-1">v{amendmentForm.version}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">시행일 *</label>
                  <input type="date" value={amendmentForm.date.replace(/년|월|일| /g, '').replace(/\./g, '-')} onChange={(e) => { const [y, m, d] = e.target.value.split('-'); setAmendmentForm({ ...amendmentForm, date: `${y}년 ${m}월 ${d}일` }); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" />
                  {amendmentForm.date && <p className="text-xs text-slate-400 mt-1">{amendmentForm.date}</p>}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">개정 사유 *</label>
                <textarea value={amendmentForm.description} onChange={(e) => setAmendmentForm({ ...amendmentForm, description: e.target.value })} rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none text-sm" placeholder="예: 회원 자격 요건 변경 (제4조 개정)" />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-xs text-amber-800">개정판 저장 후에는 이전 버전으로 되돌릴 수 없습니다.</p>
              </div>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsAmendmentModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={handleSaveAmendment} className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">저장</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── 연혁 관리 ─── */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">연혁 관리</h2>
              <p className="text-sm text-slate-500 mt-1">동아리 연혁을 등록하고 관리합니다. 등록된 정보가 동아리 소개 페이지에 표시됩니다.</p>
            </div>
            <button
              onClick={() => openHistoryModal()}
              className="px-5 py-3 bg-primary-600 text-white rounded-lg font-semibold text-base hover:bg-primary-700 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              연혁 추가
            </button>
          </div>

          {histories.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-medium">등록된 연혁이 없습니다.</p>
                <p className="text-sm text-slate-400 mt-1">연혁 추가 버튼을 눌러 첫 연혁을 등록하세요.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {histories.map((history, index) => (
                <Card key={history.id} className="hover:shadow-md transition-all">
                  <div className="flex items-start gap-4">
                    {/* 순서 표시 */}
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </span>
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">{history.year}</h3>
                        <Badge variant="primary">{history.badge}</Badge>
                      </div>
                      <ul className="space-y-1">
                        {history.items.map((item, itemIndex) => (
                          <li key={itemIndex} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0"></span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openHistoryModal(history)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="수정"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteHistory(history.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 연혁 작성/수정 모달 */}
      {showHistoryModal && (
        <Modal
          onClose={() => { setShowHistoryModal(false); setEditingHistory(null); setHistoryForm({ year: '', badge: '', items: [''], sortOrder: 0 }); }}
          maxWidth="max-w-2xl"
        >
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">
              {editingHistory ? '연혁 수정' : '새 연혁 등록'}
            </h2>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">연도 *</label>
                  <input
                    type="text"
                    value={historyForm.year}
                    onChange={(e) => setHistoryForm({ ...historyForm, year: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
                    placeholder="예: 2025년"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">배지(태그) *</label>
                  <input
                    type="text"
                    value={historyForm.badge}
                    onChange={(e) => setHistoryForm({ ...historyForm, badge: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
                    placeholder="예: 20주년 기념"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">표시 순서</label>
                  <input
                    type="number"
                    value={historyForm.sortOrder}
                    onChange={(e) => setHistoryForm({ ...historyForm, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-400 mt-1">숫자가 작을수록 먼저 표시됩니다</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">주요 이벤트 *</label>
                  <button
                    onClick={addHistoryItem}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    항목 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {historyForm.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-5 text-right flex-shrink-0">{index + 1}</span>
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => handleHistoryItemChange(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
                        placeholder={`이벤트 ${index + 1}`}
                      />
                      {historyForm.items.length > 1 && (
                        <button
                          onClick={() => removeHistoryItem(index)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-800">
                  저장된 연혁은 동아리 소개 &gt; 연혁 탭에 자동으로 표시됩니다.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowHistoryModal(false); setEditingHistory(null); setHistoryForm({ year: '', badge: '', items: [''], sortOrder: 0 }); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveHistory}
                className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
              >
                {editingHistory ? '수정' : '등록'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 공지사항 작성/수정 모달 */}
      {showNoticeModal && (
        <Modal
          onClose={() => { setShowNoticeModal(false); setEditingNotice(null); setNoticeForm({ title: '', content: '', isPinned: false }); }}
          maxWidth="max-w-2xl"
        >
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">
              {editingNotice ? '공지사항 수정' : '새 공지사항 작성'}
            </h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">제목 *</label>
                <input type="text" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm" placeholder="공지사항 제목" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">내용 *</label>
                <textarea value={noticeForm.content} onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })} rows={8} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none text-sm" placeholder="공지사항 내용" />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer py-2">
                <input type="checkbox" checked={noticeForm.isPinned} onChange={(e) => setNoticeForm({ ...noticeForm, isPinned: e.target.checked })} className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-400" />
                <span className="text-sm text-slate-700">상단 고정</span>
              </label>
            </div>
            
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowNoticeModal(false); setEditingNotice(null); setNoticeForm({ title: '', content: '', isPinned: false }); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={handleSaveNotice} className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">{editingNotice ? '수정' : '등록'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ContentManagement;
