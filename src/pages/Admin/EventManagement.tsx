/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, Calendar, MapPin, Users, Save, X, CreditCard, Phone, UserPlus, CheckCircle, AlertCircle, Lock, Unlock, Mountain, Printer, Clock, FileText, Undo, GripVertical, Search, ChevronDown, Camera, Upload, Loader2, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '../../contexts/EventContext';
import { useMembers } from '../../contexts/MemberContext';
import { useExecutives } from '../../contexts/ExecutiveContext';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import AddressSearch from '../../components/AddressSearch';
import MountainSearch from '../../components/MountainSearch';
import { HikingEvent, PaymentInfo, ScheduleItem, Course, DaySchedule, DayScheduleItem } from '../../types';
import { generateEventTitle, getNextEventNumber } from '../../utils/eventTitle';
import { uploadImage, deleteFile } from '../../lib/firebase/storage';

type TabType = 'events';

const EventManagement = () => {
  const navigate = useNavigate();
  const { events: contextEvents, addEvent, updateEvent, deleteEvent, getParticipantsByEventId } = useEvents();
  const { members, getMembersByPosition } = useMembers();
  const { executives: executiveList, getExecutivesByCategory } = useExecutives();

  // 10분 단위 시간 옵션 생성 (오전 04시 ~ 21시)
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 4; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 10) {
        const h = hour.toString().padStart(2, '0');
        const m = minute.toString().padStart(2, '0');
        options.push(`${h}:${m}`);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // 운영진 목록 가져오기 (executives 컬렉션에서 - 회장단과 운영위원 분리)
  const chairmanExecutives = getExecutivesByCategory('chairman');
  const committeeExecutives = getExecutivesByCategory('committee');

  // members 컬렉션에서 기존 코드 호환용
  const chairmanMembers = getMembersByPosition('chairman');
  const committeeMembers = getMembersByPosition('committee');
  
  const executives = [
    ...chairmanMembers,
    ...committeeMembers
  ];

  // 전체 활성 회원 목록 (기타 검색용)
  const allActiveMembers = useMemo(() => {
    return members
      .filter(m => m.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [members]);

  // Event Management State - Firebase에서 로드
  const [events, setEvents] = useState<HikingEvent[]>([]);
  
  

  // Load events from context
  useEffect(() => {
    setEvents(contextEvents);
  }, [contextEvents]);

  const [isEditing, setIsEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HikingEvent | null>(null);

  // 답사 사진 업로드 상태
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // 드래그 앤 드롭 상태 (당일 동선)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 비상연락처 선택 모드: 'executive' | 'search'
  const [emergencyContactMode, setEmergencyContactMode] = useState<'executive' | 'search'>('executive');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  
  // 회원 검색 결과 (전체 활성 회원 대상)
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return [];
    const query = memberSearchQuery.trim().toLowerCase();
    return allActiveMembers
      .filter(m => 
        m.name.toLowerCase().includes(query) || 
        (m.company && m.company.toLowerCase().includes(query)) ||
        (m.phoneNumber && m.phoneNumber.includes(query))
      )
      .slice(0, 10);
  }, [allActiveMembers, memberSearchQuery]);
  
  // 총 회원 수 계산
  const totalMembersCount = members.length;

  // 다음 회차 자동 계산
  const nextEventNumber = useMemo(() => getNextEventNumber(events), [events]);

  // 산행내용 텍스트 복사
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);

  const copyEventText = (event: HikingEvent) => {
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const date = event.date ? new Date(event.date) : null;

    // "2026년 4월 산행" 형태
    const yearMonthLine = date
      ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 산행`
      : '';

    // "시애라 231차" 형태
    const eventNumberLine = event.eventNumber
      ? `시애라 ${event.eventNumber}차`
      : event.title || '';

    // "경기도 가평군 ... 유명산 (863m)" 형태
    const mountainLine = [
      event.location,
      event.mountain && event.altitude
        ? `${event.mountain} (${event.altitude})`
        : event.mountain || event.altitude || '',
    ].filter(Boolean).join(' ');

    // 출발 일정 (departure 타입)
    const departure = event.schedule?.find(s => s.type === 'departure');
    const departureLine = date && departure?.time
      ? `출발: ${String(date.getFullYear()).slice(2)}. ${date.getMonth() + 1}. ${date.getDate()}(${dayNames[date.getDay()]}) ${departure.time}`
      : '';

    // 집결 장소 (departure location)
    const gatherLine = departure?.location
      ? `장소: ${departure.location}`
      : '';

    // 일정 전체
    const scheduleTypeLabel: Record<string, string> = {
      departure: '출발',
      stop: '경유',
      lunch: '점심',
      networking: '네트워킹',
      lunch_networking: '점심/네트워킹',
      hiking_start: '산행 시작',
      hiking_end: '산행 종료',
      return: '복귀',
      arrival: '도착',
    };
    const scheduleLines = (event.schedule || [])
      .filter(s => s.time || s.location)
      .map(s => `  ${s.time || '      '} ${s.location || scheduleTypeLabel[s.type] || s.type}`)
      .join('\n');
    const scheduleLine = scheduleLines ? `일정:\n${scheduleLines}` : '';

    // 코스 경로 (각 코스별 한 줄씩)
    // course.name = 'A조' / 'B조' 등 실제 저장된 이름 사용
    const courses = event.courses || [];
    const courseRouteLines = courses
      .filter(c => c.description || c.name)
      .map((course, idx) => {
        const prefix = idx === 0 ? `산행코스(${course.name}):` : `${course.name}:`;
        const distanceSuffix = course.distance ? ` (${course.distance})` : '';
        return `${prefix} ${course.description || ''}${distanceSuffix}`;
      })
      .join('\n');

    // 산행시간 요약 (모든 코스를 한 줄에)
    const timeSummaryParts = courses
      .filter(c => c.duration || c.distance)
      .map(course => {
        const parts = [course.duration, course.distance].filter(Boolean).join(', ');
        return `${course.name}-${parts}`;
      });
    const timeSummaryLine = timeSummaryParts.length > 0
      ? `산행시간: ${timeSummaryParts.join(' / ')}`
      : '';

    const coursesText = [courseRouteLines, timeSummaryLine].filter(Boolean).join('\n');

    // 참가비
    const costLine = (event.paymentInfo?.cost || event.cost) ? `참가비: ${event.paymentInfo?.cost || event.cost}` : '';

    const lines = [
      yearMonthLine,
      eventNumberLine,
      mountainLine,
      '',
      departureLine,
      gatherLine,
      scheduleLine,
      coursesText ? `\n${coursesText}` : '',
      costLine ? `\n${costLine}` : '',
    ].filter(line => line !== undefined && line !== null);

    const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    navigator.clipboard.writeText(text).then(() => {
      setCopiedEventId(event.id);
      setTimeout(() => setCopiedEventId(null), 2000);
    });
  };
  
  const [formData, setFormData] = useState<HikingEvent>({
    id: '',
    title: '',
    date: '',
    location: '',
    mountain: '',
    altitude: '',
    difficulty: '중',
    description: '',
    maxParticipants: totalMembersCount || 100,
    cost: '60,000원',
    schedule: [
      { time: '', location: '', type: 'departure' },
      { time: '', location: '', type: 'stop' },
      { time: '', location: '', type: 'return' },
      { time: '', location: '', type: 'arrival' },
    ],
    courses: [
      {
        id: 'default-course-a',
        name: 'A조',
        description: '',
        distance: '',
        difficulty: '중',
        schedule: [{ time: '', location: '', type: 'departure' }],
      }
    ],
    paymentInfo: {
      bankName: '',
      accountNumber: '',
      accountHolder: '',
      managerName: '',
      managerPhone: '',
      cost: '60,000원',
    },
    isPublished: false,
    isSpecial: false,
    status: 'draft', // 초기 상태는 작성중
    applicationDeadline: '',
  });

  // 총 회원 수가 변경되면 새 산행 등록 시 기본값 업데이트
  useEffect(() => {
    if (!isEditing && !editingEvent) {
      setFormData(prev => ({
        ...prev,
        maxParticipants: totalMembersCount || 100
      }));
    }
  }, [totalMembersCount, isEditing, editingEvent]);

  // isSpecial 또는 eventNumber가 변경되면 제목 자동 생성
  useEffect(() => {
    if (isEditing) {
      const eventNum = formData.eventNumber ?? nextEventNumber;
      const autoTitle = generateEventTitle(eventNum, formData.isSpecial ?? false, formData.specialType);
      if (formData.title !== autoTitle) {
        setFormData(prev => ({ ...prev, title: autoTitle, eventNumber: eventNum }));
      }
    }
  }, [formData.isSpecial, formData.specialType, formData.eventNumber, isEditing, nextEventNumber]);

  // ==================== 자동 아카이빙 (산행 다음날 자동 완료) ====================
  useEffect(() => {
    const checkAndArchiveEvents = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const event of events) {
        // 산행이 진행중(ongoing)이고, 산행 날짜가 지났으면 자동 완료
        if (event.status === 'ongoing') {
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          
          // 산행 다음날 (산행 당일 + 1일)
          const dayAfterEvent = new Date(eventDate);
          dayAfterEvent.setDate(dayAfterEvent.getDate() + 1);
          
          if (today >= dayAfterEvent) {
            try {
              // 1. 산행 상태를 completed로 변경
              await updateEvent(event.id, { status: 'completed' });

              // 2. hikingHistory 컬렉션에 자동 생성
              const participants = getParticipantsByEventId(event.id);
              const attendanceCount = participants.filter(p => p.status === 'confirmed').length;

              const historyItem = {
                id: `history-${event.id}`,
                eventId: event.id,
                title: event.title,
                date: event.date,
                year: new Date(event.date).getFullYear().toString(),
                location: event.location,
                mountain: event.mountain || '',
                altitude: event.altitude || '',
                participants: attendanceCount,
                photos: [], // 추후 갤러리에서 채워짐
                summary: event.description || '',
                isSpecial: event.isSpecial === true, // 특별산행은 hikingCount 집계 제외
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              // Firebase hikingHistory 컬렉션에 저장
              const { setDocument: saveHistoryDoc } = await import('../../lib/firebase/firestore');
              await saveHistoryDoc('hikingHistory', historyItem.id, historyItem);
            } catch (error) {
              console.error(`[자동 아카이빙 실패] ${event.title}:`, error);
            }
          }
        }
      }
    };
    
    // 컴포넌트 마운트 시 체크
    checkAndArchiveEvents();
    
    // 매일 자정에 체크 (개발 환경에서는 1분마다)
    const interval = setInterval(checkAndArchiveEvents, 60000); // 1분마다 체크
    
    return () => clearInterval(interval);
  }, [events, updateEvent]);

  // Event Management Handlers
  const handleEdit = (event: HikingEvent) => {
    setEditingEvent(event);
    setFormData(event);
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 산행을 삭제하시겠습니까?')) {
      try {
        // Firebase 삭제 (Context가 자동으로 state 업데이트)
        await deleteEvent(id);
        alert('산행이 삭제되었습니다.');
      } catch (error: any) {
        console.error('산행 삭제 실패:', error);
        alert(`산행 삭제에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 임시 저장 함수 (유효성 검사 없이 저장)
  const handleSaveDraft = async () => {
    // 회차와 제목 자동 설정
    const eventNum = formData.eventNumber ?? nextEventNumber;
    const autoTitle = generateEventTitle(eventNum, formData.isSpecial ?? false, formData.specialType);

    const eventToSave = {
      ...formData,
      id: editingEvent ? editingEvent.id : `event-${Date.now()}`,
      eventNumber: eventNum,
      title: autoTitle,
      cost: formData.paymentInfo?.cost || formData.cost, // paymentInfo.cost와 동기화
      isDraft: true, // 임시 저장 플래그
      isPublished: false, // 임시 저장은 비공개
      status: 'draft' as const,
      currentParticipants: editingEvent?.currentParticipants || 0,
      createdAt: editingEvent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, eventToSave);
        alert('산행 정보가 임시 저장되었습니다.');
      } else {
        await addEvent(eventToSave as HikingEvent);
        alert('산행 정보가 임시 저장되었습니다.');
      }
      
      setIsEditing(false);
      setEditingEvent(null);
      resetForm();
    } catch (error) {
      console.error('임시 저장 실패:', error);
      alert('임시 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleSave = async () => {
    // 입금 정보 완료 여부 확인
    const hasPaymentInfo = formData.paymentInfo && 
                          formData.paymentInfo.cost &&
                          formData.paymentInfo.bankName && 
                          formData.paymentInfo.accountNumber && 
                          formData.paymentInfo.accountHolder &&
                          formData.paymentInfo.managerName &&
                          formData.paymentInfo.managerPhone;

    // 회차와 제목 자동 설정
    const eventNum = formData.eventNumber ?? nextEventNumber;
    const autoTitle = generateEventTitle(eventNum, formData.isSpecial ?? false, formData.specialType);

    const eventToSave = {
      ...formData,
      id: editingEvent ? editingEvent.id : `event-${Date.now()}`,
      eventNumber: eventNum,
      title: autoTitle,
      cost: formData.paymentInfo?.cost || formData.cost, // paymentInfo.cost와 동기화
      isDraft: false, // 정식 저장
      isPublished: hasPaymentInfo ? true : false, // 입금 정보 완료 시 자동 공개
      currentParticipants: editingEvent?.currentParticipants || 0,
      createdAt: editingEvent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingEvent) {
        // Firebase 업데이트 (Context가 자동으로 state 업데이트)
        await updateEvent(editingEvent.id, eventToSave);
        
        if (hasPaymentInfo && !editingEvent.isPublished) {
          alert('입금 정보가 완료되어 산행이 공개되었습니다!');
        } else {
          alert('산행이 수정되었습니다.');
        }
      } else {
        // Firebase 추가 (Context가 자동으로 state 업데이트)
        await addEvent(eventToSave as HikingEvent);
        
        if (hasPaymentInfo) {
          alert('입금 정보가 완료되어 산행이 공개되었습니다!');
        } else {
          alert('산행이 저장되었습니다. 입금 정보를 입력하면 자동으로 공개됩니다.');
        }
      }
      
      setIsEditing(false);
      setEditingEvent(null);
      resetForm();
    } catch (error: any) {
      console.error('산행 저장 실패:', error);
      alert(`산행 저장에 실패했습니다: ${error.message}`);
    }
  };

  // ===== 답사 사진 업로드 =====
  const handleSurveyPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log('[답사사진] 파일 선택:', files?.length, '개');
    if (!files || files.length === 0) return;

    const maxFiles = 30;
    const currentPhotos = formData.surveyPhotos || [];
    if (currentPhotos.length + files.length > maxFiles) {
      alert(`답사 사진은 최대 ${maxFiles}장까지 업로드할 수 있습니다.`);
      return;
    }

    setIsUploadingPhotos(true);
    const eventId = editingEvent?.id || formData.id || `event-${Date.now()}`;
    console.log('[답사사진] 업로드 대상 이벤트:', eventId);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`[답사사진] 파일 ${i + 1}/${files.length}:`, file.name, file.type, `${(file.size / 1024 / 1024).toFixed(2)}MB`);
        
        if (!file.type.startsWith('image/')) {
          alert(`${file.name}은 이미지 파일이 아닙니다.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name}의 크기가 10MB를 초과합니다.`);
          continue;
        }

        setUploadProgress(`업로드 중... (${i + 1}/${files.length})`);
        const storagePath = `events/${eventId}/survey/${Date.now()}_${file.name}`;
        console.log('[답사사진] Storage 경로:', storagePath);
        
        const result = await uploadImage(storagePath, file, 1920, 0.85);
        console.log('[답사사진] 업로드 결과:', result.success, result.url ? '✅ URL 받음' : '❌ URL 없음', result.error || '');

        if (result.success && result.url) {
          newUrls.push(result.url);
        } else {
          console.error(`[답사사진] ${file.name} 업로드 실패:`, result.error);
          alert(`${file.name} 업로드에 실패했습니다: ${result.error || '알 수 없는 오류'}`);
        }
      }

      console.log('[답사사진] 업로드 완료:', newUrls.length, '개 성공');
      if (newUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          surveyPhotos: [...(prev.surveyPhotos || []), ...newUrls],
        }));
      }
    } catch (error: any) {
      console.error('[답사사진] 업로드 오류:', error);
      alert(`사진 업로드 중 오류가 발생했습니다: ${error.message || error}`);
    } finally {
      setIsUploadingPhotos(false);
      setUploadProgress('');
      // input 초기화
      e.target.value = '';
    }
  };

  // ===== 답사 사진 삭제 =====
  const handleRemoveSurveyPhoto = async (photoUrl: string, index: number) => {
    if (!confirm('이 사진을 삭제하시겠습니까?')) return;

    try {
      // Firebase Storage에서 파일 삭제 시도 (URL에서 path 추출)
      const pathMatch = photoUrl.match(/events%2F(.+?)\?/);
      if (pathMatch) {
        const decodedPath = `events/${decodeURIComponent(pathMatch[1])}`;
        await deleteFile(decodedPath).catch(() => {});
      }
    } catch {
      // Storage 삭제 실패해도 목록에서는 제거
    }

    setFormData(prev => ({
      ...prev,
      surveyPhotos: (prev.surveyPhotos || []).filter((_, i) => i !== index),
    }));
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingEvent(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      id: '',
      title: generateEventTitle(nextEventNumber, false),
      eventNumber: nextEventNumber,
      date: '',
      location: '',
      mountain: '',
      altitude: '',
      difficulty: '중',
      description: '',
      maxParticipants: totalMembersCount || 100,
      cost: '60,000원',
      schedule: [
        { time: '', location: '', type: 'departure' },
        { time: '', location: '', type: 'stop' },
        { time: '', location: '', type: 'return' },
        { time: '', location: '', type: 'arrival' },
      ],
      courses: [
        {
          id: 'default-course-a',
          name: 'A조',
          description: '',
          distance: '',
          duration: '',
          difficulty: '중',
        }
      ],
      paymentInfo: {
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        managerName: '',
        managerPhone: '',
        cost: '60,000원',
      },
      isPublished: false,
      isSpecial: false,
      status: 'draft',
      applicationDeadline: '',
    });
  };

  // ==================== 상태 전환 함수들 ====================
  
  // 1단계 → 2단계: 산행 공개 (신청 접수 시작)
  const handleOpenApplication = async (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    
    if (!event.paymentInfo?.bankName || !event.paymentInfo?.accountNumber) {
      alert('입금 정보를 먼저 입력해주세요.');
      return;
    }
    
    if (!event.applicationDeadline) {
      alert('신청 마감일을 먼저 설정해주세요.');
      return;
    }
    
    if (confirm('산행을 공개하고 신청 접수를 시작하시겠습니까?')) {
      try {
        await updateEvent(eventId, { status: 'open', isPublished: true });
        alert('산행이 공개되었습니다. 회원들이 신청할 수 있습니다.');
      } catch (error: any) {
        console.error('산행 공개 실패:', error);
        alert(`산행 공개에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 4단계: 신청 마감
  const handleCloseApplication = async (eventId: string) => {
    if (confirm('산행 신청을 마감하시겠습니까?\n마감 후에는 추가 신청을 받을 수 없습니다.')) {
      try {
        await updateEvent(eventId, { status: 'closed' });
        alert('산행 신청이 마감되었습니다.\n이제 조 편성을 진행해주세요.');
      } catch (error: any) {
        console.error('신청 마감 실패:', error);
        alert(`신청 마감에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 신청 재오픈 (closed → open)
  const handleReopenApplication = async (eventId: string) => {
    if (confirm('산행 신청을 다시 오픈하시겠습니까?\n신청을 재오픈하면 추가 신청을 받을 수 있습니다.')) {
      try {
        await updateEvent(eventId, { status: 'open' });
        alert('산행 신청이 재오픈되었습니다.\n추가 신청을 받을 수 있습니다.');
      } catch (error: any) {
        console.error('신청 재오픈 실패:', error);
        alert(`신청 재오픈에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 6단계: 산행 진행중으로 변경 (당일)
  const handleStartHiking = async (eventId: string) => {
    if (confirm('산행을 시작하시겠습니까?')) {
      try {
        await updateEvent(eventId, { status: 'ongoing' });
        alert('산행이 시작되었습니다. 안전한 산행 되세요!');
      } catch (error: any) {
        console.error('산행 시작 실패:', error);
        alert(`산행 시작에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 7단계: 산행 완료 (다음날 자동 또는 수동)
  const handleCompleteHiking = async (eventId: string) => {
    if (confirm('산행을 완료 처리하시겠습니까?\n완료된 산행은 이전 산행 목록으로 이동됩니다.')) {
      try {
        const event = events.find(e => e.id === eventId);
        if (!event) {
          alert('산행을 찾을 수 없습니다.');
          return;
        }

        // 1. 산행 상태를 completed로 변경
        await updateEvent(eventId, { status: 'completed' });

        // 2. hikingHistory 컬렉션에 자동 생성
        const participants = getParticipantsByEventId(eventId);
        const attendanceCount = participants.filter(p => p.status === 'confirmed').length;

        const historyItem: any = {
          id: `history-${eventId}`,
          eventId: eventId,
          title: event.title,
          date: event.date,
          year: new Date(event.date).getFullYear().toString(),
          location: event.location,
          mountain: event.mountain || '',
          altitude: event.altitude || '',
          participants: attendanceCount,
          photos: [], // 추후 갤러리에서 채워짐
          summary: event.description || '',
          isSpecial: event.isSpecial === true, // 특별산행은 hikingCount 집계 제외
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Firebase hikingHistory 컬렉션에 저장
        const { setDocument } = await import('../../lib/firebase/firestore');
        await setDocument('hikingHistory', historyItem.id, historyItem);
        
        alert('산행이 완료되었습니다. 수고하셨습니다!\n산행 기록이 이전 산행 목록에 자동으로 추가되었습니다.');
      } catch (error: any) {
        console.error('산행 완료 실패:', error);
        alert(`산행 완료 처리에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 완료된 산행을 되돌리는 함수
  const handleRevertCompleted = async (eventId: string) => {
    if (confirm('완료된 산행을 되돌리시겠습니까?\n산행 상태가 "진행중"으로 변경됩니다.')) {
      try {
        const event = events.find(e => e.id === eventId);
        if (!event) {
          alert('산행을 찾을 수 없습니다.');
          return;
        }

        // 산행 상태를 ongoing으로 되돌림
        await updateEvent(eventId, { status: 'ongoing' });
        
        alert('산행이 "진행중" 상태로 되돌려졌습니다.');
      } catch (error: any) {
        console.error('산행 되돌리기 실패:', error);
        alert(`산행 되돌리기에 실패했습니다: ${error.message}`);
      }
    }
  };

  // 상태별 액션 버튼 렌더링
  const getStatusActions = (event: HikingEvent) => {
    const today = new Date();
    const eventDate = new Date(event.date);
    const deadlineDate = event.applicationDeadline ? new Date(event.applicationDeadline) : null;
    
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    // deadlineDate는 시간 정보를 유지 (관리자가 설정한 시간 기준으로 마감)
    
    const isEventDay = eventDate.getTime() === today.getTime();
    const isAfterEvent = today > eventDate;
    
    switch (event.status) {
      case 'draft':
        return (
          <button
            onClick={() => handleOpenApplication(event.id)}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            신청 접수 시작
          </button>
        );
      
      case 'open':
        return (
          <button
            onClick={() => handleCloseApplication(event.id)}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-amber-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-amber-700 transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            신청 마감
          </button>
        );
      
      case 'closed':
        return (
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            <button
              onClick={() => handleReopenApplication(event.id)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-1.5 sm:gap-2"
            >
              <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              신청 재오픈
            </button>
            {isEventDay && (
              <button
                onClick={() => handleStartHiking(event.id)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 sm:gap-2"
              >
                <Mountain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                산행 시작
              </button>
            )}
            <button
              onClick={() => handleCompleteHiking(event.id)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center gap-1.5 sm:gap-2"
            >
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              산행 완료
            </button>
          </div>
        );
      
      case 'ongoing':
        return (
          <button
            onClick={() => handleCompleteHiking(event.id)}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            산행 완료
          </button>
        );
      
      case 'completed':
        if (isAfterEvent) {
          // 날짜가 지난 완료된 산행 → 마감 표시 (되돌리기 불가)
          return (
            <span className="px-4 py-2 bg-slate-200 text-slate-500 rounded-lg font-semibold flex items-center gap-2 cursor-default">
              <Lock className="w-4 h-4" />
              마감
            </span>
          );
        }
        // 날짜가 지나지 않은 경우 (수동 완료 등) → 되돌리기 가능
        return (
          <button
            onClick={() => handleRevertCompleted(event.id)}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 transition-colors flex items-center gap-2"
            title="진행중으로 되돌림"
          >
            <Undo className="w-4 h-4" />
            되돌리기
          </button>
        );
      
      default:
        return null;
    }
  };

  // 상태별 뱃지 색상 및 텍스트
  const getStatusBadge = (status: HikingEvent['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="default">작성중</Badge>;
      case 'open':
        return <Badge variant="success">신청 접수중</Badge>;
      case 'closed':
        return <Badge variant="warning">신청 마감</Badge>;
      case 'ongoing':
        return <Badge variant="primary">산행중</Badge>;
      case 'completed':
        return <Badge variant="info">완료</Badge>;
      default:
        return null;
    }
  };

  const handleScheduleChange = (index: number, field: 'time' | 'location', value: string) => {
    setFormData(prev => {
      const newSchedule = [...prev.schedule];
      newSchedule[index] = { ...newSchedule[index], [field]: value };
      return { ...prev, schedule: newSchedule };
    });
  };

  const addScheduleItem = () => {
    setFormData(prev => ({
      ...prev,
      schedule: [...prev.schedule, { time: '', location: '', type: 'stop' as const }],
    }));
  };

  const removeScheduleItem = (index: number) => {
    setFormData(prev => {
      if (prev.schedule.length > 1) {
        return { ...prev, schedule: prev.schedule.filter((_, i) => i !== index) };
      }
      return prev;
    });
  };

  const updateScheduleType = (index: number, type: 'departure' | 'stop' | 'lunch' | 'networking' | 'lunch_networking' | 'return' | 'arrival' | 'hiking_start' | 'hiking_end') => {
    setFormData(prev => {
      const newSchedule = [...prev.schedule];
      newSchedule[index] = { ...newSchedule[index], type };
      return { ...prev, schedule: newSchedule };
    });
  };

  // 당일 동선 드래그 앤 드롭 핸들러
  const handleScheduleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleScheduleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };

  const handleScheduleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setFormData(prev => {
      const newSchedule = [...prev.schedule];
      const [moved] = newSchedule.splice(dragIndex, 1);
      newSchedule.splice(index, 0, moved);
      return { ...prev, schedule: newSchedule };
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleScheduleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Course Management
  const addCourse = () => {
    const currentCourses = formData.courses || [];
    const nextCourseName = currentCourses.length === 1 && currentCourses[0].name === 'A조' ? 'B조' : '';
    
    // 이미 B조가 있으면 더 이상 추가하지 않음
    if (currentCourses.some(c => c.name === 'B조')) {
      alert('코스는 최대 2개(A조, B조)까지만 추가할 수 있습니다.');
      return;
    }
    
    const newCourse: Course = {
      id: Date.now().toString(),
      name: nextCourseName,
      description: '',
      distance: '',
      duration: '',
      difficulty: '중',
    };
    setFormData(prev => ({
      ...prev,
      courses: [...(prev.courses || []), newCourse],
    }));
  };

  const removeCourse = (courseId: string) => {
    setFormData(prev => ({
      ...prev,
      courses: prev.courses?.filter(c => c.id !== courseId) || [],
    }));
  };

  const updateCourse = (courseId: string, field: keyof Course, value: string) => {
    setFormData(prev => ({
      ...prev,
      courses: prev.courses?.map(c =>
        c.id === courseId ? { ...c, [field]: value } : c
      ) || [],
    }));
  };

  // 이전 산행의 입금 정보 불러오기
  const loadPreviousPaymentInfo = () => {
    // 날짜순으로 정렬하여 가장 최근 산행 찾기
    const sortedEvents = [...events].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // 입금 정보가 있는 가장 최근 산행 찾기
    const recentEventWithPayment = sortedEvents.find(event => 
      event.paymentInfo?.bankName && 
      event.paymentInfo?.accountNumber &&
      event.paymentInfo?.accountHolder &&
      event.id !== editingEvent?.id // 현재 편집 중인 이벤트는 제외
    );

    if (!recentEventWithPayment) {
      alert('불러올 이전 입금 정보가 없습니다.');
      return;
    }

    if (confirm(`"${recentEventWithPayment.title}"의 입금 정보를 불러오시겠습니까?\n\n은행: ${recentEventWithPayment.paymentInfo?.bankName}\n계좌: ${recentEventWithPayment.paymentInfo?.accountNumber}\n예금주: ${recentEventWithPayment.paymentInfo?.accountHolder}`)) {
      const prevPaymentInfo = recentEventWithPayment.paymentInfo!;
      setFormData(prev => ({
        ...prev,
        paymentInfo: {
          ...prevPaymentInfo,
          // 참가비는 복사하지 않음 (산행마다 다를 수 있음)
          cost: prev.paymentInfo?.cost || '60,000원',
        },
      }));
      alert('이전 입금 정보를 불러왔습니다. 참가비는 별도로 입력해주세요.');
    }
  };

  // 산행 등록 가능 여부 체크 로직
  const checkCanAddEvent = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 현재 월의 미래 산행 개수 확인
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const futureEventsThisMonth = events.filter(event => {
      const eventDate = new Date(event.date);
      const eventYear = eventDate.getFullYear();
      const eventMonth = eventDate.getMonth();
      
      // 같은 월이고 날짜가 오늘 이후인 산행
      return eventYear === currentYear && 
             eventMonth === currentMonth && 
             eventDate >= today;
    });
    
    // 다음 달의 미래 산행 개수 확인
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    
    const futureEventsNextMonth = events.filter(event => {
      const eventDate = new Date(event.date);
      const eventYear = eventDate.getFullYear();
      const eventMonth = eventDate.getMonth();
      
      return eventYear === nextYear && eventMonth === nextMonth;
    });
    
    // 최대 2개까지만 등록 가능 (현재월 + 다음월 합쳐서)
    const totalFutureEvents = futureEventsThisMonth.length + futureEventsNextMonth.length;
    
    return {
      canAdd: totalFutureEvents < 2,
      currentMonthCount: futureEventsThisMonth.length,
      nextMonthCount: futureEventsNextMonth.length,
      totalCount: totalFutureEvents,
      reason: totalFutureEvents >= 2 
        ? '최대 2개의 예정된 산행만 등록할 수 있습니다.' 
        : futureEventsThisMonth.length >= 1 && futureEventsNextMonth.length >= 1
        ? '이번 달과 다음 달 산행이 이미 등록되어 있습니다.'
        : '',
    };
  };
  
  const eventRegistrationStatus = checkCanAddEvent();

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Action Buttons */}
      <div className="flex justify-end items-center mb-4 sm:mb-6">
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (eventRegistrationStatus.canAdd) {
                  // 새 산행 등록 시 다음 회차 자동 설정
                  setFormData(prev => ({
                    ...prev,
                    eventNumber: nextEventNumber,
                    title: generateEventTitle(nextEventNumber, prev.isSpecial ?? false, prev.specialType),
                  }));
                  setIsEditing(true);
                } else {
                  alert(eventRegistrationStatus.reason);
                }
              }}
              disabled={!eventRegistrationStatus.canAdd}
              className={`flex items-center space-x-2 ${
                eventRegistrationStatus.canAdd
                  ? 'btn-primary'
                  : 'px-6 py-3 bg-slate-300 text-slate-500 rounded-xl font-semibold cursor-not-allowed'
              }`}
            >
              {eventRegistrationStatus.canAdd ? (
                <>
                  <Plus className="h-5 w-5" />
                  <span>새 산행 등록</span>
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5" />
                  <span>등록 불가</span>
                </>
              )}
            </button>
            {!eventRegistrationStatus.canAdd && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <span>{eventRegistrationStatus.reason}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Events Content */}
      <>
        {/* 산행 등록 상태 정보 */}
        {!isEditing && (
          <Card className={`mb-4 sm:mb-8 ${
              eventRegistrationStatus.canAdd 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  eventRegistrationStatus.canAdd 
                    ? 'bg-blue-600' 
                    : 'bg-amber-600'
                }`}>
                  {eventRegistrationStatus.canAdd ? (
                    <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  ) : (
                    <AlertCircle className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm sm:text-lg font-bold mb-1 sm:mb-2 ${
                    eventRegistrationStatus.canAdd 
                      ? 'text-blue-900' 
                      : 'text-amber-900'
                  }`}>
                    {eventRegistrationStatus.canAdd 
                      ? '새로운 산행을 등록할 수 있습니다' 
                      : '산행 등록이 제한되었습니다'}
                  </h3>
                  <div className={`space-y-1 text-sm ${
                    eventRegistrationStatus.canAdd 
                      ? 'text-blue-800' 
                      : 'text-amber-800'
                  }`}>
                    <p>
                      • 현재 예정된 산행: <strong>{eventRegistrationStatus.totalCount}개</strong> / 최대 2개
                    </p>
                    {eventRegistrationStatus.currentMonthCount > 0 && (
                      <p>• 이번 달 예정 산행: {eventRegistrationStatus.currentMonthCount}개</p>
                    )}
                    {eventRegistrationStatus.nextMonthCount > 0 && (
                      <p>• 다음 달 예정 산행: {eventRegistrationStatus.nextMonthCount}개</p>
                    )}
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="font-semibold text-blue-900 mb-2">
                        📋 산행 등록 정책
                      </p>
                      <p className="leading-relaxed">
                        • <strong>정기 산행</strong>: 매월 1회 필수 진행<br />
                        • <strong>특별 산행</strong>: 1박 산행 또는 해외 산행을 위한 추가 등록 가능<br />
                        • <strong>최대 등록</strong>: 동시에 최대 2개까지 등록 가능 (정기 + 특별)
                      </p>
                    </div>
                    {!eventRegistrationStatus.canAdd && (
                      <p className="font-semibold mt-3 pt-3 border-t border-amber-200">
                        💡 기존 산행이 종료되면 새로운 산행을 등록할 수 있습니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {isEditing ? (
            <div className="card">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">
                {editingEvent ? '산행 수정' : '새 산행 등록'}
              </h2>
              <div className="space-y-4 sm:space-y-6">
                {/* 특별산행 선택 */}
                <div className="p-3 sm:p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg sm:rounded-xl border-2 border-purple-200">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <input
                          type="checkbox"
                          id="isSpecial"
                          checked={formData.isSpecial || false}
                          onChange={(e) => { const checked = e.target.checked; setFormData(prev => ({ ...prev, isSpecial: checked })); }}
                          className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
                        />
                        <label htmlFor="isSpecial" className="text-sm sm:text-lg font-bold text-slate-900 cursor-pointer">
                          특별산행으로 등록
                        </label>
                        <Badge variant={formData.isSpecial ? 'primary' : 'default'}>
                          {formData.isSpecial ? '특별산행' : '정기산행'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 ml-8">
                        {formData.isSpecial ? (
                          <>
                            <strong className="text-purple-700">특별산행</strong>: 1박 산행, 해외 산행 등 특별한 산행입니다. 
                            1년에 최대 2번 진행할 수 있습니다.
                          </>
                        ) : (
                          <>
                            <strong className="text-blue-700">정기산행</strong>: 매월 진행되는 정기 당일 산행입니다.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 특별산행 상세 설정 */}
                {formData.isSpecial && (
                  <div className="space-y-4 p-4 sm:p-5 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Mountain className="w-5 h-5 text-purple-600" />
                      <h4 className="font-bold text-purple-900 text-base">특별산행 상세 설정</h4>
                    </div>

                    {/* 유형 선택 */}
                    <div>
                      <label className="block text-slate-700 font-medium mb-2 text-sm">특별산행 유형</label>
                      <div className="flex gap-3">
                        {[
                          { value: 'overseas', label: '🌏 해외산행' },
                          { value: 'domestic_special', label: '⛰️ 국내특별산행' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              specialType: opt.value as 'overseas' | 'domestic_special',
                              title: generateEventTitle(prev.eventNumber ?? nextEventNumber, true, opt.value),
                            }))}
                            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold border-2 transition-all ${
                              formData.specialType === opt.value
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-purple-400'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 날짜 범위 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">출발일 (시작일)</label>
                        <p className="text-xs text-slate-500 mb-1">위 기본 정보의 "산행 날짜"를 사용합니다</p>
                        <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600">
                          {formData.date || '날짜 미설정'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">종료일 (귀국일)</label>
                        <input
                          type="date"
                          value={formData.endDate || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                          className="input-field"
                          min={formData.date || undefined}
                        />
                      </div>
                    </div>

                    {/* 경비 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">회원 경비 (원)</label>
                        <input
                          type="number"
                          value={formData.memberCost || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, memberCost: parseInt(e.target.value) || undefined }))}
                          className="input-field"
                          placeholder="1700000"
                        />
                        {formData.memberCost && (
                          <p className="text-xs text-emerald-600 mt-1">{formData.memberCost.toLocaleString()}원</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">게스트 경비 (원)</label>
                        <input
                          type="number"
                          value={formData.guestCost || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, guestCost: parseInt(e.target.value) || undefined }))}
                          className="input-field"
                          placeholder="1800000"
                        />
                        {formData.guestCost && (
                          <p className="text-xs text-emerald-600 mt-1">{formData.guestCost.toLocaleString()}원</p>
                        )}
                      </div>
                    </div>

                    {/* 회원 신청 기간 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">회원 신청 시작일</label>
                        <input
                          type="date"
                          value={formData.memberApplicationStart || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, memberApplicationStart: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">회원 신청 마감일</label>
                        <input
                          type="date"
                          value={formData.memberApplicationEnd || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, memberApplicationEnd: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                    </div>

                    {/* 예약금 */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">예약금 (원)</label>
                        <input
                          type="number"
                          value={formData.depositAmount || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, depositAmount: parseInt(e.target.value) || undefined }))}
                          className="input-field"
                          placeholder="600000"
                        />
                        {formData.depositAmount && (
                          <p className="text-xs text-emerald-600 mt-1">{formData.depositAmount.toLocaleString()}원</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">예약금 마감일</label>
                        <input
                          type="date"
                          value={formData.depositDeadline || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, depositDeadline: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">잔금 마감일</label>
                        <input
                          type="date"
                          value={formData.balanceDeadline || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, balanceDeadline: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                    </div>

                    {/* 비회원 모집 기간 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">비회원 모집 시작일 <span className="text-slate-400 font-normal">(선택)</span></label>
                        <input
                          type="date"
                          value={formData.guestApplicationStart || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, guestApplicationStart: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-2 text-sm">비회원 모집 마감일</label>
                        <input
                          type="date"
                          value={formData.guestApplicationEnd || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, guestApplicationEnd: e.target.value }))}
                          className="input-field"
                        />
                      </div>
                    </div>

                    {/* 입금 계좌 메모 */}
                    <div>
                      <label className="block text-slate-700 font-medium mb-2 text-sm">입금 계좌 안내</label>
                      <textarea
                        value={formData.specialPaymentNote || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, specialPaymentNote: e.target.value }))}
                        className="input-field"
                        rows={2}
                        placeholder="예: 입금 계좌(시애라 계좌와 별도)는 추후 공지."
                      />
                    </div>

                    {/* 일차별 일정 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-slate-700 font-medium text-sm">일차별 상세 일정</label>
                        <button
                          type="button"
                          onClick={() => {
                            const current = formData.dailySchedule || [];
                            const nextDay = current.length + 1;
                            setFormData(prev => ({
                              ...prev,
                              dailySchedule: [
                                ...(prev.dailySchedule || []),
                                { day: nextDay, date: '', title: `${nextDay}일차`, items: [{ time: '', description: '' }] },
                              ],
                            }));
                          }}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          일차 추가
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(formData.dailySchedule || []).map((dayItem, dayIdx) => (
                          <div key={dayIdx} className="bg-white border border-purple-200 rounded-xl p-3 sm:p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">{dayItem.day}일차</span>
                              <input
                                type="text"
                                value={dayItem.title || ''}
                                onChange={(e) => {
                                  const updated = [...(formData.dailySchedule || [])];
                                  updated[dayIdx] = { ...updated[dayIdx], title: e.target.value };
                                  setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                }}
                                className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-sm"
                                placeholder={`${dayItem.day}일차, 10/${dayItem.day + 7}(${['월','화','수','목','금','토','일'][dayIdx % 7]})`}
                              />
                              <input
                                type="date"
                                value={dayItem.date || ''}
                                onChange={(e) => {
                                  const updated = [...(formData.dailySchedule || [])];
                                  updated[dayIdx] = { ...updated[dayIdx], date: e.target.value };
                                  setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                }}
                                className="px-2 py-1 border border-slate-200 rounded-lg text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (formData.dailySchedule || []).filter((_, i) => i !== dayIdx)
                                    .map((d, i) => ({ ...d, day: i + 1 }));
                                  setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                }}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-2">
                              {dayItem.items.map((item, itemIdx) => (
                                <div key={itemIdx} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={item.time}
                                    onChange={(e) => {
                                      const updated = [...(formData.dailySchedule || [])];
                                      const items = [...updated[dayIdx].items];
                                      items[itemIdx] = { ...items[itemIdx], time: e.target.value };
                                      updated[dayIdx] = { ...updated[dayIdx], items };
                                      setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                    }}
                                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center"
                                    placeholder="09:20"
                                  />
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => {
                                      const updated = [...(formData.dailySchedule || [])];
                                      const items = [...updated[dayIdx].items];
                                      items[itemIdx] = { ...items[itemIdx], description: e.target.value };
                                      updated[dayIdx] = { ...updated[dayIdx], items };
                                      setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                    }}
                                    className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                                    placeholder="일정 내용"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(formData.dailySchedule || [])];
                                      const items = updated[dayIdx].items.filter((_, i) => i !== itemIdx);
                                      updated[dayIdx] = { ...updated[dayIdx], items };
                                      setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                    disabled={dayItem.items.length === 1}
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...(formData.dailySchedule || [])];
                                  updated[dayIdx] = { ...updated[dayIdx], items: [...updated[dayIdx].items, { time: '', description: '' }] };
                                  setFormData(prev => ({ ...prev, dailySchedule: updated }));
                                }}
                                className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 mt-1"
                              >
                                <Plus className="w-3 h-3" />
                                항목 추가
                              </button>
                            </div>
                          </div>
                        ))}

                        {(formData.dailySchedule || []).length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                            "일차 추가" 버튼을 눌러 일차별 일정을 입력하세요
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-purple-600 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      특별산행 회차는 정기산행 카운팅에 포함되지 않습니다.
                    </p>
                  </div>
                )}

                {/* 산행 제목 자동 생성 미리보기 */}
                <div className="p-3 sm:p-4 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm sm:text-base text-slate-700 font-medium">산행 제목</label>
                    <Badge variant="info">자동 생성</Badge>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">회차:</span>
                      <input
                        type="number"
                        value={formData.eventNumber ?? nextEventNumber}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || nextEventNumber;
                          setFormData(prev => ({
                            ...prev,
                            eventNumber: num,
                            title: generateEventTitle(num, prev.isSpecial ?? false, prev.specialType),
                          }));
                        }}
                        className="w-20 sm:w-24 px-2 sm:px-3 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-center font-bold text-base sm:text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        min={1}
                      />
                      <span className="text-xs sm:text-sm text-slate-500">차</span>
                    </div>
                    <div className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-sm sm:text-lg font-bold text-slate-900">{formData.title || generateEventTitle(formData.eventNumber ?? nextEventNumber, formData.isSpecial ?? false, formData.specialType)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    회차 번호와 산행 유형(정기/특별)에 따라 제목이 자동으로 생성됩니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      산행 날짜
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => { const val = e.target.value; setFormData(prev => ({ ...prev, date: val })); }}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      신청 마감일시
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.applicationDeadline || ''}
                      onChange={(e) => { const val = e.target.value; setFormData(prev => ({ ...prev, applicationDeadline: val })); }}
                      className="input-field"
                      max={formData.date ? `${formData.date}T23:59` : undefined}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      신청 마감일시는 산행 날짜 이전이어야 합니다 (예: 2025-03-01 18:00)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 산 이름 검색 (필수) */}
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      산 이름
                    </label>
                    <MountainSearch
                      initialValue={formData.mountain}
                      initialAltitude={formData.altitude}
                      onSelect={(result) => {
                        setFormData(prev => ({
                          ...prev,
                          mountain: result.name,
                          altitude: result.altitude || prev.altitude || '',
                        }));
                      }}
                    />
                  </div>

                  {/* 주소 검색 */}
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      산행 장소 주소 검색
                    </label>
                    <AddressSearch
                      initialValue={formData.address}
                      onSelect={(result) => {
                        setFormData(prev => ({
                          ...prev,
                          location: result.address,
                          address: result.address,
                          coordinates: result.coordinates,
                        }));
                      }}
                    />
                  </div>

                  {/* 좌표 정보 표시 (읽기 전용) */}
                  {formData.coordinates && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-semibold text-blue-900 mb-2">📍 저장된 좌표 정보</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-blue-700">위도:</span>
                          <span className="ml-2 font-mono text-blue-900">
                            {formData.coordinates.latitude.toFixed(6)}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">경도:</span>
                          <span className="ml-2 font-mono text-blue-900">
                            {formData.coordinates.longitude.toFixed(6)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 mt-2">
                        💡 이 좌표를 기반으로 날씨 정보를 제공합니다.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      고도
                      {formData.altitude && (
                        <span className="ml-2 text-xs font-normal text-emerald-600">자동 입력됨</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.altitude || ''}
                      onChange={(e) => { const val = e.target.value; setFormData(prev => ({ ...prev, altitude: val })); }}
                      className="input-field"
                      placeholder="산 검색 시 자동 입력됩니다"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-2">
                      난이도
                    </label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => { const val = e.target.value as any; setFormData(prev => ({ ...prev, difficulty: val })); }}
                      className="input-field"
                    >
                      <option value="하">하</option>
                      <option value="중하">중하</option>
                      <option value="중">중</option>
                      <option value="중상">중상</option>
                      <option value="상">상</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-2">
                    설명
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => { const val = e.target.value; setFormData(prev => ({ ...prev, description: val })); }}
                    className="input-field"
                    rows={3}
                    placeholder="산행에 대한 설명을 입력하세요"
                  />
                </div>

                {/* 답사 사진 업로드 */}
                <div className="p-3 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    <label className="block text-slate-900 font-bold text-sm sm:text-base">
                      답사 사진
                    </label>
                    <span className="text-xs text-slate-500 ml-auto">
                      {(formData.surveyPhotos || []).length}/30장
                    </span>
                  </div>

                  {/* 업로드된 사진 미리보기 */}
                  {formData.surveyPhotos && formData.surveyPhotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mb-3">
                      {formData.surveyPhotos.map((url, idx) => (
                        <div key={idx} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-slate-200">
                          <img
                            src={url}
                            alt={`답사 사진 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSurveyPhoto(url, idx)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                            {idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 업로드 버튼 */}
                  <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    isUploadingPhotos
                      ? 'border-blue-300 bg-blue-50 cursor-wait'
                      : 'border-blue-300 bg-white hover:bg-blue-50 hover:border-blue-400'
                  }`}>
                    {isUploadingPhotos ? (
                      <>
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        <span className="text-sm font-medium text-blue-600">{uploadProgress || '업로드 중...'}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-blue-500" />
                        <span className="text-sm font-medium text-blue-600">사진 추가</span>
                        <span className="text-xs text-slate-400">(최대 10MB, JPG/PNG)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleSurveyPhotoUpload}
                      disabled={isUploadingPhotos || (formData.surveyPhotos || []).length >= 30}
                      className="hidden"
                    />
                  </label>

                  <p className="text-xs text-slate-500 mt-2">
                    답사 시 촬영한 등산로, 주요 지점 사진을 업로드하면 회원들이 산행 정보를 미리 확인할 수 있습니다.
                  </p>
                </div>

                {/* 당일 비상연락처 */}
                <div className="p-3 sm:p-5 bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-lg sm:rounded-xl">
                  <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                    <label className="block text-slate-900 font-bold text-sm sm:text-base">
                      당일 비상연락처
                    </label>
                  </div>

                  {/* 드롭다운: 운영진 + 기타 */}
                  <select
                    value={
                      emergencyContactMode === 'search' 
                        ? '__other__' 
                        : formData.emergencyContactId || ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__other__') {
                        setEmergencyContactMode('search');
                        setMemberSearchQuery('');
                        setFormData(prev => ({ ...prev, emergencyContactId: '', emergencyContactName: '', emergencyContactPhone: '' }));
                        return;
                      }
                      setEmergencyContactMode('executive');
                      setMemberSearchQuery('');
                      const exec = executiveList.find(ex => String(ex.id) === val);
                      setFormData(prev => ({
                        ...prev,
                        emergencyContactId: val,
                        emergencyContactName: exec?.name || '',
                        emergencyContactPhone: exec?.phoneNumber || '',
                      }));
                    }}
                    className="input-field bg-white"
                  >
                    <option value="">선택하세요</option>
                    {chairmanExecutives.length > 0 && (
                      <optgroup label="회장단">
                        {chairmanExecutives.map((exec) => (
                          <option key={exec.id} value={exec.id}>
                            {exec.name} ({exec.position}) - {exec.phoneNumber?.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {committeeExecutives.length > 0 && (
                      <optgroup label="운영위원회">
                        {committeeExecutives.map((exec) => (
                          <option key={exec.id} value={exec.id}>
                            {exec.name} ({exec.position}) - {exec.phoneNumber?.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="──────────">
                      <option value="__other__">기타 (회원 검색)</option>
                    </optgroup>
                  </select>

                  {/* 기타 선택 시: 회원 검색 */}
                  {emergencyContactMode === 'search' && (
                    <div className="mt-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          placeholder="이름, 회사명, 전화번호로 검색..."
                          className="input-field bg-white pl-10"
                          autoFocus
                        />
                      </div>
                      {memberSearchQuery.trim() ? (
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          {filteredMembers.length > 0 ? (
                            <div className="divide-y divide-slate-100">
                              {filteredMembers.map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      emergencyContactId: member.id,
                                      emergencyContactName: member.name,
                                      emergencyContactPhone: member.phoneNumber || '',
                                    }));
                                    setMemberSearchQuery('');
                                  }}
                                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
                                >
                                  <div>
                                    <span className="text-sm font-semibold text-slate-900">{member.name}</span>
                                    <span className="text-xs text-slate-400 ml-2">
                                      {[member.company, member.position].filter(Boolean).join(' ')}
                                    </span>
                                  </div>
                                  <span className="text-xs text-slate-400">{member.phoneNumber?.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="px-4 py-4 text-center text-sm text-slate-400">검색 결과가 없습니다</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2 ml-1">이름, 회사명 또는 전화번호를 입력하세요</p>
                      )}
                    </div>
                  )}

                  {/* 선택 결과 표시 */}
                  {formData.emergencyContactId && (
                    <div className="mt-3 px-3 py-2.5 bg-white rounded-lg border border-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm font-bold text-slate-900">{formData.emergencyContactName}</span>
                        <span className="text-sm text-slate-500">{formData.emergencyContactPhone?.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, emergencyContactId: '', emergencyContactName: '', emergencyContactPhone: '' }));
                          setEmergencyContactMode('executive');
                          setMemberSearchQuery('');
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mt-2 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>산행 당일 비상 상황 발생 시 연락할 담당자를 선택하세요.</span>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <label className="block text-sm sm:text-base text-slate-700 font-medium">
                      당일 동선
                    </label>
                    <button
                      type="button"
                      onClick={addScheduleItem}
                      className="px-3 py-1.5 sm:px-4 sm:py-2 bg-primary-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-primary-700 transition-colors flex items-center space-x-1.5 sm:space-x-2"
                    >
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>항목 추가</span>
                    </button>
                  </div>
                  <div className="space-y-2 sm:space-y-3">
                    {formData.schedule.map((item, index) => (
                      <div
                        key={index}
                        draggable
                        onDragStart={() => handleScheduleDragStart(index)}
                        onDragOver={(e) => handleScheduleDragOver(e, index)}
                        onDrop={() => handleScheduleDrop(index)}
                        onDragEnd={handleScheduleDragEnd}
                        className={`relative p-2.5 sm:p-4 rounded-lg border-2 transition-all ${
                          dragIndex === index
                            ? 'opacity-40 border-dashed border-slate-400 bg-slate-100'
                            : dragOverIndex === index
                            ? 'border-emerald-400 bg-emerald-50 shadow-md'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex gap-2 sm:gap-3">
                          {/* 드래그 핸들 */}
                          <div
                            className="hidden sm:flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 pt-6 flex-shrink-0"
                            title="드래그하여 순서 변경"
                          >
                            <GripVertical className="h-5 w-5" />
                          </div>

                          {/* 필드 영역 */}
                          <div className="flex-1 grid grid-cols-3 sm:grid-cols-1 md:grid-cols-12 gap-2 sm:gap-3">
                            <div className="col-span-1 md:col-span-3">
                              <label className="block text-xs sm:text-sm text-slate-600 mb-1">유형</label>
                              <select
                                value={item.type}
                                onChange={(e) => updateScheduleType(index, e.target.value as any)}
                                className="input-field"
                              >
                                <option value="departure">출발</option>
                                <option value="stop">정차</option>
                                <option value="hiking_start">입산</option>
                                <option value="lunch_networking">점심/네트워킹</option>
                                <option value="hiking_end">하산</option>
                                <option value="return">복귀</option>
                                <option value="arrival">도착</option>
                              </select>
                            </div>
                            <div className="col-span-1 md:col-span-3">
                              <label className="block text-xs sm:text-sm text-slate-600 mb-1">시간</label>
                              <select
                                value={item.time}
                                onChange={(e) => handleScheduleChange(index, 'time', e.target.value)}
                                className="input-field"
                              >
                                <option value="">시간 선택</option>
                                {timeOptions.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-3 sm:col-span-1 md:col-span-5">
                              <label className="block text-xs sm:text-sm text-slate-600 mb-1">장소</label>
                              <input
                                type="text"
                                value={item.location}
                                onChange={(e) => handleScheduleChange(index, 'location', e.target.value)}
                                className="input-field"
                                placeholder="종합운동장역 2번출구"
                              />
                            </div>
                            <div className="col-span-1 md:col-span-1 flex items-end">
                              <button
                                type="button"
                                onClick={() => removeScheduleItem(index)}
                                className="w-full px-2 py-2 sm:px-3 sm:py-3 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                disabled={formData.schedule.length === 1}
                              >
                                <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 mx-auto" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    * 최소 1개 이상의 동선 항목이 필요합니다
                  </p>
                </div>

                {/* Courses Section */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div className="flex-1">
                      <label className="block text-slate-900 font-bold text-base sm:text-lg mb-0.5 sm:mb-1">
                        산행 코스
                      </label>
                      <p className="text-xs sm:text-sm text-slate-600">
                        참가자가 신청 시 선택할 수 있는 코스를 등록하세요 (A조, B조)
                      </p>
                    </div>
                    {(!formData.courses || !formData.courses.some(c => c.name === 'B조')) && (
                      <button
                        type="button"
                        onClick={addCourse}
                        className="self-start px-4 py-2 sm:px-6 sm:py-3 bg-primary-600 text-white rounded-lg text-sm sm:text-base font-bold hover:bg-primary-700 transition-colors flex items-center space-x-1.5 sm:space-x-2 shadow-lg border-2 border-primary-700"
                      >
                        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span>B조 추가</span>
                      </button>
                    )}
                  </div>

                  <div className="mb-4 p-4 bg-info-50 rounded-lg border border-info-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-info-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-info-900">
                        <strong>코스 등록 안내:</strong> A조(난이도 높음), B조(난이도 낮음) - 참가자는 산행 신청 시 원하는 코스를 선택하게 됩니다
                      </div>
                    </div>
                  </div>
                  
                  {formData.courses && formData.courses.length > 0 && (
                    <div className="space-y-6">
                      {formData.courses.map((course, courseIdx) => (
                        <div key={course.id} className={`p-3 sm:p-5 rounded-lg sm:rounded-xl border-2 ${
                          course.name === 'A조' ? 'bg-success-50 border-success-200' :
                          course.name === 'B조' ? 'bg-info-50 border-info-200' :
                          'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm sm:text-lg font-bold text-slate-900">
                                코스 {courseIdx + 1}
                              </h4>
                              {course.name && (
                                <Badge variant={
                                  course.name === 'A조' ? 'success' :
                                  course.name === 'B조' ? 'info' :
                                  'default'
                                }>
                                  {course.name}
                                </Badge>
                              )}
                            </div>
                            {/* A조는 삭제 불가 */}
                            {course.name !== 'A조' && (
                              <button
                                type="button"
                                onClick={() => removeCourse(course.id)}
                                className="px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors flex items-center space-x-1 text-sm font-medium"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>코스 삭제</span>
                              </button>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4 mb-3 sm:mb-4">
                            <div>
                              <label className="block text-sm text-slate-700 font-medium mb-1">
                                코스명
                              </label>
                              <div className="px-4 py-3 bg-slate-100 rounded-lg border border-slate-300">
                                <p className="font-bold text-lg text-slate-900">{course.name}</p>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm text-slate-700 font-medium mb-1">
                                거리
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={course.distance.replace(/[^0-9.]/g, '')}
                                  onChange={(e) => {
                                    const numValue = e.target.value;
                                    updateCourse(course.id, 'distance', numValue ? `약 ${numValue}km` : '');
                                  }}
                                  className="input-field pr-12"
                                  placeholder="8.5"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                                  km
                                </span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm text-slate-700 font-medium mb-1">
                                소요시간
                              </label>
                              <input
                                type="text"
                                value={course.duration || ''}
                                onChange={(e) => updateCourse(course.id, 'duration', e.target.value)}
                                className="input-field"
                                placeholder="예: 4시간 30분"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-700 font-medium mb-1">
                                난이도
                              </label>
                              <select
                                value={course.difficulty || '중'}
                                onChange={(e) => updateCourse(course.id, 'difficulty', e.target.value)}
                                className="input-field"
                              >
                                <option value="하">하 (쉬움)</option>
                                <option value="중하">중하</option>
                                <option value="중">중 (보통)</option>
                                <option value="중상">중상</option>
                                <option value="상">상 (어려움)</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2 md:col-span-5">
                              <label className="block text-sm text-slate-700 font-medium mb-1">
                                코스 설명
                              </label>
                              <input
                                type="text"
                                value={course.description}
                                onChange={(e) => updateCourse(course.id, 'description', e.target.value)}
                                className="input-field"
                                placeholder="한국APT - 약수터 - 성당칼림길 - 능선길 - 정상(737.2m)..."
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {(!formData.courses || formData.courses.length === 0) && (
                    <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
                      <p className="text-slate-500">코스가 없습니다. 코스를 추가해주세요.</p>
                    </div>
                  )}
                </div>

                {/* 입금 정보 */}
                <div className="border-t-2 border-primary-200 pt-5 sm:pt-8">
                  <div className="bg-primary-50 rounded-lg sm:rounded-xl p-3 sm:p-6 mb-4 sm:mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-12 sm:h-12 bg-primary-600 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                          <CreditCard className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-base sm:text-2xl font-bold text-slate-900">입금 정보</h3>
                          <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1">참가자들이 참가비를 입금할 계좌 정보를 입력하세요</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={loadPreviousPaymentInfo}
                        className="self-start sm:self-auto px-3 py-1.5 sm:px-4 sm:py-2 bg-white border-2 border-primary-300 text-primary-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-primary-50 transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
                      >
                        <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                        <span>이전 정보 불러오기</span>
                      </button>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-white rounded-lg border border-primary-200">
                      <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-slate-700">
                        <strong className="text-primary-700">필수 정보:</strong> 모든 입금 정보를 정확히 입력해야 참가자들이 산행을 신청할 수 있습니다.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        참가비
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₩</span>
                        <input
                          type="number"
                          value={formData.paymentInfo?.cost ? parseInt(formData.paymentInfo.cost.replace(/[^0-9]/g, '')) : ''}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/[^0-9]/g, '');
                            const formattedValue = numericValue ? `${parseInt(numericValue).toLocaleString()}원` : '';
                            setFormData(prev => ({
                              ...prev,
                              paymentInfo: { ...prev.paymentInfo!, cost: formattedValue },
                            }));
                          }}
                          className="input-field pl-10 text-lg font-bold"
                          placeholder="60000"
                          min="0"
                          step="1000"
                        />
                        {formData.paymentInfo?.cost && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 font-medium">
                            {formData.paymentInfo.cost}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">숫자만 입력하세요</p>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        은행명
                      </label>
                      <select
                        value={formData.paymentInfo?.bankName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            paymentInfo: { ...prev.paymentInfo!, bankName: val },
                          }));
                        }}
                        className="input-field"
                      >
                        <option value="">은행 선택</option>
                        <option value="국민은행">국민은행</option>
                        <option value="신한은행">신한은행</option>
                        <option value="우리은행">우리은행</option>
                        <option value="하나은행">하나은행</option>
                        <option value="NH농협은행">NH농협은행</option>
                        <option value="IBK기업은행">IBK기업은행</option>
                        <option value="카카오뱅크">카카오뱅크</option>
                        <option value="토스뱅크">토스뱅크</option>
                        <option value="케이뱅크">케이뱅크</option>
                        <option value="SC제일은행">SC제일은행</option>
                        <option value="새마을금고">새마을금고</option>
                        <option value="신협">신협</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        계좌번호
                      </label>
                      <input
                        type="text"
                        value={formData.paymentInfo?.accountNumber || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            paymentInfo: { ...prev.paymentInfo!, accountNumber: val },
                          }));
                        }}
                        className="input-field font-mono text-lg"
                        placeholder="123-456-789012"
                      />
                      <p className="text-sm text-slate-500 mt-1">하이픈(-) 포함하여 입력</p>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        예금주
                      </label>
                      <input
                        type="text"
                        value={formData.paymentInfo?.accountHolder || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            paymentInfo: { ...prev.paymentInfo!, accountHolder: val },
                          }));
                        }}
                        className="input-field"
                        placeholder="시애라 클럽"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        담당자 이름
                      </label>
                      <input
                        type="text"
                        value={formData.paymentInfo?.managerName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            paymentInfo: { ...prev.paymentInfo!, managerName: val },
                          }));
                        }}
                        className="input-field"
                        placeholder="김산행"
                      />
                      <p className="text-sm text-slate-500 mt-1">문의 시 연락받을 담당자</p>
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-2">
                        담당자 연락처
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                          type="tel"
                          value={formData.paymentInfo?.managerPhone || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => ({
                              ...prev,
                              paymentInfo: { ...prev.paymentInfo!, managerPhone: val },
                            }));
                          }}
                          className="input-field pl-10"
                          placeholder="010-1234-5678"
                        />
                      </div>
                      <p className="text-sm text-slate-500 mt-1">입금 문의 연락처</p>
                    </div>
                  </div>

                  <div className="mt-6 p-5 bg-gradient-to-r from-success-50 to-info-50 rounded-xl border-2 border-success-200">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-6 h-6 text-success-600 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="font-bold text-success-900 mb-2">입금 정보 등록 완료 시</h4>
                        <p className="text-sm text-slate-700">산행이 자동으로 공개되며, 회원들이 산행을 확인하고 참석 신청할 수 있습니다. 입금 정보가 참석 신청 화면에 자동 표시됩니다.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4">
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2.5 sm:px-6 sm:py-3 bg-slate-200 text-slate-700 rounded-lg font-medium text-sm sm:text-lg hover:bg-slate-300 transition-colors flex items-center justify-center space-x-1.5 sm:space-x-2 order-3 sm:order-1"
                  >
                    <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>취소</span>
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    className="flex-1 px-4 py-2.5 sm:px-6 sm:py-3 bg-amber-100 text-amber-700 border-2 border-amber-300 rounded-lg font-medium text-sm sm:text-lg hover:bg-amber-200 transition-colors flex items-center justify-center space-x-1.5 sm:space-x-2 order-2"
                  >
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>임시 저장</span>
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 btn-primary flex items-center justify-center space-x-1.5 sm:space-x-2 order-1 sm:order-3"
                  >
                    <Save className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>저장</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 산행 목록을 날짜순으로 정렬 (최신순) */}
              {events
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .reduce((acc, event) => {
                  const eventDate = new Date(event.date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const isPast = eventDate < today;
                  
                  if (!acc.past && isPast) {
                    acc.sections.push(
                      <div key="divider" className="flex items-center gap-4 my-8">
                        <div className="flex-1 h-px bg-slate-300"></div>
                        <div className="px-4 py-2 bg-slate-100 rounded-full">
                          <span className="text-sm font-semibold text-slate-600">지난 산행</span>
                        </div>
                        <div className="flex-1 h-px bg-slate-300"></div>
                      </div>
                    );
                    acc.past = true;
                  }
                  
                  const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  
                  acc.sections.push(
                    <div key={event.id} className={`group relative overflow-hidden transition-all duration-200 hover:shadow-md ${
                      !isPast ? 'bg-white border border-slate-300 hover:border-slate-400' : 'bg-slate-50 border border-slate-200'
                    } rounded-lg`}>
                      {/* 상태 인디케이터 바 - 심플하게 */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${
                        event.status === 'draft' ? 'bg-slate-400' :
                        event.status === 'open' ? 'bg-green-500' :
                        event.status === 'closed' ? 'bg-amber-500' :
                        event.status === 'ongoing' ? 'bg-blue-500' :
                        'bg-slate-300'
                      }`}></div>
                      
                      <div className="p-3 sm:p-5">
                        {/* 헤더: 제목과 배지 */}
                        <div className="mb-3 sm:mb-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-base sm:text-xl font-bold text-slate-900 leading-tight">{event.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            {event.isDraft && (
                              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded">
                                임시 저장
                              </span>
                            )}
                            {event.isSpecial && (
                              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">
                                특별산행
                              </span>
                            )}
                            {!isPast && daysUntil >= 0 && (
                              <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-semibold rounded ${
                                daysUntil <= 3 ? 'bg-slate-100 text-red-600' :
                                daysUntil <= 7 ? 'bg-slate-100 text-amber-600' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                D-{daysUntil}
                              </span>
                            )}
                            {isPast && event.status !== 'completed' && (
                              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded">
                                종료
                              </span>
                            )}
                            {getStatusBadge(event.status)}
                          </div>
                        </div>

                        {/* 산행 정보 */}
                        <div className="space-y-2 sm:space-y-3">
                          {/* 날짜와 장소 */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                              <span className="font-medium text-slate-900">
                                {new Date(event.date).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  weekday: 'short'
                                })}
                              </span>
                            </div>
                            <span className="text-slate-300 hidden sm:inline">|</span>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                              <span className="text-slate-700">
                                {event.mountain || event.location}
                                {event.altitude && ` · ${event.altitude.toLowerCase().includes('m') ? event.altitude : event.altitude + 'm'}`}
                                {event.difficulty && ` · ${event.difficulty}`}
                              </span>
                            </div>
                          </div>

                          {/* 참가 정보 */}
                          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                              <span className="text-slate-700">
                                <span className="font-semibold text-slate-900">{event.currentParticipants || 0}</span>
                                <span className="text-slate-500"> / {event.maxParticipants}명</span>
                              </span>
                            </div>
                            <span className="text-slate-300 hidden sm:inline">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-600">참가비</span>
                              <span className="font-semibold text-slate-900">{event.paymentInfo?.cost || event.cost}</span>
                            </div>
                            {event.applicationDeadline && (
                              <>
                                <span className="text-slate-300 hidden sm:inline">|</span>
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                                  <span className="text-slate-600">
                                    마감: {new Date(event.applicationDeadline).toLocaleDateString('ko-KR', {
                                      month: 'long',
                                      day: 'numeric'
                                    })} {new Date(event.applicationDeadline).toLocaleTimeString('ko-KR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
                                    })}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          
                          {/* 설명 */}
                          {event.description && (
                            <p className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                              {event.description}
                            </p>
                          )}
                          
                          {/* 입금 정보 미완료 경고 */}
                          {!event.isPublished && !isPast && (
                            <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                              <p className="font-semibold text-amber-900 flex items-center gap-2 text-xs sm:text-sm">
                                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                                입금 정보 미완료
                              </p>
                              <p className="text-xs text-amber-800 mt-1">
                                이 산행은 아직 공개되지 않았습니다. 입금 정보를 모두 입력하면 자동으로 공개됩니다.
                              </p>
                            </div>
                          )}

                          {/* 액션 버튼 */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => copyEventText(event)}
                              className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5 ${
                                copiedEventId === event.id
                                  ? 'text-emerald-700 bg-emerald-50'
                                  : 'text-violet-600 bg-violet-50 hover:bg-violet-100'
                              }`}
                            >
                              {copiedEventId === event.id ? (
                                <>
                                  <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  복사완료
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  내용 복사
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => window.open(`/admin/events/print/${event.id}`, '_blank')}
                              className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5"
                            >
                              <Printer className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              프린트
                            </button>
                            <button
                              onClick={() => handleEdit(event)}
                              className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5"
                            >
                              <Edit className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(event.id)}
                              className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1 sm:gap-1.5"
                            >
                              <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              삭제
                            </button>
                            <div className="w-full sm:w-auto mt-1.5 sm:mt-0 sm:ml-auto">
                              {getStatusActions(event)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  
                  return acc;
                }, { sections: [] as React.JSX.Element[], past: false }).sections}
              
              {events.length === 0 && (
                <Card className="text-center py-12">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-xl text-slate-500">등록된 산행이 없습니다.</p>
                  <p className="text-sm text-slate-400 mt-2">
                    새 산행을 등록하여 회원들과 함께 즐거운 산행을 계획하세요.
                  </p>
                </Card>
              )}
            </div>
          )}
      </>
      
      
    </div>
  );
};

export default EventManagement;
