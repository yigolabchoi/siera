import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { X, Check, Maximize2, ArrowLeft } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

const ProfilePhotoEdit = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const imageSrc = location.state?.imageSrc as string | undefined;

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // 이미지가 없으면 프로필 페이지로 리다이렉트
  useEffect(() => {
    if (!imageSrc) {
      navigate('/home/profile');
    }
  }, [imageSrc, navigate]);

  const onCropChange = (location: Point) => {
    setCrop(location);
  };

  const onZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const onCropCompleteCallback = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  // 프로필 아바타에 필요한 최대 해상도. 요즘 스마트폰 고화소 사진을 원본 그대로 크롭하면
  // JPEG 품질을 낮춰도 Storage 업로드 용량 제한(10MB, storage.rules)을 넘어 업로드가
  // 실패할 수 있어, 압축 전에 먼저 이 크기로 다운스케일한다.
  const MAX_OUTPUT_SIZE = 1024;

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    const scale = Math.min(1, MAX_OUTPUT_SIZE / Math.max(pixelCrop.width, pixelCrop.height));
    const outputWidth = Math.round(pixelCrop.width * scale);
    const outputHeight = Math.round(pixelCrop.height * scale);

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputWidth,
      outputHeight
    );

    // 5MB 이하로 압축
    return new Promise((resolve) => {
      const compressImage = (quality: number) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const sizeInMB = blob.size / (1024 * 1024);
            console.log(`🖼️ 이미지 압축 시도 (quality: ${quality}): ${sizeInMB.toFixed(2)}MB`);
            
            if (sizeInMB <= 5 || quality <= 0.3) {
              console.log(`✅ 최종 이미지 크기: ${sizeInMB.toFixed(2)}MB`);
              resolve(blob);
            } else {
              compressImage(quality - 0.1);
            }
          }
        }, 'image/jpeg', quality);
      };
      
      compressImage(0.95);
    });
  };

  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) {
      console.error('❌ [ProfilePhotoEdit] croppedAreaPixels가 없습니다');
      return;
    }

    try {
      console.log('🔄 [ProfilePhotoEdit] 이미지 크롭 시작:', croppedAreaPixels);
      
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      
      console.log('✅ [ProfilePhotoEdit] 크롭 완료:', {
        size: croppedImageBlob.size,
        type: croppedImageBlob.type,
      });
      
      // 크롭된 이미지를 state로 전달하며 프로필 페이지로 이동
      navigate('/home/profile', { 
        state: { 
          croppedImage: croppedImageBlob,
          shouldUpload: true 
        } 
      });
    } catch (error) {
      console.error('❌ [ProfilePhotoEdit] 이미지 크롭 실패:', error);
      alert('이미지 편집에 실패했습니다.');
    }
  };

  const handleCancel = () => {
    navigate('/home/profile');
  };

  if (!imageSrc) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col" style={{ zIndex: 9999 }}>
      {/* 헤더 */}
      <div className="relative bg-slate-800 border-b border-slate-700 flex-shrink-0" style={{ zIndex: 20 }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">프로필 사진 편집</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  드래그하여 위치 조정, 확대/축소 가능
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg font-semibold text-sm hover:bg-slate-600 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold text-sm hover:bg-primary-700 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                완료
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 크롭 영역 - overflow: hidden으로 크로퍼를 이 영역에 가둠 */}
      <div className="flex-1 relative overflow-hidden" style={{ zIndex: 1 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onCropComplete={onCropCompleteCallback}
          onZoomChange={onZoomChange}
        />
      </div>

      {/* 컨트롤 바 - 하단 고정, z-index로 크로퍼 위에 표시 */}
      <div className="relative bg-slate-800 border-t border-slate-700 flex-shrink-0" style={{ zIndex: 20 }}>
        <div className="max-w-lg mx-auto px-8 py-5">
          {/* 라벨과 퍼센트 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-white">확대/축소</span>
            </div>
            <span className="text-sm font-bold text-primary-400">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* 슬라이더 */}
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="zoom-slider"
          />
          
          {/* 눈금 표시 */}
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>50%</span>
            <span>150%</span>
            <span>300%</span>
          </div>
        </div>
      </div>

      <style>{`
        .zoom-slider {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          width: 100%;
          height: 8px;
          background: linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((zoom - 0.5) / 2.5) * 100}%, #475569 ${((zoom - 0.5) / 2.5) * 100}%, #475569 100%);
          border-radius: 4px;
          cursor: pointer;
          outline: none;
          display: block;
          margin: 0;
          padding: 0;
          position: relative;
          z-index: 1;
        }
        
        .zoom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
          border: 3px solid white;
        }
        
        .zoom-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
          border: 3px solid white;
        }
        
        .zoom-slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        
        .zoom-slider::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default ProfilePhotoEdit;
