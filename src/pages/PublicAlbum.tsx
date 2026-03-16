import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Image as ImageIcon, Mountain, Calendar, Download, ExternalLink } from 'lucide-react';
import { getDocument } from '../lib/firebase/firestore';
import { AlbumShare } from '../types';

const PublicAlbum = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [album, setAlbum] = useState<AlbumShare | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 라이트박스 상태
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!shareId) { setError('잘못된 링크입니다.'); setIsLoading(false); return; }
      const result = await getDocument<AlbumShare>('albumShares', shareId);
      if (!result.success || !result.data) {
        setError('앨범을 찾을 수 없거나 공유가 만료되었습니다.');
      } else if (!result.data.isActive) {
        setError('이 공유 링크는 비활성화되었습니다.');
      } else {
        setAlbum(result.data);
      }
      setIsLoading(false);
    };
    load();
  }, [shareId]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goPrev = useCallback(() => {
    if (lightboxIndex === null || !album) return;
    setLightboxIndex((lightboxIndex - 1 + album.photos.length) % album.photos.length);
  }, [lightboxIndex, album]);

  const goNext = useCallback(() => {
    if (lightboxIndex === null || !album) return;
    setLightboxIndex((lightboxIndex + 1) % album.photos.length);
  }, [lightboxIndex, album]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, goPrev, goNext]);

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${album?.albumTitle || 'photo'}_${index + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-sm">앨범 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm mx-auto px-6">
          <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">앨범을 찾을 수 없습니다</h2>
          <p className="text-slate-500 text-sm">{error || '유효하지 않은 공유 링크입니다.'}</p>
        </div>
      </div>
    );
  }

  const currentPhoto = lightboxIndex !== null ? album.photos[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Mountain className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">시애라 등산 커뮤니티</p>
              <h1 className="text-sm sm:text-lg font-bold text-slate-900 truncate">{album.albumTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-sm text-slate-500">
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{album.photos.length}장</span>
            </div>
            <a
              href="https://sierraclub.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[11px] sm:text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">홈페이지</span>
              <span className="sm:hidden">홈</span>
            </a>
          </div>
        </div>
      </header>

      {/* 앨범 메타 */}
      <div className="max-w-6xl mx-auto px-4 pt-5 sm:pt-8 pb-3 sm:pb-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <Mountain className="w-4 h-4 text-primary-500" />
            <span className="font-medium text-slate-700">{album.eventTitle}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-[10px]">
              {album.uploadedByName.charAt(0)}
            </div>
            <span>{album.uploadedByName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span>
              {new Date(album.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* 사진 그리드 */}
      <main className="max-w-6xl mx-auto px-4 pb-12">
        {album.photos.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ImageIcon className="w-14 h-14 mx-auto mb-3 text-slate-200" />
            <p>사진이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-2">
            {album.photos.map((photo, idx) => (
              <div
                key={photo.id}
                className="relative aspect-square bg-slate-100 overflow-hidden rounded-lg cursor-pointer group"
                onClick={() => openLightbox(idx)}
              >
                <img
                  src={photo.thumbnailUrl || photo.imageUrl}
                  alt={`사진 ${idx + 1}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 라이트박스 */}
      {lightboxIndex !== null && currentPhoto && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* 닫기 */}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 bg-white/10 rounded-full transition-colors z-10"
            onClick={closeLightbox}
          >
            <X className="w-6 h-6" />
          </button>

          {/* 카운터 */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/30 px-3 py-1 rounded-full">
            {lightboxIndex + 1} / {album.photos.length}
          </div>

          {/* 다운로드 */}
          <button
            className="absolute top-4 right-16 text-white/80 hover:text-white p-2 bg-white/10 rounded-full transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); handleDownload(currentPhoto.imageUrl, lightboxIndex); }}
          >
            <Download className="w-5 h-5" />
          </button>

          {/* 이전 */}
          {album.photos.length > 1 && (
            <button
              className="absolute left-3 sm:left-6 text-white/80 hover:text-white p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
            >
              <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>
          )}

          {/* 사진 */}
          <img
            src={currentPhoto.mediumUrl || currentPhoto.imageUrl}
            alt={`사진 ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain select-none"
            onClick={(e) => e.stopPropagation()}
          />

          {/* 다음 */}
          {album.photos.length > 1 && (
            <button
              className="absolute right-3 sm:right-6 text-white/80 hover:text-white p-2 sm:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
            >
              <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PublicAlbum;
