import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Check, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { Product } from '../types';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
  products: Product[];
}

export default function ScannerModal({ isOpen, onClose, onScanSuccess, products }: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [matchingProduct, setMatchingProduct] = useState<Product | null>(null);
  const [manualCode, setManualCode] = useState<string>('');

  // Start actual webcam
  const startCamera = async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Prefer back camera
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn("Camera could not be accessed:", err);
      setCameraError(
        "No se pudo acceder a la cámara física (normal en iframe del navegador). Utiliza el simulador de códigos de barras abajo."
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScanResult(null);
      setMatchingProduct(null);
      setManualCode('');
    }
    return () => stopCamera();
  }, [isOpen]);

  const handleSimulateScan = (prod: Product) => {
    setScanResult(prod.id);
    setMatchingProduct(prod);
    
    // Auto submit scan success after a brief visual cue
    setTimeout(() => {
      onScanSuccess(prod.id);
      onClose();
    }, 1200);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    
    const found = products.find(p => p.id === manualCode.trim() || p.sku === manualCode.trim());
    setScanResult(manualCode.trim());
    if (found) {
      setMatchingProduct(found);
      setTimeout(() => {
        onScanSuccess(found.id);
        onClose();
      }, 1000);
    } else {
      setMatchingProduct(null);
      setTimeout(() => {
        onScanSuccess(manualCode.trim());
        onClose();
      }, 1500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        id="scanner-modal-card" 
        className="relative w-full max-w-md overflow-hidden border bg-slate-950 border-slate-800 rounded-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h3 className="font-semibold text-slate-100 font-sans">Escáner de Código de Barras</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Container */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {cameraActive ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-500 bg-slate-900/40">
              <Camera className="w-12 h-12 mb-3 text-slate-600 stroke-[1.5]" />
              <p className="text-sm px-4">Accesibilidad de cámara no disponible en previsualización de iframe.</p>
              {cameraError && (
                <span className="text-[11px] text-slate-600 mt-2 px-6 leading-relaxed italic bg-slate-950 py-1.5 rounded-lg border border-slate-900">
                  {cameraError}
                </span>
              )}
            </div>
          )}

          {/* Hologram Box / Laser overlay */}
          <div className="absolute inset-x-8 inset-y-6 border-2 border-dashed border-indigo-500/50 rounded-lg pointer-events-none flex flex-col justify-between">
            <div className="w-full h-[2px] bg-red-500 shadow-[0_0_8px_#ef4444] animate-[bounce_2s_infinite] opacity-80" />
            <div className="text-[10px] text-indigo-400 bg-black/70 px-2 py-0.5 self-center mb-1 rounded font-mono select-none">
              APUNTE AL CÓDIGO
            </div>
          </div>

          {/* Instant Scan Success Overlay */}
          {scanResult && (
            <div className="absolute inset-0 bg-indigo-600/10 flex flex-col items-center justify-center backdrop-blur-xs animate-fade-in">
              <div className="flex items-center justify-center w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg mb-2 scale-up">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>
              <p className="font-mono text-xs font-semibold text-indigo-400 bg-slate-950 px-3 py-1 rounded-full border border-indigo-500/30">
                Código: {scanResult}
              </p>
              {matchingProduct ? (
                <p className="text-sm font-semibold text-slate-100 mt-1.5 bg-black/80 px-4 py-1 rounded">
                  {matchingProduct.name}
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-1.5">Nuevo producto detectado</p>
              )}
            </div>
          )}
        </div>

        {/* Simulator Area */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-800">
          <div className="mb-3">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400 font-mono block mb-2">
              ⚡ Simulador Móvil de Código de Barras
            </span>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {products.map(prod => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleSimulateScan(prod)}
                  className="flex items-center justify-between text-left p-2 bg-slate-950 border border-slate-800 hover:border-indigo-500/40 rounded-lg transition group"
                >
                  <div className="min-w-0 pr-1">
                    <p className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-400">
                      {prod.name}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      {prod.id}
                    </span>
                  </div>
                  <Layers className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 group-hover:text-indigo-400" />
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="border-t border-slate-800 pt-3 flex gap-2">
            <input
              type="text"
              placeholder="Ingreso manual de código/ID de producto..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg text-xs font-semibold select-none transition"
            >
              Procesar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
