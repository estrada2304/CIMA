import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, Search, Plus, Trash, CheckCircle, Calculator, ChevronRight, AlertCircle, RefreshCw,
  Upload, Download, FileSpreadsheet, X, Check, History, Eye, Printer, PackageCheck,
  Calendar, FileText, ArrowUpRight, DollarSign, Layers
} from 'lucide-react';
import { Product, Purchase, ExchangeRate, User, Supplier, CompanySettings } from '../types';
import { formatDateDDMMAAAA } from '../lib/formatters';
import { downloadPurchasePDF, downloadPurchasesReportPDF } from '../lib/pdfGenerator';
import { INITIAL_COMPANY } from '../data';

interface PurchasesModuleProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exchangeRate: ExchangeRate;
  currentUser: User;
  onAddPurchase: (pur: Purchase) => void;
  suppliers: Supplier[];
  setSuppliers?: React.Dispatch<React.SetStateAction<Supplier[]>>;
  purchases?: Purchase[];
  setPurchases?: React.Dispatch<React.SetStateAction<Purchase[]>>;
  companySettings?: CompanySettings;
}

interface PurchaseCartItem {
  product: Product;
  qty: number;
  costUSD: number;
  newPriceUSD?: number;
}

export default function PurchasesModule({
  products,
  setProducts,
  exchangeRate,
  currentUser,
  onAddPurchase,
  suppliers = [],
  setSuppliers,
  purchases = [],
  setPurchases,
  companySettings = INITIAL_COMPANY
}: PurchasesModuleProps) {
  // Navigation subtabs: 'registrar' | 'historial'
  const [activeSubTab, setActiveSubTab] = useState<'registrar' | 'historial'>('registrar');

  // Intake Form states
  const [supplierName, setSupplierName] = useState('');
  const [supplierRif, setSupplierRif] = useState('J-');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);

  // Batch Import state variables
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [importReport, setImportReport] = useState<{ success: number; errors: string[] } | null>(null);

  // Focus product for manual addition
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState<number>(10);
  const [addCostUSD, setAddCostUSD] = useState<number>(0.0);

  // History states
  const [historySearch, setHistorySearch] = useState('');
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState<Purchase | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const canEdit = currentUser.role === 'Administrador' || currentUser.role === 'Almacenista';

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `Bs. ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  };

  // Drag & drop handlers
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleCSVImport = (csvContent: string) => {
    try {
      const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) {
        setImportReport({ success: 0, errors: ['El archivo CSV no contiene registros válidos.'] });
        return;
      }

      let successCount = 0;
      const errors: string[] = [];
      const newItems: PurchaseCartItem[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length < 3) continue;

        const codeOrId = parts[0];
        const qty = parseInt(parts[parts.length - 2], 10);
        const rawCost = parts[parts.length - 1];
        let costUSD = parseFloat(rawCost);
        // Check if cost is in Bs
        if (line.toLowerCase().includes('bs') || line.toLowerCase().includes('ves')) {
          const parsedVES = parseFloat(rawCost.replace(/[^0-9.,]/g, '').replace(',', '.'));
          if (!isNaN(parsedVES) && parsedVES > 0 && exchangeRate.rate > 0) {
            costUSD = Math.round((parsedVES / exchangeRate.rate) * 100) / 100;
          }
        }

        if (isNaN(qty) || qty <= 0 || isNaN(costUSD) || costUSD < 0) {
          errors.push(`Línea ${i + 1}: Cantidad o costo inválido (${line})`);
          continue;
        }

        const foundProd = products.find(p => p.id === codeOrId || p.sku.toLowerCase() === codeOrId.toLowerCase());
        if (!foundProd) {
          errors.push(`Línea ${i + 1}: Producto no encontrado con código "${codeOrId}"`);
          continue;
        }

        newItems.push({
          product: foundProd,
          qty,
          costUSD
        });
        successCount++;
      }

      if (newItems.length > 0) {
        setCart(prev => {
          const merged = [...prev];
          newItems.forEach(newItem => {
            const idx = merged.findIndex(m => m.product.id === newItem.product.id);
            if (idx > -1) {
              merged[idx] = newItem;
            } else {
              merged.push(newItem);
            }
          });
          return merged;
        });
      }

      setImportReport({ success: successCount, errors });
    } catch (e: any) {
      setImportReport({ success: 0, errors: [`Fallo al procesar CSV: ${e.message}`] });
    }
  };

  const handleJSONImport = (jsonContent: string) => {
    try {
      const parsed = JSON.parse(jsonContent);
      if (!Array.isArray(parsed)) {
        setImportReport({ success: 0, errors: ['El archivo JSON debe contener un arreglo de ítems de compra.'] });
        return;
      }

      let successCount = 0;
      const errors: string[] = [];
      const newItems: PurchaseCartItem[] = [];

      parsed.forEach((item: any, index: number) => {
        const code = item.productId || item.id || item.codigo;
        const qty = Number(item.qty || item.cantidad);
        const costUSD = Number(item.costUSD || item.costoUSD || item.costo);

        if (!code || isNaN(qty) || qty <= 0 || isNaN(costUSD) || costUSD < 0) {
          errors.push(`Ítem ${index + 1}: Formato o valores numéricos inválidos.`);
          return;
        }

        const foundProd = products.find(p => p.id === code || p.sku.toLowerCase() === String(code).toLowerCase());
        if (!foundProd) {
          errors.push(`Ítem ${index + 1}: Producto no encontrado con código "${code}".`);
          return;
        }

        newItems.push({
          product: foundProd,
          qty,
          costUSD
        });
        successCount++;
      });

      if (newItems.length > 0) {
        setCart(prev => {
          const merged = [...prev];
          newItems.forEach(newItem => {
            const idx = merged.findIndex(m => m.product.id === newItem.product.id);
            if (idx > -1) {
              merged[idx] = newItem;
            } else {
              merged.push(newItem);
            }
          });
          return merged;
        });
      }

      setImportReport({ success: successCount, errors });
    } catch (e: any) {
      setImportReport({ success: 0, errors: [`JSON no válido: ${e.message}`] });
    }
  };

  // Export current cart to CSV
  const handleExportCartCSV = () => {
    if (cart.length === 0) {
      showToast("⚠️ No hay ítems en la hoja de compra actual para exportar.");
      return;
    }
    const headers = ["Código de Barras", "Nombre del Producto", "ID de Producto", "Cantidad", "Costo USD Unitario", "Subtotal USD"];
    const rows = cart.map(item => [
      `"${item.product.id}"`,
      `"${item.product.name.replace(/"/g, '""')}"`,
      `"${item.product.sku}"`,
      item.qty,
      item.costUSD,
      item.costUSD * item.qty
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SigaInvent_HojaCompra_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export full purchases history to CSV
  const handleExportPurchasesHistoryCSV = () => {
    if (purchases.length === 0) {
      showToast("⚠️ No hay registros de compras en el historial para exportar.");
      return;
    }
    const headers = ["ID Compra", "Fecha (dd/mm/aaaa)", "Hora", "Proveedor", "RIF Proveedor", "Cant Ítems", "Total USD ($)", "Tasa BCV (Bs.)", "Total Bs.", "Registrado Por"];
    const rows = purchases.map(p => {
      const datePart = formatDateDDMMAAAA(p.timestamp);
      const timePart = new Date(p.timestamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      return [
        `"${p.id}"`,
        `"${datePart}"`,
        `"${timePart}"`,
        `"${p.supplierName.replace(/"/g, '""')}"`,
        `"${p.supplierRif || ''}"`,
        p.items.reduce((acc, it) => acc + it.qty, 0),
        p.totalUSD.toFixed(2),
        p.exchangeRateUsed.toFixed(2),
        p.totalVES.toFixed(2),
        `"${p.createdByName}"`
      ];
    });

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Control_Compras_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter products for suggestions
  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const term = (searchTerm || '').toLowerCase().trim();
    return !term || 
      (p.name || '').toLowerCase().includes(term) ||
      String(p.id || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term);
  });

  const handleSelectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setAddQty(10);
    setAddCostUSD(prod.costUSD);
    setSearchTerm('');
  };

  const handleAddItemToPurchase = () => {
    if (!selectedProduct) return;

    const existingIndex = cart.findIndex(item => item.product.id === selectedProduct.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex] = {
        product: selectedProduct,
        qty: addQty,
        costUSD: addCostUSD
      };
      setCart(updated);
    } else {
      setCart([...cart, {
        product: selectedProduct,
        qty: addQty,
        costUSD: addCostUSD
      }]);
    }

    setSelectedProduct(null);
  };

  const handleCompletePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      showToast("⚠️ Escriba el nombre o seleccione el proveedor para registrar la compra.");
      return;
    }
    if (cart.length === 0) {
      showToast("⚠️ La hoja de compra está vacía. Añada productos antes de registrar.");
      return;
    }

    // Calculate total
    const totalUSD = cart.reduce((acc, item) => acc + (item.costUSD * item.qty), 0);
    const totalVES = totalUSD * exchangeRate.rate;

    const newPurchase: Purchase = {
      id: `COM-${Math.floor(1000 + Math.random() * 9000)}`,
      supplierName: supplierName.trim(),
      supplierRif: supplierRif.trim().toUpperCase(),
      items: cart.map(item => {
        const itemCostUSD = item.costUSD;
        const itemTotalUSD = item.costUSD * item.qty;
        const itemCostVES = Math.round(itemCostUSD * exchangeRate.rate * 100) / 100;
        const itemTotalVES = Math.round(itemTotalUSD * exchangeRate.rate * 100) / 100;
        return {
          productId: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          qty: item.qty,
          costUSD: itemCostUSD,
          costVES: itemCostVES,
          totalUSD: itemTotalUSD,
          totalVES: itemTotalVES
        };
      }),
      totalUSD,
      totalVES,
      exchangeRateUsed: exchangeRate.rate,
      timestamp: new Date().toISOString(),
      createdById: currentUser.id,
      createdByName: currentUser.username
    };

    // Auto-register supplier in system suppliers list if not already present
    if (setSuppliers && supplierName.trim()) {
      const sName = supplierName.trim();
      const sRif = supplierRif.trim();
      const exists = suppliers.some(s => s.name.toLowerCase() === sName.toLowerCase());
      if (!exists) {
        const newSup: Supplier = {
          id: `sup-${Date.now()}`,
          name: sName,
          rif: sRif || 'J-',
          phone: '',
          email: '',
          address: '',
          contactPerson: 'Departamento de Compras'
        };
        setSuppliers(prev => [...prev, newSup]);
      }
    }

    // Save purchase record in global state & Firestore
    onAddPurchase(newPurchase);

    // Clear intake form
    setCart([]);
    setSupplierName('');
    setSupplierRif('J-');

    // Notify user and switch to Historial tab so they see it reflected immediately!
    showToast(`🎉 ¡Compra ${newPurchase.id} registrada con éxito! El inventario fue surtido y la compra está reflejada en el historial.`);
    setActiveSubTab('historial');
  };

  const removeItem = (prodId: string) => {
    setCart(cart.filter(item => item.product.id !== prodId));
  };

  const handleDeletePurchase = (purchase: Purchase) => {
    if (currentUser.role !== 'Administrador') {
      showToast("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador pueden eliminar registros de compras.");
      return;
    }
    if (confirm(`¿Confirma que desea eliminar la orden de compra ${purchase.id} del proveedor "${purchase.supplierName}"? Esta acción removerá el registro permanentemente de la base de datos y de la nube.`)) {
      if (setPurchases) {
        setPurchases(prev => prev.filter(p => p.id !== purchase.id));
      }
      showToast(`🗑️ Compra ${purchase.id} eliminada con éxito.`);
    }
  };

  // Filter out any dummy / template / Polar records permanently from view and metrics
  const validPurchases = useMemo(() => {
    return purchases.filter(p => p && p.id !== 'COM-0001' && !(p.supplierName || '').toLowerCase().includes('polar'));
  }, [purchases]);

  // Filtered purchases for history view
  const filteredPurchases = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return validPurchases;
    return validPurchases.filter(p => 
      p.id.toLowerCase().includes(q) ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.supplierRif && p.supplierRif.toLowerCase().includes(q)) ||
      (p.createdByName && p.createdByName.toLowerCase().includes(q)) ||
      (p.items && p.items.some(it => (it.name || '').toLowerCase().includes(q) || (it.productId || '').includes(q)))
    );
  }, [validPurchases, historySearch]);

  // Summary Metrics calculated exclusively on real purchases
  const totalPurchasesCount = validPurchases.length;
  const totalInvestmentUSD = validPurchases.reduce((sum, p) => sum + (p.totalUSD || 0), 0);
  const totalInvestmentVES = validPurchases.reduce((sum, p) => sum + (p.totalVES || 0), 0);
  const totalUnitsSurtidas = validPurchases.reduce((sum, p) => sum + (p.items ? p.items.reduce((iSum, it) => iSum + (it.qty || 0), 0) : 0), 0);

  // PDF Export Handlers
  const handleExportPurchasesHistoryPDF = () => {
    if (validPurchases.length === 0) {
      showToast("⚠️ No hay compras en el historial para generar el reporte en PDF.");
      return;
    }
    try {
      showToast("📄 Generando Reporte Consolidado de Compras en PDF...");
      downloadPurchasesReportPDF(validPurchases, companySettings, currentUser.nombreCompleto || currentUser.username || 'ssuarez');
    } catch (err: any) {
      console.error("Error generating purchases report PDF:", err);
      showToast("⚠️ Error al exportar el reporte en PDF: " + (err.message || err));
    }
  };

  const handleDownloadSinglePurchasePDF = (p: Purchase | null) => {
    if (!p) return;
    try {
      showToast(`📄 Generando Orden de Compra ${p.id} en PDF...`);
      downloadPurchasePDF(p, companySettings);
    } catch (err: any) {
      console.error("Error generating purchase PDF:", err);
      showToast("⚠️ Error al generar el PDF de la orden de compra: " + (err.message || err));
    }
  };

  const invoiceTotalUSD = cart.reduce((acc, item) => acc + (item.costUSD * item.qty), 0);

  if (!canEdit) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-4 stroke-[1.5]" />
        <h3 className="text-slate-200 font-bold text-sm uppercase font-mono tracking-wider">Acceso Restringido por Rol</h3>
        <p className="text-slate-400 text-xs mt-2 leading-relaxed">
          Usted tiene un rol de <strong>{currentUser.role}</strong>. El módulo de Compras y Surtido de Mercancía está restringido exclusivamente para Administradores de Empresa y Almacenistas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-1 font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 max-w-md bg-emerald-950 border border-emerald-500/50 text-emerald-100 p-4 rounded-xl shadow-2xl flex items-center justify-between gap-3 animate-fade-in font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setNotification(null)}
            className="text-emerald-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & Subtab Switcher */}
      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-indigo-400 uppercase tracking-widest font-bold">MÓDULO DE COMPRAS Y RECEPCIÓN</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300 font-mono font-bold">
              CONTROL DE MERCANCÍA
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Surtido de Inventario y Control de Compras</h2>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('registrar')}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 font-mono uppercase tracking-wider ${
              activeSubTab === 'registrar'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Registrar Compra / Surtir
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('historial')}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 font-mono uppercase tracking-wider relative ${
              activeSubTab === 'historial'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" /> 
            <span>Historial de Compras</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-indigo-300 font-bold ml-1">
              {purchases.length}
            </span>
          </button>
        </div>
      </div>

      {/* SUBTAB 1: REGISTRAR COMPRA / SURTIR */}
      {activeSubTab === 'registrar' && (
        <div className="space-y-6">
          {/* Subheader Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-850 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-[10px] uppercase text-slate-500">COMPRANDO COMO:</span>
              <span className="text-indigo-400 font-bold">{currentUser.username} ({currentUser.role})</span>
              <span className="text-slate-650">|</span>
              <span className="text-[10px] uppercase text-slate-500">TASA BCV:</span>
              <span className="text-emerald-400 font-bold">1 $ = {formatCurrency(exchangeRate.rate, 'VES')}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImportExport(!showImportExport)}
                className={`px-3 py-1.5 border rounded-lg font-bold text-xs transition flex items-center gap-1.5 ${
                  showImportExport
                    ? 'bg-indigo-950/50 border-indigo-500 text-indigo-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" /> Carga Masiva (Excel/CSV)
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportCartCSV}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-lg font-bold text-xs transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar Hoja
                </button>
              )}
            </div>
          </div>

          {/* Collapsible batch import/export dashboard */}
          {showImportExport && (
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4 shadow-xl animate-slide-in font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" /> Importar Lista de Compras al Surtido
                </h3>
                <button
                  type="button"
                  onClick={() => setShowImportExport(false)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                    dragActive
                      ? 'border-indigo-500 bg-indigo-950/20'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                  <p className="text-slate-200 font-bold text-xs mb-1">Arrastra tu archivo CSV o JSON aquí</p>
                  <p className="text-[10px] text-slate-500 mb-3">Formato: Código_Barras, Cantidad, CostoUSD</p>
                  <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs cursor-pointer shadow">
                    Explorar Archivo
                    <input type="file" accept=".csv, .json" className="hidden" onChange={handleFileInput} />
                  </label>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">📋 O Pegar Texto Directo:</span>
                  <textarea
                    rows={4}
                    placeholder="7591001001, 20, 1.50&#10;7591001002, 50, 0.85"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleCSVImport(importText)}
                      disabled={!importText.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-bold text-xs transition"
                    >
                      Procesar Texto
                    </button>
                  </div>
                </div>
              </div>

              {importReport && (
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                  <p className="text-emerald-400 font-bold">✅ Ítems agregados exitosamente: {importReport.success}</p>
                  {importReport.errors.length > 0 && (
                    <div className="mt-2 text-rose-400 space-y-1">
                      <p className="font-bold">⚠️ Errores ({importReport.errors.length}):</p>
                      {importReport.errors.slice(0, 3).map((err, i) => (
                        <p key={i} className="text-[10px] text-slate-400">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2-Column Layout: Left Search/Select, Right Intake Cart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: PROVIDER & PRODUCT SELECTION */}
            <div className="lg:col-span-7 space-y-5">
              {/* Provider Info Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShoppingBag className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">1. Datos del Proveedor</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Nombre o Razón Social del Proveedor *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Toho, Prescott, Suministros CIMA"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-2 px-3 text-white text-xs outline-none"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">RIF del Proveedor</label>
                    <input
                      type="text"
                      placeholder="J-12345678-9"
                      value={supplierRif}
                      onChange={(e) => setSupplierRif(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-2 px-3 text-white text-xs outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Quick select existing registered supplier */}
                {suppliers.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">O seleccionar de proveedores registrados:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {suppliers.slice(0, 6).map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSupplierName(s.name);
                            setSupplierRif(s.rif || 'J-');
                          }}
                          className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded text-[11px] font-medium transition"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Product Selection Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">2. Selección de Productos para Surtir</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Total en catálogo: {products.length}</span>
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre, código de barras o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-2 pl-9 pr-3 text-white text-xs outline-none"
                  />
                </div>

                {/* Product Search Results / List */}
                {searchTerm.trim() !== '' && (
                  <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg divide-y divide-slate-800 bg-slate-950">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.slice(0, 15).map(prod => (
                        <div
                          key={prod.id}
                          onClick={() => handleSelectProduct(prod)}
                          className="p-2.5 hover:bg-slate-900 cursor-pointer flex items-center justify-between transition text-xs"
                        >
                          <div>
                            <p className="font-semibold text-white">{prod.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              Cód: {prod.id} | SKU: {prod.sku} | Stock Actual: {prod.stock} unids
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-indigo-400 font-bold block">{formatCurrency(prod.costUSD, 'USD')}</span>
                            <span className="text-[10px] text-slate-500">Costo Unit.</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-center text-slate-500 text-xs font-mono">No se encontraron productos coincidentes.</p>
                    )}
                  </div>
                )}

                {/* Selected Product Form to Add into Cart */}
                {selectedProduct ? (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Producto Seleccionado:</span>
                        <h4 className="text-sm font-bold text-white">{selectedProduct.name}</h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Código: {selectedProduct.id} | Stock Actual: <span className="text-emerald-400 font-bold">{selectedProduct.stock}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(null)}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Cantidad a Surtir *</label>
                        <input
                          type="number"
                          min="1"
                          value={addQty}
                          onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-slate-950 border border-slate-800 rounded py-1.5 px-2.5 text-white font-mono text-xs outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Costo Unitario ($ USD) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={addCostUSD}
                          onChange={(e) => setAddCostUSD(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full bg-slate-950 border border-slate-800 rounded py-1.5 px-2.5 text-white font-mono text-xs outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1 flex items-end">
                        <button
                          type="button"
                          onClick={handleAddItemToPurchase}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs transition flex items-center justify-center gap-1.5 shadow"
                        >
                          <Plus className="w-4 h-4" /> Añadir a Hoja
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl text-center text-slate-500 text-xs font-mono">
                    Busque un producto arriba o escriba su nombre para agregarlo a la recepción de mercancía.
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: RECEPTION CART & SUMMARY */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">3. Hoja de Compra / Recepción</h3>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 font-mono font-bold">
                      {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="mt-4 max-h-[380px] overflow-y-auto space-y-2 pr-1">
                    {cart.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-xs font-mono space-y-2">
                        <ShoppingBag className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
                        <p>No hay productos en la hoja de compra actual.</p>
                      </div>
                    ) : (
                      cart.map(item => (
                        <div key={item.product.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white truncate">{item.product.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              +{item.qty} unids × {formatCurrency(item.costUSD, 'USD')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-white block">{formatCurrency(item.costUSD * item.qty, 'USD')}</span>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              {formatCurrency(item.costUSD * item.qty * exchangeRate.rate, 'VES')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.product.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-900 transition"
                            title="Eliminar producto de la hoja"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bottom Total and Register Button */}
                <div className="border-t border-slate-800 pt-4 mt-4 space-y-4">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-850 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400 font-mono">
                      <span>Total Unidades:</span>
                      <span className="font-bold text-white">{cart.reduce((s, it) => s + it.qty, 0)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-850">
                      <span className="text-xs uppercase font-mono font-bold text-slate-300">Total Inversión:</span>
                      <div className="text-right">
                        <span className="text-base font-bold text-indigo-400 block">{formatCurrency(invoiceTotalUSD, 'USD')}</span>
                        <span className="text-[10px] text-emerald-400 font-mono block">
                          {formatCurrency(invoiceTotalUSD * exchangeRate.rate, 'VES')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCompletePurchase}
                    disabled={cart.length === 0 || !supplierName.trim()}
                    className={`w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 select-none shadow-lg ${
                      cart.length === 0 || !supplierName.trim()
                        ? 'bg-slate-950 border border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                    }`}
                  >
                    <PackageCheck className="w-4 h-4" /> Registrar Compra e Incrementar Surtido
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RECENT PURCHASES PREVIEW (Direct feedback on the same screen) */}
          {purchases.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">Últimas Compras Registradas en el Sistema</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('historial')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-mono font-bold flex items-center gap-1 transition"
                >
                  Ver todas ({purchases.length}) <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Proveedor</th>
                      <th className="py-2 px-3 text-right">Ítems</th>
                      <th className="py-2 px-3 text-right">Monto ($ USD)</th>
                      <th className="py-2 px-3 text-right">Monto (Bs.)</th>
                      <th className="py-2 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {purchases.slice(0, 3).map(p => (
                      <tr key={p.id} className="hover:bg-slate-950/50 transition">
                        <td className="py-2.5 px-3 font-bold text-indigo-400">{p.id}</td>
                        <td className="py-2.5 px-3 text-slate-400">{formatDateDDMMAAAA(p.timestamp)}</td>
                        <td className="py-2.5 px-3 text-white font-semibold">{p.supplierName}</td>
                        <td className="py-2.5 px-3 text-right">{p.items.reduce((s, it) => s + it.qty, 0)} unids</td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">{formatCurrency(p.totalUSD, 'USD')}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatCurrency(p.totalVES, 'VES')}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedPurchaseDetail(p)}
                            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded text-[11px] font-bold transition inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-indigo-400" /> Detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: HISTORIAL Y CONTROL DE COMPRAS */}
      {activeSubTab === 'historial' && (
        <div className="space-y-5 animate-fade-in">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase font-mono font-bold tracking-wider">Total Compras</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2 font-mono">{totalPurchasesCount}</p>
              <span className="text-[10px] text-slate-500 font-mono">Registros preservados en BD</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase font-mono font-bold tracking-wider">Total Inversión USD</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2 font-mono">{formatCurrency(totalInvestmentUSD, 'USD')}</p>
              <span className="text-[10px] text-slate-500 font-mono">Total mercancía adquirida</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase font-mono font-bold tracking-wider">Total Inversión Bs.</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400">
                  <Calculator className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xl font-bold text-emerald-400 mt-2 font-mono">{formatCurrency(totalInvestmentVES, 'VES')}</p>
              <span className="text-[10px] text-slate-500 font-mono">Equivalente según tasa oficial</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px] uppercase font-mono font-bold tracking-wider">Unidades Surtidas</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white mt-2 font-mono">{totalUnitsSurtidas} unids</p>
              <span className="text-[10px] text-slate-500 font-mono">Ingresadas al inventario</span>
            </div>
          </div>

          {/* Search Bar & Export Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por ID, proveedor, RIF o producto..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-2 pl-9 pr-3 text-white text-xs outline-none font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleExportPurchasesHistoryPDF}
                disabled={validPurchases.length === 0}
                className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 hover:text-white rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                title="Generar y descargar reporte consolidado de compras en PDF"
              >
                <Printer className="w-4 h-4 text-emerald-400" /> Exportar Reporte (PDF)
              </button>

              <button
                type="button"
                onClick={handleExportPurchasesHistoryCSV}
                disabled={validPurchases.length === 0}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-850 disabled:opacity-50 border border-slate-800 text-slate-200 rounded-lg text-xs font-bold font-mono transition flex items-center gap-1.5 shadow"
                title="Exportar compras en formato CSV"
              >
                <Download className="w-4 h-4 text-indigo-400" /> Exportar CSV
              </button>
            </div>
          </div>

          {/* Full Purchases Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">ID Compra</th>
                    <th className="py-3 px-4">Fecha / Hora</th>
                    <th className="py-3 px-4">Proveedor</th>
                    <th className="py-3 px-4 text-center">Ítems</th>
                    <th className="py-3 px-4 text-right">Tasa BCV</th>
                    <th className="py-3 px-4 text-right">Total USD ($)</th>
                    <th className="py-3 px-4 text-right">Total Bs.</th>
                    <th className="py-3 px-4">Responsable</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {filteredPurchases.length > 0 ? (
                    filteredPurchases.map(p => {
                      const timeStr = new Date(p.timestamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
                      const totalQty = p.items.reduce((s, it) => s + it.qty, 0);
                      return (
                        <tr key={p.id} className="hover:bg-slate-950/60 transition">
                          <td className="py-3 px-4 font-bold text-indigo-400">{p.id}</td>
                          <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                            <span className="font-bold text-white block">{formatDateDDMMAAAA(p.timestamp)}</span>
                            <span className="text-[10px] text-slate-500 font-mono block">{timeStr}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-white block">{p.supplierName}</span>
                            {p.supplierRif && <span className="text-[10px] text-slate-400 font-mono block">{p.supplierRif}</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-bold">
                              {p.items.length} {p.items.length === 1 ? 'prod' : 'prods'} ({totalQty} unids)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">
                            {formatCurrency(p.exchangeRateUsed, 'VES')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-white">
                            {formatCurrency(p.totalUSD, 'USD')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">
                            {formatCurrency(p.totalVES, 'VES')}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {p.createdByName}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDownloadSinglePurchasePDF(p)}
                                title="Descargar Orden de Compra en formato PDF"
                                className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 hover:text-white rounded text-[11px] font-bold transition inline-flex items-center gap-1 shadow cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedPurchaseDetail(p)}
                                className="px-2.5 py-1 bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-800/60 text-indigo-300 hover:text-white rounded text-[11px] font-bold transition inline-flex items-center gap-1 shadow cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" /> Ver Detalle
                              </button>
                              {currentUser.role === 'Administrador' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeletePurchase(p)}
                                  className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-white rounded text-[11px] font-bold transition inline-flex items-center gap-1 shadow cursor-pointer"
                                  title="Eliminar compra (Solo Administrador)"
                                >
                                  <Trash className="w-3.5 h-3.5" /> Eliminar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500 font-mono">
                        <ShoppingBag className="w-10 h-10 mx-auto opacity-30 text-slate-400 mb-2" />
                        <p className="text-sm">No se encontraron registros de compras.</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {historySearch ? 'Pruebe con otro término de búsqueda.' : 'Las compras que registre en la pestaña "Registrar Compra" se guardarán y reflejarán aquí.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL FOR A PURCHASE */}
      {selectedPurchaseDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-up text-xs font-mono">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Comprobante de Recepción: {selectedPurchaseDetail.id}
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Fecha: {formatDateDDMMAAAA(selectedPurchaseDetail.timestamp)} - {new Date(selectedPurchaseDetail.timestamp).toLocaleTimeString('es-VE')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseDetail(null)}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Supplier and Meta Card */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-500 uppercase block text-[9px]">Proveedor:</span>
                  <span className="font-bold text-white block">{selectedPurchaseDetail.supplierName}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase block text-[9px]">RIF:</span>
                  <span className="font-mono text-slate-300 block">{selectedPurchaseDetail.supplierRif || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase block text-[9px]">Tasa Oficial:</span>
                  <span className="font-bold text-emerald-400 block">{formatCurrency(selectedPurchaseDetail.exchangeRateUsed, 'VES')}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase block text-[9px]">Registrado por:</span>
                  <span className="text-slate-300 block">{selectedPurchaseDetail.createdByName}</span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Mercancía Recibida e Ingresada al Inventario
                </h4>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Producto / Descripción</th>
                        <th className="py-2 px-3 text-center">Cant</th>
                        <th className="py-2 px-3 text-right">Costo Unit ($)</th>
                        <th className="py-2 px-3 text-right">Costo Unit (Bs.)</th>
                        <th className="py-2 px-3 text-right">Subtotal ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {selectedPurchaseDetail.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-950/40">
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{it.productId}</td>
                          <td className="py-2 px-3">
                            <span className="font-semibold text-white block">{it.name}</span>
                            <span className="text-[9px] px-1 rounded bg-slate-900 border border-slate-800 text-indigo-300 font-bold inline-block mt-0.5">
                              [$] Ref. USD
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-white">+{it.qty}</td>
                          <td className="py-2 px-3 text-right text-slate-300">{formatCurrency(it.costUSD, 'USD')}</td>
                          <td className="py-2 px-3 text-right text-slate-400">{formatCurrency(it.costUSD * selectedPurchaseDetail.exchangeRateUsed, 'VES')}</td>
                          <td className="py-2 px-3 text-right font-bold text-white">{formatCurrency(it.totalUSD, 'USD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Total Unidades Surtidas</span>
                  <span className="text-sm font-bold text-white">
                    {selectedPurchaseDetail.items.reduce((s, it) => s + it.qty, 0)} unidades
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase block">Inversión Total</span>
                  <span className="text-lg font-bold text-indigo-400 block">{formatCurrency(selectedPurchaseDetail.totalUSD, 'USD')}</span>
                  <span className="text-xs text-emerald-400 block">{formatCurrency(selectedPurchaseDetail.totalVES, 'VES')}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSinglePurchasePDF(selectedPurchaseDetail)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Orden de Compra (PDF)
                </button>
                {currentUser.role === 'Administrador' && (
                  <button
                    type="button"
                    onClick={() => {
                      const pur = selectedPurchaseDetail;
                      setSelectedPurchaseDetail(null);
                      handleDeletePurchase(pur);
                    }}
                    className="px-3.5 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 hover:text-white rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow cursor-pointer"
                    title="Eliminar esta compra del sistema (Solo Administrador)"
                  >
                    <Trash className="w-3.5 h-3.5" /> Eliminar Orden
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedPurchaseDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
