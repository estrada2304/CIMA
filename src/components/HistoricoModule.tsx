import React, { useState, useMemo } from 'react';
import { 
  History, Search, Download, Eye, Ban, Calendar, Filter, X, 
  Printer, CheckCircle2, AlertTriangle, FileText, Banknote, ShieldCheck,
  Upload, FileSpreadsheet, Check, RotateCcw, Trash2, CheckSquare, Square
} from 'lucide-react';
import { Transaction, ExchangeRate, User, CompanySettings } from '../types';
import { downloadTransactionPDF } from '../lib/pdfGenerator';
import { syncSingleDoc } from '../lib/firebase';
import { formatDateDDMMAAAA, formatDateTimeDDMMAAAA, isBolivaresPaymentMethod } from '../lib/formatters';

interface HistoricoModuleProps {
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  exchangeRate: ExchangeRate;
  companySettings: CompanySettings;
  currentUser: User;
  onResetCommercialHistory?: () => void;
}

export default function HistoricoModule({
  transactions,
  setTransactions,
  exchangeRate,
  companySettings,
  currentUser,
  onResetCommercialHistory
}: HistoricoModuleProps) {
  // Multi-selection states
  const [selectedTrxIds, setSelectedTrxIds] = useState<string[]>([]);

  // Centralized import / export states for transactions history
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleExportJSON = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(transactions, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.setAttribute("download", `CIMA_Respaldos_Historico_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSV = (text: string): string[][] => {
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
           i++; 
         } else {
           inQuotes = !inQuotes;
         }
       } else if (char === ',' && !inQuotes) {
         currentLine.push(currentValue.trim());
         currentValue = '';
       } else if ((char === '\r' || char === '\n') && !inQuotes) {
         if (char === '\r' && nextChar === '\n') {
           i++;
         }
         currentLine.push(currentValue.trim());
         lines.push(currentLine);
         currentLine = [];
         currentValue = '';
       } else {
         currentValue += char;
       }
    }
    if (currentLine.length > 0 || currentValue !== '') {
      currentLine.push(currentValue.trim());
      lines.push(currentLine);
    }
    return lines;
  };

  const handleCSVImport = (text: string) => {
    try {
      setImportError(null);
      const rawLines = parseCSV(text);
      if (rawLines.length < 2) {
        throw new Error("El archivo CSV debe contener al menos una fila de cabecera y una de datos.");
      }
      
      const headers = rawLines[0].map((h: string) => h.toLowerCase().trim());
      
      const findIndex = (keywords: string[]) => {
        return headers.findIndex((h: string) => 
          keywords.some(kw => h.includes(kw))
        );
      };

      const idIndex = findIndex(['documento', 'id', 'factura', 'codigo', 'código', 'transaccion', 'transaction']);
      const nameIndex = findIndex(['razon', 'razón', 'cliente', 'nombre_cliente', 'name', 'clientname']);
      const rifIndex = findIndex(['rif', 'identificacion', 'client_rif', 'rif_cliente', 'dni']);
      const totalIndex = findIndex(['total', 'monto', 'totalusd', 'total_usd', 'amount']);
      const typeIndex = findIndex(['tipo', 'type', 'documenttype', 'tipo_documento']);
      const paymentIndex = findIndex(['metodo', 'pago', 'payment', 'paymentmethod', 'metodo_pago']);

      if (idIndex === -1 || nameIndex === -1) {
        throw new Error("Su CSV debe contener al menos las columnas de 'ID Documento' y 'Razon Social / Cliente'.");
      }

      const tempTransactions = [...transactions];
      let loadedCount = 0;
      let overwrittenCount = 0;

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.length === 0 || (line.length === 1 && line[0] === '')) continue;

        const docId = line[idIndex] ? line[idIndex].replace(/['"\s]/g, '').toUpperCase() : `MIG-${Math.floor(Math.random() * 9000 + 1000)}`;
        const clientName = line[nameIndex] ? line[nameIndex].replace(/^["']|["']$/g, '').trim() : 'Cliente Genérico';
        const clientRif = rifIndex !== -1 && line[rifIndex] ? line[rifIndex].replace(/['"\s]/g, '').toUpperCase() : 'V-00000000';
        let totalUSD = totalIndex !== -1 && line[totalIndex] ? parseFloat(line[totalIndex].replace(/[^0-9.-]/g, '')) || 0 : 0;
        let type = typeIndex !== -1 && line[typeIndex] ? line[typeIndex].toLowerCase().trim() : 'factura';
        if (!['factura', 'cotizacion', 'recibo', 'consignacion'].includes(type)) {
          type = 'factura';
        }

        let payment = paymentIndex !== -1 && line[paymentIndex] ? line[paymentIndex].trim() : 'Dólares Efectivo';
        const validPayments = ['Dólares Efectivo', 'Bolívares Pago Móvil', 'Bolívares Transferencia', 'Punto de Venta', 'Zelle', 'Consignación Abierta'];
        const matchedPayment = validPayments.find(p => p.toLowerCase().includes(payment.toLowerCase())) || 'Dólares Efectivo';

        const newTrx: Transaction = {
          id: docId,
          type: type as any,
          clientName,
          clientRif,
          items: [], // empty for basic CSV migration
          subtotalUSD: totalUSD / 1.16, // approximate
          subtotalVES: (totalUSD / 1.16) * exchangeRate.rate,
          ivaPercent: 16,
          ivaUSD: (totalUSD / 1.16) * 0.16,
          ivaVES: (totalUSD / 1.16) * 0.16 * exchangeRate.rate,
          igtfPercent: 0,
          igtfUSD: 0,
          igtfVES: 0,
          totalUSD,
          totalVES: totalUSD * exchangeRate.rate,
          exchangeRateUsed: exchangeRate.rate,
          paymentMethod: matchedPayment as any,
          status: 'completado',
          createdById: currentUser.id,
          createdByName: currentUser.username,
          timestamp: new Date().toISOString()
        };

        const existingIdx = tempTransactions.findIndex(t => t.id === docId);
        if (existingIdx !== -1) {
          tempTransactions[existingIdx] = newTrx;
          overwrittenCount++;
        } else {
          tempTransactions.push(newTrx);
          loadedCount++;
        }
      }

      setTransactions(tempTransactions);
      localStorage.setItem('siga_transactions', JSON.stringify(tempTransactions));
      alert(`✅ Transacciones importadas desde CSV:\n- ${loadedCount} nuevas importadas.\n- ${overwrittenCount} sobrescritas (ID duplicado).`);
      setImportText('');
      setShowImportExport(false);
    } catch (err: any) {
      setImportError(err.message || "Error al procesar archivo CSV.");
    }
  };

  const handleJSONImport = (text: string) => {
    try {
      setImportError(null);
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : (data.transactions || []);
      if (!Array.isArray(list)) {
        throw new Error("El archivo JSON debe contener una lista [] de transacciones.");
      }

      const tempTransactions = [...transactions];
      let loaded = 0;
      let overwrites = 0;

      list.forEach((trx: any) => {
        if (!trx.id || !trx.clientName) return;

        const cleanTrx: Transaction = {
          id: String(trx.id),
          type: trx.type || 'factura',
          clientName: String(trx.clientName),
          clientRif: String(trx.clientRif || 'V-00000000'),
          clientPhone: trx.clientPhone,
          clientEmail: trx.clientEmail,
          items: Array.isArray(trx.items) ? trx.items : [],
          subtotalUSD: Number(trx.subtotalUSD ?? trx.totalUSD ?? 0),
          subtotalVES: Number(trx.subtotalVES ?? 0),
          ivaPercent: Number(trx.ivaPercent ?? 16),
          ivaUSD: Number(trx.ivaUSD ?? 0),
          ivaVES: Number(trx.ivaVES ?? 0),
          igtfPercent: Number(trx.igtfPercent ?? 0),
          igtfUSD: Number(trx.igtfUSD ?? 0),
          igtfVES: Number(trx.igtfVES ?? 0),
          totalUSD: Number(trx.totalUSD ?? 0),
          totalVES: Number(trx.totalVES ?? 0),
          exchangeRateUsed: Number(trx.exchangeRateUsed ?? exchangeRate.rate),
          paymentMethod: trx.paymentMethod || 'Dólares Efectivo',
          status: trx.status || 'completado',
          createdById: trx.createdById || currentUser.id,
          createdByName: trx.createdByName || currentUser.username,
          timestamp: trx.timestamp || new Date().toISOString(),
          additionalNotes: trx.additionalNotes,
          inventorySource: trx.inventorySource
        };

        const existingIdx = tempTransactions.findIndex(x => x.id === cleanTrx.id);
        if (existingIdx !== -1) {
          tempTransactions[existingIdx] = cleanTrx;
          overwrites++;
        } else {
          tempTransactions.push(cleanTrx);
          loaded++;
        }
      });

      setTransactions(tempTransactions);
      localStorage.setItem('siga_transactions', JSON.stringify(tempTransactions));
      alert(`✅ Respaldo restaurado desde JSON con éxito:\n- ${loaded} transacciones añadidas.\n- ${overwrites} transacciones actualizadas.`);
      setImportText('');
      setShowImportExport(false);
    } catch (err: any) {
      setImportError("Error al procesar JSON: " + err.message);
    }
  };

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

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState(() => {
    const saved = localStorage.getItem('siga_historico_search_term');
    if (saved) {
      localStorage.removeItem('siga_historico_search_term');
      return saved;
    }
    return '';
  });
  const [selectedType, setSelectedType] = useState<string>('todos'); // todos, factura, cotizacion, recibo, consignacion
  const [selectedStatus, setSelectedStatus] = useState<string>('todos'); // todos, completado, pendiente, anulado
  const [selectedPayment, setSelectedPayment] = useState<string>('todos');
  
  // Date Period selection
  const [period, setPeriod] = useState<string>('todos'); // todos, hoy, semana, mes, custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Specific Year and Month selectors
  const [selectedYear, setSelectedYear] = useState<string>('todos');
  const [selectedMonth, setSelectedMonth] = useState<string>('todos'); // todos, "0" (Jan), "1" (Feb)...

  // View detail states
  const [selectedTrx, setSelectedTrx] = useState<Transaction | null>(null);
  const [isPrintFriendly, setIsPrintFriendly] = useState(false);

  // Annulment Modal State
  const [annulModalTrx, setAnnulModalTrx] = useState<Transaction | null>(null);
  const [annulReasonPreset, setAnnulReasonPreset] = useState<string>('Error en datos de cliente o facturación');
  const [annulReasonCustom, setAnnulReasonCustom] = useState<string>('');

  const presetAnnulReasons = [
    'Error en datos de cliente o facturación',
    'Devolución total o parcial de mercancía',
    'Error en precios, cantidades o montos',
    'Documento duplicado',
    'Cliente canceló la solicitud / cotización',
    'Modificación o cambio de método de pago',
    'Otro motivo (Escribir detalle)'
  ];

  const isTrxBolivares = selectedTrx
    ? isBolivaresPaymentMethod(selectedTrx.paymentMethod)
    : false;

  // Collection (cobro) states
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<'Dólares Efectivo' | 'Bolívares Pago Móvil' | 'Bolívares Transferencia' | 'Punto de Venta' | 'Zelle' | 'Binance' | 'Zinli' | 'Otro (Divisas)'>('Dólares Efectivo');
  const [collectCustomMethod, setCollectCustomMethod] = useState('');
  const [collectNotes, setCollectNotes] = useState('');

  // Success messages
  const [toastMessage, setToastMessage] = useState('');

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    } else {
      return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
    }
  };

  // Helper lists for selects
  const uniqueYears = useMemo(() => {
    const years = transactions.map(t => new Date(t.timestamp).getFullYear().toString());
    return Array.from(new Set(years)).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const monthsList = [
    { value: '0', label: 'Enero' },
    { value: '1', label: 'Febrero' },
    { value: '2', label: 'Marzo' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Mayo' },
    { value: '5', label: 'Junio' },
    { value: '6', label: 'Julio' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Septiembre' },
    { value: '9', label: 'Octubre' },
    { value: '10', label: 'Noviembre' },
    { value: '11', label: 'Diciembre' }
  ];

  const handleDeleteTransaction = (trx: Transaction) => {
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador pueden eliminar documentos comerciales.");
      return;
    }
    if (confirm(`¿Confirma que desea eliminar permanentemente el documento ${trx.id} (${trx.type.toUpperCase()}) de "${trx.clientName}"? Esta acción removerá el registro de la base de datos y de la nube.`)) {
      setTransactions(prev => prev.filter(t => t.id !== trx.id));
    }
  };

  // Core filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (!t) return false;
      const term = (searchTerm || '').toLowerCase().trim();
      // 1. Text Search
      const matchesSearch = !term ||
        (t.id || '').toLowerCase().includes(term) ||
        (t.clientName || '').toLowerCase().includes(term) ||
        (t.clientRif || '').toLowerCase().includes(term) ||
        (t.createdByName && (t.createdByName || '').toLowerCase().includes(term));

      // 2. Document Type
      const matchesType = selectedType === 'todos' || t.type === selectedType;

      // 3. Status
      const matchesStatus = selectedStatus === 'todos' || t.status === selectedStatus;

      // 4. Payment Method
      const matchesPayment = selectedPayment === 'todos' || t.paymentMethod === selectedPayment;

      // 5. Date & Period Filters
      const tDate = new Date(t.timestamp);
      let matchesPeriod = true;

      if (period === 'hoy') {
        const today = new Date();
        matchesPeriod = 
          tDate.getDate() === today.getDate() &&
          tDate.getMonth() === today.getMonth() &&
          tDate.getFullYear() === today.getFullYear();
      } else if (period === 'semana') {
        const today = new Date();
        const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        firstDayOfWeek.setHours(0, 0, 0, 0);
        matchesPeriod = tDate >= firstDayOfWeek;
      } else if (period === 'mes') {
        const today = new Date();
        matchesPeriod = 
          tDate.getMonth() === today.getMonth() &&
          tDate.getFullYear() === today.getFullYear();
      } else if (period === 'custom') {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0,0,0,0);
          matchesPeriod = matchesPeriod && (tDate >= start);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23,59,59,999);
          matchesPeriod = matchesPeriod && (tDate <= end);
        }
      }

      // 6. Hard Year Select
      let matchesYear = true;
      if (selectedYear !== 'todos') {
        matchesYear = tDate.getFullYear().toString() === selectedYear;
      }

      // 7. Hard Month Select
      let matchesMonth = true;
      if (selectedMonth !== 'todos') {
        matchesMonth = tDate.getMonth().toString() === selectedMonth;
      }

      return matchesSearch && matchesType && matchesStatus && matchesPayment && matchesPeriod && matchesYear && matchesMonth;
    });
  }, [transactions, searchTerm, selectedType, selectedStatus, selectedPayment, period, startDate, endDate, selectedYear, selectedMonth]);

  // Aggregate stats for the currently filtered viewport
  const stats = useMemo(() => {
    // We only calculate monetizable stats for non-quote and non-annulled documents
    const validDocs = filteredTransactions.filter(t => t.type !== 'cotizacion' && t.status !== 'anulado');
    
    const count = filteredTransactions.length;
    const totalUSD = validDocs.reduce((acc, t) => acc + t.totalUSD, 0);
    const totalVES = validDocs.reduce((acc, t) => acc + t.totalVES, 0);
    const totalIVA_USD = validDocs.reduce((acc, t) => acc + t.ivaUSD, 0);
    const totalIGTF_USD = validDocs.reduce((acc, t) => acc + t.igtfUSD, 0);

    const facturasCount = filteredTransactions.filter(t => t.type === 'factura').length;
    const cotizacionesCount = filteredTransactions.filter(t => t.type === 'cotizacion').length;
    const recibosCount = filteredTransactions.filter(t => t.type === 'recibo').length;
    const consignacionesCount = filteredTransactions.filter(t => t.type === 'consignacion').length;

    return {
      count,
      totalUSD,
      totalVES,
      totalIVA_USD,
      totalIGTF_USD,
      facturasCount,
      cotizacionesCount,
      recibosCount,
      consignacionesCount
    };
  }, [filteredTransactions]);

  // CSV Generator Downloader
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert('⚠️ No hay datos filtrados para descargar.');
      return;
    }

    const headers = [
      'ID Documento',
      'Tipo de Documento',
      'Razon Social / Cliente',
      'RIF u Documento',
      'Telefono',
      'Email',
      'Fecha',
      'Monto Subtotal (USD)',
      'Porcentaje IVA (%)',
      'Monto IVA (USD)',
      'Monto IGTF (USD)',
      'Monto Total (USD)',
      'Monto Total (VES)',
      'Tasa de Cambio (VES/$)',
      'Metodo de Pago',
      'Estado',
      'Emitido por'
    ];

    const escapeCSV = (str: string) => {
      if (!str) return '';
      return '"' + str.replace(/"/g, '""').replace(/\n/g, ' ') + '"';
    };

    const rows = filteredTransactions.map(t => [
      t.id,
      t.type.toUpperCase(),
      escapeCSV(t.clientName),
      t.clientRif,
      t.clientPhone || 'N/A',
      t.type === 'factura' ? (t.clientEmail || 'N/A') : 'N/A',
      formatDateDDMMAAAA(t.timestamp) + ' ' + new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      t.subtotalUSD.toFixed(2),
      t.ivaPercent.toString(),
      t.ivaUSD.toFixed(2),
      t.igtfUSD.toFixed(2),
      t.totalUSD.toFixed(2),
      t.totalVES.toFixed(2),
      t.exchangeRateUsed.toFixed(4),
      escapeCSV(t.paymentMethod),
      t.status.toUpperCase(),
      escapeCSV(t.createdByName)
    ]);

    // Construct CSV String
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    // Add Byte Order Mark for Spanish Excel compatibility
    const universalBOM = '\uFEFF';
    const blob = new Blob([universalBOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const d = new Date();
    const dateFormatted = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `CIMA_Historico_Reporte_${dateFormatted}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Void/Anul transaction callback
  const openAnnulModal = (trx: Transaction) => {
    setAnnulModalTrx(trx);
    setAnnulReasonPreset('Error en datos de cliente o facturación');
    setAnnulReasonCustom('');
  };

  const handleConfirmAnnulment = () => {
    if (!annulModalTrx) return;

    let finalReason = annulReasonPreset;
    if (annulReasonPreset === 'Otro motivo (Escribir detalle)') {
      if (!annulReasonCustom.trim()) {
        alert('Por favor especifique la nota o motivo por el cual se anula el documento.');
        return;
      }
      finalReason = annulReasonCustom.trim();
    } else if (annulReasonCustom.trim()) {
      finalReason = `${annulReasonPreset} - ${annulReasonCustom.trim()}`;
    }

    const cancelledAt = new Date().toISOString();
    const cancelledByName = currentUser.nombreCompleto || currentUser.username;
    const cancelledById = currentUser.id;

    const updatedTrx: Transaction = {
      ...annulModalTrx,
      status: 'anulado',
      cancellationReason: finalReason,
      cancelledAt,
      cancelledByName,
      cancelledById
    };

    const updatedList = transactions.map(t => t.id === annulModalTrx.id ? updatedTrx : t);
    setTransactions(updatedList);
    localStorage.setItem('siga_transactions', JSON.stringify(updatedList));

    // Sync to Firestore in real-time
    syncSingleDoc('transactions', annulModalTrx.id, updatedTrx).catch(err => console.error(err));

    setToastMessage(`⛔ El documento ${annulModalTrx.id} ha sido ANULADO exitosamente.`);
    setTimeout(() => setToastMessage(''), 4000);

    if (selectedTrx && selectedTrx.id === annulModalTrx.id) {
      setSelectedTrx(updatedTrx);
    }

    setAnnulModalTrx(null);
  };

  // Switch status (e.g. from Pendiente to Completado for consignments or payments)
  const handleToggleStatus = (
    trxId: string, 
    current: 'completado'|'pendiente'|'anulado',
    paymentMethodUsed?: string,
    notesText?: string
  ) => {
    const nextStatus = current === 'pendiente' ? 'completado' : 'pendiente';
    const updated = transactions.map(t => {
      if (t.id === trxId) {
        const extraNotes = notesText ? ` | Nota de cobro: ${notesText}` : '';
        return { 
          ...t, 
          status: nextStatus as 'completado' | 'pendiente' | 'anulado',
          paymentMethod: paymentMethodUsed ? paymentMethodUsed : (nextStatus === 'completado' && t.paymentMethod === 'Consignación Abierta' ? 'Dólares Efectivo' : t.paymentMethod),
          additionalNotes: t.additionalNotes ? `${t.additionalNotes}${extraNotes}` : (notesText || undefined)
        };
      }
      return t;
    });
    setTransactions(updated);
    setToastMessage(`Estado del documento ${trxId} actualizado.`);
    setTimeout(() => setToastMessage(''), 3550);
    if (selectedTrx && selectedTrx.id === trxId) {
      const extraNotes = notesText ? ` | Nota de cobro: ${notesText}` : '';
      setSelectedTrx({ 
        ...selectedTrx, 
        status: nextStatus,
        paymentMethod: paymentMethodUsed ? paymentMethodUsed : (nextStatus === 'completado' && selectedTrx.paymentMethod === 'Consignación Abierta' ? 'Dólares Efectivo' : selectedTrx.paymentMethod),
        additionalNotes: selectedTrx.additionalNotes ? `${selectedTrx.additionalNotes}${extraNotes}` : (notesText || undefined)
      });
    }
  };

  // Multi-selection handlers
  const handleToggleSelectTrx = (id: string) => {
    setSelectedTrxIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFilteredTrx = () => {
    if (selectedTrxIds.length === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedTrxIds([]);
    } else {
      setSelectedTrxIds(filteredTransactions.map(t => t.id));
    }
  };

  const handleExportSelectedCSV = () => {
    const selectedList = transactions.filter(t => selectedTrxIds.includes(t.id));
    if (selectedList.length === 0) return;

    const headers = ["ID Documento", "Tipo", "Fecha (dd/mm/aaaa)", "Hora", "Cliente", "RIF", "Estado", "Total USD ($)", "Tasa BCV (Bs.)", "Total Bs.", "Metodo de Pago", "Vendedor"];
    const rows = selectedList.map(t => {
      const datePart = formatDateDDMMAAAA(t.timestamp);
      const timePart = new Date(t.timestamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      return [
        `"${t.id}"`,
        `"${t.type.toUpperCase()}"`,
        `"${datePart}"`,
        `"${timePart}"`,
        `"${t.clientName.replace(/"/g, '""')}"`,
        `"${t.clientRif || ''}"`,
        `"${t.status.toUpperCase()}"`,
        t.totalUSD.toFixed(2),
        t.exchangeRateUsed.toFixed(2),
        t.totalVES.toFixed(2),
        `"${t.paymentMethod}"`,
        `"${t.createdByName || ''}"`
      ];
    });

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Documentos_Seleccionados_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage(`📥 Exportados ${selectedList.length} documentos a CSV exitosamente.`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Reset all filters in one click
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedType('todos');
    setSelectedStatus('todos');
    setSelectedPayment('todos');
    setPeriod('todos');
    setStartDate('');
    setEndDate('');
    setSelectedYear('todos');
    setSelectedMonth('todos');
  };

  return (
    <div className="p-6 space-y-6">
      {/* HEADER ROW */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-orange-400 uppercase tracking-widest block font-bold">MÓDULO DE HISTÓRICO FISCAL</span>
          <h2 className="text-xl font-bold font-mono tracking-wider text-white mt-1">Historial General de Transmisiones Comerciales</h2>
          <p className="text-xs text-zinc-400 mt-1 select-none">
            Consulte de forma interactiva y decodifique todas las Facturas, Cotizaciones, Recibos y Consignaciones emitidas. Descargue auditorías por períodos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {currentUser.role === 'Administrador' && (
            <button
              onClick={() => setShowResetModal(true)}
              className="px-3.5 py-2 bg-red-950/20 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-red-900/40 rounded font-mono font-bold text-xs select-none transition flex items-center gap-1.5 shadow-sm uppercase tracking-wider cursor-pointer"
              title="Restablecer el histórico de transacciones a 0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" /> Poner a 0
            </button>
          )}

          <button
            onClick={() => setShowImportExport(!showImportExport)}
            className={`px-4 py-2 border rounded font-mono font-bold text-xs select-none transition flex items-center gap-1.5 shadow-sm uppercase tracking-wider ${
              showImportExport
                ? 'bg-orange-950/40 border-orange-550 text-orange-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-orange-400" /> Respaldo / Cargar
          </button>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-800 text-xs font-semibold rounded select-none transition flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider shadow-sm"
          >
            <Download className="w-4 h-4" /> Exportar Filtro a CSV
          </button>
        </div>
      </div>

      {/* Permanent Records Audit Notice */}
      <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/30 rounded-lg flex items-center gap-3 text-xs font-mono text-emerald-300">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <p className="leading-relaxed">
          <strong className="text-white font-bold">Control y Preservación Permanente:</strong> Todas las facturas, cotizaciones, recibos y notas generadas se almacenan de manera segura e inalterable en este historial comercial. Ningún registro se borra para garantizar el control contable y la trazabilidad de operaciones.
        </p>
      </div>

      {/* Import / Export / Backup Panel for Historico transactions */}
      {showImportExport && (
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-lg space-y-5 shadow-xl animate-slide-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider font-mono text-orange-455 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-orange-400" /> Respaldo & Restauración de Historial Comercial
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Permite realizar respaldos totales en JSON o importar transacciones externas en formato CSV.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowImportExport(false)}
              className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-mono">
            {/* Left Column: Drag & Drop upload */}
            <div className="space-y-3.5">
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold block">📥 Cargar Historial / Restaurar</span>
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                  dragActive
                    ? 'border-orange-500 bg-orange-950/10'
                    : 'border-zinc-900 bg-black hover:border-zinc-800'
                }`}
                onClick={() => document.getElementById('historico-file-picker')?.click()}
              >
                <Upload className="w-8 h-8 text-orange-400 mb-2" />
                <p className="text-xs text-zinc-300 font-medium">Arrastra tu archivo JSON o CSV aquí</p>
                <p className="text-[10px] text-zinc-505 font-mono mt-1">o haz clic para explorar en tu equipo</p>
                <input
                  id="historico-file-picker"
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px bg-zinc-900 flex-1"></div>
                <span className="text-[10px] text-zinc-650 font-mono uppercase text-zinc-500">o copia texto en formato raw</span>
                <div className="h-px bg-zinc-900 flex-1"></div>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={3}
                  placeholder="ID_Documento,Cliente,Rif,MontoTotal,Tipo_Documento,Metodo_Pago"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full p-2.5 bg-black border border-zinc-900 rounded text-[11px] text-zinc-300 font-mono placeholder-zinc-700 focus:outline-none"
                />
                <div className="flex justify-end">
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
                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition select-none tracking-wider ${
                      importText.trim()
                        ? 'bg-orange-600 text-black hover:bg-orange-500 active:scale-95 cursor-pointer'
                        : 'bg-zinc-900 border border-zinc-850 text-zinc-600 cursor-not-allowed'
                    }`}
                  >
                    Restaurar Datos
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Instructions and JSON Backups */}
            <div className="space-y-4 bg-black p-4 border border-zinc-900 rounded flex flex-col justify-between">
              <div className="space-y-1.5 text-xs text-zinc-350">
                <span className="text-[10px] text-orange-400 uppercase tracking-widest font-mono font-bold block">💡 Columnas CSV para Historial</span>
                <p className="text-[11px] text-zinc-400 leading-normal">
                  Para importar transacciones mediante CSV, asegúrate de incluir en la primera fila cabeceras descriptivas:
                </p>
                <ul className="list-disc list-inside text-[10.5px] text-zinc-400 pl-1 space-y-1">
                  <li><strong>ID Documento:</strong> <code className="text-orange-450 bg-zinc-950 px-1 py-0.5 rounded">id, documento, factura</code> (Ej: FAC-4929)</li>
                  <li><strong>Cliente/Razon:</strong> <code className="text-orange-455 bg-zinc-950 px-1 py-0.5 rounded">razon, cliente, name</code></li>
                  <li><strong>RIF / ID Fiscal:</strong> <code className="text-orange-455 bg-zinc-950 px-1 py-0.5 rounded">rif, dni, client_rif</code></li>
                  <li><strong>Monto Total:</strong> <code className="text-orange-455 bg-zinc-950 px-1 py-0.5 rounded">total, monto, totalusd</code></li>
                </ul>
                <p className="text-[10.5px] text-zinc-500 italic mt-1">
                  * Nota: El formato JSON es preferible ya que respalda y restaura el desglose exacto de los productos facturados por completo.
                </p>
              </div>

              <div className="pt-3 border-t border-zinc-900 flex flex-col gap-2">
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold block">📥 Exportar Base Completa</span>
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="py-2.5 px-3 bg-zinc-900 border border-zinc-800 hover:border-orange-500 hover:bg-zinc-950 rounded text-xs text-zinc-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer font-bold"
                >
                  <Download className="w-3.5 h-3.5 text-orange-400" /> Exportar Respaldo Histórico Completo (JSON)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST SYSTEM SUCCESS */}
      {toastMessage && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded text-xs font-mono flex items-center gap-2 animate-pulse">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SEGMENT STATE QUICK CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Segmento Registros</span>
          <span className="text-[22px] font-black tracking-tight text-white block mt-1">
            {stats.count}
          </span>
          <span className="text-[9.5px] text-zinc-550 block mt-0.5">documentos comerciales</span>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Total Transado ($ Netos)</span>
          <span className="text-[22px] font-black tracking-tight text-orange-400 block mt-1">
            {formatCurrency(stats.totalUSD, 'USD')}
          </span>
          <span className="text-[9.5px] text-zinc-550 block mt-0.5">excluyendo cotizaciones y anulados</span>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Total en Cuentas (Bolívares)</span>
          <span className="text-[15px] font-extrabold tracking-tight text-zinc-200 block mt-2 truncate">
            {formatCurrency(stats.totalVES, 'VES')}
          </span>
          <span className="text-[9px] text-zinc-550 block mt-1">con base a tasas de emisión</span>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block font-mono">Proporción por Tipos</span>
          <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono text-zinc-350 mt-1.5">
            <div>📄 Facs: <span className="font-bold text-white">{stats.facturasCount}</span></div>
            <div>📋 Cotz: <span className="font-bold text-white">{stats.cotizacionesCount}</span></div>
            <div>🧾 Reci: <span className="font-bold text-white">{stats.recibosCount}</span></div>
            <div>📦 Cons: <span className="font-bold text-white">{stats.consignacionesCount}</span></div>
          </div>
        </div>
      </div>

      {/* FILTER BAR PANEL CONTROLS */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
          <h3 className="text-xs font-bold text-zinc-300 font-mono uppercase flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-orange-400" /> Filtros Avanzados y de Calendario Fiscal
          </h3>
          <button 
            type="button"
            onClick={handleResetFilters}
            className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-500 hover:text-orange-400 transition"
          >
            Refrescar / Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          {/* SEARCH INPUT */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Buscar Coincidencia</label>
            <div className="relative">
              <input
                type="text"
                placeholder="ID, Nombre Cliente, RIF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black border border-zinc-900 rounded py-1.5 pl-8 pr-3 text-white placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs"
              />
              <Search className="w-3.5 h-3.5 text-zinc-550 absolute left-2.5 top-2" />
            </div>
          </div>

          {/* DOCUMENT TYPE SELECT */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Tipo de Documento</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1.5 px-2.5 text-zinc-300 focus:outline-none focus:border-orange-500 text-xs"
            >
              <option value="todos">Todos los Documentos</option>
              <option value="factura">📄 Facturas Oficiales</option>
              <option value="cotizacion">📋 Cotizaciones / Presupuestos</option>
              <option value="recibo">🧾 Recibos de Caja</option>
              <option value="consignacion">📦 Notas de Consignación</option>
            </select>
          </div>

          {/* DATE RANGE PERIOD QUICK */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Periodo de Emisión</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1.5 px-2.5 text-zinc-300 focus:outline-none focus:border-orange-500 text-xs"
            >
              <option value="todos">Cualquier Fecha</option>
              <option value="hoy">Hoy (Día Actual)</option>
              <option value="semana">Esta Semana (7 días)</option>
              <option value="mes">Este Mes Comercial</option>
              <option value="custom">📅 Rangos Personalizados</option>
            </select>
          </div>

          {/* STATUS SELECTOR */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Garantía / Estado</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1.5 px-2.5 text-zinc-300 focus:outline-none focus:border-orange-500 text-xs"
            >
              <option value="todos">Todos los Estados</option>
              <option value="completado">🟢 Completado / Despachado</option>
              <option value="pendiente">⏳ Pendiente / En Tránsito</option>
              <option value="anulado">🔴 Anulado / Cancelado</option>
            </select>
          </div>
        </div>

        {/* YEAR/MONTH SELECT ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1 text-xs font-mono">
          {/* HARD YEAR */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Filtrar por Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1.5 px-2.5 text-zinc-350 focus:outline-none focus:border-orange-500 text-xs"
            >
              <option value="todos">Cualquier Año</option>
              {uniqueYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* HARD MONTH */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Filtrar por Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1.5 px-2.5 text-zinc-350 focus:outline-none focus:border-orange-500 text-xs"
            >
              <option value="todos">Cualquier Mes</option>
              {monthsList.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* CONDITIONAL START DATE */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
              Rango Desde {period !== 'custom' && <span className="text-zinc-650 italic">(Requiere 'Rango')</span>}
            </label>
            <input
              type="date"
              disabled={period !== 'custom'}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1 px-2 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs disabled:opacity-40"
            />
          </div>

          {/* CONDITIONAL END DATE */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">
              Rango Hasta {period !== 'custom' && <span className="text-zinc-650 italic">(Requiere 'Rango')</span>}
            </label>
            <input
              type="date"
              disabled={period !== 'custom'}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-black border border-zinc-900 rounded py-1 px-2 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {selectedTrxIds.length > 0 && (
        <div className="p-3 bg-indigo-950/40 border border-indigo-500/40 rounded-lg flex flex-wrap items-center justify-between gap-3 font-mono animate-fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
            <span className="text-xs font-bold text-indigo-200">
              {selectedTrxIds.length} {selectedTrxIds.length === 1 ? 'documento seleccionado' : 'documentos seleccionados'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedTrxIds([])}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-xs font-medium transition cursor-pointer"
            >
              Deseleccionar
            </button>
            <button
              type="button"
              onClick={handleExportSelectedCSV}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Seleccionados ({selectedTrxIds.length})
            </button>
          </div>
        </div>
      )}

      {/* RENDER TABLE OF HISTORY */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden shadow">
        <div className="px-4 py-3 bg-black border-b border-zinc-900 flex justify-between items-center">
          <h4 className="text-[10px] font-extrabold font-mono text-zinc-450 uppercase tracking-widest">
            Ficha de Registros Coincidentes ({filteredTransactions.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono">
            <thead>
              <tr className="bg-black border-b border-zinc-900 text-zinc-400 text-[10px] uppercase tracking-wider select-none">
                <th className="p-3.5 pl-4 font-bold">
                  {currentUser.role === 'Administrador' && (
                    <button
                      type="button"
                      onClick={handleSelectAllFilteredTrx}
                      className="mr-2 text-zinc-400 hover:text-orange-400 transition align-middle inline-block"
                      title={selectedTrxIds.length === filteredTransactions.length && filteredTransactions.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
                    >
                      {selectedTrxIds.length === filteredTransactions.length && filteredTransactions.length > 0 ? (
                        <CheckSquare className="w-3.5 h-3.5 text-orange-400 inline" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-zinc-600 inline" />
                      )}
                    </button>
                  )}
                  Código / ID
                </th>
                <th className="p-3.5 font-bold">Tipo</th>
                <th className="p-3.5 font-bold">Fecha Emisión</th>
                <th className="p-3.5 font-bold">Cliente u Organismo</th>
                <th className="p-3.5 font-bold">Monto Total USD</th>
                <th className="p-3.5 font-bold">Monto Total VES</th>
                <th className="p-3.5 font-bold">Estado</th>
                <th className="p-3.5 text-right pr-4 font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-xs">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map(t => {
                  let badgeColor = "bg-orange-500/10 text-orange-400 border-orange-500/20";
                  let typeLabel = "Factura";
                  if (t.type === 'cotizacion') {
                    badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                    typeLabel = "Cotización";
                  } else if (t.type === 'recibo') {
                    badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    typeLabel = "Recibo";
                  } else if (t.type === 'consignacion') {
                    badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                    typeLabel = "Consignación";
                  }

                  let statusBadge = "bg-orange-500/10 text-orange-400 border-orange-500/30";
                  if (t.status === 'completado') {
                    statusBadge = "bg-green-500/10 text-emerald-400 border-green-500/20";
                  } else if (t.status === 'anulado') {
                    statusBadge = "!bg-transparent !text-red-500 !border-red-500 font-bold";
                  }

                  const isSelected = selectedTrxIds.includes(t.id);

                  return (
                    <tr key={t.id} className={`hover:bg-zinc-900/35 transition-colors ${isSelected ? 'bg-red-950/15' : ''}`}>
                      <td className="p-3.5 pl-4 font-extrabold text-white">
                        {currentUser.role === 'Administrador' && (
                          <button
                            type="button"
                            onClick={() => handleToggleSelectTrx(t.id)}
                            className="mr-2 text-zinc-400 hover:text-orange-400 transition align-middle inline-block"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-orange-400 inline" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-zinc-600 inline" />
                            )}
                          </button>
                        )}
                        {t.id}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 border text-[9px] rounded font-extrabold uppercase ${badgeColor}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="p-3.5 text-zinc-400 text-[11px] whitespace-nowrap">
                        {formatDateDDMMAAAA(t.timestamp)} {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3.5 font-semibold text-zinc-200">
                        <div>{t.clientName}</div>
                        <div className="text-[10px] text-zinc-500 font-normal">{t.clientRif}</div>
                      </td>
                      <td className="p-3.5 font-bold text-white whitespace-nowrap">
                        {formatCurrency(t.totalUSD, 'USD')}
                      </td>
                      <td className="p-3.5 text-zinc-300 font-bold whitespace-nowrap">
                        {t.paymentMethod === 'Bolívares Pago Móvil' || t.paymentMethod === 'Bolívares Transferencia' || t.paymentMethod === 'Punto de Venta'
                          ? formatCurrency(t.totalVES, 'VES')
                          : '-'
                        }
                      </td>
                      <td className="p-3.5">
                        <span 
                          className={`px-2 py-0.5 border text-[9.5px] rounded-full font-bold uppercase ${statusBadge}`}
                          style={(t.status || '').toLowerCase() === 'anulado' ? { backgroundColor: 'transparent', borderColor: '#ef4444', color: '#ef4444' } : undefined}
                        >
                          {t.type === 'consignacion' 
                            ? (t.status === 'pendiente' ? 'Por Cobrar 🚚' : t.status === 'completado' ? 'Cobrado ✅' : 'Anulado ⛔')
                            : (t.status === 'pendiente' ? 'Pendiente ⏳' : t.status === 'completado' ? 'Completado ✓' : 'Anulado ⛔')}
                        </span>
                        {t.status === 'anulado' && t.cancellationReason && (
                          <div className="text-[10px] text-red-400 font-sans font-semibold flex items-center gap-1 mt-1 max-w-[200px] truncate" title={`Anulado: ${t.cancellationReason}`}>
                            <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                            <span className="truncate">{t.cancellationReason}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right pr-4 space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedTrx(t);
                            setIsPrintFriendly(false);
                          }}
                          className="px-2 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded font-bold text-[10px] text-zinc-300 hover:text-white transition uppercase inline-flex items-center gap-1"
                          title="Inspeccionar factura con detalle fiscal"
                        >
                          <Eye className="w-3 h-3" /> <span>Detalle</span>
                        </button>

                        <button
                          onClick={() => {
                            try {
                              downloadTransactionPDF(t, companySettings);
                            } catch (error) {
                              console.error("Error generating PDF:", error);
                              alert("Ocurrió un error al generar el archivo PDF.");
                            }
                          }}
                          className="px-2 py-1 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-900/40 rounded font-bold text-[10px] text-amber-400 hover:text-amber-300 transition uppercase inline-flex items-center gap-1"
                          title="Descargar PDF de este documento"
                        >
                          <Download className="w-3 h-3" /> <span>PDF</span>
                        </button>

                        {t.status === 'pendiente' && (
                          t.type === 'consignacion' ? (
                            <button
                              onClick={() => {
                                setSelectedTrx(t);
                                setIsPrintFriendly(false);
                              }}
                              className="px-2 py-1 bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 hover:text-emerald-100 rounded font-black text-[10px] transition uppercase animate-pulse"
                              title="Registrar cobro/pago de esta consignación"
                            >
                              💵 Cobrar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(t.id, 'pendiente')}
                              className="px-2 py-1 bg-emerald-950/20 hover:bg-emerald-900/25 border border-emerald-900/30 text-emerald-400 rounded font-black text-[10px] transition uppercase"
                              title="Cambiar estatus a Completado / Despachado"
                            >
                              Liberar
                            </button>
                          )
                        )}

                        {t.status !== 'anulado' && (
                          <button
                            onClick={() => openAnnulModal(t)}
                            className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/35 border border-red-900/40 text-red-400 hover:text-red-300 rounded font-bold text-[10px] transition uppercase inline-flex items-center gap-1"
                            title="Anular documento comercial y registrar motivo"
                          >
                            <Ban className="w-3.5 h-3.5 inline-block" />
                            <span>Anular</span>
                          </button>
                        )}

                        {currentUser.role === 'Administrador' && (
                          <button
                            onClick={() => handleDeleteTransaction(t)}
                            className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/40 border border-red-900/40 text-red-400 hover:text-red-300 rounded font-bold text-[10px] transition uppercase inline-flex items-center gap-1 cursor-pointer"
                            title="Eliminar documento comercial (Solo Administrador)"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline-block" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-12 text-center font-mono">
                    <div className="flex flex-col items-center justify-center space-y-2.5 max-w-md mx-auto text-zinc-400">
                      <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-orange-400">
                        <History className="w-6 h-6 opacity-80" />
                      </div>
                      <p className="font-bold text-sm text-zinc-200">
                        {transactions.length === 0 ? "Histórico Comercial en 0" : "Sin resultados para el filtro"}
                      </p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {transactions.length === 0 
                          ? "El sistema no tiene documentos registrados. Puede comenzar a emitir Facturas, Cotizaciones, Recibos o Consignaciones desde el Módulo de Facturación."
                          : "No se encontraron documentos comerciales que coincidan con los criterios de búsqueda o período seleccionado."
                        }
                      </p>
                      {transactions.length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[11px] rounded font-bold transition cursor-pointer"
                        >
                          Limpiar Filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECTOR DETAIL MODAL */}
      {selectedTrx && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-850 rounded-lg w-full max-w-xl my-8 overflow-hidden shadow-2xl animate-scale-up text-xs font-mono">
            {/* Header toolbar */}
            <div className="p-4 bg-black border-b border-zinc-900 flex justify-between items-center no-print">
              <h3 className="text-xs font-extrabold uppercase text-orange-400 flex items-center gap-1.5 leading-none">
                <FileText className="w-4 h-4" /> Visor de Documento Fiscal {selectedTrx.id}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrintFriendly(!isPrintFriendly)}
                  className={`px-3 py-1 text-[10px] font-bold rounded uppercase transition flex items-center gap-1 ${
                    isPrintFriendly 
                      ? 'bg-orange-600 text-black' 
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                  title="Activar vista apta para ticket de impresora térmica o factura escolar"
                >
                  <Printer className="w-3.5 h-3.5" /> {isPrintFriendly ? 'Vista Completa' : 'Formato Ticket'}
                </button>
                <button 
                  onClick={() => setSelectedTrx(null)}
                  className="text-zinc-500 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document visualizer layout container */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]" id="printable-receipt-card">
              {isPrintFriendly ? (
                /* THERMAL TICKET VIEW MOCKUP */
                <div className="bg-white text-black p-4 rounded border-2 border-dashed border-zinc-300 font-mono text-[11px] leading-tight max-w-xs mx-auto space-y-3.5 select-all">
                  <div className="text-center space-y-1">
                    <p className="font-extrabold text-sm uppercase">{companySettings.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A."}</p>
                    <p>RIF: {companySettings.rif || "J-50375018-9"}</p>
                    <p className="text-[10px]">{companySettings.address || "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080"}</p>
                    <p className="text-[10px]">Tlf: {companySettings.phone || "0412 9862939 / 0212-9876543"}</p>
                    <div className="font-bold uppercase text-[11px] pt-1 text-zinc-900 border-t border-dashed border-zinc-300 mt-1">
                      {selectedTrx.type === 'factura' ? 'FACTURA FISCAL DE VENTA' : selectedTrx.type === 'cotizacion' ? 'COTIZACIÓN FORMAL' : selectedTrx.type === 'recibo' ? 'RECIBO DE PAGO DE CAJA' : 'NOTA DE ENTREGA EN CONSIGNACIÓN'}
                    </div>
                  </div>

                  <div className="border-t border-b border-dashed border-zinc-400 py-1.5 space-y-1">
                    <p className="font-bold flex justify-between">
                      <span>DOC: {selectedTrx.id}</span>
                      <span>({selectedTrx.type.toUpperCase()})</span>
                    </p>
                    <p>FECHA: {formatDateDDMMAAAA(selectedTrx.timestamp)} {new Date(selectedTrx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <p>CLIENTE: {selectedTrx.clientName}</p>
                    <p>RIF/CI: {selectedTrx.clientRif}</p>
                    {selectedTrx.clientPhone && <p>TLF: {selectedTrx.clientPhone}</p>}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between font-bold border-b border-zinc-250 pb-0.5 mb-1 text-[10px]">
                      <span>DESCRIPCIÓN / PRODUCTO ({isTrxBolivares ? 'Bs.' : '$'})</span>
                      <span>TOTAL ({isTrxBolivares ? 'Bs.' : '$'})</span>
                    </div>
                    {selectedTrx.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-2">
                        <div>
                          <span>[{isTrxBolivares ? 'Bs.' : '$'}] {it.name}</span>
                          <span className="block text-[10px] text-zinc-600">
                            ({it.qty} x {isTrxBolivares ? formatCurrency(it.priceUSD * selectedTrx.exchangeRateUsed, 'VES') : formatCurrency(it.priceUSD, 'USD')})
                          </span>
                        </div>
                        <span className="font-bold shrink-0">
                          {isTrxBolivares ? formatCurrency(it.totalVES, 'VES') : formatCurrency(it.totalUSD, 'USD')}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-zinc-400 pt-2 space-y-1 text-right">
                    <div className="flex justify-between">
                      <span>SUBTOTAL:</span>
                      <span>{formatCurrency(selectedTrx.subtotalUSD, 'USD')}</span>
                    </div>
                    {selectedTrx.ivaUSD > 0 && (
                      <div className="flex justify-between">
                        <span>IVA ({selectedTrx.ivaPercent}%):</span>
                        <span>{formatCurrency(selectedTrx.ivaUSD, 'USD')}</span>
                      </div>
                    )}
                    {selectedTrx.igtfUSD > 0 && (
                      <div className="flex justify-between text-[10px]">
                        <span>I.G.T.F. (3%):</span>
                        <span>{formatCurrency(selectedTrx.igtfUSD, 'USD')}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black border-t border-zinc-400 pt-1 text-[13px]">
                      <span>TOTAL USD:</span>
                      <span>{formatCurrency(selectedTrx.totalUSD, 'USD')}</span>
                    </div>
                    {isTrxBolivares && (
                      <>
                        <div className="flex justify-between font-bold text-zinc-750">
                          <span>TOTAL VES:</span>
                          <span>{formatCurrency(selectedTrx.totalVES, 'VES')}</span>
                        </div>
                        <p className="text-[9.5px] italic text-left pt-1.5 text-zinc-700">Tasa de Cambio Oficial BCV: 1 $ = {formatCurrency(selectedTrx.exchangeRateUsed, 'VES')}</p>
                      </>
                    )}
                  </div>

                  <div className="border-t border-dashed border-zinc-400 pt-2 text-center text-[10px] space-y-1">
                    {selectedTrx.status === 'anulado' && (
                      <div className="border-2 border-red-600 bg-red-50 p-2 text-center text-red-700 space-y-0.5 my-2 font-mono">
                        <p className="font-black text-xs uppercase">*** DOCUMENTO ANULADO ***</p>
                        <p className="text-[10px] font-bold">MOTIVO: {selectedTrx.cancellationReason || 'ANULADO'}</p>
                        {selectedTrx.cancelledByName && (
                          <p className="text-[9px] text-red-600">POR: {selectedTrx.cancelledByName}</p>
                        )}
                      </div>
                    )}
                    <p>Método de Pago: {selectedTrx.paymentMethod}</p>
                    <p className="text-zinc-100 font-semibold"><span className="text-amber-500 font-bold">Vendedor:</span> {selectedTrx.createdByName}</p>
                    <p className="font-bold tracking-widest pt-1">*** GRACIAS POR SU COMPRA ***</p>
                    <p className="text-[8px] text-zinc-500">CIMA Offline Sync Security Sentinel</p>
                  </div>
                </div>
              ) : (
                /* DETAILED ENTERPRISE VIEW MODE */
                <div className="space-y-6">
                  {/* Alert banner if document was annulled */}
                  {selectedTrx.status === 'anulado' && (
                    <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-4 space-y-2 font-mono shadow-inner">
                      <div className="flex items-center gap-2 text-red-400 font-extrabold text-xs uppercase tracking-wider">
                        <Ban className="w-4 h-4 text-red-500 shrink-0" />
                        <span>DOCUMENTO COMERCIAL ANULADO</span>
                      </div>
                      <p className="text-zinc-200 text-xs">
                        <strong className="text-red-300">Motivo / Nota de Anulación:</strong>{' '}
                        <span className="text-white font-medium">{selectedTrx.cancellationReason || 'No especificado'}</span>
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-zinc-400 pt-2 border-t border-red-900/50">
                        <div><strong>Anulado por:</strong> {selectedTrx.cancelledByName || 'Usuario del sistema'}</div>
                        {selectedTrx.cancelledAt && (
                          <div><strong>Fecha y Hora:</strong> {formatDateDDMMAAAA(selectedTrx.cancelledAt)} {new Date(selectedTrx.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Company and header details */}
                  {selectedTrx.type !== 'factura' ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-4 border-b border-zinc-900 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-orange-500 text-zinc-950 rounded-xl flex items-center justify-center font-black tracking-tighter text-sm shrink-0 shadow-md shadow-orange-500/20">
                          CIMA
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-base font-extrabold text-white uppercase">{companySettings.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A."}</h4>
                          <p className="text-zinc-400 text-[10.5px] font-mono">RIF: {companySettings.rif || "J-50375018-9"} • Tlf: {companySettings.phone || "0412 9862939 / 0212-9876543"}</p>
                          <p className="text-zinc-500 text-[10.5px] max-w-md">{companySettings.address || "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080"}</p>
                        </div>
                      </div>

                      <div className="bg-black border border-zinc-900 p-3 rounded-xl text-right space-y-1 shrink-0">
                        <span className="text-[10px] text-orange-400 font-extrabold uppercase tracking-widest block font-mono">CONTROL DIGITAL</span>
                        <p className="text-lg font-black text-white font-mono">{selectedTrx.id}</p>
                        <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-bold rounded uppercase tracking-wide block font-mono">
                          {selectedTrx.type === 'cotizacion' ? 'COTIZACIÓN FORMAL' : selectedTrx.type === 'recibo' ? 'RECIBO DE PAGO DE CAJA' : 'NOTA DE ENTREGA EN CONSIGNACIÓN'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center border-b border-zinc-900 pb-3 print:pt-14 print:border-none">
                      <span className="text-[10px] font-mono text-amber-400/80 uppercase tracking-widest px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 inline-block no-print">
                        📄 Factura Fiscal (Formato para hoja membretada preimpresa)
                      </span>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 font-mono">Control: </span>
                        <span className="text-xs font-mono font-bold text-white">{selectedTrx.id}</span>
                      </div>
                    </div>
                  )}

                  {/* Customer, date and cashier */}
                  <div className="grid grid-cols-2 gap-4 bg-black p-4 rounded border border-zinc-900">
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-black">Cliente / Razón Social</p>
                      <p className="font-bold text-white text-xs">{selectedTrx.clientName}</p>
                      <p className="text-[11px] text-zinc-400">RIF: {selectedTrx.clientRif}</p>
                      {selectedTrx.clientPhone && <p className="text-[11px] text-zinc-400">Tlf: {selectedTrx.clientPhone}</p>}
                      {selectedTrx.type === 'factura' && selectedTrx.clientEmail && (
                        <p className="text-[11px] text-zinc-450 truncate">Email: {selectedTrx.clientEmail}</p>
                      )}
                    </div>

                    <div className="space-y-1 text-right">
                      <p className="text-[10px] text-zinc-500 uppercase font-black">Información de Emisión</p>
                      <p className="text-zinc-300 font-semibold">{formatDateDDMMAAAA(selectedTrx.timestamp)} {new Date(selectedTrx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[11px] text-zinc-400"><span className="text-amber-500 font-bold">Vendedor:</span> <span className="font-semibold text-white">{selectedTrx.createdByName}</span></p>
                      {isTrxBolivares && (
                        <p className="text-[11.5px] text-orange-400 font-bold block mt-1">Tasa Oficial Ref: 1$ = {formatCurrency(selectedTrx.exchangeRateUsed, 'VES')}</p>
                      )}
                    </div>
                  </div>

                  {/* Items catalog breakdown */}
                  <div className="space-y-2">
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Breakdown de Ítems Vinculados</p>
                    <div className="border border-zinc-900 rounded overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-black text-[9.5px] text-zinc-400 uppercase tracking-wider select-none">
                            <th className="p-2.5">Descripción / Producto ({isTrxBolivares ? 'Bs.' : '$'})</th>
                            <th className="p-2.5 text-center">Cantidad</th>
                            <th className="p-2.5 text-right">{isTrxBolivares ? 'Precio Bs.' : 'Precio USD'}</th>
                            <th className="p-2.5 text-right">{isTrxBolivares ? 'Monto Bs.' : 'Monto USD'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 text-xs">
                          {selectedTrx.items.map((it, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/15">
                              <td className="p-2.5 text-white font-semibold">
                                <span className="text-orange-400 font-mono font-bold mr-1.5">[{isTrxBolivares ? 'Bs.' : '$'}]</span>
                                {it.name}
                              </td>
                              <td className="p-2.5 text-center text-zinc-300">{it.qty}</td>
                              <td className="p-2.5 text-right text-zinc-400">
                                {isTrxBolivares 
                                  ? formatCurrency(it.priceUSD * selectedTrx.exchangeRateUsed, 'VES') 
                                  : formatCurrency(it.priceUSD, 'USD')}
                              </td>
                              <td className="p-2.5 text-right font-bold text-white">
                                {isTrxBolivares 
                                  ? formatCurrency(it.totalVES, 'VES') 
                                  : formatCurrency(it.totalUSD, 'USD')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial calculation breakdown and IGTF warnings */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-7 bg-black rounded border border-zinc-900 p-3 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold block">Talonario / Auditoría Fiscal</span>
                        <p className="text-zinc-300"><strong>Canal de Pago:</strong> {selectedTrx.paymentMethod}</p>
                        <p className="text-zinc-350 select-none">
                          <strong>Estado de Cobro:</strong> <span className={`px-2 py-0.5 rounded uppercase font-bold text-[9px] ${selectedTrx.status === 'completado' ? 'bg-green-500/10 text-emerald-400 border border-green-500/20' : selectedTrx.status === 'anulado' ? '!bg-transparent !text-red-500 !border !border-red-500 font-bold' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`} style={selectedTrx.status === 'anulado' ? { backgroundColor: 'transparent', borderColor: '#ef4444', color: '#ef4444' } : undefined}>{selectedTrx.status}</span>
                        </p>
                      </div>

                      <div className="border-t border-zinc-900 pt-3 mt-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-orange-400 font-bold mb-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Seguridad CIMA Cloud Sync
                        </div>
                        <p className="text-[9.5px] text-zinc-500 leading-normal">
                          Firmado y timbrado digitalmente de forma local en Caracas para garantizar resguardo ante desconexiones físicas.
                        </p>
                      </div>
                    </div>

                    <div className="md:col-span-5 bg-black rounded border border-zinc-900 p-4 space-y-2.5 text-right font-mono">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">SUBTOTAL:</span>
                        <span className="font-semibold text-white">{formatCurrency(selectedTrx.subtotalUSD, 'USD')}</span>
                      </div>
                      
                      {selectedTrx.ivaUSD > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500 uppercase">I.V.A. ({selectedTrx.ivaPercent}%):</span>
                          <span className="font-semibold text-white">{formatCurrency(selectedTrx.ivaUSD, 'USD')}</span>
                        </div>
                      )}

                      {selectedTrx.igtfUSD > 0 && (
                        <div className="flex justify-between text-xs text-orange-400">
                          <span className="uppercase">I.G.T.F. (3% CAS):</span>
                          <span className="font-bold">{formatCurrency(selectedTrx.igtfUSD, 'USD')}</span>
                        </div>
                      )}

                      <div className="border-t border-zinc-900 pt-2 space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-400 font-bold">TOTAL USD:</span>
                          <span className="text-[17px] font-black text-orange-400">{formatCurrency(selectedTrx.totalUSD, 'USD')}</span>
                        </div>
                        {isTrxBolivares && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-500 font-bold">TOTAL VES:</span>
                            <span className="text-[13px] font-bold text-zinc-200">{formatCurrency(selectedTrx.totalVES, 'VES')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedTrx.status === 'pendiente' && (
                    <div className="bg-slate-900 border border-indigo-950 rounded-xl p-4 mt-4 space-y-3 shadow-md no-print">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
                          <span className="text-sm">💵</span>
                          {selectedTrx.type === 'consignacion' 
                            ? 'REGISTRAR COBRO Y LIQUIDACIÓN DE CONSIGNACIÓN' 
                            : 'REGISTRAR COBRO Y FINALIZAR TRANSACCIÓN'}
                        </h4>
                        <span className="text-[9.5px] bg-amber-500/10 text-orange-400 border border-orange-500/20 font-bold px-2 py-0.5 rounded font-mono">
                          CONSIGNACIÓN ABIERTA / PENDIENTE
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-normal font-sans">
                        {selectedTrx.type === 'consignacion' 
                          ? 'Al cobrar el valor de los productos entregados en consignación, seleccione el método de pago utilizado por el cliente y presione el botón de abajo para registrar el ingreso y cerrar la cuenta.' 
                          : 'Seleccione el método de pago con el que el cliente ha liquidado el monto adeudado para actualizar su estatus comercial.'}
                      </p>
                      
                      {/* Método de pago selector */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 pt-1">
                        {(['Dólares Efectivo', 'Bolívares Pago Móvil', 'Bolívares Transferencia', 'Punto de Venta', 'Zelle', 'Binance', 'Zinli', 'Otro (Divisas)'] as const).map((method) => {
                          const active = collectPaymentMethod === method;
                          const isDivisa = method === 'Dólares Efectivo' || method === 'Zelle' || method === 'Binance' || method === 'Zinli' || method === 'Otro (Divisas)';
                          return (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setCollectPaymentMethod(method)}
                              className={`p-2 rounded border text-left flex flex-col justify-between transition h-14 select-none ${
                                active 
                                  ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-505/30' 
                                  : 'bg-black border-zinc-900 hover:border-zinc-805'
                              }`}
                            >
                              <span className={`text-[8px] font-mono block tracking-wider ${active ? 'text-indigo-400 font-extrabold' : 'text-zinc-500'}`}>
                                {isDivisa ? 'DIVISA ($)' : 'NACIONAL (Bs)'}
                              </span>
                              <span className={`text-[9.5px] font-bold truncate leading-tight mt-1 ${active ? 'text-indigo-300' : 'text-zinc-300'}`}>
                                {method}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Especificar otro método si se selecciona Otro (Divisas) */}
                      {collectPaymentMethod === 'Otro (Divisas)' && (
                        <div className="space-y-1 bg-black border border-zinc-900 p-2.5 rounded-lg animate-scale-up">
                          <label className="text-[9px] text-indigo-400 uppercase font-black block">Especifique el método (ej. PayPal, Mony, Wally)</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. PayPal, Wally, Mony, Banesco Panamá..."
                            value={collectCustomMethod}
                            onChange={(e) => setCollectCustomMethod(e.target.value)}
                            className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      )}

                      {/* Notas de cobro */}
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[9px] text-zinc-500 uppercase font-black block">Notas o Referencias sobre la Liquidación (Opcional)</label>
                        <input
                          type="text"
                          placeholder="Ej. Liquidado en dólares en caja / Ref: PM-593"
                          value={collectNotes}
                          onChange={(e) => setCollectNotes(e.target.value)}
                          className="w-full px-3 py-1.5 bg-black border border-zinc-900 rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      {/* Botón de acción */}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const finalPaymentMethod = collectPaymentMethod === 'Otro (Divisas)' 
                              ? (collectCustomMethod.trim() ? `Otro (${collectCustomMethod.trim()})` : 'Otro (Divisas)') 
                              : collectPaymentMethod;
                            handleToggleStatus(selectedTrx.id, 'pendiente', finalPaymentMethod, collectNotes);
                            setCollectNotes('');
                            setCollectCustomMethod('');
                          }}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-450 border border-emerald-600 text-black rounded font-black uppercase text-[10.5px] transition shadow-md flex items-center gap-1.5"
                        >
                          <span>✓</span> Registrar Cobro y Liquidación
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom actions toolbar */}
            <div className="p-4 bg-black border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 no-print">
              <div className="flex flex-wrap gap-2">
                {selectedTrx.status !== 'anulado' && (
                  <button
                    onClick={() => openAnnulModal(selectedTrx)}
                    className="px-3.5 py-1.5 bg-red-950/30 hover:bg-red-900/35 border border-red-900/40 text-red-400 rounded hover:text-red-300 font-bold uppercase text-[10.5px] transition flex items-center justify-center gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" /> Anular este Documento
                  </button>
                )}

                {selectedTrx.status === 'pendiente' && (
                  <button
                    onClick={() => handleToggleStatus(selectedTrx.id, 'pendiente')}
                    className="px-3.5 py-1.5 bg-emerald-950/20 hover:bg-emerald-900/25 border border-emerald-950/30 text-emerald-400 hover:text-emerald-300 rounded font-bold uppercase text-[10.5px] transition"
                  >
                    Marcar Completado
                  </button>
                )}

                {currentUser.role === 'Administrador' && (
                  <button
                    onClick={() => {
                      handleDeleteTransaction(selectedTrx);
                      setSelectedTrx(null);
                    }}
                    className="px-3.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 hover:text-red-200 rounded font-bold uppercase text-[10.5px] transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Eliminar documento comercial de forma permanente (Solo Administrador)"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar Documento
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      downloadTransactionPDF(selectedTrx, companySettings);
                    } catch (error) {
                      console.error("Error generating PDF:", error);
                      alert("Ocurrió un error al generar el archivo PDF.");
                    }
                  }}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-450 text-zinc-950 rounded font-bold uppercase text-[10.5px] transition flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const printable = document.getElementById('printable-receipt-card');
                    if (printable) {
                      window.print();
                    }
                  }}
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-white rounded font-bold uppercase text-[10.5px] transition flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir Documento
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTrx(null)}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-550 text-black rounded font-extrabold uppercase text-[10.5px] transition"
                >
                  Cerrar Visor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ANNULMENT REASON MODAL OVERLAY */}
      {annulModalTrx && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-red-900/60 rounded-lg w-full max-w-lg overflow-hidden shadow-2xl font-mono text-xs text-zinc-300 space-y-0">
            {/* Modal Header */}
            <div className="p-4 bg-red-950/40 border-b border-red-900/50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <h3 className="font-extrabold text-white text-sm uppercase tracking-wide">
                    Anular {annulModalTrx.type.toUpperCase()} #{annulModalTrx.id}
                  </h3>
                  <p className="text-[10px] text-red-300">Cliente: {annulModalTrx.clientName} ({annulModalTrx.clientRif})</p>
                </div>
              </div>
              <button 
                onClick={() => setAnnulModalTrx(null)}
                className="text-zinc-500 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-300 text-[11px] leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>
                  Atención: Al anular esta {annulModalTrx.type}, quedará sin validez comercial y se registrará la nota explicativa para auditoría fiscal.
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-300 uppercase block">
                  Seleccione el motivo de la anulación:
                </label>
                <select
                  value={annulReasonPreset}
                  onChange={(e) => setAnnulReasonPreset(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded p-2 text-xs text-white focus:outline-none focus:border-red-500"
                >
                  {presetAnnulReasons.map((r, idx) => (
                    <option key={idx} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-300 uppercase block">
                  Nota explicativa o detalles adicionales del por qué se anuló:
                </label>
                <textarea
                  rows={3}
                  placeholder="Ingrese una nota descriptiva con el motivo exacto de la anulación..."
                  value={annulReasonCustom}
                  onChange={(e) => setAnnulReasonCustom(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded p-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 font-mono"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-black border-t border-zinc-900 flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={() => setAnnulModalTrx(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded font-bold uppercase text-[10px] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAnnulment}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-extrabold uppercase text-[10px] transition flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Confirmar Anulación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET / WIPE CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-red-900/50 rounded-lg w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up text-xs font-mono">
            <div className="p-4 bg-red-950/40 border-b border-red-900/40 flex justify-between items-center">
              <h3 className="text-xs font-extrabold uppercase text-red-400 flex items-center gap-1.5 leading-none">
                <AlertTriangle className="w-4 h-4 text-red-500" /> Confirmar Puesta a Cero del Histórico
              </h3>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-zinc-300">
              <p className="text-xs font-bold text-white">
                ¿Está seguro que desea reiniciar todo el Histórico Comercial, Compras y Analíticas a 0?
              </p>
              
              <div className="bg-black p-3.5 rounded border border-zinc-850 space-y-2 text-[11px] text-zinc-400">
                <p className="text-orange-400 font-bold">Esta acción realizará lo siguiente:</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>Elimina todas las Facturas, Recibos, Cotizaciones y Consignaciones emitidas.</li>
                  <li>Elimina las órdenes de compras registradas y resetea las gráficas de analítica a 0.</li>
                  <li>Reinicia los correlativos automáticos (la próxima factura será <span className="text-white font-bold">FAC-0001</span>).</li>
                  <li><span className="text-emerald-400 font-bold">Conserva</span> su catálogo de productos, inventario, clientes, proveedores y usuarios.</li>
                </ul>
              </div>

              <p className="text-[10.5px] text-zinc-500">
                Esta operación sincronizará de inmediato con la nube y el almacenamiento local para empezar a trabajar con registros reales y limpios.
              </p>
            </div>

            <div className="p-4 bg-black border-t border-zinc-900 flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded font-bold uppercase text-[10px] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onResetCommercialHistory) {
                    onResetCommercialHistory();
                  } else {
                    setTransactions([]);
                  }
                  setShowResetModal(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-extrabold uppercase text-[10px] transition flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, Reiniciar a 0</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
