import { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Download, X, Image as ImageIcon, Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Trash2, Mountain, Star, LayoutGrid, Layers, ArrowLeft, Camera, Pencil, Check, Share2, Link } from 'lucide-react';
import { useAuth } from '../contexts/AuthContextEnhanced';
import { useGallery } from '../contexts/GalleryContext';
import { useEvents } from '../contexts/EventContext';
import { useNavigate } from 'react-router-dom';
import { setDocument } from '../lib/firebase/firestore';


interface UploadFile {
  id: string;
  file: File;
  preview: string;
}

// ===== LazyImage 컴포넌트: IntersectionObserver + 스켈레톤 + 페이드인 =====
const LazyImage = ({ 
  src, 
  alt, 
  className = '', 
  containerClassName = '',
  placeholderHeight,
  onClick,
  style,
}: { 
  src: string; 
  alt: string; 
  className?: string; 
  containerClassName?: string;
  placeholderHeight?: string; // 이미지 로딩 전 최소 높이 (그리드용)
  onClick?: () => void;
  style?: React.CSSProperties;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={imgRef} 
      className={containerClassName} 
      onClick={onClick} 
      style={{ ...style, minHeight: !isLoaded && placeholderHeight ? placeholderHeight : undefined }}
    >
      {/* 스켈레톤 플레이스홀더 */}
      {!isLoaded && (
        <div className={`${placeholderHeight ? 'w-full h-full' : 'absolute inset-0'} bg-slate-200 animate-pulse rounded-inherit flex items-center justify-center`}>
          <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300" />
        </div>
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-500 ease-out ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          draggable={false}
        />
      )}
    </div>
  );
};

const ITEMS_PER_BATCH = 12;

// 페이지 로드 시마다 새로운 시드 생성 (세션 내 일관성 유지, 새로고침 시 변경)
const SESSION_SEED = Date.now();

