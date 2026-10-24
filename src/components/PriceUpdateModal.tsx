import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  FileCode, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Download, 
  ArrowRight, 
  RefreshCw, 
  DollarSign, 
  Image as ImageIcon,
  Eye,
  HelpCircle,
  Loader2,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Product, ExchangeRate } from '../types';
import { DEFAULT_PRODUCT_IMAGE } from '../lib/imageUtils';

interface PriceUpdateItem {
  product: Product;
  newPriceUSD?: number;
  newPriceVES?: number;
  newPriceWholesaleUSD?: number;
  newPriceWholesaleVES?: number;
  newPriceCuadrillasUSD?: number;
  newPriceCuadrillasVES?: number;
  newCostUSD?: number;
  newCostVES?: number;
  hasPriceChange: boolean;
  isMatched: boolean;
  unmatchedCode?: string;
  unmatchedName?: string;
}

interface PriceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  exchangeRate: ExchangeRate;
  onApplyPriceUpdates: (updatedProducts: Product[]) => Promise<void>;
  onOpenZoom: (imageUrl: string, productName: string, productCode: string) => void;
}

export const PriceUpdateModal: React.FC<PriceUpdateModalProps> = ({
  isOpen,
  onClose,
  products,
  exchangeRate,
  onApplyPriceUpdates,
  onOpenZoom
}) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [inputTab, setInputTab] = useState<'file' | 'text'>('file');
  const [inputText, setInputText] = useState<string>('');
  const [parsedItems, setParsedItems] = useState<PriceUpdateItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'changed' | 'unmatched'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper to parse numbers in Venezuelan / Spanish formats
  const parseNum = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val === 'number') return isNaN(val) ? undefined : val;
    let s = String(val).trim().replace(/[$\sBs]/gi, '');
    if (!s) return undefined;
    
    // Handle formats like 1.250,50 vs 1250.50
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? undefined : Math.round(n * 100) / 100;
  };

  // CSV line splitter respecting quotes
  const parseCSVLines = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ';' || char === '\t' || (char === ',' && !inQuotes)) {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f !== '')) lines.push(currentLine);
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.some(f => f !== '')) lines.push(currentLine);
    }

    return lines;
  };

  // Process text into PriceUpdateItem list
  const processInput = (rawText: string) => {
    setParseError(null);
    try {
      const trimmed = rawText.trim();
      if (!trimmed) {
        throw new Error('Por favor ingresa o sube un archivo con los precios a actualizar.');
      }

      const items: PriceUpdateItem[] = [];

      // Check if input is JSON
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        let jsonData: any;
        try {
          jsonData = JSON.parse(trimmed);
        } catch (e: any) {
          throw new Error('El formato JSON es inválido. Verifica comillas y llaves.');
        }

        const list = Array.isArray(jsonData) ? jsonData : (jsonData.products || jsonData.precios || []);
        if (!Array.isArray(list) || list.length === 0) {
          throw new Error('No se encontró una lista de productos en el archivo JSON.');
        }

        list.forEach((row: any) => {
          const code = String(row.id || row.codigo || row.codigo_barras || row.barcode || row.sku || '').trim();
          const name = String(row.nombre || row.name || row.producto || '').trim();
          
          const pDetal = parseNum(row.priceUSD ?? row.precio ?? row.p_detal ?? row.precio_detal ?? row.venta ?? row.precio_usd);
          const pDetalVES = parseNum(row.priceVES ?? row.precio_bs ?? row.p_detal_bs ?? row.precio_detal_bs);
          const pMayor = parseNum(row.priceWholesaleUSD ?? row.p_mayor ?? row.precio_mayor ?? row.mayor);
          const pMayorVES = parseNum(row.priceWholesaleVES ?? row.precio_mayor_bs ?? row.p_mayor_bs);
          const pCuadrilla = parseNum(row.priceCuadrillasUSD ?? row.p_cuadrillas ?? row.cuadrilla ?? row.cuadrillas);
          const pCost = parseNum(row.costUSD ?? row.costo ?? row.costo_usd ?? row.cost);

          // Find match in current products
          const matched = products.find(p => p && (
            (code && String(p.id).toLowerCase() === code.toLowerCase()) ||
            (code && p.sku && (p.sku || '').toLowerCase() === code.toLowerCase()) ||
            (name && (p.name || '').toLowerCase() === name.toLowerCase())
          ));

          if (matched) {
            const hasChange = 
              (pDetal !== undefined && pDetal !== matched.priceUSD) ||
              (pDetalVES !== undefined && pDetalVES !== (matched.priceVES || 0)) ||
              (pMayor !== undefined && pMayor !== (matched.priceWholesaleUSD || 0)) ||
              (pMayorVES !== undefined && pMayorVES !== (matched.priceWholesaleVES || 0)) ||
              (pCuadrilla !== undefined && pCuadrilla !== (matched.priceCuadrillasUSD || 0)) ||
              (pCost !== undefined && pCost !== matched.costUSD);

            items.push({
              product: matched,
              newPriceUSD: pDetal,
              newPriceVES: pDetalVES,
              newPriceWholesaleUSD: pMayor,
              newPriceWholesaleVES: pMayorVES,
              newPriceCuadrillasUSD: pCuadrilla,
              newCostUSD: pCost,
              hasPriceChange: hasChange,
              isMatched: true
            });
          } else if (code || name) {
            items.push({
              product: {
                id: code || 'SIN-CODIGO',
                name: name || 'Producto no encontrado',
                category: 'General',
                sku: code,
                costUSD: pCost || 0,
                priceUSD: pDetal || 0,
                stock: 0,
                minStock: 0,
                createdAt: '',
                updatedAt: ''
              },
              newPriceUSD: pDetal,
              newPriceWholesaleUSD: pMayor,
              newPriceCuadrillasUSD: pCuadrilla,
              newCostUSD: pCost,
              hasPriceChange: false,
              isMatched: false,
              unmatchedCode: code,
              unmatchedName: name
            });
          }
        });
      } else {
        // Parse as CSV
        const lines = parseCSVLines(trimmed);
        if (lines.length < 2) {
          throw new Error('El archivo CSV debe tener al menos una fila de encabezados y una fila con datos.');
        }

        const headers = lines[0].map(h => 
          h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        );

        const findCol = (predicate: (h: string) => boolean) => headers.findIndex(predicate);

        const codeIdx = findCol(h => ['codigo', 'cdigo', 'cod', 'barcode', 'barra', 'barras', 'sku', 'id', 'referencia'].some(k => h === k || h.startsWith(k)));
        const nameIdx = findCol(h => ['nombre', 'name', 'producto', 'item', 'descripcion'].some(k => h.includes(k)));
        
        const priceDetalIdx = findCol(h => (h.includes('precio') || h.includes('detal') || h.includes('price') || h.includes('venta') || h.includes('p_detal')) && !h.includes('mayor') && !h.includes('cuadrilla') && !h.includes('bs') && !h.includes('ves'));
        const priceDetalVESIdx = findCol(h => (h.includes('detal') || h.includes('precio') || h.includes('p_detal')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));
        const priceMayorIdx = findCol(h => (h.includes('mayor') || h.includes('p_mayor') || h.includes('whole')) && !h.includes('detal') && !h.includes('bs') && !h.includes('ves'));
        const priceMayorVESIdx = findCol(h => (h.includes('mayor') || h.includes('p_mayor')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));
        const priceCuadrillaIdx = findCol(h => (h.includes('cuadrilla') || h.includes('p_cuadrilla')) && !h.includes('detal') && !h.includes('bs') && !h.includes('ves'));
        const priceCuadrillaVESIdx = findCol(h => (h.includes('cuadrilla') || h.includes('p_cuadrilla')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));
        const costIdx = findCol(h => (h.includes('cost') || h.includes('compra')) && !h.includes('bs') && !h.includes('ves'));
        const costVESIdx = findCol(h => (h.includes('cost') || h.includes('compra')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));

        if (codeIdx === -1 && nameIdx === -1) {
          throw new Error('No se encontró una columna de Código de producto (Código, Barcode, SKU o ID) ni de Nombre en la primera fila.');
        }

        if (priceDetalIdx === -1 && priceDetalVESIdx === -1 && priceMayorIdx === -1 && priceMayorVESIdx === -1 && priceCuadrillaIdx === -1 && priceCuadrillaVESIdx === -1 && costIdx === -1 && costVESIdx === -1) {
          throw new Error('No se detectó ninguna columna de precios (Precio Detal, Mayor, Cuadrillas o Costo).');
        }

        const rate = exchangeRate?.rate || 1;

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          if (!row || row.length === 0 || row.every(c => !c)) continue;

          const code = codeIdx !== -1 && row[codeIdx] ? row[codeIdx].trim() : '';
          const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '';

          let pDetal = priceDetalIdx !== -1 ? parseNum(row[priceDetalIdx]) : undefined;
          let pDetalVES = priceDetalVESIdx !== -1 ? parseNum(row[priceDetalVESIdx]) : undefined;
          if (pDetal === undefined && pDetalVES !== undefined && pDetalVES > 0) pDetal = pDetalVES;
          if (pDetalVES === undefined && pDetal !== undefined && pDetal > 0) pDetalVES = pDetal;

          let pMayor = priceMayorIdx !== -1 ? parseNum(row[priceMayorIdx]) : undefined;
          let pMayorVES = priceMayorVESIdx !== -1 ? parseNum(row[priceMayorVESIdx]) : undefined;
          if (pMayor === undefined && pMayorVES !== undefined && pMayorVES > 0) pMayor = pMayorVES;
          if (pMayorVES === undefined && pMayor !== undefined && pMayor > 0) pMayorVES = pMayor;

          let pCuadrilla = priceCuadrillaIdx !== -1 ? parseNum(row[priceCuadrillaIdx]) : undefined;
          let pCuadrillaVES = priceCuadrillaVESIdx !== -1 ? parseNum(row[priceCuadrillaVESIdx]) : undefined;
          if (pCuadrilla === undefined && pCuadrillaVES !== undefined && pCuadrillaVES > 0) pCuadrilla = pCuadrillaVES;
          if (pCuadrillaVES === undefined && pCuadrilla !== undefined && pCuadrilla > 0) pCuadrillaVES = pCuadrilla;

          let pCost = costIdx !== -1 ? parseNum(row[costIdx]) : undefined;
          let pCostVES = costVESIdx !== -1 ? parseNum(row[costVESIdx]) : undefined;
          if (pCost === undefined && pCostVES !== undefined && pCostVES > 0) pCost = pCostVES;
          if (pCostVES === undefined && pCost !== undefined && pCost > 0) pCostVES = pCost;

          // Find match
          const matched = products.find(p => p && (
            (code && String(p.id).toLowerCase() === code.toLowerCase()) ||
            (code && p.sku && (p.sku || '').toLowerCase() === code.toLowerCase()) ||
            (name && (p.name || '').toLowerCase() === name.toLowerCase())
          ));

          if (matched) {
            const hasChange = 
              (pDetal !== undefined && pDetal !== matched.priceUSD) ||
              (pDetalVES !== undefined && pDetalVES !== (matched.priceVES || 0)) ||
              (pMayor !== undefined && pMayor !== (matched.priceWholesaleUSD || 0)) ||
              (pMayorVES !== undefined && pMayorVES !== (matched.priceWholesaleVES || 0)) ||
              (pCuadrilla !== undefined && pCuadrilla !== (matched.priceCuadrillasUSD || 0)) ||
              (pCuadrillaVES !== undefined && pCuadrillaVES !== (matched.priceCuadrillasVES || 0)) ||
              (pCost !== undefined && pCost !== matched.costUSD) ||
              (pCostVES !== undefined && pCostVES !== (matched.costVES || 0));

            items.push({
              product: matched,
              newPriceUSD: pDetal,
              newPriceVES: pDetalVES,
              newPriceWholesaleUSD: pMayor,
              newPriceWholesaleVES: pMayorVES,
              newPriceCuadrillasUSD: pCuadrilla,
              newPriceCuadrillasVES: pCuadrillaVES,
              newCostUSD: pCost,
              newCostVES: pCostVES,
              hasPriceChange: hasChange,
              isMatched: true
            });
          } else if (code || name) {
            items.push({
              product: {
                id: code || 'SIN-CODIGO',
                name: name || 'Producto no encontrado',
                category: 'General',
                sku: code,
                costUSD: pCost || 0,
                costVES: pCostVES || 0,
                priceUSD: pDetal || 0,
                priceVES: pDetalVES || 0,
                stock: 0,
                minStock: 0,
                createdAt: '',
                updatedAt: ''
              },
              newPriceUSD: pDetal,
              newPriceVES: pDetalVES,
              newPriceWholesaleUSD: pMayor,
              newPriceWholesaleVES: pMayorVES,
              newPriceCuadrillasUSD: pCuadrilla,
              newPriceCuadrillasVES: pCuadrillaVES,
              newCostUSD: pCost,
              newCostVES: pCostVES,
              hasPriceChange: false,
              isMatched: false,
              unmatchedCode: code,
              unmatchedName: name
            });
          }
        }
      }

      if (items.length === 0) {
        throw new Error('No se encontraron registros de precios para procesar.');
      }

      setParsedItems(items);
      setStep('preview');
    } catch (err: any) {
      setParseError(err.message || 'Error al procesar los precios del archivo.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setInputText(text);
      processInput(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download a ready-to-fill CSV template with all current products in USD and VES
  const handleDownloadTemplate = () => {
    const rate = exchangeRate.rate || 1;
    const headers = [
      'Codigo',
      'Nombre',
      'Precio_Detal_USD',
      'Precio_Detal_VES',
      'Precio_Mayor_USD',
      'Precio_Mayor_VES',
      'Precio_Cuadrillas_USD',
      'Precio_Cuadrillas_VES',
      'Costo_USD',
      'Costo_VES'
    ];

    const rows = products.map(p => [
      `"${p.id}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      p.priceUSD || 0,
      p.priceVES || p.priceUSD || 0,
      p.priceWholesaleUSD || 0,
      p.priceWholesaleVES || p.priceWholesaleUSD || 0,
      p.priceCuadrillasUSD || 0,
      p.priceCuadrillasVES || p.priceCuadrillasUSD || 0,
      p.costUSD || 0,
      p.costVES || p.costExchangeUSD || p.costUSD || 0
    ]);

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Plantilla_Precios_SigaInvent_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Apply updates while strictly preserving photos and other metadata
  const handleConfirmUpdates = async () => {
    try {
      setIsApplying(true);
      const rate = exchangeRate.rate || 1;

      // Map of matched updates by product ID
      const updatesMap = new Map<string, PriceUpdateItem>();
      parsedItems.forEach(item => {
        if (item.isMatched && item.hasPriceChange) {
          updatesMap.set(item.product.id, item);
        }
      });

      if (updatesMap.size === 0) {
        alert('ℹ️ No hay cambios de precios pendientes para aplicar en los productos encontrados.');
        onClose();
        return;
      }

      const updatedList: Product[] = products.map(currentProd => {
        const update = updatesMap.get(currentProd.id);
        if (!update) return currentProd;

        // Guaranteed dual-currency calculation: never lose $ or Bs prices
        const newPriceUSD = update.newPriceUSD !== undefined && update.newPriceUSD >= 0 
          ? update.newPriceUSD 
          : (update.newPriceVES !== undefined && update.newPriceVES > 0 
              ? update.newPriceVES 
              : currentProd.priceUSD);
        const newPriceVES = update.newPriceVES !== undefined && update.newPriceVES > 0 
          ? update.newPriceVES 
          : (newPriceUSD > 0 
              ? newPriceUSD 
              : (currentProd.priceVES ?? 0));

        const newPriceWholesaleUSD = update.newPriceWholesaleUSD !== undefined && update.newPriceWholesaleUSD >= 0 
          ? update.newPriceWholesaleUSD 
          : (update.newPriceWholesaleVES !== undefined && update.newPriceWholesaleVES > 0 
              ? update.newPriceWholesaleVES 
              : (currentProd.priceWholesaleUSD ?? 0));
        const newPriceWholesaleVES = update.newPriceWholesaleVES !== undefined && update.newPriceWholesaleVES > 0 
          ? update.newPriceWholesaleVES 
          : (newPriceWholesaleUSD > 0 
              ? newPriceWholesaleUSD 
              : (currentProd.priceWholesaleVES ?? 0));

        const newPriceCuadrillasUSD = update.newPriceCuadrillasUSD !== undefined && update.newPriceCuadrillasUSD >= 0 
          ? update.newPriceCuadrillasUSD 
          : (update.newPriceCuadrillasVES !== undefined && update.newPriceCuadrillasVES > 0 
              ? update.newPriceCuadrillasVES 
              : (currentProd.priceCuadrillasUSD ?? 0));
        const newPriceCuadrillasVES = update.newPriceCuadrillasVES !== undefined && update.newPriceCuadrillasVES > 0 
          ? update.newPriceCuadrillasVES 
          : (newPriceCuadrillasUSD > 0 
              ? newPriceCuadrillasUSD 
              : (currentProd.priceCuadrillasVES ?? 0));

        const newCostUSD = update.newCostUSD !== undefined && update.newCostUSD >= 0 
          ? update.newCostUSD 
          : (update.newCostVES !== undefined && update.newCostVES > 0 
              ? update.newCostVES 
              : currentProd.costUSD);
        const newCostVES = update.newCostVES !== undefined && update.newCostVES > 0 
          ? update.newCostVES 
          : (newCostUSD > 0 
              ? newCostUSD 
              : (currentProd.costVES ?? 0));

        return {
          ...currentProd, // PRESERVES EVERYTHING
          priceUSD: newPriceUSD,
          priceVES: newPriceVES,
          priceWholesaleUSD: newPriceWholesaleUSD,
          priceWholesaleVES: newPriceWholesaleVES,
          priceCuadrillasUSD: newPriceCuadrillasUSD,
          priceCuadrillasVES: newPriceCuadrillasVES,
          costUSD: newCostUSD,
          costVES: newCostVES,
          costExchangeUSD: newCostUSD,
          // CRITICAL: NEVER TOUCH THE PHOTO
          imageUrl: currentProd.imageUrl,
          // CRITICAL: NEVER TOUCH STOCK OR LOCATION
          stock: currentProd.stock,
          minStock: currentProd.minStock,
          binLocation: currentProd.binLocation,
          updatedAt: new Date().toISOString()
        };
      });

      await onApplyPriceUpdates(updatedList);
      alert(`✅ ¡Precios actualizados con éxito!\n- Se actualizaron los precios de ${updatesMap.size} productos.\n- 100% de tus fotografías y existencias se conservaron intactas.`);
      onClose();
    } catch (err: any) {
      alert(`⚠️ Error al aplicar los precios: ${err.message || err}`);
    } finally {
      setIsApplying(false);
    }
  };

  const matchedCount = parsedItems.filter(i => i.isMatched).length;
  const changedCount = parsedItems.filter(i => i.isMatched && i.hasPriceChange).length;
  const unmatchedCount = parsedItems.filter(i => !i.isMatched).length;

  const filteredItems = parsedItems.filter(i => {
    if (filterMode === 'changed') return i.isMatched && i.hasPriceChange;
    if (filterMode === 'unmatched') return !i.isMatched;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-60 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-scale-up">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  Subir y Actualizar Precios Masivos (CSV / JSON)
                </h3>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Fotos 100% Protegidas
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Actualiza precios en $ y Bs sin alterar fotografías, cantidades de stock ni ubicaciones guardadas.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5 text-xs">
          
          {step === 'upload' ? (
            <div className="space-y-6">
              
              {/* Guarantee Banner */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-slate-950 to-slate-900 p-4 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300 font-mono">
                      Seguridad Total para tu Catálogo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed max-w-2xl">
                    Esta herramienta busca cada producto por su <strong>Código</strong> o <strong>Nombre</strong> y actualiza únicamente los valores monetarios. <strong>Tus fotos subidas no se tocan ni se eliminan</strong>, y todos los precios son referencias directas en $ sin cálculos automáticos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-emerald-500/50 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
                  title="Descargar archivo Excel CSV con tus productos para editar los precios"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Descargar Plantilla CSV</span>
                </button>
              </div>

              {/* Upload Tabs */}
              <div className="flex border-b border-slate-800 gap-2">
                <button
                  type="button"
                  onClick={() => setInputTab('file')}
                  className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
                    inputTab === 'file'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Subir Archivo Excel CSV o JSON
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab('text')}
                  className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
                    inputTab === 'text'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Pegar Texto CSV / JSON
                </button>
              </div>

              {parseError && (
                <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Error en los datos suministrados:</p>
                    <p className="text-[11px] text-rose-400 font-mono">{parseError}</p>
                  </div>
                </div>
              )}

              {inputTab === 'file' ? (
                <div className="space-y-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-750 hover:border-emerald-500/60 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-950/60 hover:bg-slate-950 transition cursor-pointer group text-center"
                  >
                    <div className="p-4 rounded-2xl bg-slate-900 group-hover:bg-emerald-500/10 border border-slate-800 group-hover:border-emerald-500/30 transition text-slate-400 group-hover:text-emerald-400">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-200 text-sm">
                        Selecciona o arrastra tu archivo CSV o JSON aquí
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono mt-1">
                        Formatos soportados: .csv (separado por comas o punto y coma) y .json
                      </p>
                    </div>
                    <span className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold font-mono transition mt-1">
                      Examinar Archivo en mi Computadora
                    </span>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept=".csv,.json"
                      onChange={handleFileUpload}
                      className="hidden" 
                    />
                  </div>

                  {/* Format tips */}
                  <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl space-y-2 text-[11px]">
                    <h4 className="font-bold font-mono text-slate-300 flex items-center gap-1.5 text-xs text-indigo-400">
                      <HelpCircle className="w-4 h-4" /> Columnas Reconocidas Automáticamente en el CSV:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400 font-mono text-[10.5px]">
                      <div>• <strong>Codigo / Barcode / SKU / ID:</strong> Identifica el producto.</div>
                      <div>• <strong>Nombre:</strong> Identificación secundaria si no hay código.</div>
                      <div>• <strong>Precio / Precio_Detal / Venta:</strong> Nuevo precio detal en USD.</div>
                      <div>• <strong>Precio_Mayor / Mayor:</strong> Nuevo precio al mayor en USD.</div>
                      <div>• <strong>Precio_Cuadrillas:</strong> Nuevo precio cuadrillas en USD.</div>
                      <div>• <strong>Costo:</strong> Nuevo costo de compra en USD.</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={8}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={'Codigo,Precio_Detal_USD,Precio_Mayor_USD\nFBO-TE5117A,45.00,40.00\nPHDP303,12.50,11.00\n...'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 transition resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setInputText('')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition"
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      onClick={() => processInput(inputText)}
                      disabled={!inputText.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Analizar Precios</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            /* Step 2: Preview Diff */
            <div className="space-y-4">
              
              {/* Summary Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Filas en Archivo</span>
                  <p className="text-lg font-bold text-slate-100 mt-0.5">{parsedItems.length}</p>
                </div>
                <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl">
                  <span className="text-[10px] text-emerald-400 uppercase font-bold block">Precios con Cambios</span>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">{changedCount} productos</p>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Sin Modificación</span>
                  <p className="text-lg font-bold text-slate-300 mt-0.5">{matchedCount - changedCount}</p>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-rose-400 uppercase font-bold block">No Encontrados</span>
                  <p className="text-lg font-bold text-rose-400 mt-0.5">{unmatchedCount}</p>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1 rounded-lg font-mono text-xs transition ${
                      filterMode === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todos ({parsedItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('changed')}
                    className={`px-3 py-1 rounded-lg font-mono text-xs transition ${
                      filterMode === 'changed' ? 'bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Con Cambios ({changedCount})
                  </button>
                  {unmatchedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('unmatched')}
                      className={`px-3 py-1 rounded-lg font-mono text-xs transition ${
                        filterMode === 'unmatched' ? 'bg-rose-950/60 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      No Encontrados ({unmatchedCount})
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Fotos protegidas e intactas</span>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Foto</th>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3 font-sans">Producto</th>
                      <th className="py-2.5 px-3 text-right">Precio Detal Actual</th>
                      <th className="py-2.5 px-3 text-right">Nuevo Precio Detal</th>
                      <th className="py-2.5 px-3 text-right">Mayor USD</th>
                      <th className="py-2.5 px-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredItems.map((item, idx) => {
                      const p = item.product;
                      const hasPriceDiff = item.newPriceUSD !== undefined && item.newPriceUSD !== p.priceUSD;
                      const isUp = item.newPriceUSD !== undefined && item.newPriceUSD > p.priceUSD;

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3">
                            <div 
                              onClick={() => {
                                if (p.imageUrl) {
                                  onOpenZoom(p.imageUrl, p.name, p.id);
                                }
                              }}
                              className="w-9 h-9 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative group cursor-pointer"
                              title="Clic para ver foto en grande con zoom"
                            >
                              <img 
                                src={p.imageUrl || DEFAULT_PRODUCT_IMAGE} 
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                                }}
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-3 h-3 text-emerald-300" />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-200">
                            {item.isMatched ? p.id : (item.unmatchedCode || 'N/D')}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-300 max-w-[200px] truncate" title={p.name}>
                            {item.isMatched ? p.name : (item.unmatchedName || 'No encontrado en inventario')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            {item.isMatched ? `$${p.priceUSD.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {item.newPriceUSD !== undefined ? (
                              <span className={`font-bold flex items-center justify-end gap-1 ${
                                hasPriceDiff 
                                  ? (isUp ? 'text-amber-400' : 'text-emerald-400') 
                                  : 'text-slate-300'
                              }`}>
                                {hasPriceDiff && (
                                  isUp 
                                    ? <TrendingUp className="w-3 h-3 text-amber-400 inline" /> 
                                    : <TrendingDown className="w-3 h-3 text-emerald-400 inline" />
                                )}
                                ${item.newPriceUSD.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-sans italic">Sin cambio</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {item.newPriceWholesaleUSD !== undefined 
                              ? `$${item.newPriceWholesaleUSD.toFixed(2)}` 
                              : (p.priceWholesaleUSD ? `$${p.priceWholesaleUSD.toFixed(2)}` : '-')}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {item.isMatched ? (
                              item.hasPriceChange ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                                  Se Actualizará
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400">
                                  Sin Cambios
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/60 text-rose-300 border border-rose-500/30">
                                No Encontrado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          {step === 'preview' ? (
            <button
              type="button"
              onClick={() => setStep('upload')}
              disabled={isApplying}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-mono font-bold transition"
            >
              ← Volver a Cargar Archivo
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Garantía: Fotos y cantidades existentes quedan 100% protegidas.</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-mono transition cursor-pointer"
            >
              Cancelar
            </button>

            {step === 'preview' && (
              <button
                type="button"
                onClick={handleConfirmUpdates}
                disabled={isApplying || changedCount === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 shadow-lg shadow-emerald-950 cursor-pointer"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando en la Nube...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar y Actualizar {changedCount} Precios</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
