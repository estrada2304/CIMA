import React, { useState, useRef } from 'react';
import { 
  Package, Plus, Trash, Trash2, Edit2, AlertCircle, Search, 
  TrendingDown, Layers, DollarSign, RefreshCw, Barcode, Eye,
  Upload, Download, FileText, Check, X, FileSpreadsheet,
  CheckSquare, Square, RotateCcw, AlertTriangle, Sparkles, HelpCircle, Info, Loader2,
  Camera, Image as ImageIcon, Link as LinkIcon, ImagePlus, User as UserIcon, ZoomIn, ShieldCheck
} from 'lucide-react';
import { Product, ExchangeRate, User, UserRole, ConsignmentItem, Client } from '../types';
import { Truck } from 'lucide-react';
import { batchSaveProducts, batchDeleteProducts, deleteSingleDoc, syncSingleDoc } from '../lib/firebase';
import { RAW_CATALOGO_CSV } from '../data/catalogoInicial';
import { compressImageFile, DEFAULT_PRODUCT_IMAGE, PRESET_PRODUCT_IMAGES } from '../lib/imageUtils';
import { ProductPhotoZoomModal } from './ProductPhotoZoomModal';
import { PriceUpdateModal } from './PriceUpdateModal';

interface InventoryModuleProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exchangeRate: ExchangeRate;
  currentUser: User;
  onOpenScanner: (onScanSuccess: (barcode: string) => void) => void;
  consignmentItems?: ConsignmentItem[];
  setConsignmentItems?: React.Dispatch<React.SetStateAction<ConsignmentItem[]>>;
  clients?: Client[];
}

