import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Camera, 
  Download, 
  Move,
  Eye
} from 'lucide-react';
import { DEFAULT_PRODUCT_IMAGE } from '../lib/imageUtils';

interface ProductPhotoZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  productName?: string;
  productCode?: string;
  productCategory?: string;
  productPrice?: number;
  onChangePhoto?: () => void;
}

export const ProductPhotoZoomModal: React.FC<ProductPhotoZoomModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  productName = 'Fotografía del Producto',
  productCode,
  productCategory,
  productPrice,
  onChangePhoto
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom and pan when modal opens or image changes
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, imageUrl]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleReset();
      } else if (e.key.toLowerCase() === 'r') {
        handleRotate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, zoom]);

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setZoom(prev => Math.min(4, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoom(prev => {
      const next = Math.max(0.5, Math.round((prev - 0.25) * 100) / 100);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleSetPresetZoom = (level: number) => {
    setZoom(level);
    if (level <= 1) setPan({ x: 0, y: 0 });
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Drag & Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 || e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Double click toggles between 100% and 200%
  const handleDoubleClick = () => {
    if (zoom > 1) {
      handleReset();
    } else {
      setZoom(2);
    }
  };

  // Download image
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl || DEFAULT_PRODUCT_IMAGE;
    link.download = `${productCode || 'producto'}_foto.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentImg = imageUrl || DEFAULT_PRODUCT_IMAGE;

  return (
    <div 
      className="fixed inset-0 z-70 bg-black/95 backdrop-blur-md flex flex-col select-none animate-fade-in"
      onMouseUp={handleMouseUp}
    >
      {/* Top Bar */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 truncate max-w-md" title={productName}>
                {productName}
              </h3>
              {productCategory && (
                <span className="hidden sm:inline text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  {productCategory}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              {productCode && (
                <span>Código: <strong className="text-indigo-400">{productCode}</strong></span>
              )}
              {productPrice !== undefined && (
                <>
                  <span>•</span>
                  <span>Precio: <strong className="text-emerald-400">${productPrice.toFixed(2)}</strong></span>
                </>
              )}
              <span>•</span>
              <span className="text-slate-500">Zoom: {Math.round(zoom * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onChangePhoto && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onChangePhoto();
              }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold font-mono transition cursor-pointer"
              title="Cambiar la foto de este producto"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Cambiar Foto</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded-lg transition"
            title="Descargar fotografía original"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition cursor-pointer ml-1"
            title="Cerrar visor (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${
          zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
      >
        <div 
          className="transition-transform duration-100 ease-out will-change-transform flex items-center justify-center max-w-full max-h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center'
          }}
        >
          <img 
            src={currentImg} 
            alt={productName}
            referrerPolicy="no-referrer"
            className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-2xl pointer-events-none"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
            }}
          />
        </div>

        {/* Floating Pan Hint when Zoomed */}
        {zoom > 1 && (
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-xs border border-slate-700/60 text-slate-300 text-[11px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-2 pointer-events-none animate-fade-in shadow-lg">
            <Move className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Arrastra para mover la imagen</span>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="bg-slate-950/90 border-t border-slate-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
        
        {/* Quick Presets */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 font-mono uppercase mr-1 hidden sm:inline">Ajuste:</span>
          {[0.5, 1, 1.5, 2, 3].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => handleSetPresetZoom(lvl)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md font-semibold transition ${
                Math.abs(zoom - lvl) < 0.1
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {Math.round(lvl * 100)}%
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-lg">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            title="Reducir zoom (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs font-bold text-slate-200 px-2 min-w-[55px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            title="Aumentar zoom (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-5 bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={handleReset}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition text-xs font-mono font-semibold"
            title="Restablecer a tamaño normal (100%)"
          >
            1:1
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
            title="Rotar 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Helper text */}
        <div className="text-[10px] text-slate-500 font-mono hidden md:block">
          Doble clic para zoom rápido • Rueda del mouse para acercar/alejar
        </div>
      </div>
    </div>
  );
};