const Gallery = () => {
  const { user, isAdmin } = useAuth();
  const { photos, isLoading, toggleLike, uploadPhotos, updateAlbumPhotos, deletePhoto } = useGallery();
  const { events, updateEvent } = useEvents();
  const navigate = useNavigate();
  
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [likedPhotos, setLikedPhotos] = useState<Set<string>>(new Set());
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [viewMode, setViewMode] = useState<'albums' | 'grid'>('albums');
  const [gridSelectedPhotoIndex, setGridSelectedPhotoIndex] = useState<number | null>(null);

  // 순차 로딩 상태
  const [gridVisibleCount, setGridVisibleCount] = useState(ITEMS_PER_BATCH);
  const [albumVisibleCount, setAlbumVisibleCount] = useState(ITEMS_PER_BATCH);
  const gridSentinelRef = useRef<HTMLDivElement>(null);
  const albumSentinelRef = useRef<HTMLDivElement>(null);
  
  // 업로드 관련 상태
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [galleryTitle, setGalleryTitle] = useState(''); // 갤러리 제목
  const [isDragging, setIsDragging] = useState(false);
  const [selectedEventForUpload, setSelectedEventForUpload] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // 수정 관련 상태
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAlbum, setEditAlbum] = useState<{ photoIds: string[]; title: string; eventId: string; eventTitle: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editEventId, setEditEventId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  // 컴포넌트 마운트 확인
  useEffect(() => {
    // 초기화 로직 (필요시)
  }, []);
  
  // showUploadModal 변경 추적
  useEffect(() => {
    // 상태 추적 로직 (필요시)
  }, [showUploadModal]);
  
  // 이벤트 날짜 매핑 (eventId → date) - 산행 날짜 기준 정렬에 사용
  const eventDateMap = useMemo(() => {
    const map: Record<string, string> = {};
    events.forEach(e => {
      map[e.id] = e.date;
    });
    return map;
  }, [events]);

  // 사진의 산행 날짜 기준 연-월 반환 (업로드 날짜가 아닌 실제 산행 날짜)
  const getEventYearMonth = useMemo(() => {
    return (photo: { eventId: string; eventYear: string; eventMonth: string }) => {
      const eventDate = eventDateMap[photo.eventId];
      if (eventDate) {
        // eventDate 형식: "2025-01-15" 등
        return `${eventDate.substring(0, 4)}-${eventDate.substring(5, 7)}`;
      }
      // fallback: 기존 업로드 기준
      return `${photo.eventYear}-${photo.eventMonth}`;
    };
  }, [eventDateMap]);

  // 산행 목록 (모든 산행 - 최신순)
  const availableEvents = events
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20); // 최근 20개 산행
  
  // 연도별 월 그룹 생성 (산행 날짜 기준)
  const yearMonthGroups = useMemo(() => {
    const ymList = Array.from(new Set(photos.map(p => getEventYearMonth(p))))
      .sort((a, b) => b.localeCompare(a));
    
    const yearMap: Record<string, { id: string; monthLabel: string }[]> = {};
    
    ymList.forEach(ym => {
      const [year, month] = ym.split('-');
      if (!yearMap[year]) yearMap[year] = [];
      yearMap[year].push({ id: ym, monthLabel: `${parseInt(month)}월` });
    });
    
    return Object.keys(yearMap)
      .sort((a, b) => b.localeCompare(a))
      .map(year => ({ year, months: yearMap[year] }));
  }, [photos, getEventYearMonth]);
  
  // "전체" 선택 시 앨범 뷰로 강제 전환
  useEffect(() => {
    if (selectedEvent === 'all') {
      setViewMode('albums');
    }
  }, [selectedEvent]);

  // 필터/뷰 모드 변경 시 visible count 리셋
  useEffect(() => {
    setGridVisibleCount(ITEMS_PER_BATCH);
    setAlbumVisibleCount(ITEMS_PER_BATCH);
  }, [selectedEvent, viewMode]);

  // 그리드 무한스크롤: IntersectionObserver
  useEffect(() => {
    const sentinel = gridSentinelRef.current;
    if (!sentinel || viewMode !== 'grid' || gridSelectedPhotoIndex !== null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGridVisibleCount(prev => prev + ITEMS_PER_BATCH);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, gridSelectedPhotoIndex, gridVisibleCount]);

  // 앨범 무한스크롤: IntersectionObserver
  useEffect(() => {
    const sentinel = albumSentinelRef.current;
    if (!sentinel || viewMode !== 'albums') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAlbumVisibleCount(prev => prev + ITEMS_PER_BATCH);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, albumVisibleCount]);

  // 필터링된 사진 목록 (산행 날짜 기준 정렬: 최신 산행 → 과거 산행, 같은 산행 내에서는 업로드 순서)
  const filteredPhotos = (selectedEvent === 'all'
    ? [...photos]
    : photos.filter(p => getEventYearMonth(p) === selectedEvent)
  ).sort((a, b) => {
    const dateA = eventDateMap[a.eventId] || '';
    const dateB = eventDateMap[b.eventId] || '';
    const dateCompare = dateB.localeCompare(dateA);
    if (dateCompare !== 0) return dateCompare;
    // 같은 산행 내에서는 업로드 순서 유지
    return (a.uploadedAt || '').localeCompare(b.uploadedAt || '');
  });
  
  // 사진을 앨범으로 그룹화 (title + uploadedBy + eventId 기준)
  interface PhotoAlbum {
    id: string;
    title: string;
    eventTitle: string;
    eventId: string;
    coverPhoto: string;
    photoCount: number;
    uploadedBy: string;
    uploadedByName: string;
    uploadedAt: string;
    photos: typeof filteredPhotos;
  }

  const photoAlbums: PhotoAlbum[] = Object.values(
    filteredPhotos.reduce((acc, photo) => {
      const albumKey = `${photo.title || 'untitled'}_${photo.uploadedBy}_${photo.eventId}`;
      
      if (!acc[albumKey]) {
        acc[albumKey] = {
          id: albumKey,
          title: photo.title || '제목 없음',
          eventTitle: photo.eventTitle,
          eventId: photo.eventId,
          coverPhoto: '', // 그룹화 후 랜덤 선택
          photoCount: 0,
          uploadedBy: photo.uploadedBy,
          uploadedByName: photo.uploadedByName,
          uploadedAt: photo.uploadedAt,
          photos: []
        };
      }
      
      acc[albumKey].photos.push(photo);
      acc[albumKey].photoCount = acc[albumKey].photos.length;
      
      return acc;
    }, {} as Record<string, PhotoAlbum>)
  ).map(album => {
    // 앨범 썸네일을 랜덤으로 선택 (세션 시드 + albumId 조합으로 새로고침마다 다른 사진, 필터 변경 시 유지)
    const hash = album.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const randomIndex = (hash + SESSION_SEED) % album.photos.length;
    album.coverPhoto = album.photos[randomIndex].thumbnailUrl || album.photos[randomIndex].imageUrl;
    return album;
  }).sort((a, b) => {
    // 1차: 산행 날짜 기준 내림차순 (최신 산행 먼저)
    const dateA = eventDateMap[a.eventId] || '';
    const dateB = eventDateMap[b.eventId] || '';
    const dateCompare = dateB.localeCompare(dateA);
    if (dateCompare !== 0) return dateCompare;
    // 2차: 같은 산행 내에서는 업로드 날짜순
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
  
  // 각 월별 사진 개수 계산 (산행 날짜 기준)
  const photoCountByMonth: Record<string, number> = {};
  photos.forEach(photo => {
    const key = getEventYearMonth(photo);
    photoCountByMonth[key] = (photoCountByMonth[key] || 0) + 1;
  });

  const [selectedAlbum, setSelectedAlbum] = useState<PhotoAlbum | null>(null);
  const [albumSlideIndex, setAlbumSlideIndex] = useState(0);
  const [imageScale, setImageScale] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sharingAlbumId, setSharingAlbumId] = useState<string | null>(null);

  // 앨범 공유 링크 생성 및 클립보드 복사 (관리자 전용)
  const handleShareAlbum = async (e: React.MouseEvent, album: PhotoAlbum) => {
    e.stopPropagation();
    if (!user || !isAdmin) return;
    setSharingAlbumId(album.id);
    try {
      const shareId = crypto.randomUUID();
      const sharePhotos = album.photos.map(p => ({
        id: p.id,
        imageUrl: p.imageUrl,
        thumbnailUrl: p.thumbnailUrl || '',
        mediumUrl: p.mediumUrl || '',
        uploadedAt: p.uploadedAt,
      }));
      await setDocument('albumShares', shareId, {
        albumTitle: album.title,
        eventId: album.eventId,
        eventTitle: album.eventTitle,
        uploadedBy: album.uploadedBy,
        uploadedByName: album.uploadedByName,
        createdBy: user.id,
        createdByName: user.name || user.email || '',
        isActive: true,
        photos: sharePhotos,
      });
      const shareUrl = `${window.location.origin}/share/album/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      alert(`공유 링크가 클립보드에 복사되었습니다!\n\n${shareUrl}`);
    } catch (err) {
      console.error('공유 링크 생성 실패:', err);
      alert('공유 링크 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSharingAlbumId(null);
    }
  };

  // 업로드 버튼 핸들러 (명확한 함수로 분리)
  const handleOpenUploadModal = () => {
    setShowUploadModal(true);
  };

  // 앨범 수정 모달 열기
  const handleOpenEditModal = (album: { photos: typeof photos; title: string; eventId: string; eventTitle: string }) => {
    setEditAlbum({
      photoIds: album.photos.map(p => p.id),
      title: album.title,
      eventId: album.eventId,
      eventTitle: album.eventTitle,
    });
    setEditTitle(album.title);
    setEditEventId(album.eventId);
    setShowEditModal(true);
  };

  // 앨범 수정 저장
  const handleSaveEdit = async () => {
    if (!editAlbum || !editTitle.trim()) return;
    
    setIsEditing(true);
    try {
      const selectedEvent = events.find(e => e.id === editEventId);
      const updates: { title?: string; eventId?: string; eventTitle?: string } = {};
      
      if (editTitle.trim() !== editAlbum.title) {
        updates.title = editTitle.trim();
      }
      if (editEventId !== editAlbum.eventId && selectedEvent) {
        updates.eventId = selectedEvent.id;
        updates.eventTitle = selectedEvent.title;
      }
      
      if (Object.keys(updates).length === 0) {
        setShowEditModal(false);
        return;
      }
      
      await updateAlbumPhotos(editAlbum.photoIds, updates);
      setShowEditModal(false);
      setEditAlbum(null);
      alert('앨범이 수정되었습니다.');
    } catch (error) {
      console.error('앨범 수정 실패:', error);
      alert('앨범 수정에 실패했습니다.');
    } finally {
      setIsEditing(false);
    }
  };

  // 확대/축소 핸들러
  const handleZoomIn = () => {
    setImageScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const resetZoom = () => {
    setImageScale(1);
    setImagePosition({ x: 0, y: 0 });
  };

  // 범용 이미지 다운로드 핸들러
  const downloadImage = async (imageUrl: string, fileName: string) => {
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      try {
        const newWindow = window.open(imageUrl, '_blank');
        if (!newWindow) {
          const link = document.createElement('a');
          link.href = imageUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch {
        alert('다운로드에 실패했습니다. 이미지를 길게 눌러 저장해주세요.');
      }
    }
  };

  // 앨범 뷰 다운로드
  const handleDownload = () => {
    if (!selectedAlbum) return;
    const currentPhoto = selectedAlbum.photos[albumSlideIndex];
    downloadImage(currentPhoto.imageUrl, `${selectedAlbum.title}_${albumSlideIndex + 1}.jpg`);
  };

  // 그리드 뷰 다운로드
  const handleGridDownload = () => {
    if (gridSelectedPhotoIndex === null) return;
    const photo = filteredPhotos[gridSelectedPhotoIndex];
    downloadImage(photo.imageUrl, `${photo.title || '사진'}_${gridSelectedPhotoIndex + 1}.jpg`);
  };

  // 대표 이미지 설정 (관리자 전용)
  const handleSetCoverImage = async (photoImageUrl: string, eventId: string) => {
    if (!isAdmin) return;
    const eventData = events.find(e => e.id === eventId);
    if (!eventId) {
      alert('연결된 산행 정보가 없습니다.');
      return;
    }
    if (eventData?.imageUrl === photoImageUrl) {
      alert('이미 이 산행의 대표 이미지로 설정되어 있습니다.');
      return;
    }
    if (confirm(`이 사진을 "${eventData?.title || '산행'}"의 대표 이미지로 설정하시겠습니까?`)) {
      try {
        await updateEvent(eventId, { imageUrl: photoImageUrl });
        alert('대표 이미지가 설정되었습니다!');
      } catch (error) {
        console.error('대표 이미지 설정 실패:', error);
        alert('대표 이미지 설정에 실패했습니다.');
      }
    }
  };

  // 이미지 드래그 핸들러 (확대 시 이동)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (imageScale > 1) {
      setIsDraggingImage(true);
      setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingImage && imageScale > 1) {
      setImagePosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingImage(false);
  };

  // 터치 이벤트 핸들러 (모바일)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (imageScale > 1 && e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDraggingImage(true);
      setDragStart({ x: touch.clientX - imagePosition.x, y: touch.clientY - imagePosition.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDraggingImage && imageScale > 1 && e.touches.length === 1) {
      const touch = e.touches[0];
      setImagePosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDraggingImage(false);
  };

  // 앨범 변경 시 줌 리셋
  useEffect(() => {
    resetZoom();
  }, [albumSlideIndex, selectedAlbum]);

  // 슬라이드쇼
  useEffect(() => {
    if (!isSlideshow || selectedImage === null) return;
    
    const timer = setInterval(() => {
      setSelectedImage(prev => 
        prev === null ? 0 : (prev + 1) % filteredPhotos.length
      );
    }, 3000);
    
    return () => clearInterval(timer);
  }, [isSlideshow, selectedImage, filteredPhotos.length]);

  const handleLike = async (photoId: string) => {
    if (!user) return;
    
    await toggleLike(photoId, user.id);
    setLikedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📁 파일 선택 이벤트 발생');
    console.log('📁 선택된 파일:', e.target.files);
    const files = Array.from(e.target.files || []);
    console.log('📁 파일 배열:', files);
    if (files.length > 0) {
      console.log(`✅ ${files.length}개의 파일 선택됨`);
      processFiles(files);
    } else {
      console.warn('⚠️ 선택된 파일이 없습니다');
    }
    // input value 초기화 (같은 파일을 다시 선택할 수 있도록)
    e.target.value = '';
  };

  const processFiles = (files: File[]) => {
    console.log('🔄 processFiles 시작, 파일 개수:', files.length);
    const newFiles = files.map((file, index) => {
      console.log(`📄 파일 ${index + 1}:`, file.name, file.size, file.type);
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
      };
    });
    
    console.log('✅ processFiles 완료, 추가할 파일:', newFiles.length);
    setUploadFiles(prev => {
      const updated = [...prev, ...newFiles];
      console.log('📋 전체 업로드 파일 목록:', updated.length);
      return updated;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      alert('업로드할 사진을 선택해주세요.');
      return;
    }
    
    if (!selectedEventForUpload) {
      alert('산행을 선택해주세요.');
      return;
    }
    
    if (!galleryTitle.trim()) {
      alert('갤러리 제목을 입력해주세요.');
      return;
    }
    
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    const event = events.find(e => e.id === selectedEventForUpload);
    if (!event) {
      alert('선택한 산행을 찾을 수 없습니다.');
      return;
    }

    setIsUploading(true);
    
    try {
      console.log('📤 사진 업로드 시작:', {
        fileCount: uploadFiles.length,
        eventId: event.id,
        eventTitle: event.title,
        galleryTitle: galleryTitle,
        user: user.email
      });
      
      const files = uploadFiles.map(uf => uf.file);
      
      await uploadPhotos(files, event.id, event.title, galleryTitle);
      
      // 정리
      setUploadFiles([]);
      setGalleryTitle('');
      setShowUploadModal(false);
      setSelectedEventForUpload('');
      
      alert(`${files.length}장의 사진이 업로드되었습니다!`);
    } catch (error: any) {
      console.error('사진 업로드 실패:', error);
      
      // 더 자세한 에러 메시지
      let errorMessage = '사진 업로드에 실패했습니다.';
      if (error.message) {
        errorMessage += `\n\n오류: ${error.message}`;
      }
      if (error.code === 'storage/unauthorized') {
        errorMessage += '\n\n로그아웃 후 다시 로그인해주세요.';
      }
      
      alert(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const removeUploadFile = (id: string) => {
    setUploadFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  // 업로드 모달 렌더링 함수 (공통)
  const renderUploadModal = (variant: 'empty' | 'main') => {
    const inputId = variant === 'empty' ? 'file-upload-input-empty' : 'file-upload-input';
    
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
        <div className="bg-white w-full sm:max-w-2xl sm:mx-4 sm:rounded-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-b-2xl overflow-hidden">
          {/* 헤더 */}
          <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b bg-white">
            <div className="flex justify-between items-center">
              {/* 모바일 드래그 핸들 */}
              <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-slate-300 rounded-full sm:hidden" />
              <h2 className="text-lg sm:text-2xl font-bold text-slate-900">사진 업로드</h2>
              <button 
                onClick={() => setShowUploadModal(false)}
                type="button"
                className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* 스크롤 콘텐츠 */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
            {/* 산행 선택 */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
                산행 선택 <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedEventForUpload}
                onChange={(e) => setSelectedEventForUpload(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">산행을 선택하세요</option>
                {availableEvents.length === 0 ? (
                  <option disabled>등록된 산행이 없습니다</option>
                ) : (
                  availableEvents.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.title} ({event.date})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 갤러리 제목 */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
                갤러리 제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={galleryTitle}
                onChange={(e) => setGalleryTitle(e.target.value)}
                placeholder="예: 겨울 산행 단체 사진"
                className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={100}
              />
              <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                업로드하는 모든 사진에 적용될 제목입니다
              </p>
            </div>

            {/* 사진 선택 영역 */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className={`border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <Upload className="w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-3 text-blue-500" />
              <p className="text-slate-900 font-bold text-sm sm:text-lg mb-1 sm:mb-2">
                사진을 선택해주세요
              </p>
              <p className="text-slate-500 text-xs sm:text-sm mb-4 hidden sm:block">
                파일을 드래그하여 추가할 수도 있습니다
              </p>
              <input
                id={inputId}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <label
                htmlFor={inputId}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 cursor-pointer transition-colors font-semibold text-sm sm:text-base shadow-md"
              >
                <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                사진 선택
              </label>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-3">
                JPG, PNG, GIF (최대 10MB) · 최대 50장
              </p>
            </div>

            {/* 선택된 파일 목록 */}
            {uploadFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm sm:text-base text-slate-900">
                    선택된 사진 <span className="text-blue-600">{uploadFiles.length}장</span>
                  </h3>
                  <button
                    onClick={() => {
                      uploadFiles.forEach(f => URL.revokeObjectURL(f.preview));
                      setUploadFiles([]);
                    }}
                    className="text-xs sm:text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    전체 삭제
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 sm:gap-2 max-h-[240px] sm:max-h-[320px] overflow-y-auto p-1.5 sm:p-2 bg-slate-50 rounded-xl">
                  {uploadFiles.map(file => (
                    <div key={file.id} className="relative group">
                      <img
                        src={file.preview}
                        alt="미리보기"
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeUploadFile(file.id)}
                        className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 p-0.5 sm:p-1 bg-red-500/90 text-white rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 하단 액션 */}
          <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-slate-50 flex gap-2 sm:gap-3">
            <button
              onClick={() => setShowUploadModal(false)}
              className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 border border-slate-300 rounded-xl hover:bg-white transition-colors text-sm sm:text-base font-medium"
              type="button"
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={uploadFiles.length === 0 || !selectedEventForUpload || !galleryTitle.trim() || isUploading}
              className="flex-1 sm:flex-none px-6 py-2.5 sm:py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm sm:text-base font-medium"
              type="button"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  업로드 ({uploadFiles.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 빈 상태일 때
  if (photos.length === 0 && !isLoading) {
    return (
      <>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="bg-white rounded-xl shadow-sm p-8 sm:p-12 text-center">
            <ImageIcon className="w-16 h-16 sm:w-24 sm:h-24 text-slate-300 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-xl font-semibold text-slate-900 mb-1.5 sm:mb-2">아직 업로드된 사진이 없습니다</h3>
            <p className="text-sm sm:text-base text-slate-600 mb-5 sm:mb-6">
              첫 번째 산행 사진을 업로드해보세요!
            </p>
            {user && (
              <button
                onClick={handleOpenUploadModal}
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-md text-sm sm:text-base font-medium"
                type="button"
              >
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                사진 업로드하기
              </button>
            )}
            {!user && (
              <p className="text-xs sm:text-sm text-slate-500 mt-4">사진 업로드는 로그인이 필요합니다.</p>
            )}
          </div>
        </div>

        {/* 업로드 모달 - 빈 상태용 */}
        {showUploadModal && renderUploadModal('empty')}
      </>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-16 sm:w-16 border-b-4 border-slate-900 mx-auto mb-3 sm:mb-4"></div>
            <p className="text-base sm:text-xl text-slate-600 font-medium">사진을 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
      {/* ===== 모바일 최적화 상단 메뉴 ===== */}
      <div className="space-y-2.5 sm:space-y-3 mb-4 sm:mb-6">
        {/* Row 1: 사진 수 + 뷰 모드 토글(월 선택 시만) + 업로드 버튼 */}
        <div className="flex items-center justify-between gap-2">
          {/* 사진 수 */}
          <span className="text-[11px] sm:text-sm text-slate-400 font-medium tabular-nums flex-shrink-0">
            {selectedEvent === 'all' 
              ? `${photoAlbums.length}개 앨범` 
              : viewMode === 'albums' 
                ? `${photoAlbums.length}개 앨범` 
                : `${filteredPhotos.length}장`}
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 세그먼트 컨트롤 스타일 뷰 모드 토글 - 월 선택 시에만 표시 */}
            {selectedEvent !== 'all' && (
              <div className="flex bg-slate-100 rounded-lg sm:rounded-xl p-0.5 sm:p-1 gap-0.5">
                <button
                  onClick={() => setViewMode('albums')}
                  className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg text-[11px] sm:text-sm font-semibold transition-all duration-200 ${
                    viewMode === 'albums' 
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5' 
                      : 'text-slate-400 hover:text-slate-600 active:bg-white/50'
                  }`}
                >
                  <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  앨범
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg text-[11px] sm:text-sm font-semibold transition-all duration-200 ${
                    viewMode === 'grid' 
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5' 
                      : 'text-slate-400 hover:text-slate-600 active:bg-white/50'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  전체
                </button>
              </div>
            )}

            {/* 업로드 버튼 */}
            {user && (
              <button
                onClick={handleOpenUploadModal}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2.5 bg-slate-900 text-white rounded-lg sm:rounded-xl hover:bg-slate-800 active:scale-95 transition-all text-[11px] sm:text-sm font-semibold whitespace-nowrap flex-shrink-0 shadow-sm"
                type="button"
              >
                <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">사진 업로드</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: 연도별 그룹 월별 필터 */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-100 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          {/* 전체 버튼 */}
          <div className="flex items-center">
            <button
              onClick={() => setSelectedEvent('all')}
              className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                selectedEvent === 'all'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200 border border-slate-200'
              }`}
            >
              전체
            </button>
          </div>

          {/* 연도별 그룹 */}
          {yearMonthGroups.map(group => (
            <div key={group.year} className="flex items-center gap-2 sm:gap-3">
              {/* 연도 레이블 */}
              <span className="text-xs sm:text-sm font-bold text-slate-400 min-w-[2.8rem] sm:min-w-[3.5rem] flex-shrink-0 pl-0.5">
                {group.year}
              </span>
              {/* 월 버튼 리스트 */}
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide py-0.5">
                {group.months.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedEvent(m.id)}
                    className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap flex-shrink-0 min-w-[3rem] sm:min-w-[3.5rem] text-center ${
                      selectedEvent === m.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {m.monthLabel}
                    {photoCountByMonth[m.id] ? (
                      <span className={`ml-1 text-[10px] sm:text-xs ${
                        selectedEvent === m.id ? 'text-white/60' : 'text-slate-400'
                      }`}>
                        {photoCountByMonth[m.id]}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================== 앨범 보기 모드 ==================== */}
      {viewMode === 'albums' && (
        <>
          {isLoading ? (
            <div className="text-center py-8 sm:py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-slate-600 mt-3 sm:mt-4 text-sm sm:text-base">사진을 불러오는 중...</p>
            </div>
          ) : photoAlbums.length === 0 ? (
            <div className="bg-white rounded-xl sm:rounded-lg shadow-sm p-8 sm:p-12 text-center">
              <ImageIcon className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-3 sm:mb-4" />
              <p className="text-sm sm:text-base text-slate-600">선택한 기간에 사진이 없습니다.</p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5">
              {photoAlbums.slice(0, albumVisibleCount).map((album, idx) => (
                <div
                  key={album.id}
                  className="relative bg-white rounded-xl shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden group animate-in fade-in"
                  style={{ animationDelay: `${Math.min(idx % ITEMS_PER_BATCH, 11) * 50}ms`, animationDuration: '400ms', animationFillMode: 'both' }}
                  onClick={() => {
                    setSelectedAlbum(album);
                    setAlbumSlideIndex(0);
                  }}
                >
                  {/* 대표 사진 - LazyImage 적용 */}
                  <LazyImage
                    src={album.coverPhoto}
                    alt={album.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    containerClassName="relative aspect-[4/3] bg-slate-100 overflow-hidden"
                  />
                  {/* 사진 개수 뱃지 */}
                  <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 bg-black/60 backdrop-blur-sm text-white px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-sm font-medium flex items-center gap-0.5 sm:gap-1 z-10">
                    <ImageIcon className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                    {album.photoCount}
                  </div>
                  
                  <div className="p-2 sm:p-4">
                    <h3 className="font-bold text-[13px] leading-tight sm:text-lg text-slate-900 mb-0.5 sm:mb-1 truncate">{album.title}</h3>
                    <p className="text-[11px] sm:text-sm text-slate-500 flex items-center gap-0.5 sm:gap-1 truncate">
                      <Mountain className="w-2.5 h-2.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="truncate">{album.eventTitle}</span>
                    </p>
                    
                    {/* 데스크톱용 메타정보 */}
                    <div className="hidden sm:flex items-center justify-between text-xs text-slate-500 mt-2.5">
                      <div className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-[10px]">
                          {album.uploadedByName.charAt(0)}
                        </div>
                        <span>{album.uploadedByName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(album.uploadedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                    {/* 모바일용 메타정보 - 간소화 */}
                    <div className="flex sm:hidden items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span className="truncate max-w-[50%]">{album.uploadedByName}</span>
                      <span className="flex-shrink-0">
                        {new Date(album.uploadedAt).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    
                    {user && (isAdmin || album.uploadedBy === user.id) && (
                      <div className="mt-1.5 sm:mt-3 flex gap-1 sm:gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(album);
                          }}
                          className="flex-1 px-1.5 sm:px-3 py-1 sm:py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md sm:rounded-lg text-[11px] sm:text-sm font-medium transition-colors flex items-center justify-center gap-0.5 sm:gap-1"
                        >
                          <Pencil className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                          수정
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`"${album.title}" 앨범의 모든 사진(${album.photoCount}장)을 삭제하시겠습니까?`)) {
                              album.photos.forEach(photo => deletePhoto(photo.id));
                            }
                          }}
                          className="flex-1 px-1.5 sm:px-3 py-1 sm:py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-md sm:rounded-lg text-[11px] sm:text-sm font-medium transition-colors flex items-center justify-center gap-0.5 sm:gap-1"
                        >
                          <Trash2 className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                          삭제
                        </button>
                      </div>
                    )}
                    {/* 공유 링크 버튼 - 관리자 전용 */}
                    {user && isAdmin && (
                      <button
                        onClick={(e) => handleShareAlbum(e, album)}
                        disabled={sharingAlbumId === album.id}
                        className="mt-1 sm:mt-2 w-full px-1.5 sm:px-3 py-1 sm:py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-md sm:rounded-lg text-[11px] sm:text-sm font-medium transition-colors flex items-center justify-center gap-0.5 sm:gap-1"
                      >
                        {sharingAlbumId === album.id ? (
                          <>
                            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            링크 생성 중...
                          </>
                        ) : (
                          <>
                            <Link className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                            공유 링크 복사
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* 앨범 무한스크롤 sentinel */}
            {albumVisibleCount < photoAlbums.length && (
              <div ref={albumSentinelRef} className="flex justify-center py-6 sm:py-8">
                <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  더 불러오는 중...
                </div>
              </div>
            )}
            </>
          )}
        </>
      )}

      {/* ==================== 바둑판(그리드) 보기 모드 ==================== */}
      {viewMode === 'grid' && (
        <>
          {filteredPhotos.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 sm:p-12 text-center">
              <ImageIcon className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-3 sm:mb-4" />
              <p className="text-sm sm:text-base text-slate-600">선택한 기간에 사진이 없습니다.</p>
            </div>
          ) : gridSelectedPhotoIndex !== null ? (
            /* ===== 사진 상세 보기 ===== */
            <div className="animate-in fade-in">
              {/* 뒤로가기 + 액션 바 */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <button
                  onClick={() => setGridSelectedPhotoIndex(null)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">목록으로 돌아가기</span>
                  <span className="sm:hidden">뒤로</span>
                </button>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[11px] sm:text-sm text-slate-500">
                    {gridSelectedPhotoIndex + 1}/{filteredPhotos.length}
                  </span>
                  {/* 대표 이미지 설정 (관리자 전용) */}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        const photo = filteredPhotos[gridSelectedPhotoIndex!];
                        handleSetCoverImage(photo.imageUrl, photo.eventId);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                      title="대표 이미지로 설정"
                    >
                      <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">대표 설정</span>
                    </button>
                  )}
                  {/* 다운로드 */}
                  <button
                    onClick={handleGridDownload}
                    className="inline-flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                    title="다운로드"
                  >
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">다운로드</span>
                  </button>
                </div>
              </div>

              {/* 큰 사진 */}
              <div className="bg-black rounded-xl sm:rounded-2xl overflow-hidden relative">
                <div className="flex items-center justify-center min-h-[40vh] sm:min-h-[50vh] max-h-[65vh] sm:max-h-[75vh] p-1 sm:p-2">
                  <img
                    src={filteredPhotos[gridSelectedPhotoIndex].mediumUrl || filteredPhotos[gridSelectedPhotoIndex].imageUrl}
                    alt={filteredPhotos[gridSelectedPhotoIndex].title || '사진'}
                    className="max-w-full max-h-[63vh] sm:max-h-[73vh] object-contain rounded-md sm:rounded-lg"
                  />
                </div>

                {/* 이전/다음 버튼 */}
                {gridSelectedPhotoIndex > 0 && (
                  <button
                    onClick={() => setGridSelectedPhotoIndex(prev => (prev !== null ? prev - 1 : null))}
                    className="absolute left-1.5 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-7 sm:h-7" />
                  </button>
                )}
                {gridSelectedPhotoIndex < filteredPhotos.length - 1 && (
                  <button
                    onClick={() => setGridSelectedPhotoIndex(prev => (prev !== null ? prev + 1 : null))}
                    className="absolute right-1.5 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 text-white bg-white/15 hover:bg-white/25 rounded-full transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 sm:w-7 sm:h-7" />
                  </button>
                )}
              </div>

              {/* 사진 정보 */}
              <div className="mt-2.5 sm:mt-4 bg-white rounded-xl shadow-sm p-3 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[13px] sm:text-lg text-slate-900 truncate">
                      {filteredPhotos[gridSelectedPhotoIndex].title || '제목 없음'}
                    </h3>
                    <p className="text-[11px] sm:text-sm text-slate-500 mt-0.5 sm:mt-1 flex items-center gap-1">
                      <Mountain className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                      <span className="truncate">{filteredPhotos[gridSelectedPhotoIndex].eventTitle}</span>
                    </p>
                  </div>
                  <div className="text-right text-[10px] sm:text-xs text-slate-400 flex-shrink-0">
                    <p>{filteredPhotos[gridSelectedPhotoIndex].uploadedByName}</p>
                    <p className="mt-0.5">
                      {new Date(filteredPhotos[gridSelectedPhotoIndex].uploadedAt).toLocaleDateString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ===== 바둑판 그리드 (순차 로딩) ===== */
            <>
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-1.5 sm:gap-3 space-y-1.5 sm:space-y-3">
                {filteredPhotos.slice(0, gridVisibleCount).map((photo, index) => (
                  <div
                    key={photo.id}
                    className="break-inside-avoid cursor-pointer group relative overflow-hidden rounded-lg bg-slate-100 animate-in fade-in"
                    style={{ animationDelay: `${Math.min(index % ITEMS_PER_BATCH, 11) * 40}ms`, animationDuration: '400ms', animationFillMode: 'both' }}
                    onClick={() => setGridSelectedPhotoIndex(index)}
                  >
                    <LazyImage
                      src={photo.thumbnailUrl || photo.imageUrl}
                      alt={photo.title || '사진'}
                      className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      containerClassName="w-full"
                      placeholderHeight="140px"
                    />
                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5 sm:p-3">
                      <p className="text-white text-[11px] sm:text-sm font-medium truncate">{photo.title || '제목 없음'}</p>
                      <p className="text-white/70 text-[9px] sm:text-xs truncate">{photo.eventTitle}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* 그리드 무한스크롤 sentinel */}
              {gridVisibleCount < filteredPhotos.length && (
                <div ref={gridSentinelRef} className="flex justify-center py-6 sm:py-8">
                  <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    더 불러오는 중...
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* 앨범 슬라이드쇼 모달 */}
      {selectedAlbum && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          {/* 상단 컨트롤 바 */}
          <div className="flex-shrink-0 bg-gradient-to-b from-black/80 to-transparent px-2.5 sm:px-4 py-2 sm:py-4 z-20">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="text-white min-w-0 flex-1 mr-2">
                <h2 className="text-[13px] sm:text-lg font-bold truncate">{selectedAlbum.title}</h2>
                <p className="text-[11px] sm:text-sm text-white/70 flex items-center gap-1">
                  {albumSlideIndex + 1}/{selectedAlbum.photos.length}
                  {(() => {
                    const eventData = events.find(e => e.id === selectedAlbum.eventId);
                    const currentPhoto = selectedAlbum.photos[albumSlideIndex];
                    if (eventData?.imageUrl === currentPhoto?.imageUrl) {
                      return (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-400/20 text-amber-400 rounded-full text-[9px] sm:text-xs font-medium">
                          <Star className="w-2 h-2 sm:w-3 sm:h-3 fill-amber-400" />
                          대표
                        </span>
                      );
                    }
                    return null;
                  })()}
                </p>
              </div>
              
              <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
                {/* 확대/축소 - 데스크톱만 */}
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={handleZoomOut}
                    disabled={imageScale <= 0.5}
                    className="p-2.5 text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors disabled:opacity-30"
                    title="축소"
                  >
                    <ZoomOut className="w-6 h-6" />
                  </button>
                  <span className="text-white text-base font-medium min-w-[60px] text-center">
                    {Math.round(imageScale * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    disabled={imageScale >= 3}
                    className="p-2.5 text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors disabled:opacity-30"
                    title="확대"
                  >
                    <ZoomIn className="w-6 h-6" />
                  </button>
                </div>
                
                {/* 대표 이미지 설정 버튼 (관리자만) */}
                {isAdmin && selectedAlbum && (
                  <button
                    onClick={() => {
                      const currentPhoto = selectedAlbum.photos[albumSlideIndex];
                      handleSetCoverImage(currentPhoto.imageUrl, selectedAlbum.eventId);
                    }}
                    className="p-2 sm:p-3 text-amber-400 bg-white/10 hover:bg-white/20 rounded-lg sm:rounded-xl transition-colors"
                    title="이 산행의 대표 이미지로 설정"
                  >
                    <Star className="w-5 h-5 sm:w-7 sm:h-7" />
                  </button>
                )}

                {/* 다운로드 버튼 */}
                <button
                  onClick={handleDownload}
                  className="p-2 sm:p-3 text-white bg-white/10 hover:bg-white/20 rounded-lg sm:rounded-xl transition-colors"
                  title="다운로드"
                >
                  <Download className="w-5 h-5 sm:w-7 sm:h-7" />
                </button>
                
                {/* 닫기 버튼 */}
                <button
                  onClick={() => {
                    setSelectedAlbum(null);
                    setAlbumSlideIndex(0);
                    resetZoom();
                  }}
                  className="p-2 sm:p-3 text-white bg-white/10 hover:bg-white/20 rounded-lg sm:rounded-xl transition-colors"
                  title="닫기"
                >
                  <X className="w-5 h-5 sm:w-7 sm:h-7" />
                </button>
              </div>
            </div>
          </div>

          {/* 사진 표시 영역 */}
          <div className="flex-1 relative overflow-hidden">
            {/* 이전 버튼 */}
            {albumSlideIndex > 0 && (
              <button
                onClick={() => {
                  setAlbumSlideIndex(prev => prev - 1);
                  resetZoom();
                }}
                className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-4 text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              >
                <ChevronLeft className="w-5 h-5 sm:w-9 sm:h-9" />
              </button>
            )}

            {/* 다음 버튼 */}
            {albumSlideIndex < selectedAlbum.photos.length - 1 && (
              <button
                onClick={() => {
                  setAlbumSlideIndex(prev => prev + 1);
                  resetZoom();
                }}
                className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-4 text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              >
                <ChevronRight className="w-5 h-5 sm:w-9 sm:h-9" />
              </button>
            )}

            <div 
              className="absolute inset-0 flex items-center justify-center px-8 sm:px-16 py-1 sm:py-2"
            >
              <div
                className={`relative w-full h-full flex items-center justify-center ${isDraggingImage ? 'cursor-grabbing' : imageScale > 1 ? 'cursor-grab' : 'cursor-default'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <img
                  src={selectedAlbum.photos[albumSlideIndex].mediumUrl || selectedAlbum.photos[albumSlideIndex].imageUrl}
                  alt={selectedAlbum.title}
                  className="max-w-full max-h-full object-contain select-none transition-transform"
                  style={{
                    transform: `scale(${imageScale}) translate(${imagePosition.x / imageScale}px, ${imagePosition.y / imageScale}px)`,
                    transformOrigin: 'center center',
                  }}
                  draggable={false}
                />
              </div>
            </div>
          </div>

          {/* 썸네일 네비게이션 */}
          <div className="flex-shrink-0 z-20 px-1.5 sm:px-4 pb-2 sm:pb-4">
            <div className="max-w-7xl mx-auto">
              <div className="bg-black/60 backdrop-blur-md rounded-lg sm:rounded-xl p-1.5 sm:p-3">
                <div className="flex gap-1 sm:gap-2 justify-center items-center overflow-x-auto scrollbar-hide">
                  {selectedAlbum.photos.map((photo, index) => {
                    const eventData = events.find(e => e.id === selectedAlbum.eventId);
                    const isCoverImage = eventData?.imageUrl === photo.imageUrl;
                    return (
                      <button
                        key={photo.id}
                        onClick={() => {
                          setAlbumSlideIndex(index);
                          resetZoom();
                        }}
                        className={`relative flex-shrink-0 w-9 h-9 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-md sm:rounded-lg overflow-hidden transition-all ${
                          index === albumSlideIndex
                            ? 'ring-2 ring-white scale-110'
                            : 'opacity-50 hover:opacity-100 hover:scale-105'
                        }`}
                      >
                        <img
                          src={photo.thumbnailUrl || photo.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {isCoverImage && (
                          <div className="absolute top-0 right-0 bg-amber-400 rounded-bl-md p-0.5">
                            <Star className="w-2 h-2 sm:w-3 sm:h-3 text-white fill-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 업로드 모달 */}
      {showUploadModal && renderUploadModal('main')}

      {/* 앨범 수정 모달 */}
      {showEditModal && editAlbum && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-lg sm:mx-4 sm:rounded-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-b-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b bg-white">
              <div className="flex justify-between items-center">
                <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-slate-300 rounded-full sm:hidden" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-blue-600" />
                  앨범 수정
                </h2>
                <button
                  onClick={() => { setShowEditModal(false); setEditAlbum(null); }}
                  type="button"
                  className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            {/* 콘텐츠 */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
              {/* 현재 정보 */}
              <div className="bg-slate-50 rounded-xl p-3 sm:p-4 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-slate-900">대상:</span>{' '}
                  {editAlbum.photoIds.length}장의 사진
                </p>
              </div>

              {/* 앨범 제목 */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
                  앨범 제목 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="앨범 제목을 입력하세요"
                  className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={100}
                />
              </div>

              {/* 산행 선택 */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">
                  연결된 산행
                </label>
                <select
                  value={editEventId}
                  onChange={(e) => setEditEventId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">산행을 선택하세요</option>
                  {availableEvents.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.title} ({event.date})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 하단 액션 */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-slate-50 flex gap-2 sm:gap-3">
              <button
                onClick={() => { setShowEditModal(false); setEditAlbum(null); }}
                className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 border border-slate-300 rounded-xl hover:bg-white transition-colors text-sm sm:text-base font-medium"
                type="button"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editTitle.trim() || isEditing}
                className="flex-1 sm:flex-none px-6 py-2.5 sm:py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm sm:text-base font-medium"
                type="button"
              >
                {isEditing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Gallery;