export default function InventoryModule({
  products,
  setProducts,
  exchangeRate,
  currentUser,
  onOpenScanner,
  consignmentItems = [],
  setConsignmentItems,
  clients = []
}: InventoryModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'consignacion'>('general');

  // Multi-selection & Deletion states
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Import / Export state variables
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedProducts, setParsedProducts] = useState<Product[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'overwrite' | 'skip' | 'replace_all'>('overwrite');
  const [importError, setImportError] = useState<string | null>(null);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Helper to repair corrupted Spanish characters (ANSI/Latin1 into UTF-8 or replacement chars)
  const cleanSpanishEncoding = (text: string): string => {
    if (!text) return '';
    let res = text;
    const replacements: [RegExp, string][] = [
      [/C[\uFFFD]DIGO/gi, 'CÓDIGO'],
      [/ARN[\uFFFD]S/gi, 'ARNÉS'],
      [/ALBA[\uFFFD]ILER[\uFFFD]A/gi, 'ALBAÑILERÍA'],
      [/ALBA[\uFFFD]ILERIA/gi, 'ALBAÑILERÍA'],
      [/ALBA[\uFFFD]IL/gi, 'ALBAÑIL'],
      [/M[\uFFFD]TRICA/gi, 'MÉTRICA'],
      [/MULTIPROP[\uFFFD]SITO/gi, 'MULTIPROPÓSITO'],
      [/PELDA[\uFFFD]OS/gi, 'PELDAÑOS'],
      [/TELESC[\uFFFD]PICA/gi, 'TELESCÓPICA'],
      [/EXTENS[\uFFFD]N/gi, 'EXTENSIÓN'],
      [/L[\uFFFD]SER/gi, 'LÁSER'],
      [/ANAL[\uFFFD]GICO/gi, 'ANALÓGICO'],
      [/PRES[\uFFFD]N/gi, 'PRESIÓN'],
      [/V[\uFFFD]AS/gi, 'VÍAS'],
      [/DIEL[\uFFFD]CTRIC/gi, 'DIELÉCTRIC'],
      [/INAL[\uFFFD]MBRIC/gi, 'INALÁMBRIC'],
      [/SILIC[\uFFFD]N/gi, 'SILICÓN'],
      [/COMBINAC[\uFFFD]N/gi, 'COMBINACIÓN'],
      [/L[\uFFFD]MINAS/gi, 'LÁMINAS'],
      [/MULT[\uFFFD]METRO/gi, 'MULTÍMETRO'],
      [/SE[\uFFFD]ORITA/gi, 'SEÑORITA'],
      [/PERIF[\uFFFD]RICA/gi, 'PERIFÉRICA'],
      [/CORD[\uFFFD]N/gi, 'CORDÓN'],
      [/M[\uFFFD]QUINA/gi, 'MÁQUINA'],
      [/[\uFFFD]NICA/gi, 'ÚNICA'],
      [/HIDR[\uFFFD]ULIC/gi, 'HIDRÁULIC'],
      [/MARR[\uFFFD]N/gi, 'MARRÓN'],
      [/MOSQUET[\uFFFD]N/gi, 'MOSQUETÓN'],
      [/BATER[\uFFFD]A/gi, 'BATERÍA'],
      [/CINTUR[\uFFFD]N/gi, 'CINTURÓN'],
      [/DEMOLIC[\uFFFD]N/gi, 'DEMOLICIÓN'],
      [/PL[\uFFFD]STIC/gi, 'PLÁSTIC'],
      [/MET[\uFFFD]LIC/gi, 'METÁLIC'],
      [/TENS[\uFFFD]N/gi, 'TENSIÓN'],
      [/ROTAC[\uFFFD]N/gi, 'ROTACIÓN'],
      [/AUTOM[\uFFFD]TIC/gi, 'AUTOMÁTIC'],
      [/TUBER[\uFFFD]A/gi, 'TUBERÍA'],
      [/CARB[\uFFFD]N/gi, 'CARBÓN'],
      [/OX[\uFFFD]GENO/gi, 'OXÍGENO'],
      [/DISE[\uFFFD]O/gi, 'DISEÑO'],
      [/L[\uFFFD]PIZ/gi, 'LÁPIZ'],
      [/TR[\uFFFD]FICO/gi, 'TRÁFICO'],
      [/PU[\uFFFD]O/gi, 'PUÑO'],
      [/PANTAL[\uFFFD]N/gi, 'PANTALÓN'],
      [/L[\uFFFD]NEA/gi, 'LÍNEA'],
      [/EST[\uFFFD]NDAR/gi, 'ESTÁNDAR'],
      [/ESPATULA/gi, 'ESPÁTULA']
    ];
    for (const [pattern, rep] of replacements) {
      res = res.replace(pattern, rep);
    }
    return res.replace(/[\uFFFD]/g, '');
  };

  // Parses numbers with support for Spanish comma decimals ("17,90", "36,8") and dots ("1.675,66")
  const parseSpanishNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    let s = String(val).trim();
    if (!s || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') return 0;

    // Remove currency signs, letters, and extraneous spaces
    s = s.replace(/[$Bs.€\s]/g, (m) => m === '.' ? '.' : '');
    s = s.replace(/\s+/g, '');

    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        // "1.675,66" -> 1675.66
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // "1,675.66" -> 1675.66
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      // "17,90" or "36,8" -> 17.90 or 36.8
      s = s.replace(',', '.');
    }

    const num = parseFloat(s);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  };

  // Parses stock quantities, properly distinguishing thousand separators like "1.200" or "1,200"
  const parseStockNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    let s = String(val).trim();
    if (!s || s === '-' || s.toLowerCase() === 'n/a') return 0;

    // Format like 1.200 or 1,200 -> 1200 units
    if (/^\d{1,3}[.,]\d{3}$/.test(s)) {
      return parseInt(s.replace(/[.,]/g, ''), 10) || 0;
    }
    return Math.round(parseSpanishNumber(s));
  };

  // Calculation helpers for Cuadrillas based on category/brand
  const getCuadrillaRatio = (category: string): number => {
    const cat = (category || '').toUpperCase();
    if (cat.includes('FBO')) return 1.02; // +2%
    if (cat.includes('TOHO')) return 1.20; // +20%
    if (cat.includes('PRESCOTT')) return 1.10; // +10%
    return 1.10; // Default +10%
  };

  const calculateCuadrillasAuto = (category: string, priceVESVal: number, priceUSDVal: number): number => {
    const base = priceVESVal > 0 ? priceVESVal : priceUSDVal;
    if (!base || base <= 0) return 0;
    const ratio = getCuadrillaRatio(category);
    return Math.round(base * ratio * 100) / 100;
  };

  // Reusable multi-delimiter CSV parser (handles commas, semicolons, tabs, quotes, multiline cells)
  const parseCSV = (text: string): string[][] => {
    // Detect delimiter from first non-empty line
    const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ',';
    if (tabCount > semicolonCount && tabCount > commaCount) {
      delimiter = '\t';
    } else if (semicolonCount >= commaCount) {
      delimiter = ';';
    }

    const lines: string[][] = [];
    let currentLine: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentLine.push(currentValue.trim());
        currentValue = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentLine.push(currentValue.trim());
        if (currentLine.some(cell => cell.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    if (currentValue.length > 0 || currentLine.length > 0) {
      currentLine.push(currentValue.trim());
      if (currentLine.some(cell => cell.length > 0)) {
        lines.push(currentLine);
      }
    }
    return lines;
  };

  // Intelligent CSV importer that precisely reads user columns without overwriting with formulas
  const handleCSVImport = (text: string) => {
    try {
      setImportError(null);
      setImportLogs([]);
      const rawLines = parseCSV(text);
      if (rawLines.length < 2) {
        throw new Error("El archivo CSV debe contener al menos una fila de cabecera y una de datos.");
      }

      // Normalize headers: clean encoding, lowercase, remove accents
      const headers = rawLines[0].map((h: string) =>
        cleanSpanishEncoding(h)
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      );

      // Search helpers
      const findCol = (predicate: (h: string) => boolean) => headers.findIndex(predicate);

      // 1. Product Code / ID / Barcode (CDIGO, CODIGO, COD, BARCODE, etc.)
      const codeIndex = findCol(h => ['codigo', 'cdigo', 'cod', 'barcode', 'barra', 'barras', 'sku', 'id', 'referencia', 'articulo'].some(k => h === k || h.startsWith(k)));

      // 2. Name
      const nameIndex = findCol(h => ['nombre', 'name', 'descripcion', 'descrip', 'producto', 'item'].some(k => h.includes(k)));

      // 3. Category / Type (TIPO, CATEGORIA, MARCA)
      const categoryIndex = findCol(h => ['tipo', 'categoria', 'marca', 'grupo', 'linea', 'departamento', 'brand'].some(k => h.includes(k)));

      // 4. Cost in USD: headers with "cost" and ("$" or "usd" or "dolar")
      let costUSDIndex = findCol(h => (h.includes('cost') || h.includes('compra')) && (h.includes('$') || h.includes('usd') || h.includes('dolar')));
      if (costUSDIndex === -1) {
        // Fallback: any cost header not mentioning bs or ves
        costUSDIndex = findCol(h => (h.includes('cost') || h.includes('compra')) && !h.includes('bs') && !h.includes('ves') && !h.includes('bolivar'));
      }

      // 5. Cost in Bs: headers with "cost" and ("bs" or "ves" or "bolivar")
      const costVESIndex = findCol(h => (h.includes('cost') || h.includes('compra')) && (h.includes('bs') || h.includes('ves') || h.includes('bolivar')));

      // 6. Price Detal Cuadrillas (P_DETAL_C)
      const priceDetalCIndex = findCol(h => h.includes('detal_c') || h.includes('detal c') || h.includes('p_detal_c') || h.includes('detal cuadrilla'));

      // 7. Price Mayor Detal (P_MAYOR_D)
      const priceMayorDIndex = findCol(h => h.includes('mayor_d') || h.includes('mayor d') || h.includes('p_mayor_d') || h.includes('mayor detal'));

      // 8. Price Cuadrillas (P_CUADRILLAS)
      const priceCuadrillasIndex = findCol(h => (h.includes('cuadrilla') || h.includes('p_cuadrilla')) && !h.includes('detal') && !h.includes('bs') && !h.includes('ves'));
      const priceCuadrillasVESIndex = findCol(h => (h.includes('cuadrilla') || h.includes('p_cuadrilla')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));

      // 9. Price Mayor / Wholesale (P_MAYOR)
      const priceMayorIndex = findCol(h => (h.includes('mayor') || h.includes('whole') || h.includes('p_mayor')) && !h.includes('_d') && !h.includes(' detal') && !h.includes('bs') && !h.includes('ves'));
      const priceMayorVESIndex = findCol(h => (h.includes('mayor') || h.includes('p_mayor')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')));

      // 10. Price Detal (P_DETAL, PRECIO, VENTA)
      const priceDetalIndex = findCol(h => (h.includes('detal') || h.includes('precio') || h.includes('price') || h.includes('venta') || h.includes('p_detal')) && !h.includes('_c') && !h.includes('cuadrilla') && !h.includes('mayor') && !h.includes('bs') && !h.includes('ves'));
      const priceDetalVESIndex = findCol(h => (h.includes('detal') || h.includes('precio') || h.includes('p_detal')) && (h.includes('bs') || h.includes('ves') || h.includes('boliv')) && !h.includes('mayor'));

      // 11. Stock / Inventory
      const stockIndex = findCol(h => h.includes('stock') || h.includes('existencia') || h.includes('disponible') || h.includes('cantidad') || h.includes('cant') || h.includes('unid'));

      // 12. Location BIN
      const binIndex = findCol(h => h.includes('bin') || h.includes('ubicacion') || h.includes('estante') || h.includes('deposito') || h.includes('almacen') || h.includes('pasillo'));

      if (nameIndex === -1 && codeIndex === -1) {
        throw new Error("No se pudo detectar las columnas de CÓDIGO ni NOMBRE. Por favor verifique las cabeceras.");
      }

      const list: Product[] = [];
      const logs: string[] = [];

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.length === 0 || (line.length === 1 && line[0].trim() === '')) continue;

        // Raw code and name
        const rawCode = codeIndex !== -1 && line[codeIndex] ? line[codeIndex].trim() : '';
        const rawName = nameIndex !== -1 && line[nameIndex] ? line[nameIndex].trim() : '';

        // Clean accented letters
        const cleanName = cleanSpanishEncoding(rawName).replace(/^["']|["']$/g, '').trim();
        const cleanCode = rawCode.replace(/^["']|["']$/g, '').trim() || (cleanName ? "PROD-" + (i + 1000) : '');

        if (!cleanName && !cleanCode) {
          logs.push(`Fila ${i + 1}: Omitida, fila vacía.`);
          continue;
        }

        // The product code serves as both the unique ID and the SKU!
        // No separate SKU required.
        const id = cleanCode || "BAR-" + Math.floor(Math.random() * 900000000000 + 100000000000);
        const sku = cleanCode || id;

        // Brand / Category from TIPO
        const rawTipo = categoryIndex !== -1 && line[categoryIndex] ? line[categoryIndex].trim() : '';
        const category = cleanSpanishEncoding(rawTipo).replace(/^["']|["']$/g, '').trim() || 'General';

        const rate = exchangeRate?.rate || 1;

        // Costs
        let costUSD = costUSDIndex !== -1 && line[costUSDIndex] ? parseSpanishNumber(line[costUSDIndex]) : 0;
        let costVES = costVESIndex !== -1 && line[costVESIndex] ? parseSpanishNumber(line[costVESIndex]) : 0;
        if (costUSD === 0 && costVES > 0) costUSD = costVES;
        if (costVES === 0 && costUSD > 0) costVES = costUSD;
        const costExchangeUSD = costUSD > 0 ? costUSD : (costVES > 0 ? costVES : 0);

        // Prices directly from user columns (all expressed as dollar references)
        let priceUSD = priceDetalIndex !== -1 && line[priceDetalIndex] ? parseSpanishNumber(line[priceDetalIndex]) : 0;
        let priceVES = priceDetalVESIndex !== -1 && line[priceDetalVESIndex] ? parseSpanishNumber(line[priceDetalVESIndex]) : 0;
        if (priceUSD === 0 && priceVES > 0) priceUSD = priceVES;
        if (priceVES === 0 && priceUSD > 0) priceVES = priceUSD;

        const parsedMayorUSD = priceMayorIndex !== -1 && line[priceMayorIndex] ? parseSpanishNumber(line[priceMayorIndex]) : 0;
        let priceWholesaleUSD = parsedMayorUSD > 0 ? parsedMayorUSD : 0;
        let priceWholesaleVES = priceMayorVESIndex !== -1 && line[priceMayorVESIndex] ? parseSpanishNumber(line[priceMayorVESIndex]) : 0;
        if (priceWholesaleUSD === 0 && priceWholesaleVES > 0) priceWholesaleUSD = priceWholesaleVES;
        if (priceWholesaleVES === 0 && priceWholesaleUSD > 0) priceWholesaleVES = priceWholesaleUSD;

        const parsedCuadrillasUSD = priceCuadrillasIndex !== -1 && line[priceCuadrillasIndex] ? parseSpanishNumber(line[priceCuadrillasIndex]) : 0;
        let priceCuadrillasUSD = parsedCuadrillasUSD > 0 ? parsedCuadrillasUSD : 0;
        let priceCuadrillasVES = priceCuadrillasVESIndex !== -1 && line[priceCuadrillasVESIndex] ? parseSpanishNumber(line[priceCuadrillasVESIndex]) : 0;
        if (priceCuadrillasUSD === 0 && priceCuadrillasVES > 0) priceCuadrillasUSD = priceCuadrillasVES;
        if (priceCuadrillasUSD === 0) {
          priceCuadrillasUSD = calculateCuadrillasAuto(category, priceVES, priceUSD);
        }
        if (priceCuadrillasVES === 0) priceCuadrillasVES = priceCuadrillasUSD;

        const parsedDetalC = priceDetalCIndex !== -1 && line[priceDetalCIndex] ? parseSpanishNumber(line[priceDetalCIndex]) : 0;
        const priceCuadrillasDetalUSD = parsedDetalC > 0 ? parsedDetalC : 0;

        const parsedMayorD = priceMayorDIndex !== -1 && line[priceMayorDIndex] ? parseSpanishNumber(line[priceMayorDIndex]) : 0;
        const priceMayorDetalUSD = parsedMayorD > 0 ? parsedMayorD : 0;

        // Location BIN
        const rawBin = binIndex !== -1 && line[binIndex] ? line[binIndex] : '';
        const binLocation = rawBin
          .replace(/^["']|["']$/g, '')
          .replace(/[\r\n]+/g, ' - ')
          .replace(/\s+/g, ' ')
          .trim();

        // Stock
        const stock = stockIndex !== -1 && line[stockIndex] ? parseStockNumber(line[stockIndex]) : 0;

        list.push({
          id,
          name: cleanName || cleanCode,
          category,
          sku,
          costUSD,
          costExchangeUSD,
          costVES,
          priceUSD,
          priceVES,
          priceWholesaleUSD,
          priceWholesaleVES,
          priceCuadrillasUSD,
          priceCuadrillasVES,
          priceCuadrillasDetalUSD,
          priceMayorDetalUSD,
          binLocation,
          stock,
          minStock: 5,
          description: `Tipo: ${category}${binLocation ? ` | BIN: ${binLocation}` : ''}`,
          imageUrl: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      if (list.length === 0) {
        throw new Error("No se encontraron productos válidos para importar. Revise el contenido.");
      }

      setParsedProducts(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError(err.message || "Error al procesar el archivo CSV.");
    }
  };

  // JSON parser with flexible mapping
  const handleJSONImport = (text: string) => {
    try {
      setImportError(null);
      setImportLogs([]);
      const data = JSON.parse(text);
      const rawList = Array.isArray(data) ? data : (data.products || []);
      if (!Array.isArray(rawList)) {
        throw new Error("Formato JSON inválido. Debe ser una lista [] de productos.");
      }

      const list: Product[] = [];
      const logs: string[] = [];

      rawList.forEach((item: any, idx: number) => {
        const code = String(item.id || item.codigo || item.codigo_barras || item.barcode || item.sku || `PROD-${idx + 1}`).trim();
        const name = cleanSpanishEncoding(String(item.name || item.nombre || '')).trim();
        if (!name && !code) {
          logs.push(`Registro en posición ${idx + 1}: Omitido por estar vacío.`);
          return;
        }

        const rate = exchangeRate?.rate || 1;
        let costUSD = parseSpanishNumber(item.costUSD || item.costo || item.costo_usd || 0);
        let costVES = parseSpanishNumber(item.costVES || item.costo_bs || 0);
        if (costUSD === 0 && costVES > 0) costUSD = costVES;
        if (costVES === 0 && costUSD > 0) costVES = costUSD;

        let priceUSD = parseSpanishNumber(item.priceUSD || item.precio || item.p_detal || 0);
        let priceVES = parseSpanishNumber(item.priceVES || item.precio_bs || item.p_detal_bs || 0);
        if (priceUSD === 0 && priceVES > 0) priceUSD = priceVES;
        if (priceVES === 0 && priceUSD > 0) priceVES = priceUSD;

        let priceWholesaleUSD = parseSpanishNumber(item.priceWholesaleUSD || item.p_mayor || 0);
        let priceWholesaleVES = parseSpanishNumber(item.priceWholesaleVES || item.precio_mayor_bs || item.p_mayor_bs || 0);
        if (priceWholesaleUSD === 0 && priceWholesaleVES > 0) priceWholesaleUSD = priceWholesaleVES;
        if (priceWholesaleVES === 0 && priceWholesaleUSD > 0) priceWholesaleVES = priceWholesaleUSD;

        let priceCuadrillasUSD = parseSpanishNumber(item.priceCuadrillasUSD || item.p_cuadrillas || 0);
        let priceCuadrillasVES = parseSpanishNumber(item.priceCuadrillasVES || item.precio_cuadrillas_bs || 0);
        if (priceCuadrillasUSD === 0 && priceCuadrillasVES > 0) priceCuadrillasUSD = priceCuadrillasVES;
        if (priceCuadrillasUSD === 0) {
          priceCuadrillasUSD = calculateCuadrillasAuto(String(item.category || item.tipo || item.categoria || ''), priceVES, priceUSD);
        }
        if (priceCuadrillasVES === 0) priceCuadrillasVES = priceCuadrillasUSD;

        const priceCuadrillasDetalUSD = parseSpanishNumber(item.priceCuadrillasDetalUSD || item.p_detal_c || 0);
        const priceMayorDetalUSD = parseSpanishNumber(item.priceMayorDetalUSD || item.p_mayor_d || 0);

        list.push({
          id: code,
          name: name || code,
          category: String(item.category || item.tipo || item.categoria || 'General'),
          sku: String(item.sku || code),
          costUSD,
          costExchangeUSD: costUSD,
          costVES,
          priceUSD,
          priceVES,
          priceWholesaleUSD,
          priceWholesaleVES,
          priceCuadrillasUSD,
          priceCuadrillasVES,
          priceCuadrillasDetalUSD,
          priceMayorDetalUSD,
          binLocation: String(item.binLocation || item.bin || item.ubicacion || ''),
          stock: parseStockNumber(item.stock || item.existencia || item.cantidad || 0),
          minStock: Number(item.minStock || 5),
          description: String(item.description || item.descripcion || `Importado JSON el ${new Date().toLocaleDateString()}`),
          imageUrl: String(item.imageUrl || "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      setParsedProducts(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError("Error al analizar archivo JSON: " + err.message);
    }
  };

  // Quick action: load the user's initial 155 products dataset
  const handleLoadSampleCatalogue = () => {
    setImportText(RAW_CATALOGO_CSV);
    handleCSVImport(RAW_CATALOGO_CSV);
  };

  // Drag and drop handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        handleJSONImport(text);
      } else {
        handleCSVImport(text);
      }
    };
    reader.readAsText(file);
  };

  // Confirmation with Firestore and LocalStorage synchronizations
  const handleConfirmImport = async () => {
    setIsImporting(true);
    try {
      if (duplicateStrategy === 'replace_all') {
        setProducts(parsedProducts);
        localStorage.setItem('siga_products', JSON.stringify(parsedProducts));

        // Background server & Firestore cloud backup
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            products: parsedProducts,
            sourceUser: currentUser,
            activity: {
              username: currentUser.username,
              action: 'Importación de Catálogo',
              details: `Se importaron ${parsedProducts.length} productos al catálogo general.`
            }
          })
        }).catch(console.warn);

        batchSaveProducts(parsedProducts).catch(console.warn);

        alert(`✅ Importación completada con éxito:\n- Se vació el catálogo anterior y se establecieron ${parsedProducts.length} productos nuevos en el sistema.`);
      } else {
        let updatedList = [...products];
        let overwroteCount = 0;
        let addedCount = 0;
        let skippedCount = 0;

        parsedProducts.forEach(p => {
          const existingIdx = updatedList.findIndex(x => x.id === p.id);
          if (existingIdx !== -1) {
            if (duplicateStrategy === 'overwrite') {
              const currentItem = updatedList[existingIdx];
              // Protect existing custom photo if new product has default/empty photo
              const currentImg = currentItem.imageUrl;
              const hasCustomPhoto = currentImg && currentImg !== DEFAULT_PRODUCT_IMAGE && !currentImg.includes('images.unsplash.com/photo-1542831371');
              const newImg = p.imageUrl;
              const newHasPhoto = newImg && newImg !== DEFAULT_PRODUCT_IMAGE && !newImg.includes('images.unsplash.com/photo-1542831371');

              const finalImg = newHasPhoto ? newImg : (hasCustomPhoto ? currentImg : (newImg || currentImg || DEFAULT_PRODUCT_IMAGE));

              const merged: Product = {
                ...currentItem,
                ...p,
                imageUrl: finalImg,
                updatedAt: new Date().toISOString()
              };
              updatedList[existingIdx] = merged;
              overwroteCount++;
            } else {
              skippedCount++;
            }
          } else {
            updatedList.push(p);
            addedCount++;
          }
        });

        setProducts(updatedList);
        localStorage.setItem('siga_products', JSON.stringify(updatedList));

        // Background server & Firestore cloud backup
        fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            products: updatedList,
            sourceUser: currentUser,
            activity: {
              username: currentUser.username,
              action: 'Carga de Productos',
              details: `Se cargaron ${addedCount} productos nuevos y se actualizaron ${overwroteCount}.`
            }
          })
        }).catch(console.warn);

        batchSaveProducts(updatedList).catch(console.warn);

        alert(`✅ Importación completada con éxito:\n- ${addedCount} productos nuevos añadidos.\n- ${overwroteCount} actualizados/sobrescritos.\n- ${skippedCount} omitidos por duplicado.\n- Fotografías existentes protegidas.`);
      }

      setParsedProducts([]);
      setImportText('');
      setImportStep('upload');
      setShowImportExport(false);
    } catch (error: any) {
      console.error("Error confirming import:", error);
      alert("Error al confirmar la importación: " + (error.message || error));
    } finally {
      setIsImporting(false);
    }
  };

  // Export current list to CSV with Excel compatibility (UTF-8 BOM)
  const handleExportCSV = () => {
    const rate = exchangeRate?.rate || 1;
    const headers = [
      "Código de Barras",
      "Nombre del Producto",
      "Categoría",
      "ID de Producto",
      "Costo USD ($)",
      "Costo al cambio USD ($)",
      "Precio Detal USD ($)",
      "Precio Detal Bs ($)",
      "Precio Mayor USD ($)",
      "Precio Mayor Bs ($)",
      "Precio Cuadrillas ($)",
      "Precio Cuadrillas Detal USD",
      "Precio Mayor Detal USD",
      "Ubicación BIN",
      "Stock Actual",
      "Mínimo Alerta",
      "Descripción"
    ];
    const rows = products.map(p => [
      `"${p.id}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.category || 'General'}"`,
      `"${p.sku || p.id}"`,
      p.costUSD || 0,
      p.costExchangeUSD || p.costVES || p.costUSD || 0,
      p.priceUSD || 0,
      p.priceVES || p.priceUSD || 0,
      p.priceWholesaleUSD || 0,
      p.priceWholesaleVES || p.priceWholesaleUSD || 0,
      p.priceCuadrillasUSD > 0 ? p.priceCuadrillasUSD : calculateCuadrillasAuto(p.category, p.priceVES || p.priceUSD || 0, p.priceUSD || 0),
      p.priceCuadrillasDetalUSD || 0,
      p.priceMayorDetalUSD || 0,
      `"${(p.binLocation || '').replace(/"/g, '""')}"`,
      p.stock || 0,
      p.minStock || 5,
      `"${(p.description || '').replace(/"/g, '""')}"`
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SigaInvent_Productos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON file
  const handleExportJSON = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(products, null, 2))}`;
    const link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", `SigaInvent_Productos_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add Product Form states
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Alimentos');
  const [newSku, setNewSku] = useState('');
  const [newCost, setNewCost] = useState<number>(0);
  const [newCostVES, setNewCostVES] = useState<number>(0);
  const [newCostExchangeUSD, setNewCostExchangeUSD] = useState<number>(0);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [newPriceVES, setNewPriceVES] = useState<number>(0);
  const [newPriceWholesale, setNewPriceWholesale] = useState<number>(0);
  const [newPriceWholesaleVES, setNewPriceWholesaleVES] = useState<number>(0);
  const [newPriceCuadrillas, setNewPriceCuadrillas] = useState<number>(0);
  const [newPriceCuadrillasVES, setNewPriceCuadrillasVES] = useState<number>(0);
  const [newPriceCuadrillasDetal, setNewPriceCuadrillasDetal] = useState<number>(0);
  const [newPriceMayorDetal, setNewPriceMayorDetal] = useState<number>(0);
  const [newBinLocation, setNewBinLocation] = useState('');
  const [newStock, setNewStock] = useState<number>(0);
  const [newMinStock, setNewMinStock] = useState<number>(5);
  const [newDescription, setNewDescription] = useState('');
  const [newImageUrl, setNewImageUrl] = useState<string>(DEFAULT_PRODUCT_IMAGE);
  const [isCompressingNewImage, setIsCompressingNewImage] = useState<boolean>(false);

  // Editing Product states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editBarcode, setEditBarcode] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Alimentos');
  const [editSku, setEditSku] = useState('');
  const [editCost, setEditCost] = useState<number>(0);
  const [editCostVES, setEditCostVES] = useState<number>(0);
  const [editCostExchangeUSD, setEditCostExchangeUSD] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editPriceVES, setEditPriceVES] = useState<number>(0);
  const [editPriceWholesale, setEditPriceWholesale] = useState<number>(0);
  const [editPriceWholesaleVES, setEditPriceWholesaleVES] = useState<number>(0);
  const [editPriceCuadrillas, setEditPriceCuadrillas] = useState<number>(0);
  const [editPriceCuadrillasVES, setEditPriceCuadrillasVES] = useState<number>(0);
  const [editPriceCuadrillasDetal, setEditPriceCuadrillasDetal] = useState<number>(0);
  const [editPriceMayorDetal, setEditPriceMayorDetal] = useState<number>(0);
  const [editBinLocation, setEditBinLocation] = useState('');
  const [editStock, setEditStock] = useState<number>(0);
  const [editMinStock, setEditMinStock] = useState<number>(5);
  const [editDescription, setEditDescription] = useState('');
  const [editImageUrl, setEditImageUrl] = useState<string>(DEFAULT_PRODUCT_IMAGE);
  const [isCompressingEditImage, setIsCompressingEditImage] = useState<boolean>(false);

  // Quick Photo Change Modal states
  const [quickPhotoProduct, setQuickPhotoProduct] = useState<Product | null>(null);
  const [quickPhotoUrl, setQuickPhotoUrl] = useState<string>(DEFAULT_PRODUCT_IMAGE);
  const [isCompressingQuickPhoto, setIsCompressingQuickPhoto] = useState<boolean>(false);
  const [quickPhotoTab, setQuickPhotoTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [photoSaveSuccess, setPhotoSaveSuccess] = useState<boolean>(false);

  // Photo Zoom Viewer State
  const [zoomModalData, setZoomModalData] = useState<{
    isOpen: boolean;
    imageUrl: string;
    productName?: string;
    productCode?: string;
    productCategory?: string;
    productPrice?: number;
    product?: Product;
  }>({
    isOpen: false,
    imageUrl: ''
  });

  const openZoomViewer = (
    imageUrl: string,
    productName?: string,
    productCode?: string,
    productCategory?: string,
    productPrice?: number,
    product?: Product
  ) => {
    setZoomModalData({
      isOpen: true,
      imageUrl: imageUrl || DEFAULT_PRODUCT_IMAGE,
      productName: productName || 'Fotografía de Producto',
      productCode,
      productCategory,
      productPrice,
      product
    });
  };

  // Dedicated Bulk Price Update Modal State (CSV / JSON with 100% Photo Protection)
  const [isPriceUpdateModalOpen, setIsPriceUpdateModalOpen] = useState(false);

  const handleApplyPriceUpdates = async (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
  };

  // Upload helper to permanently store images on disk and server
  const uploadProductPhoto = async (imageStr: string, productId?: string): Promise<string> => {
    if (!imageStr || !imageStr.startsWith('data:image/')) {
      return imageStr;
    }
    try {
      const res = await fetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageStr, productId })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.url) {
          return json.url;
        }
      }
    } catch (err) {
      console.warn("Upload helper error, preserving image:", err);
    }
    return imageStr;
  };

  // Helper for processing, compressing and permanently uploading image files
  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setImageUrl: (url: string) => void,
    setIsLoading: (loading: boolean) => void,
    productId?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const compressed = await compressImageFile(file, 600, 600, 0.85);
      // Immediately upload to server to get permanent /uploads/ file path
      const uploadedUrl = await uploadProductPhoto(compressed, productId);
      setImageUrl(uploadedUrl);
    } catch (err: any) {
      alert(`⚠️ Error al procesar la imagen: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const openPhotoModal = (p: Product) => {
    setQuickPhotoProduct(p);
    setQuickPhotoUrl(p.imageUrl || DEFAULT_PRODUCT_IMAGE);
    setQuickPhotoTab('upload');
    setPhotoSaveSuccess(false);
  };

  const handleSaveQuickPhoto = async () => {
    if (!quickPhotoProduct) return;
    const targetId = quickPhotoProduct.id;
    let finalImageUrl = quickPhotoUrl.trim() || quickPhotoProduct.imageUrl || DEFAULT_PRODUCT_IMAGE;

    if (finalImageUrl.startsWith('data:image/')) {
      finalImageUrl = await uploadProductPhoto(finalImageUrl, targetId);
    }

    let updatedTargetProduct: Product | null = null;
    const updated = products.map(p => {
      if (p.id === targetId) {
        const newP = {
          ...p,
          imageUrl: finalImageUrl,
          updatedAt: new Date().toISOString()
        };
        updatedTargetProduct = newP;
        return newP;
      }
      return p;
    });

    setProducts(updated);
    try {
      localStorage.setItem('siga_products', JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota warning on quick photo save:", e);
    }

    // Direct Firestore individual document sync with persistent photo
    if (updatedTargetProduct) {
      syncSingleDoc('products', targetId, updatedTargetProduct).catch(console.warn);
    }

    // Cloud & local server sync with author attribution
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        products: updated,
        sourceUser: currentUser,
        activity: {
          username: currentUser.username,
          action: 'Fotografía de Producto',
          details: `Foto actualizada para "${quickPhotoProduct.name}" (${quickPhotoProduct.sku}) por ${currentUser.nombreCompleto || currentUser.username}`
        }
      })
    }).catch(console.warn);

    setPhotoSaveSuccess(true);
    setTimeout(() => {
      setPhotoSaveSuccess(false);
      setQuickPhotoProduct(null);
    }, 700);
  };

  // Devolución de Consignación (Return to warehouse) states
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnClientRif, setReturnClientRif] = useState('');
  const [returnProductId, setReturnProductId] = useState('');
  const [returnQty, setReturnQty] = useState<number>(1);

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditBarcode(p.id);
    setEditName(p.name);
    setEditCategory(p.category || 'Alimentos');
    setEditSku(p.sku);
    setEditCost(p.costUSD || 0);
    setEditCostVES(p.costVES || p.costExchangeUSD || p.costUSD || 0);
    setEditCostExchangeUSD(p.costExchangeUSD || p.costUSD || 0);
    setEditPrice(p.priceUSD || 0);
    setEditPriceVES(p.priceVES || p.priceUSD || 0);
    setEditPriceWholesale(p.priceWholesaleUSD || 0);
    setEditPriceWholesaleVES(p.priceWholesaleVES || p.priceWholesaleUSD || 0);
    const autoCuad = calculateCuadrillasAuto(p.category || '', p.priceVES || p.priceUSD || 0, p.priceUSD || 0);
    const finalCuad = p.priceCuadrillasUSD > 0 ? p.priceCuadrillasUSD : autoCuad;
    setEditPriceCuadrillas(finalCuad);
    setEditPriceCuadrillasVES(p.priceCuadrillasVES > 0 ? p.priceCuadrillasVES : finalCuad);
    setEditPriceCuadrillasDetal(p.priceCuadrillasDetalUSD || 0);
    setEditPriceMayorDetal(p.priceMayorDetalUSD || 0);
    setEditBinLocation(p.binLocation || '');
    setEditStock(p.stock || 0);
    setEditMinStock(p.minStock || 5);
    setEditDescription(p.description || '');
    setEditImageUrl(p.imageUrl || DEFAULT_PRODUCT_IMAGE);
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!editBarcode || !editName || !editSku) {
      alert("⚠️ El código de barras, el nombre y el ID del producto son obligatorios.");
      return;
    }

    // Check if SKU already exists for another product
    if (products.some(p => p.sku.toUpperCase() === editSku.toUpperCase() && p.id !== editingProduct.id)) {
      alert(`⚠️ ID del producto "${editSku.toUpperCase()}" ya se encuentra registrado para otro producto.`);
      return;
    }

    // Check if Barcode already exists for another product
    if (editBarcode !== editingProduct.id && products.some(p => p.id === editBarcode)) {
      alert(`⚠️ Código de barras "${editBarcode}" ya se encuentra registrado para otro producto.`);
      return;
    }

    let finalImageUrl = editImageUrl.trim() || editingProduct.imageUrl || DEFAULT_PRODUCT_IMAGE;
    if (finalImageUrl.startsWith('data:image/')) {
      finalImageUrl = await uploadProductPhoto(finalImageUrl, editBarcode);
    }

    const finalPriceUSD = Number(editPrice) || 0;
    const finalPriceVES = Number(editPriceVES) > 0 ? Number(editPriceVES) : finalPriceUSD;

    const finalWholesaleUSD = Number(editPriceWholesale) || 0;
    const finalWholesaleVES = Number(editPriceWholesaleVES) > 0 ? Number(editPriceWholesaleVES) : finalWholesaleUSD;

    const autoCuad = calculateCuadrillasAuto(editCategory, finalPriceVES, finalPriceUSD);
    const finalCuadrillasUSD = Number(editPriceCuadrillas) > 0 ? Number(editPriceCuadrillas) : autoCuad;
    const finalCuadrillasVES = Number(editPriceCuadrillasVES) > 0 ? Number(editPriceCuadrillasVES) : finalCuadrillasUSD;

    const finalCostUSD = Number(editCost) || 0;
    const finalCostVES = Number(editCostVES) > 0 ? Number(editCostVES) : finalCostUSD;

    const updatedProduct: Product = {
      ...editingProduct,
      id: editBarcode,
      name: editName,
      category: editCategory,
      sku: editSku.toUpperCase(),
      imageUrl: finalImageUrl,
      costUSD: finalCostUSD,
      costVES: finalCostVES,
      costExchangeUSD: Number(editCostExchangeUSD) || finalCostUSD,
      priceUSD: finalPriceUSD,
      priceVES: finalPriceVES,
      priceWholesaleUSD: finalWholesaleUSD,
      priceWholesaleVES: finalWholesaleVES,
      priceCuadrillasUSD: finalCuadrillasUSD,
      priceCuadrillasVES: finalCuadrillasVES,
      priceCuadrillasDetalUSD: Number(editPriceCuadrillasDetal) || 0,
      priceMayorDetalUSD: Number(editPriceMayorDetal) || 0,
      binLocation: editBinLocation,
      stock: Number(editStock),
      minStock: Number(editMinStock),
      description: editDescription,
      updatedAt: new Date().toISOString()
    };

    const isIdChanged = editBarcode !== editingProduct.id;
    const updated = products.map(p => p.id === editingProduct.id ? updatedProduct : p);
    setProducts(updated);
    try {
      localStorage.setItem('siga_products', JSON.stringify(updated));
    } catch (err) {}
    syncSingleDoc('products', updatedProduct.id, updatedProduct).catch(console.warn);
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: updated,
        sourceUser: currentUser,
        activity: {
          username: currentUser.username,
          action: 'Edición Producto',
          details: `Producto actualizado: "${updatedProduct.name}" (${updatedProduct.sku})`
        }
      })
    }).catch(console.warn);

    if (isIdChanged) {
      deleteSingleDoc('products', editingProduct.id).catch(console.warn);
      fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'products', ids: [editingProduct.id], user: currentUser })
      }).catch(console.warn);
    }
    setEditingProduct(null);
  };

  const handleScanBarcodeForEdit = () => {
    onOpenScanner((barcode) => {
      setEditBarcode(barcode);
    });
  };

  // Extract unique categories
  const categories = ['todos', ...Array.from(new Set(products.filter(Boolean).map(p => p.category || 'Otros')))];

  // Filters
  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const term = (searchTerm || '').toLowerCase().trim();
    const matchesSearch = !term || 
                          (p.name || '').toLowerCase().includes(term) || 
                          String(p.id || '').toLowerCase().includes(term) || 
                          (p.sku || '').toLowerCase().includes(term);
    const matchesCategory = selectedCategory === 'todos' || p.category === selectedCategory;
    const matchesLowStock = !showLowStockOnly || (p.stock || 0) <= (p.minStock || 0);
    return matchesSearch && matchesCategory && matchesLowStock;
  });

  // Role permissions
  const canModify = currentUser.role === 'Administrador' || currentUser.role === 'Almacenista';
  const isAdmin = currentUser.role === 'Administrador';

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarcode || !newName || !newSku) {
      alert("⚠️ El código de barras, el nombre y el ID del producto son obligatorios.");
      return;
    }

    // Check if barcode already exists
    if (products.some(p => p.id === newBarcode)) {
      alert(`⚠️ Código de barras "${newBarcode}" ya se encuentra registrado en el catálogo.`);
      return;
    }

    // Check if SKU already exists
    if (products.some(p => p.sku.toUpperCase() === newSku.toUpperCase())) {
      alert(`⚠️ ID del producto "${newSku.toUpperCase()}" ya se encuentra registrado para otro producto.`);
      return;
    }

    const finalPriceUSD = Number(newPrice) || 0;
    const finalPriceVES = Number(newPriceVES) > 0 ? Number(newPriceVES) : finalPriceUSD;

    const finalWholesaleUSD = Number(newPriceWholesale) || 0;
    const finalWholesaleVES = Number(newPriceWholesaleVES) > 0 ? Number(newPriceWholesaleVES) : finalWholesaleUSD;

    const autoCuad = calculateCuadrillasAuto(newCategory, finalPriceVES, finalPriceUSD);
    const finalCuadrillasUSD = Number(newPriceCuadrillas) > 0 ? Number(newPriceCuadrillas) : autoCuad;
    const finalCuadrillasVES = Number(newPriceCuadrillasVES) > 0 ? Number(newPriceCuadrillasVES) : finalCuadrillasUSD;

    const finalCostUSD = Number(newCost) || 0;
    const finalCostVES = Number(newCostVES) > 0 ? Number(newCostVES) : finalCostUSD;

    let finalImageUrl = newImageUrl.trim() || DEFAULT_PRODUCT_IMAGE;
    if (finalImageUrl.startsWith('data:image/')) {
      finalImageUrl = await uploadProductPhoto(finalImageUrl, newBarcode);
    }

    const newProduct: Product = {
      id: newBarcode,
      name: newName,
      category: newCategory,
      sku: newSku.toUpperCase(),
      costUSD: finalCostUSD,
      costVES: finalCostVES,
      costExchangeUSD: Number(newCostExchangeUSD) || finalCostUSD,
      priceUSD: finalPriceUSD,
      priceVES: finalPriceVES,
      priceWholesaleUSD: finalWholesaleUSD,
      priceWholesaleVES: finalWholesaleVES,
      priceCuadrillasUSD: finalCuadrillasUSD,
      priceCuadrillasVES: finalCuadrillasVES,
      priceCuadrillasDetalUSD: Number(newPriceCuadrillasDetal) || 0,
      priceMayorDetalUSD: Number(newPriceMayorDetal) || 0,
      binLocation: newBinLocation,
      stock: Number(newStock),
      minStock: Number(newMinStock),
      description: newDescription,
      imageUrl: finalImageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updated = [newProduct, ...products];
    setProducts(updated);
    try {
      localStorage.setItem('siga_products', JSON.stringify(updated));
    } catch (e) {}
    syncSingleDoc('products', newProduct.id, newProduct).catch(e => console.error("Firestore product add sync error:", e));
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        products: updated,
        sourceUser: currentUser,
        activity: {
          username: currentUser.username,
          action: 'Nuevo Producto',
          details: `Registrado producto ${newProduct.name} (${newProduct.sku})`
        }
      })
    }).catch(console.warn);

    // Clear form
    setNewBarcode('');
    setNewName('');
    setNewSku('');
    setNewCost(0);
    setNewCostExchangeUSD(0);
    setNewPrice(0);
    setNewPriceVES(0);
    setNewPriceWholesale(0);
    setNewPriceWholesaleVES(0);
    setNewPriceCuadrillas(0);
    setNewPriceCuadrillasDetal(0);
    setNewPriceMayorDetal(0);
    setNewBinLocation('');
    setNewStock(0);
    setNewMinStock(5);
    setNewDescription('');
    setNewImageUrl(DEFAULT_PRODUCT_IMAGE);
    setIsAddingProduct(false);
  };

  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id));
    }
  };

  const handleConfirmDeleteSingle = (p: Product) => {
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar productos.");
      return;
    }
    setProductToDelete(p);
  };

  const executeDeleteSingle = () => {
    if (!productToDelete) return;
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar productos.");
      return;
    }
    const targetId = productToDelete.id;
    deleteSingleDoc('products', targetId).catch(e => console.error(e));
    fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        id: targetId,
        user: currentUser
      })
    }).catch(console.warn);

    const updated = products.filter(p => p.id !== targetId);
    setProducts(updated);
    try {
      localStorage.setItem('siga_products', JSON.stringify(updated));
    } catch (e) {}
    setSelectedProductIds(prev => prev.filter(id => id !== targetId));
    setProductToDelete(null);
  };

  const executeBulkDelete = () => {
    if (selectedProductIds.length === 0) return;
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar productos.");
      return;
    }
    const idsToDelete = [...selectedProductIds];
    batchDeleteProducts(idsToDelete).catch(e => console.error(e));
    fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        ids: idsToDelete,
        user: currentUser
      })
    }).catch(console.warn);

    const updated = products.filter(p => !idsToDelete.includes(p.id));
    setProducts(updated);
    try {
      localStorage.setItem('siga_products', JSON.stringify(updated));
    } catch (e) {}
    setSelectedProductIds([]);
    setShowBulkDeleteModal(false);
  };

  const executeWipeCatalogue = () => {
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para vaciar el catálogo.");
      return;
    }
    const allOldIds = products.map(p => p.id);
    if (allOldIds.length > 0) {
      batchDeleteProducts(allOldIds).catch(e => console.error(e));
      fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: 'products',
          ids: allOldIds,
          user: currentUser
        })
      }).catch(console.warn);
    }
    setProducts([]);
    try {
      localStorage.setItem('siga_products', JSON.stringify([]));
    } catch (e) {}
    setSelectedProductIds([]);
    setShowWipeModal(false);
  };

  const handleProcessReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnClientRif || !returnProductId || returnQty <= 0) {
      alert("⚠️ Por favor, seleccione un cliente, un producto y una cantidad válida.");
      return;
    }

    const consignmentItem = consignmentItems.find(
      c => c.clientRif === returnClientRif && c.productId === returnProductId
    );

    if (!consignmentItem) {
      alert("⚠️ No se encontró la consignación para el cliente y producto seleccionados.");
      return;
    }

    if (returnQty > consignmentItem.qty) {
      alert(`⚠️ La cantidad a devolver (${returnQty}) supera la cantidad en custodia (${consignmentItem.qty}).`);
      return;
    }

    if (setConsignmentItems) {
      // 1. Deduct from consignment stock
      const updatedConsignments = consignmentItems.map(c => {
        if (c.clientRif === returnClientRif && c.productId === returnProductId) {
          return { ...c, qty: c.qty - returnQty, updatedAt: new Date().toISOString() };
        }
        return c;
      }).filter(c => c.qty > 0);
      setConsignmentItems(updatedConsignments);

      // 2. Add back to global physical stock of warehouse
      const updatedProducts = products.map(p => {
        if (p.id === returnProductId) {
          return { ...p, stock: p.stock + returnQty, updatedAt: new Date().toISOString() };
        }
        return p;
      });
      setProducts(updatedProducts);
      localStorage.setItem('siga_products', JSON.stringify(updatedProducts));

      alert(`✅ Éxito: Se reintegraron ${returnQty} unidades de "${consignmentItem.productName}" al Almacén General.`);
      
      // Reset state and close modal
      setReturnClientRif('');
      setReturnProductId('');
      setReturnQty(1);
      setIsReturnModalOpen(false);
    }
  };

  const handleScanBarcodeForNew = () => {
    onOpenScanner((barcode) => {
      setNewBarcode(barcode);
      // Auto fill temporary SKU
      if (barcode.length > 4) {
        setNewSku("SKU-" + barcode.slice(-4).toUpperCase());
      }
    });
  };

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    } else {
      return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
    }
  };

  // Count low stock of entire inventory
  const totalLowStockCount = products.filter(p => p.stock <= p.minStock).length;

  return (
    <div className="space-y-6 p-1">
      {/* Overview stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Artículos Registrados</span>
            <span className="text-2xl font-bold text-slate-100">{products.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-400 border border-slate-800">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Alertas de Bajo Stock</span>
            <span className="text-2xl font-bold text-amber-500">{totalLowStockCount}</span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            totalLowStockCount > 0 ? 'bg-amber-500/10 border-amber-500/25 text-amber-500 animate-pulse' : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Valoración del Inventario</span>
            <span className="text-xl font-bold text-indigo-400">
              {formatCurrency(products.reduce((acc, p) => acc + (p.priceUSD * p.stock), 0), 'USD')}
            </span>
            <span className="text-[10px] text-slate-500 block font-mono">
              Ref. {formatCurrency(products.reduce((acc, p) => acc + (p.priceUSD * p.stock * exchangeRate.rate), 0), 'VES')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-400 border border-slate-800">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Low stock general global notification banner */}
      {totalLowStockCount > 0 && (
        <div className="bg-amber-500/10 p-4 border border-amber-500/15 rounded-xl flex items-start sm:items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-slate-950 rounded">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-400 uppercase font-sans">Alerta Crítica Interna</h4>
              <p className="text-[11px] text-slate-350 mt-0.5 leading-normal">
                Existen {totalLowStockCount} productos con unidades por debajo del stock mínimo de seguridad. Reponga stock mediante el Módulo de Compras.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowLowStockOnly(true);
              setSelectedCategory('todos');
            }}
            className="px-3.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 font-bold text-xs rounded transition shrink-0 uppercase tracking-wider font-mono shadow-sm"
          >
            Ver Alertas
          </button>
        </div>
      )}

      {/* Sub-tab selection bar */}
      <div className="flex border-b border-slate-800 gap-4 mb-6">
        <button
          type="button"
          onClick={() => setActiveSubTab('general')}
          className={`pb-3 text-xs uppercase tracking-widest font-mono font-bold transition-all border-b-2 px-1 ${
            activeSubTab === 'general'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          📦 Almacén Físico (Inventario General)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('consignacion')}
          className={`pb-3 text-xs uppercase tracking-widest font-mono font-bold transition-all border-b-2 px-1 flex items-center gap-1.5 ${
            activeSubTab === 'consignacion'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Truck className="w-4 h-4" /> Inventario en Consignación (Por Clientes)
        </button>
      </div>

      {activeSubTab === 'general' ? (
        <>
          {/* Control panel and filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Filters and search block */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-2xl">
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por código de barras, ID del producto o nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-550"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 capitalize"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'todos' ? '📁 Todas las Categorías' : cat}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                className={`px-3 py-2 text-xs rounded-xl border font-semibold select-none transition ${
                  showLowStockOnly 
                    ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚠️ Ver Alertas Stock
              </button>
            </div>

            {/* Trigger addition, import/export and wipe forms */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* NUEVO: Subir Precios Masivos (CSV / JSON) sin tocar fotos */}
              {canModify && (
                <button
                  type="button"
                  onClick={() => setIsPriceUpdateModalOpen(true)}
                  className="px-4 py-2 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-950/40 select-none uppercase tracking-wider cursor-pointer"
                  title="Subir archivo CSV o JSON para actualizar precios masivos sin borrar ninguna foto"
                >
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Subir Precios (CSV/JSON)</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded font-mono hidden sm:inline">
                    Protege Fotos
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowImportExport(!showImportExport);
                  setIsAddingProduct(false);
                }}
                className={`px-4 py-2 border rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow select-none uppercase tracking-wider ${
                  showImportExport
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-400" /> Importar / Exportar
              </button>

              {canModify && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingProduct(!isAddingProduct);
                    setShowImportExport(false);
                  }}
                  className={`px-4 py-2 text-white text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow select-none uppercase tracking-wider ${
                    isAddingProduct
                      ? 'bg-rose-900 border border-rose-800 hover:bg-rose-800'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  <Plus className="w-4 h-4 text-white stroke-[3]" /> Registrar Nuevo Producto
                </button>
              )}

              {currentUser.role === 'Administrador' && products.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowWipeModal(true)}
                  className="px-3 py-2 bg-slate-950 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-700/50 text-slate-400 hover:text-rose-400 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow select-none uppercase tracking-wider"
                  title="Vaciar todo el catálogo de productos para importar desde 0"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" /> Vaciar Catálogo
                </button>
              )}
            </div>
          </div>

          {/* Import / Export dashboard panel */}
          {showImportExport && (
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-5 shadow-xl animate-slide-in">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-850 pb-3 gap-2">
                <div>
                  <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Importación & Exportación de Productos (Inventario BST y otros)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">Soporta archivos Excel CSV delimitados por comas o archivos JSON estructurados.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImportExport(false)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {importStep === 'upload' ? (
                <div className="space-y-4">
                  {/* Banner directo para actualizar solo precios sin borrar fotos */}
                  <div className="bg-gradient-to-r from-emerald-950/50 to-slate-950 p-4 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300 font-mono">
                          ¿Solo necesitas actualizar los precios de tus productos?
                        </span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-200 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Conserva Fotos 100% Intactas
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Sube tu archivo CSV o JSON con nuevos precios. El sistema actualiza los precios en $ y Bs sin tocar ni borrar tus fotos guardadas ni cantidades.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportExport(false);
                        setIsPriceUpdateModalOpen(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-950 transition active:scale-95 whitespace-nowrap cursor-pointer shrink-0"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Subir Solo Precios
                    </button>
                  </div>

                  {/* Quick-Load Banner for User's Prepared Catalogue */}
                  <div className="bg-gradient-to-r from-indigo-950/60 to-slate-950 p-4 border border-indigo-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span className="text-xs font-bold text-slate-100 font-mono">
                          Catálogo de Ferretería y Herramientas (155 Productos Listos)
                        </span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Precios y Costos Verificados
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Carga directa con todos tus códigos (FBO, PHDP, etc.), costos en $, costos en Bs, precios detal, mayor, cuadrillas y BIN sin alterar ninguna cuenta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLoadSampleCatalogue}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-950 transition active:scale-95 whitespace-nowrap cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Cargar Mis 155 Herramientas
                    </button>
                  </div>

                  {/* Clarification on SKU and Spanish number formatting */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-sans">
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-bold font-mono text-[10.5px]">
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        ¿POR QUÉ PEDÍA UN SKU?
                      </div>
                      <p className="text-slate-400 leading-relaxed text-[10.5px]">
                        En comercio general "SKU" es el identificador único. En tu inventario de herramientas, <strong className="text-slate-200">tu propio código de producto (ej: FBO-TE5117A, PHDP303) funciona directamente como SKU</strong>. Ya no se te pide ningún código adicional.
                      </p>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono text-[10.5px]">
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        CUENTAS Y PRECIOS EXACTOS
                      </div>
                      <p className="text-slate-400 leading-relaxed text-[10.5px]">
                        El sistema ahora interpreta de manera nativa los formatos en español con coma decimal (ej. <code className="text-amber-400 bg-slate-900 px-1 py-0.5 rounded">1.675,66</code>) y <strong className="text-slate-200">respeta exactamente tus costos y precios sin recalcular fórmulas arbitrarias</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                    {/* Left Side: Import File/Paste */}
                    <div className="space-y-3.5">
                      <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold block">📥 Cargar Archivo Propio</span>
                      
                      {/* Drag and Drop Box */}
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                          dragActive
                            ? 'border-indigo-500 bg-indigo-950/10'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                        }`}
                        onClick={() => document.getElementById('inventory-file-picker')?.click()}
                      >
                        <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                        <p className="text-xs text-slate-350 font-medium">Arrastra tu archivo CSV o JSON aquí</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">o haz clic para explorar en tu equipo</p>
                        <input
                          id="inventory-file-picker"
                          type="file"
                          accept=".csv,.json"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-px bg-slate-850 flex-1"></div>
                        <span className="text-[10px] text-slate-600 font-mono uppercase">o pega texto CSV directamente</span>
                        <div className="h-px bg-slate-850 flex-1"></div>
                      </div>

                      {/* Copy/Paste Area */}
                      <div className="space-y-2">
                        <textarea
                          rows={4}
                          placeholder="Pega aquí las filas de Excel o CSV de tus herramientas..."
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-[11px] text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-550"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={!importText.trim()}
                            onClick={() => {
                              if (importText.trim().startsWith('[')) {
                                handleJSONImport(importText);
                              } else {
                                handleCSVImport(importText);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition select-none tracking-wider ${
                              importText.trim()
                                ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 cursor-pointer'
                                : 'bg-slate-950/20 border border-slate-850/50 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Procesar Texto Pegado
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Instructions and Export */}
                    <div className="space-y-4 bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
                      <div className="space-y-1.5 text-xs text-slate-300">
                        <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono font-bold block">💡 Columnas Soportadas de tu Catálogo</span>
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          Tu archivo puede incluir cualquiera de estos encabezados en cualquier orden:
                        </p>
                        <ul className="list-disc list-inside text-[10.5px] text-slate-400 pl-1 space-y-1 font-mono">
                          <li><strong className="text-slate-200">CÓDIGO:</strong> Identificador y código de producto</li>
                          <li><strong className="text-slate-200">DESCRIPCIÓN:</strong> Nombre completo del artículo</li>
                          <li><strong className="text-slate-200">TIPO:</strong> Categoría (ej. Herramientas Eléctricas)</li>
                          <li><strong className="text-slate-200">COSTO USD ($):</strong> Costo en dólares</li>
                          <li><strong className="text-slate-200">COSTO AL CAMBIO ($):</strong> Costo referencial en dólares</li>
                          <li><strong className="text-slate-200">PRECIO DETAL / MAYOR / CUADRILLAS:</strong> Tarifas directas</li>
                          <li><strong className="text-slate-200">STOCK / CANTIDAD:</strong> Existencias físicas</li>
                          <li><strong className="text-slate-200">BIN:</strong> Ubicación física en estante</li>
                        </ul>
                      </div>

                      <div className="pt-3 border-t border-slate-900 flex flex-col gap-2.5">
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold block">📤 Exportar Datos del Sistema</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleExportCSV}
                            className="py-2 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-400" /> Descargar CSV (Excel)
                          </button>
                          <button
                            type="button"
                            onClick={handleExportJSON}
                            className="py-2 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-indigo-400" /> Descargar JSON (Backup)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* STEP PREVIEW */
                <div className="space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-850 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] font-mono font-bold text-emerald-400 block flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-400" /> ¡Lectura Finalizada! ({parsedProducts.length} productos analizados)
                      </span>
                      <p className="text-[10px] text-slate-400 leading-normal font-sans">
                        Revisa la lista a continuación antes de realizar la inserción a la base de datos de SigaInvent.
                      </p>
                    </div>

                    {/* Duplicate strategy selector */}
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-slate-400 font-bold whitespace-nowrap">Modo de Importación:</span>
                      <select
                        value={duplicateStrategy}
                        onChange={(e) => setDuplicateStrategy(e.target.value as 'overwrite' | 'skip' | 'replace_all')}
                        className="bg-slate-900 border border-slate-800 p-1.5 rounded-lg text-[10px] text-white focus:outline-none focus:border-indigo-500 font-semibold"
                      >
                        <option value="overwrite">Actualizar / Sobrescribir Existentes</option>
                        <option value="skip">Omitir Duplicados Existentes</option>
                        <option value="replace_all">⚠️ Vaciar Catálogo Actual y Reemplazar Todo</option>
                      </select>
                    </div>
                  </div>

                  {/* Preview list */}
                  <div className="max-h-72 overflow-y-auto border border-slate-850 rounded-lg bg-slate-950/40">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-900 z-10">
                        <tr>
                          <th className="p-2 border-r border-slate-900 whitespace-nowrap">Código</th>
                          <th className="p-2 border-r border-slate-900 min-w-[200px]">Producto</th>
                          <th className="p-2 border-r border-slate-900 whitespace-nowrap">Categoría</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap">Stock</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap">Costo $</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap">Costo Bs ($)</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap text-indigo-400">Detal $</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap">Mayor $</th>
                          <th className="p-2 border-r border-slate-900 text-right whitespace-nowrap text-teal-400">Cuadrillas $</th>
                          <th className="p-2 text-center whitespace-nowrap">BIN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-950/80 text-slate-300">
                        {parsedProducts.slice(0, 100).map((p, idx) => {
                          const isDuplicate = products.some(x => x.id === p.id);
                          return (
                            <tr key={idx} className={`hover:bg-slate-900/40 ${isDuplicate ? 'bg-amber-500/5' : ''}`}>
                              <td className="p-2 border-r border-slate-950/60 font-bold whitespace-nowrap">
                                <span className="text-indigo-300">{p.id}</span>
                                {isDuplicate && <span className="text-[8px] bg-amber-500/10 border border-amber-500/25 text-amber-500 px-1 rounded ml-1 font-sans">Existente</span>}
                              </td>
                              <td className="p-2 border-r border-slate-950/60 font-sans text-slate-200">
                                {p.name}
                              </td>
                              <td className="p-2 border-r border-slate-950/60 text-slate-400 whitespace-nowrap">{p.category}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-emerald-400 font-bold">{p.stock}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-slate-400">${p.costUSD.toFixed(2)}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-slate-400">{p.costVES ? `$${p.costVES.toFixed(2)}` : '-'}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-indigo-300 font-bold">${p.priceUSD.toFixed(2)}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-slate-300">${(p.priceWholesaleUSD || 0).toFixed(2)}</td>
                              <td className="p-2 border-r border-slate-950/60 text-right text-teal-300">${(p.priceCuadrillasUSD || 0).toFixed(2)}</td>
                              <td className="p-2 text-center text-[10px] text-slate-400">{p.binLocation || '-'}</td>
                            </tr>
                          );
                        })}
                        {parsedProducts.length > 100 && (
                          <tr className="bg-slate-950/40 text-slate-500 text-center font-bold">
                            <td colSpan={10} className="p-2">Y {parsedProducts.length - 100} productos más...</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Logs of warnings */}
                  {importLogs.length > 0 && (
                    <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-400 font-mono space-y-0.5">
                      <span className="font-bold uppercase tracking-wider block">ℹ️ Notas de análisis:</span>
                      {importLogs.slice(0, 5).map((log, i) => <p key={i}>- {log}</p>)}
                      {importLogs.length > 5 && <p className="text-slate-500">Y {importLogs.length - 5} notas adicionales...</p>}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-850">
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => {
                        setParsedProducts([]);
                        setImportStep('upload');
                      }}
                      className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold rounded-lg transition uppercase select-none tracking-wider disabled:opacity-50"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={handleConfirmImport}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white text-xs font-bold rounded-lg transition flex items-center gap-2 uppercase select-none tracking-wider shadow-lg shadow-indigo-950 cursor-pointer"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          Guardando y Sincronizando en la Nube...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          Confirmar e Importar {parsedProducts.length} Productos
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Product Form Collapse */}
          {isAddingProduct && (
            <form onSubmit={handleAddProduct} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4 shadow-xl animate-slide-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider font-mono text-indigo-400">📦 Registrar un Nuevo Producto en el Catálogo</h3>
                <span className="text-[10px] text-slate-500 font-mono">Solo Administrador u Almacenista</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Barcode scanner action inside product addition */}
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Código de barras</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      required
                      placeholder="Ej. 7591001002221"
                      value={newBarcode}
                      onChange={(e) => setNewBarcode(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                    />
                    <button
                      type="button"
                      onClick={handleScanBarcodeForNew}
                      className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-850 hover:border-indigo-500 text-indigo-400 rounded-lg transition"
                      title="Capturar con cámara móvil"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Taladro Percutor"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Categoría / Marca</label>
                  <input
                    type="text"
                    required
                    list="new-categories-list"
                    placeholder="Ej. PRESCOTT, FBO, TOHO..."
                    value={newCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setNewCategory(cat);
                      const autoCuad = calculateCuadrillasAuto(cat, newPriceVES, newPrice);
                      setNewPriceCuadrillas(autoCuad);
                      setNewPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                  <datalist id="new-categories-list">
                    {categories.filter(c => c !== 'todos').map(c => (
                      <option key={c} value={c} />
                    ))}
                    <option value="PRESCOTT" />
                    <option value="FBO" />
                    <option value="TOHO" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">ID del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. PT-010"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Costo USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newCost}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewCost(val);
                      setNewCostExchangeUSD(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Costo al cambio USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newCostExchangeUSD}
                    onChange={(e) => setNewCostExchangeUSD(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Detal USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPrice}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewPrice(val);
                      const baseVES = newPriceVES > 0 ? newPriceVES : val;
                      const autoCuad = calculateCuadrillasAuto(newCategory, baseVES, val);
                      setNewPriceCuadrillas(autoCuad);
                      setNewPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Detal Bs ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPriceVES}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewPriceVES(val);
                      const autoCuad = calculateCuadrillasAuto(newCategory, val, newPrice);
                      setNewPriceCuadrillas(autoCuad);
                      setNewPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Mayor USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPriceWholesale}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewPriceWholesale(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Mayor Bs ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPriceWholesaleVES}
                    onChange={(e) => setNewPriceWholesaleVES(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold font-mono">Precio Cuadrillas ($)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoCuad = calculateCuadrillasAuto(newCategory, newPriceVES, newPrice);
                        setNewPriceCuadrillas(autoCuad);
                        setNewPriceCuadrillasVES(autoCuad);
                      }}
                      className="text-[9px] text-teal-400 hover:text-teal-300 transition flex items-center gap-1 font-mono cursor-pointer"
                      title="Auto-calcular precio de cuadrillas según la categoría (+10% Prescott, +2% FBO, +20% Toho)"
                    >
                      ⚡ Auto (+{Math.round((getCuadrillaRatio(newCategory) - 1) * 100)}%)
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPriceCuadrillas}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewPriceCuadrillas(val);
                      setNewPriceCuadrillasVES(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Ubicación BIN</label>
                  <input
                    type="text"
                    placeholder="Ej: Estante A-12, Pasillo B"
                    value={newBinLocation}
                    onChange={(e) => setNewBinLocation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Stock Inicial</label>
                  <input
                    type="number"
                    required
                    value={newStock}
                    onChange={(e) => setNewStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Mínimo para Alerta</label>
                  <input
                    type="number"
                    required
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Descripción del Artículo</label>
                  <input
                    type="text"
                    placeholder="Detalla empaque, fabricante, uso, etc."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                {/* Fotografía para Nuevo Producto */}
                <div className="md:col-span-4 p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center gap-4">
                  <div 
                    onClick={() => {
                      if (newImageUrl) {
                        openZoomViewer(newImageUrl, newName || 'Nuevo Producto', newBarcode || newSku);
                      }
                    }}
                    className="relative group w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-750 hover:border-indigo-400 bg-slate-900 flex-shrink-0 flex items-center justify-center shadow-md cursor-pointer"
                    title="Clic para ver foto en grande y hacer zoom"
                  >
                    <img
                      src={newImageUrl || DEFAULT_PRODUCT_IMAGE}
                      alt="Vista previa"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 transition-opacity text-indigo-300">
                      <Eye className="w-4 h-4" />
                      <span className="text-[8px] font-mono font-bold">Ver Zoom</span>
                    </div>
                    {isCompressingNewImage && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1 text-[9px] text-indigo-300">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Optimizando...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-indigo-400" />
                        Fotografía del Producto
                      </span>
                      <div className="flex items-center gap-2">
                        {newImageUrl && newImageUrl !== DEFAULT_PRODUCT_IMAGE && (
                          <>
                            <button
                              type="button"
                              onClick={() => openZoomViewer(newImageUrl, newName || 'Nuevo Producto', newBarcode || newSku)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 underline transition flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> Ver Zoom
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewImageUrl(DEFAULT_PRODUCT_IMAGE)}
                              className="text-[10px] text-slate-400 hover:text-rose-400 underline transition"
                            >
                              Restablecer imagen
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer px-3 py-1 bg-indigo-650/30 hover:bg-indigo-650/45 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
                        <Upload className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Subir foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageFileChange(e, setNewImageUrl, setIsCompressingNewImage, newBarcode || newSku)}
                        />
                      </label>

                      <label className="cursor-pointer px-3 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-750 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
                        <Camera className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Tomar con cámara</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleImageFileChange(e, setNewImageUrl, setIsCompressingNewImage, newBarcode || newSku)}
                        />
                      </label>
                    </div>

                    <div className="relative">
                      <LinkIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="url"
                        placeholder="O pegar URL directa de imagen (https://...)"
                        value={newImageUrl.startsWith('data:') ? '' : newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        className="w-full pl-8 pr-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddingProduct(false)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 rounded-lg text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Confirmar e Ingresar
                </button>
              </div>
            </form>
          )}

          {/* Bulk Selection Action Bar */}
          {selectedProductIds.length > 0 && (
            <div className="p-3 bg-indigo-950/60 border border-indigo-500/40 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
                <span className="text-xs font-bold text-indigo-200 font-mono">
                  {selectedProductIds.length} {selectedProductIds.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProductIds([])}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  Deseleccionar
                </button>
                {currentUser.role === 'Administrador' && (
                  <button
                    type="button"
                    onClick={() => setShowBulkDeleteModal(true)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar Seleccionados ({selectedProductIds.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Catalogue table/responsive list */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="hidden md:grid grid-cols-12 gap-3 bg-slate-950/60 p-3.5 border-b border-slate-800 text-[10px] uppercase font-mono font-bold text-slate-400 items-center">
              <div className="col-span-3 flex items-center gap-2.5">
                {canModify && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-slate-400 hover:text-indigo-400 transition"
                    title={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
                  >
                    {selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                )}
                <span>Código / Producto</span>
              </div>
              <div className="col-span-2 text-center">Categoría</div>
              <div className="col-span-1 text-center">ID Producto</div>
              <div className="col-span-1 text-right">Costo ($)</div>
              <div className="col-span-2 text-right">Precios ($)</div>
              <div className="col-span-1 text-center font-bold">Existencias</div>
              <div className="col-span-2 text-right">Acciones</div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-slate-500 flex flex-col items-center justify-center">
                <Package className="w-12 h-12 mb-2 text-slate-705 stroke-[1]" />
                <p className="text-sm">No se encontraron productos en el catálogo.</p>
                <p className="text-[10px] text-slate-600 mt-1">
                  {products.length === 0 
                    ? "El catálogo está vacío. Puede importar sus productos vía CSV/Excel o registrar nuevos ítems."
                    : "Intente remover filtros o realizar una búsqueda diferente."}
                </p>
                {products.length === 0 && canModify && (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImportExport(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                    >
                      <Upload className="w-4 h-4" /> Importar Archivo CSV / Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingProduct(true)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Registrar Manualmente
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {filteredProducts.map(p => {
                  const isLow = p.stock <= p.minStock;
                  const isSelected = selectedProductIds.includes(p.id);
                  return (
                    <div 
                      key={p.id} 
                      className={`grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-3 p-3.5 items-center hover:bg-slate-950/25 transition ${
                        isSelected ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : isLow ? 'bg-amber-500/[0.02]' : ''
                      }`}
                    >
                      <div className="col-span-1 md:col-span-3 flex items-start gap-2.5">
                        {canModify && (
                          <button
                            type="button"
                            onClick={() => handleToggleSelectProduct(p.id)}
                            className="mt-2.5 text-slate-400 hover:text-indigo-400 transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        )}
                        <div 
                          onClick={() => {
                            openZoomViewer(p.imageUrl || DEFAULT_PRODUCT_IMAGE, p.name, p.id, p.category, p.priceUSD, p);
                          }}
                          className="relative group w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-950 border border-slate-800 self-center cursor-pointer hover:border-indigo-400"
                          title="Clic para ver foto en tamaño grande y hacer zoom"
                        >
                          <img 
                            src={p.imageUrl || DEFAULT_PRODUCT_IMAGE} 
                            alt={p.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                            }}
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-4 h-4 text-indigo-300" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-slate-100 text-xs truncate capitalize" title={p.name}>{p.name}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 font-mono">
                            <span className="text-[10px] text-slate-500 font-semibold">{p.id}</span>
                            {isLow && (
                              <span className="text-[9px] bg-red-500/15 text-rose-450 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider scale-95 border border-red-500/10">Bajo Stock</span>
                            )}
                            {p.binLocation && (
                              <span className="text-[9.5px] bg-indigo-550/15 text-indigo-400 font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border border-indigo-500/10" title="Ubicación BIN">
                                📍 BIN: {p.binLocation}
                              </span>
                            )}
                          </div>
                          {p.description && (
                            <p className="text-[10px] text-slate-400 mt-1 italic font-light line-clamp-1" title={p.description}>
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="col-span-2 text-left md:text-center">
                        <span className="md:hidden text-[9px] text-slate-500 font-mono font-bold uppercase mr-1">Categoría:</span>
                        <span className="text-xs bg-slate-950 text-slate-400 px-2.5 py-0.5 rounded-full border border-slate-800 capitalize">{p.category}</span>
                      </div>

                      <div className="col-span-1 text-left md:text-center font-mono">
                        <span className="md:hidden text-[9px] text-slate-500 font-mono font-bold uppercase mr-1">ID Producto:</span>
                        <span className="text-xs text-slate-400">{p.sku}</span>
                      </div>

                      <div className="col-span-1 text-left md:text-right font-mono flex flex-col gap-0.5 justify-center">
                        <span className="md:hidden text-[9px] text-slate-500 font-mono font-bold uppercase mr-1">Costo:</span>
                        <div className="text-xs text-slate-300 font-semibold" title="Costo USD ($)">${(p.costUSD || 0).toFixed(2)}</div>
                        <div className="text-[10px] text-slate-400 font-medium" title="Costo al cambio USD ($)">
                          <span className="text-[8.5px] text-slate-500 uppercase mr-1">Al cambio:</span>
                          <span>${(p.costExchangeUSD || p.costVES || p.costUSD || 0).toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Complete CIMA prices columns - Coincide exactamente con la Ficha de Producto */}
                      <div className="col-span-2 text-left md:text-right font-mono text-[10px] space-y-1.5 py-1">
                        <span className="md:hidden text-[9px] text-zinc-500 font-mono font-bold uppercase mr-1 font-semibold">Precios:</span>
                        <div className="flex flex-col gap-1 md:items-end">
                          <div className="flex flex-col items-end w-full border-b border-slate-800/40 pb-1">
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
                              <span className="text-[9px] text-indigo-400 font-bold uppercase mr-1">Precio Detal USD ($):</span>
                              <span className="text-xs text-indigo-400 font-bold">${(p.priceUSD || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
                              <span className="text-[8.5px] text-indigo-300 uppercase mr-1 font-semibold">Precio Detal Bs ($):</span>
                              <span 
                                className="text-[11px] text-indigo-200 font-bold"
                                title={`Referencia al cambio del día (${exchangeRate.rate} Bs/$): Bs. ${(((p.priceVES || p.priceUSD || 0) * exchangeRate.rate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              >
                                ${(p.priceVES || p.priceUSD || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end w-full border-b border-slate-800/40 pb-1">
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
                              <span className="text-[9px] text-slate-400 uppercase mr-1 font-bold">Precio Mayor USD ($):</span>
                              <span className="text-[11px] text-slate-300 font-semibold">${(p.priceWholesaleUSD || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
                              <span className="text-[8.5px] text-slate-300 uppercase mr-1 font-bold">Precio Mayor Bs ($):</span>
                              <span 
                                className="text-[11px] text-slate-200 font-bold"
                                title={`Referencia al cambio del día (${exchangeRate.rate} Bs/$): Bs. ${(((p.priceWholesaleVES || p.priceWholesaleUSD || 0) * exchangeRate.rate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              >
                                ${(p.priceWholesaleVES || p.priceWholesaleUSD || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end w-full">
                            <div className="flex items-center justify-between md:justify-end gap-2 w-full">
                              <span className="text-[9px] text-teal-400 uppercase mr-1 font-bold">Precio Cuadrillas ($):</span>
                              <span 
                                className="text-[11px] text-teal-300 font-bold"
                                title={`Referencia al cambio del día (${exchangeRate.rate} Bs/$): Bs. ${(((p.priceCuadrillasUSD > 0 ? p.priceCuadrillasUSD : calculateCuadrillasAuto(p.category, p.priceVES || p.priceUSD || 0, p.priceUSD || 0)) * exchangeRate.rate)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              >
                                ${(p.priceCuadrillasUSD > 0 ? p.priceCuadrillasUSD : calculateCuadrillasAuto(p.category, p.priceVES || p.priceUSD || 0, p.priceUSD || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-1 text-left md:text-center mt-1 md:mt-0">
                        <span className="md:hidden text-[9px] text-slate-500 font-mono font-bold uppercase mr-1">Existencia:</span>
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                          isLow ? 'text-rose-400 bg-rose-500/10 border border-rose-500/15' : 'text-slate-200 bg-slate-950 border border-slate-850'
                        }`}>
                          {p.stock} unids
                        </span>
                      </div>

                      <div className="col-span-2 flex items-center justify-end gap-2 mt-2.5 md:mt-0">
                        {canModify && (
                          <button
                            type="button"
                            title="Cambiar Foto"
                            onClick={() => openPhotoModal(p)}
                            className="p-1 px-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded text-slate-400 hover:text-indigo-300 text-xs flex items-center gap-1 transition-all"
                          >
                            <Camera className="w-3 h-3 text-indigo-400" />
                            <span className="md:hidden lg:inline text-[10px]">Foto</span>
                          </button>
                        )}

                        <button
                          type="button"
                          title="Editar Producto"
                          onClick={() => {
                            if (!canModify) {
                              alert("⛔ Acción Denegada: Su rol de Vendedor solo tiene privilegios de lectura.");
                              return;
                            }
                            openEditModal(p);
                          }}
                          className="p-1 px-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-slate-400 hover:text-slate-100 text-xs flex items-center gap-1 transition-all"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span className="md:hidden lg:inline text-[10px]">Editar</span>
                        </button>

                        {currentUser.role === 'Administrador' && (
                          <button
                            type="button"
                            onClick={() => handleConfirmDeleteSingle(p)}
                            className="p-1.5 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded text-slate-500 hover:text-rose-400 transition cursor-pointer"
                            title="Eliminar del Catálogo (Solo Administrador)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* CONSIGNMENT INVENTORY REPORT VIEW (Point 1) */
        <div className="space-y-6 animate-slide-in">
          {/* Action and explanation banner for returning to warehouse */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-400" />
                Retornos y Devoluciones de Mercancía
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Si un cliente con mercadería en consignación decide no realizar la venta, o desea regresar los productos en custodia, puede reintegrar las unidades de forma segura de regreso al Almacén General desde aquí.
              </p>
            </div>
            {canModify && (
              <button
                type="button"
                onClick={() => {
                  setIsReturnModalOpen(true);
                  // pre-fill with first client and product if available
                  const firstWithQty = consignmentItems.find(c => c.qty > 0);
                  if (firstWithQty) {
                    setReturnClientRif(firstWithQty.clientRif);
                    setReturnProductId(firstWithQty.productId);
                    setReturnQty(1);
                  }
                }}
                className="w-full md:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow"
              >
                <Plus className="w-4 h-4" /> Registrar Devolución al Almacén
              </button>
            )}
          </div>

          {/* Summary / KPI Section for consignments */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Clientes con Consignaciones</span>
                <span className="text-2xl font-bold text-indigo-400">
                  {Object.keys(
                    consignmentItems.reduce<Record<string, boolean>>((acc, item) => {
                      if (item.qty > 0) acc[item.clientRif] = true;
                      return acc;
                    }, {})
                  ).length}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-400 border border-slate-800">
                <Truck className="w-5 h-5 text-indigo-400" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Items Totales Consignados</span>
                <span className="text-2xl font-bold text-slate-100">
                  {consignmentItems.reduce((acc, item) => acc + item.qty, 0)} <span className="text-xs text-slate-500">unids</span>
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-400 border border-slate-800">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">Valor de Consignación Calle</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {formatCurrency(
                    consignmentItems.reduce((acc, item) => {
                      const prod = products.find(p => p.id === item.productId);
                      const price = prod ? prod.priceUSD : 0;
                      return acc + (price * item.qty);
                    }, 0),
                    'USD'
                  )}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-emerald-400/20 border border-emerald-500/25">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Grouped report */}
          {consignmentItems.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500 flex flex-col items-center justify-center">
              <Truck className="w-12 h-12 mb-2 text-slate-700 stroke-[1]" />
              <p className="text-sm">No existen mercancías activas en consignación para ningún cliente.</p>
              <p className="text-[10px] text-slate-600 mt-1">Cuando registre compras de tipo "Consignación" en ventas, aparecerán en este reporte.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.values(
                consignmentItems.reduce<Record<string, { clientRif: string; clientName: string; items: ConsignmentItem[] }>>((acc, item) => {
                  if (item.qty <= 0) return acc;
                  if (!acc[item.clientRif]) {
                    acc[item.clientRif] = {
                      clientRif: item.clientRif,
                      clientName: item.clientName,
                      items: []
                    };
                  }
                  acc[item.clientRif].items.push(item);
                  return acc;
                }, {})
              ).map(clientGroup => {
                const clientMeta = clients.find(c => c.rif === clientGroup.clientRif);
                
                return (
                  <div key={clientGroup.clientRif} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    {/* Customer Header Info */}
                    <div className="bg-slate-955 p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[9px] font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/15 uppercase tracking-wider">Cliente de Consignación</span>
                        <h3 className="text-sm font-bold text-slate-100 mt-1.5">{clientGroup.clientName}</h3>
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-450 mt-1 font-mono">
                          <span>RIF: <strong>{clientGroup.clientRif}</strong></span>
                          {clientMeta?.phone && <span>TLF: {clientMeta.phone}</span>}
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-right font-mono self-start sm:self-center">
                        <span className="text-[9px] text-slate-550 block uppercase">Subtotal Cliente</span>
                        <span className="text-xs font-extrabold text-indigo-400">
                          {formatCurrency(
                            clientGroup.items.reduce((acc, item) => {
                              const prod = products.find(p => p.id === item.productId);
                              const price = prod ? prod.priceUSD : 0;
                              return acc + (price * item.qty);
                            }, 0),
                            'USD'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Group Items table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950/20 text-[10px] uppercase font-mono font-bold text-slate-500 border-b border-slate-800/80">
                            <th className="p-3">Producto / Código</th>
                            <th className="p-3 text-center">ID Producto</th>
                            <th className="p-3 text-right">Cant. Custódia</th>
                            <th className="p-3 text-right">Precio Detal Ref</th>
                            <th className="p-3 text-right">Monto Estimado</th>
                            <th className="p-3 text-center">Responsable / Despacho</th>
                            <th className="p-3 text-center">Último Envío</th>
                            <th className="p-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-mono">
                          {clientGroup.items.map(item => {
                            const prod = products.find(p => p.id === item.productId);
                            const refPrice = prod ? prod.priceUSD : 0;
                            const totalVal = refPrice * item.qty;
                            
                            return (
                              <tr key={item.id} className="hover:bg-slate-950/15 transition">
                                <td className="p-3 flex items-center gap-3">
                                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-slate-950 border border-slate-800">
                                    <img 
                                      src={prod?.imageUrl || "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=100&auto=format&fit=crop&q=60"} 
                                      alt={item.productName}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover" 
                                    />
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-200 block normal-case font-sans">{item.productName}</span>
                                    <span className="text-[10px] text-slate-505 block leading-tight">{item.productId}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center text-slate-400">{prod?.sku || '-'}</td>
                                <td className="p-3 text-right font-bold text-slate-100">{item.qty} unids</td>
                                <td className="p-3 text-right text-slate-450">{formatCurrency(refPrice, 'USD')}</td>
                                <td className="p-3 text-right text-emerald-450 font-bold">{formatCurrency(totalVal, 'USD')}</td>
                                <td className="p-3 text-center">
                                  <div className="inline-flex flex-col items-center">
                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-mono flex items-center gap-1">
                                      <UserIcon className="w-2.5 h-2.5 text-amber-400" />
                                      {item.createdByName || 'ssuarez'}
                                    </span>
                                    {item.documentId && (
                                      <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                        {item.documentId}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 text-center text-slate-500 text-[10px]">{new Date(item.updatedAt).toLocaleDateString()}</td>
                                <td className="p-3 text-right">
                                  {canModify ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReturnClientRif(item.clientRif);
                                        setReturnProductId(item.productId);
                                        setReturnQty(item.qty);
                                        setIsReturnModalOpen(true);
                                      }}
                                      className="text-[10px] bg-indigo-500/10 hover:bg-indigo-600 hover:text-white text-indigo-400 px-2 py-1 rounded border border-indigo-500/15 transition uppercase"
                                    >
                                      Devolver a Almacén
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-600 font-mono">Solo Lectura</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-extrabold uppercase font-mono tracking-widest text-indigo-400 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-indigo-400" />
                Modificar Ficha de Producto: {editingProduct.name}
              </h3>
              <button 
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="p-5 space-y-4 text-xs">
              {/* Fotografía de Producto en Edición */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-center gap-4">
                <div 
                  onClick={() => {
                    if (editImageUrl) {
                      openZoomViewer(editImageUrl, editName || 'Producto', editBarcode || editSku, editCategory, editPrice);
                    }
                  }}
                  className="relative group w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-750 hover:border-indigo-400 bg-slate-900 flex-shrink-0 flex items-center justify-center shadow-md cursor-pointer"
                  title="Clic para ver foto en tamaño grande y hacer zoom"
                >
                  <img 
                    src={editImageUrl || DEFAULT_PRODUCT_IMAGE} 
                    alt="Vista previa" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity text-indigo-300">
                    <Eye className="w-5 h-5" />
                    <span className="text-[9px] font-mono font-bold">Ver Zoom</span>
                  </div>
                  {isCompressingEditImage && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1 text-[9px] text-indigo-300">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Optimizando...</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 uppercase font-mono flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      Fotografía del Producto
                    </span>
                    <div className="flex items-center gap-2">
                      {editImageUrl && editImageUrl !== DEFAULT_PRODUCT_IMAGE && (
                        <>
                          <button
                            type="button"
                            onClick={() => openZoomViewer(editImageUrl, editName || 'Producto', editBarcode || editSku, editCategory, editPrice)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline transition flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> Ver Zoom
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditImageUrl(DEFAULT_PRODUCT_IMAGE)}
                            className="text-[10px] text-slate-400 hover:text-rose-400 underline transition"
                          >
                            Restablecer a imagen por defecto
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer px-3 py-1 bg-indigo-650/30 hover:bg-indigo-650/45 border border-indigo-500/40 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
                      <Upload className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Subir foto</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleImageFileChange(e, setEditImageUrl, setIsCompressingEditImage, editBarcode || editSku)}
                      />
                    </label>

                    <label className="cursor-pointer px-3 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-750 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Tomar con cámara</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={(e) => handleImageFileChange(e, setEditImageUrl, setIsCompressingEditImage, editBarcode || editSku)}
                      />
                    </label>
                  </div>

                  <div className="relative">
                    <LinkIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="url"
                      placeholder="O pegar URL directa de imagen (https://...)"
                      value={editImageUrl.startsWith('data:') ? '' : editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      className="w-full pl-8 pr-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Código de barras / ID</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      required
                      value={editBarcode}
                      onChange={(e) => setEditBarcode(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                    />
                    <button
                      type="button"
                      onClick={handleScanBarcodeForEdit}
                      className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-850 hover:border-indigo-500 text-indigo-400 rounded-lg transition"
                      title="Capturar con cámara móvil"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Nombre del Producto</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Categoría / Marca</label>
                  <input
                    type="text"
                    required
                    list="edit-categories-list"
                    placeholder="Ej. PRESCOTT, FBO, TOHO..."
                    value={editCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setEditCategory(cat);
                      const autoCuad = calculateCuadrillasAuto(cat, editPriceVES, editPrice);
                      setEditPriceCuadrillas(autoCuad);
                      setEditPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                  <datalist id="edit-categories-list">
                    {categories.filter(c => c !== 'todos').map(c => (
                      <option key={c} value={c} />
                    ))}
                    <option value="PRESCOTT" />
                    <option value="FBO" />
                    <option value="TOHO" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">ID del Producto</label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Costo USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editCost}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditCost(val);
                      setEditCostExchangeUSD(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Costo al cambio USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editCostExchangeUSD}
                    onChange={(e) => setEditCostExchangeUSD(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Detal USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPrice}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditPrice(val);
                      const baseVES = editPriceVES > 0 ? editPriceVES : val;
                      const autoCuad = calculateCuadrillasAuto(editCategory, baseVES, val);
                      setEditPriceCuadrillas(autoCuad);
                      setEditPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Detal Bs ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPriceVES}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditPriceVES(val);
                      const autoCuad = calculateCuadrillasAuto(editCategory, val, editPrice);
                      setEditPriceCuadrillas(autoCuad);
                      setEditPriceCuadrillasVES(autoCuad);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Mayor USD ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPriceWholesale}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditPriceWholesale(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Precio Mayor Bs ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPriceWholesaleVES}
                    onChange={(e) => setEditPriceWholesaleVES(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-500 uppercase font-bold font-mono">Precio Cuadrillas ($)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoCuad = calculateCuadrillasAuto(editCategory, editPriceVES, editPrice);
                        setEditPriceCuadrillas(autoCuad);
                        setEditPriceCuadrillasVES(autoCuad);
                      }}
                      className="text-[9px] text-teal-400 hover:text-teal-300 transition flex items-center gap-1 font-mono cursor-pointer"
                      title="Auto-calcular precio de cuadrillas según la categoría (+10% Prescott, +2% FBO, +20% Toho)"
                    >
                      ⚡ Auto (+{Math.round((getCuadrillaRatio(editCategory) - 1) * 100)}%)
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPriceCuadrillas}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditPriceCuadrillas(val);
                      setEditPriceCuadrillasVES(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Ubicación BIN</label>
                  <input
                    type="text"
                    placeholder="Ej: Estante A-12, Pasillo B"
                    value={editBinLocation}
                    onChange={(e) => setEditBinLocation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Existencia (Stock)</label>
                  <input
                    type="number"
                    required
                    value={editStock}
                    onChange={(e) => setEditStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Mínimo para Alerta</label>
                  <input
                    type="number"
                    required
                    value={editMinStock}
                    onChange={(e) => setEditMinStock(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Descripción del Artículo</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center gap-3 pt-3 border-t border-slate-800">
                {currentUser.role === 'Administrador' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = editingProduct;
                      setEditingProduct(null);
                      handleConfirmDeleteSingle(toDel);
                    }}
                    className="px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-white rounded-lg font-bold uppercase text-[10px] transition flex items-center gap-1.5 cursor-pointer shadow"
                    title="Eliminar este producto permanentemente (Solo Administrador)"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar Producto
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 font-bold uppercase text-[10px] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold uppercase text-[10px] transition flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Guardar Cambios
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA CAMBIAR FOTO DE PRODUCTO (RÁPIDO Y PERSISTENTE) */}
      {quickPhotoProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    Cambiar Fotografía del Producto
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">
                    {quickPhotoProduct.name} <span className="text-indigo-400 font-bold">({quickPhotoProduct.sku})</span>
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  if (!isCompressingQuickPhoto) setQuickPhotoProduct(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* Preview and quick reset */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <div 
                  onClick={() => {
                    if (quickPhotoUrl) {
                      openZoomViewer(quickPhotoUrl, quickPhotoProduct.name, quickPhotoProduct.id, quickPhotoProduct.category, quickPhotoProduct.priceUSD, quickPhotoProduct);
                    }
                  }}
                  className="relative group w-28 h-28 rounded-xl overflow-hidden border-2 border-indigo-500/40 hover:border-indigo-400 bg-slate-900 flex-shrink-0 flex items-center justify-center shadow-lg cursor-pointer"
                  title="Clic para ver foto en tamaño grande y hacer zoom"
                >
                  <img 
                    src={quickPhotoUrl || DEFAULT_PRODUCT_IMAGE} 
                    alt={quickPhotoProduct.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity text-indigo-300">
                    <Eye className="w-5 h-5" />
                    <span className="text-[9px] font-mono font-bold">Ver Zoom</span>
                  </div>
                  {isCompressingQuickPhoto && (
                    <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-1.5 text-indigo-300 z-10">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-[10px] font-mono">Optimizando...</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <h4 className="font-bold text-slate-200 text-sm">{quickPhotoProduct.name}</h4>
                  <div className="text-[11px] text-slate-400 font-mono space-x-2">
                    <span>Código: <strong className="text-slate-200">{quickPhotoProduct.id}</strong></span>
                    <span>•</span>
                    <span>Categoría: <strong className="text-indigo-400">{quickPhotoProduct.category}</strong></span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Las fotos se procesan y optimizan automáticamente en alta definición para carga ultrarrápida y se sincronizan en la nube.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => openZoomViewer(quickPhotoUrl, quickPhotoProduct.name, quickPhotoProduct.id, quickPhotoProduct.category, quickPhotoProduct.priceUSD, quickPhotoProduct)}
                      className="px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-300 rounded-lg text-[11px] font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Ver Foto Completa y Zoom</span>
                    </button>
                    {quickPhotoUrl && quickPhotoUrl !== DEFAULT_PRODUCT_IMAGE && (
                      <button
                        type="button"
                        onClick={() => setQuickPhotoUrl(DEFAULT_PRODUCT_IMAGE)}
                        className="text-[10px] text-rose-400 hover:text-rose-300 underline font-mono inline-block"
                      >
                        Restablecer a imagen por defecto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Tabs */}
              <div className="flex border-b border-slate-800 gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPhotoTab('upload')}
                  className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
                    quickPhotoTab === 'upload'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Subir / Cámara
                </button>
                <button
                  type="button"
                  onClick={() => setQuickPhotoTab('url')}
                  className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
                    quickPhotoTab === 'url'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Enlace URL Web
                </button>
                <button
                  type="button"
                  onClick={() => setQuickPhotoTab('presets')}
                  className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
                    quickPhotoTab === 'presets'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Galería Sugerida
                </button>
              </div>

              {/* Tab 1: Upload / Camera */}
              {quickPhotoTab === 'upload' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                  <label className="cursor-pointer p-4 bg-slate-950 hover:bg-slate-850/80 border-2 border-dashed border-indigo-500/40 hover:border-indigo-500 rounded-xl flex flex-col items-center justify-center gap-2 text-center group transition">
                    <div className="p-2.5 rounded-full bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-200 text-xs">Seleccionar Archivo</span>
                    <span className="text-[10px] text-slate-500">JPG, PNG o WebP desde tu equipo o móvil</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageFileChange(e, setQuickPhotoUrl, setIsCompressingQuickPhoto, quickPhotoProduct?.id)}
                    />
                  </label>

                  <label className="cursor-pointer p-4 bg-slate-950 hover:bg-slate-850/80 border-2 border-dashed border-emerald-500/40 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-2 text-center group transition">
                    <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-200 text-xs">Tomar con Cámara</span>
                    <span className="text-[10px] text-slate-500">Abre la cámara directa del teléfono o laptop</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleImageFileChange(e, setQuickPhotoUrl, setIsCompressingQuickPhoto, quickPhotoProduct?.id)}
                    />
                  </label>
                </div>
              )}

              {/* Tab 2: URL */}
              {quickPhotoTab === 'url' && (
                <div className="space-y-3 animate-fade-in">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1 font-mono">
                      URL de la Imagen en Internet
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="url"
                          placeholder="https://ejemplo.com/fotos/producto.jpg"
                          value={quickPhotoUrl.startsWith('data:') ? '' : quickPhotoUrl}
                          onChange={(e) => setQuickPhotoUrl(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!quickPhotoUrl) {
                            alert("Por favor ingrese un enlace web válido");
                          }
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs"
                      >
                        Verificar
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Copie y pegue la dirección directa de cualquier imagen de Google Images, página del fabricante o catálogo web.
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 3: Presets */}
              {quickPhotoTab === 'presets' && (
                <div className="space-y-2 animate-fade-in">
                  <span className="text-[10px] text-slate-400 font-mono block">
                    Haga clic en cualquiera de las siguientes imágenes temáticas para aplicarla:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
                    {PRESET_PRODUCT_IMAGES.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setQuickPhotoUrl(preset.url)}
                        className={`p-1 rounded-lg border text-left flex flex-col items-center gap-1 group transition ${
                          quickPhotoUrl === preset.url
                            ? 'border-indigo-500 bg-indigo-500/15 ring-1 ring-indigo-500'
                            : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                        }`}
                      >
                        <div className="w-full h-14 rounded overflow-hidden bg-slate-900">
                          <img 
                            src={preset.url} 
                            alt={preset.label} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                          />
                        </div>
                        <span className="text-[9px] text-slate-300 font-medium text-center line-clamp-1 w-full">
                          {preset.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                {photoSaveSuccess ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                    <Check className="w-4 h-4" /> ¡Guardado y sincronizado en la nube!
                  </span>
                ) : (
                  "El cambio se guardará de inmediato en el sistema"
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPhotoProduct(null)}
                  disabled={isCompressingQuickPhoto}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 font-bold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickPhoto}
                  disabled={isCompressingQuickPhoto || photoSaveSuccess}
                  className={`px-5 py-2 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow-md ${
                    photoSaveSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-550 text-white'
                  }`}
                >
                  {photoSaveSuccess ? (
                    <>
                      <Check className="w-4 h-4" /> Guardado
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Guardar Foto
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEVOLUCION DE CONSIGNACION MODAL */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-extrabold uppercase font-mono tracking-widest text-indigo-400 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin-slow" />
                Registrar Devolución al Almacén
              </h3>
              <button 
                onClick={() => setIsReturnModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5 font-mono">1. Seleccionar Cliente</label>
                <select
                  required
                  value={returnClientRif}
                  onChange={(e) => {
                    setReturnClientRif(e.target.value);
                    // auto select first available product for this client
                    const clientProducts = consignmentItems.filter(c => c.clientRif === e.target.value && c.qty > 0);
                    if (clientProducts.length > 0) {
                      setReturnProductId(clientProducts[0].productId);
                      setReturnQty(1);
                    } else {
                      setReturnProductId('');
                      setReturnQty(1);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                >
                  <option value="">-- Seleccione Cliente --</option>
                  {Object.values(
                    consignmentItems.reduce<Record<string, { rif: string; name: string }>>((acc, item) => {
                      if (item.qty > 0) {
                        acc[item.clientRif] = { rif: item.clientRif, name: item.clientName };
                      }
                      return acc;
                    }, {})
                  ).map(client => (
                    <option key={client.rif} value={client.rif}>
                      {client.name} (RIF: {client.rif})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5 font-mono">2. Seleccionar Producto</label>
                <select
                  required
                  disabled={!returnClientRif}
                  value={returnProductId}
                  onChange={(e) => {
                    setReturnProductId(e.target.value);
                    setReturnQty(1);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 disabled:opacity-50"
                >
                  <option value="">-- Seleccione Producto --</option>
                  {returnClientRif && consignmentItems
                    .filter(c => c.clientRif === returnClientRif && c.qty > 0)
                    .map(item => (
                      <option key={item.productId} value={item.productId}>
                        {item.productName} (Código: {item.productId}, Custodia: {item.qty})
                      </option>
                    ))}
                </select>
              </div>

              {returnProductId && (() => {
                const selectedItem = consignmentItems.find(
                  c => c.clientRif === returnClientRif && c.productId === returnProductId
                );
                const maxQty = selectedItem ? selectedItem.qty : 1;

                return (
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5 font-mono">
                      3. Cantidad a Reintegrar (Máx: {maxQty})
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={maxQty}
                        required
                        value={returnQty}
                        onChange={(e) => setReturnQty(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                      />
                      <button
                        type="button"
                        onClick={() => setReturnQty(maxQty)}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase rounded-lg border border-slate-700 transition"
                      >
                        Máximo
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-4 border-t border-slate-800/60 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-450 hover:text-slate-100 transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!returnClientRif || !returnProductId || returnQty <= 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg transition font-bold"
                >
                  Procesar Devolución
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Delete Single Product */}
      {productToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">¿Eliminar Producto del Catálogo?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Estás a punto de eliminar permanentemente:
              </p>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-left font-mono text-xs mt-2 space-y-1">
                <div className="font-bold text-slate-200">{productToDelete.name}</div>
                <div className="text-slate-500 text-[11px]">Código: <span className="text-indigo-400">{productToDelete.id}</span> | SKU: <span className="text-indigo-400">{productToDelete.sku}</span></div>
                <div className="text-slate-500 text-[11px]">Stock Actual: <span className="text-amber-400 font-bold">{productToDelete.stock} unidades</span></div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteSingle}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/50"
              >
                Sí, Eliminar Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Bulk Delete */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-100">¿Eliminar {selectedProductIds.length} Productos Seleccionados?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Se eliminarán permanentemente los <span className="text-rose-400 font-bold">{selectedProductIds.length} productos</span> marcados del catálogo general de inventario.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeBulkDelete}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/50"
              >
                Eliminar {selectedProductIds.length} Productos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Wipe Complete Catalogue */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto animate-pulse">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-rose-300">¿Vaciar Todo el Catálogo de Inventario?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Esta acción eliminará <span className="text-rose-400 font-bold">TODOS los {products.length} productos</span> registrados actualmente en el inventario.
              </p>
              <p className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                💡 Esta función te permite dejar el catálogo en 0 para importar tus listas CSV/Excel de productos limpios sin mezclar con datos de prueba.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeWipeCatalogue}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-950/50"
              >
                Sí, Vaciar a 0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISOR Y ZOOM DE FOTOGRAFÍA DE PRODUCTO */}
      <ProductPhotoZoomModal
        isOpen={zoomModalData.isOpen}
        onClose={() => setZoomModalData(prev => ({ ...prev, isOpen: false }))}
        imageUrl={zoomModalData.imageUrl}
        productName={zoomModalData.productName}
        productCode={zoomModalData.productCode}
        productCategory={zoomModalData.productCategory}
        productPrice={zoomModalData.productPrice}
        onChangePhoto={
          canModify && zoomModalData.product 
            ? () => openPhotoModal(zoomModalData.product!)
            : undefined
        }
      />

      {/* MODAL DE ACTUALIZACIÓN MASIVA DE PRECIOS (CSV / JSON) PROTEGIENDO FOTOS */}
      <PriceUpdateModal
        isOpen={isPriceUpdateModalOpen}
        onClose={() => setIsPriceUpdateModalOpen(false)}
        products={products}
        exchangeRate={exchangeRate}
        onApplyPriceUpdates={handleApplyPriceUpdates}
        onOpenZoom={(img, name, code) => openZoomViewer(img, name, code)}
      />
    </div>
  );
}
