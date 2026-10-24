import React, { useState, useEffect, useRef } from 'react';
import { 
  Receipt, ShoppingCart, UserPlus, Trash, ChevronRight, 
  Calculator, Plus, Minus, Search, CreditCard, DollarSign, FileText, CheckCircle, Smartphone, AlertTriangle,
  Upload, Download, FileSpreadsheet, Check, X, ChevronDown, Phone, Mail, MapPin
} from 'lucide-react';
import { Product, Client, Transaction, TransactionItem, TransactionType, ExchangeRate, CompanySettings, User, ConsignmentItem } from '../types';
import { downloadTransactionPDF } from '../lib/pdfGenerator';
import { DEFAULT_PRODUCT_IMAGE } from '../lib/imageUtils';
import { formatDateDDMMAAAA, isBolivaresPaymentMethod } from '../lib/formatters';

interface BillingModuleProps {
  products: Product[];
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  exchangeRate: ExchangeRate;
  companySettings: CompanySettings;
  currentUser: User;
  onAddTransaction: (trx: Transaction) => void;
  onOpenScanner: (onScanSuccess: (barcode: string) => void) => void;
  isOnline: boolean;
  consignmentItems?: ConsignmentItem[];
  sequences?: Record<string, number>;
  transactions?: Transaction[];
}

export default function BillingModule({
  products,
  clients,
  setClients,
  exchangeRate,
  companySettings,
  currentUser,
  onAddTransaction,
  onOpenScanner,
  isOnline,
  consignmentItems = [],
  sequences,
  transactions = []
}: BillingModuleProps) {
  const [docType, setDocType] = useState<TransactionType>('factura');
  const [selectedClient, setSelectedClient] = useState<string>('');

  // Helper to preview the next sequential ID in the UI without incrementing it permanently
  const getPredictedNextId = (type: TransactionType): string => {
    const prefix = type === 'factura' ? 'FAC' : type === 'cotizacion' ? 'COT' : type === 'recibo' ? 'REC' : 'CON';
    const storageKey = `siga_seq_${type}`;
    
    // Layer 1: Check shared real-time sequences from Firestore settings collection
    let maxNum = sequences ? (sequences[type] || 0) : 0;

    // Layer 2: Check local sequences in client browser's localStorage
    const currentSeqVal = localStorage.getItem(storageKey);
    if (currentSeqVal !== null) {
      const localNum = parseInt(currentSeqVal, 10);
      if (!isNaN(localNum) && localNum > maxNum) {
        maxNum = localNum;
      }
    }

    // Layer 3: Scan the full active transaction records list to prevent collision with any existing ID
    if (Array.isArray(transactions)) {
      transactions.forEach(t => {
        if (t.type === type) {
          const match = t.id.match(/-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        }
      });
    }

    const nextSeq = maxNum + 1;
    return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
  };
  
  // Client input fields for new client quick-add
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientRif, setNewClientRif] = useState('V-');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');

  // Cart
  const [cart, setCart] = useState<{ product: Product; qty: number; selectedPriceType?: string }[]>([]);

  // Import / Export state variables for massive billing draft orders
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Reusable native CSV parser that handles double quotes and escapes
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

  // Process imported items and add them to the Billing Invoice Cart
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

      const idIndex = findIndex(['id', 'barra', 'barras', 'barcode', 'código', 'codigo', 'item_id', 'sku']);
      const qtyIndex = findIndex(['qty', 'cantidad', 'unidades', 'cant', 'cantidades']);

      if (idIndex === -1) {
        throw new Error("No se pudo detectar la columna con el código de barras o id del producto. Verifique sus cabeceras.");
      }
      if (qtyIndex === -1) {
        throw new Error("No se pudo detectar la columna con la cantidad o unidades. Verifique sus cabeceras.");
      }

      const tempCart = [...cart];
      let loadedCount = 0;
      let ignoredCount = 0;
      let ignoredLog: string[] = [];

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.length === 0 || (line.length === 1 && line[0] === '')) continue;

        const barcode = line[idIndex] ? line[idIndex].replace(/['"\s]/g, '') : '';
        if (!barcode) continue;

        const matchedProduct = products.find(p => p && (String(p.id) === barcode || (p.sku || '').toUpperCase() === barcode.toUpperCase()));
        if (!matchedProduct) {
          ignoredCount++;
          ignoredLog.push(barcode);
          continue;
        }

        const qty = qtyIndex !== -1 && line[qtyIndex] ? parseInt(line[qtyIndex].replace(/[^0-9]/g, '')) || 1 : 1;

        const existingCartIdx = tempCart.findIndex(item => item.product.id === matchedProduct.id);
        if (existingCartIdx > -1) {
          // Add or replace qty
          tempCart[existingCartIdx] = {
            product: matchedProduct,
            qty: qty
          };
        } else {
          tempCart.push({
            product: matchedProduct,
            qty: qty
          });
        }
        loadedCount++;
      }

      setCart(tempCart);
      let alertMsg = `✅ Surtido de facturación cargado con éxito:\n- ${loadedCount} productos cargados al carrito de facturación actual.`;
      if (ignoredCount > 0) {
        alertMsg += `\n- ⚠️ ${ignoredCount} códigos no existían en el catálogo y fueron omitidos: [${ignoredLog.slice(0, 5).join(', ')}${ignoredLog.length > 5 ? '...' : ''}].`;
      }
      alert(alertMsg);
      setShowImportExport(false);
      setImportText('');
    } catch (err: any) {
      setImportError(err.message || "Error al procesar el archivo CSV.");
    }
  };

  const handleJSONImport = (text: string) => {
    try {
      setImportError(null);
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : (data.items || data.cart || []);
      if (!Array.isArray(list)) {
        throw new Error("Formato JSON inválido. Debe ser una lista [] de compras.");
      }

      const tempCart = [...cart];
      let loadedCount = 0;
      let ignoredCount = 0;

      list.forEach((item: any) => {
        const barcode = item.productId || item.id || item.barcode || '';
        const matchedProduct = products.find(p => p && (String(p.id) === String(barcode) || (p.sku || '').toUpperCase() === String(barcode).toUpperCase()));
        if (!matchedProduct) {
          ignoredCount++;
          return;
        }

        const qty = Number(item.qty || item.cantidad || 1);

        const existingCartIdx = tempCart.findIndex(x => x.product.id === matchedProduct.id);
        if (existingCartIdx > -1) {
          tempCart[existingCartIdx] = {
            product: matchedProduct,
            qty
          };
        } else {
          tempCart.push({
            product: matchedProduct,
            qty
          });
        }
        loadedCount++;
      });

      setCart(tempCart);
      alert(`✅ Carga finalizada desde JSON: ${loadedCount} items añadidos al carrito. ${ignoredCount > 0 ? `(${ignoredCount} productos ignorados por no existir en catálogo)` : ''}`);
      setShowImportExport(false);
      setImportText('');
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

  // Export current draft invoice cart to CSV
  const handleExportCartCSV = () => {
    if (cart.length === 0) {
      alert("⚠️ No hay ítems en el carrito actual para exportar.");
      return;
    }
    const headers = ["Código de Barras", "Nombre del Producto", "ID de Producto", "Cantidad", "Precio USD Unitario", "Subtotal USD"];
    const rows = cart.map(item => [
      `"${item.product.id}"`,
      `"${item.product.name.replace(/"/g, '""')}"`,
      `"${item.product.sku}"`,
      item.qty,
      item.product.priceUSD,
      item.product.priceUSD * item.qty
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CIMA_CarroFacturacion_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [searchTerm, setSearchTerm] = useState('');
  
  // Client search and autocomplete combobox states
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [paymentMethod, setPaymentMethod] = useState<'Dólares Efectivo' | 'Bolívares Pago Móvil' | 'Bolívares Transferencia' | 'Punto de Venta' | 'Zelle' | 'Binance' | 'Zinli' | 'Otro (Divisas)' | 'Consignación Abierta'>('Dólares Efectivo');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');

  const isBolivares = isBolivaresPaymentMethod(paymentMethod);

  // Success Receipt Modal state
  const [completedTrx, setCompletedTrx] = useState<Transaction | null>(null);

  // Inventory source selection ('general' or 'consignacion')
  const [inventorySource, setInventorySource] = useState<'general' | 'consignacion'>('general');
  
  // Guard a fixed exchange rate for the active transaction to keep Bs price locked
  const [fixedRate, setFixedRate] = useState<number>(exchangeRate.rate);

  useEffect(() => {
    if (exchangeRate && exchangeRate.rate) {
      setFixedRate(exchangeRate.rate);
    }
  }, [exchangeRate]);

  useEffect(() => {
    if (docType !== 'factura' && docType !== 'recibo') {
      setInventorySource('general');
    }
  }, [docType]);

  useEffect(() => {
    if (!selectedClient) {
      setInventorySource('general');
    }
  }, [selectedClient]);

  // Filter clients based on clientSearchQuery across name, rif/cedula, phone, email, and address (sorted alphabetically)
  const filteredClients = [...clients]
    .filter(c => {
      if (!clientSearchQuery.trim()) return true;
      const q = clientSearchQuery.toLowerCase().trim();
      const qDigits = clientSearchQuery.replace(/\D/g, '');

      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const rifMatch = (c.rif || '').toLowerCase().includes(q);
      const phoneMatch = (c.phone || '').toLowerCase().includes(q);
      const emailMatch = (c.email || '').toLowerCase().includes(q);
      const addressMatch = (c.address || '').toLowerCase().includes(q);

      if (nameMatch || rifMatch || phoneMatch || emailMatch || addressMatch) {
        return true;
      }

      if (qDigits.length >= 3) {
        const rifDigits = (c.rif || '').replace(/\D/g, '');
        const phoneDigits = (c.phone || '').replace(/\D/g, '');
        if (rifDigits.includes(qDigits) || phoneDigits.includes(qDigits)) {
          return true;
        }
      }

      return false;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

  const activeClient = clients.find(c => c.id === selectedClient);

  // Filter products for dropdown/search list matching selected inventory source
  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const term = (searchTerm || '').toLowerCase().trim();
    const pName = (p.name || '').toLowerCase();
    const pId = String(p.id || '').toLowerCase();
    const pSku = (p.sku || '').toLowerCase();
    const matchesSearch = !term || pName.includes(term) || pId.includes(term) || pSku.includes(term);

    if (!matchesSearch) return false;

    if (inventorySource === 'consignacion') {
      const clientMeta = clients.find(c => c && c.id === selectedClient);
      if (!clientMeta) return false;
      const consignmentRecord = consignmentItems.find(
        c => c && c.clientRif === clientMeta.rif && c.productId === p.id
      );
      return consignmentRecord ? consignmentRecord.qty > 0 : false;
    }

    return true;
  });

  const resolveVES = (vesVal: number | undefined, usdVal: number) => {
    if (vesVal && vesVal > 0) {
      if (vesVal > usdVal * 10 && fixedRate > 5) {
        return vesVal;
      }
      return Math.round(vesVal * fixedRate * 100) / 100;
    }
    return Math.round(usdVal * fixedRate * 100) / 100;
  };

  const getItemUnitPrice = (item: { product: Product; selectedPriceType?: string }) => {
    const p = item.product;
    const type = item.selectedPriceType || 'detal';
    
    if (type === 'detal' || type === 'detalUSD') {
      return p.priceUSD;
    }
    if (type === 'detalVES') {
      return p.priceVES || p.priceUSD;
    }
    if (type === 'mayor' || type === 'mayorUSD') {
      return p.priceWholesaleUSD || Math.round(p.priceUSD * 0.85 * 100) / 100;
    }
    if (type === 'mayorVES') {
      return p.priceWholesaleVES || p.priceWholesaleUSD || Math.round(p.priceUSD * 0.85 * 100) / 100;
    }
    if (type === 'cuadrillas' || type === 'cuadrillasVES') {
      return p.priceCuadrillasVES || p.priceCuadrillasUSD || Math.round((p.priceVES || p.priceUSD) * 1.10 * 100) / 100;
    }
    if (type === 'cuadrillasUSD') {
      return p.priceCuadrillasUSD || Math.round((p.priceVES || p.priceUSD) * 1.10 * 100) / 100;
    }
    if (type === 'cuadrillasDetal') {
      return p.priceCuadrillasDetalUSD || Math.round(p.priceUSD * 0.95 * 100) / 100;
    }
    if (type === 'mayorDetal') {
      return p.priceMayorDetalUSD || Math.round(p.priceUSD * 0.80 * 100) / 100;
    }
    return p.priceUSD;
  };

  const getItemUnitPriceDisplay = (item: { product: Product; selectedPriceType?: string }) => {
    const p = item.product;
    const type = item.selectedPriceType || 'detal';
    
    if (type === 'detalVES') {
      const ves = (p.priceVES || p.priceUSD) * fixedRate;
      return formatCurrency(ves, 'VES');
    }
    if (type === 'mayorVES') {
      const wholesaleRef = p.priceWholesaleVES || p.priceWholesaleUSD || Math.round(p.priceUSD * 0.85 * 100) / 100;
      const ves = wholesaleRef * fixedRate;
      return formatCurrency(ves, 'VES');
    }
    if (type === 'cuadrillas' || type === 'cuadrillasVES') {
      const cuadrillasRef = p.priceCuadrillasVES || p.priceCuadrillasUSD || Math.round((p.priceVES || p.priceUSD) * 1.10 * 100) / 100;
      const ves = cuadrillasRef * fixedRate;
      return formatCurrency(ves, 'VES');
    }
    if (type === 'mayor' || type === 'mayorUSD') {
      const wholesaleUSD = p.priceWholesaleUSD || Math.round(p.priceUSD * 0.85 * 100) / 100;
      return formatCurrency(wholesaleUSD, 'USD');
    }
    if (type === 'cuadrillasDetal') {
      return formatCurrency(p.priceCuadrillasDetalUSD || Math.round(p.priceUSD * 0.95 * 100) / 100, 'USD');
    }
    if (type === 'mayorDetal') {
      return formatCurrency(p.priceMayorDetalUSD || Math.round(p.priceUSD * 0.80 * 100) / 100, 'USD');
    }
    
    return formatCurrency(p.priceUSD, 'USD');
  };

  // Calculate cart totals using fixed rate
  const subtotalUSD = cart.reduce((acc, item) => acc + (getItemUnitPrice(item) * item.qty), 0);
  const subtotalVES = subtotalUSD * fixedRate;

  const requiresIva = docType === 'factura';
  const ivaRateValue = requiresIva ? companySettings.ivaRate : 0;
  const ivaUSD = subtotalUSD * (ivaRateValue / 100);
  const ivaVES = subtotalVES * (ivaRateValue / 100);

  // Apply IGTF (Impuesto a las Grandes Transacciones Financieras) 3% when payment method is cash dollars, Zelle, Binance, Zinli or other foreign currency methods and docType is 'factura'
  const applyIgtf = docType === 'factura' && (paymentMethod === 'Dólares Efectivo' || paymentMethod === 'Zelle' || paymentMethod === 'Binance' || paymentMethod === 'Zinli' || paymentMethod === 'Otro (Divisas)');
  const igtfRateValue = applyIgtf ? companySettings.igtfRate : 0;
  const igtfUSD = subtotalUSD * (igtfRateValue / 100);
  const igtfVES = subtotalVES * (igtfRateValue / 100);

  const totalUSD = subtotalUSD + ivaUSD + igtfUSD;
  const totalVES = subtotalVES + ivaVES + igtfVES;

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientRif) return;
    
    const newClient: Client = {
      id: 'cli-' + Date.now(),
      name: newClientName,
      rif: newClientRif.toUpperCase(),
      phone: newClientPhone,
      email: newClientEmail,
      address: newClientAddress
    };

    const updated = [...clients, newClient];
    setClients(updated);
    localStorage.setItem('siga_clients', JSON.stringify(updated));
    
    setSelectedClient(newClient.id);
    setIsAddingClient(false);
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    
    // Clear fields
    setNewClientName('');
    setNewClientRif('V-');
    setNewClientPhone('');
    setNewClientEmail('');
    setNewClientAddress('');
  };

  const getMaxAvailableStock = (prod: Product) => {
    if (inventorySource === 'consignacion') {
      const clientMeta = clients.find(c => c.id === selectedClient);
      if (!clientMeta) return 0;
      const consignmentRecord = consignmentItems.find(
        c => c.clientRif === clientMeta.rif && c.productId === prod.id
      );
      return consignmentRecord ? consignmentRecord.qty : 0;
    }
    return prod.stock;
  };

  const addToCart = (prod: Product) => {
    if (inventorySource === 'consignacion' && !selectedClient) {
      alert("⚠️ Error: Seleccione un cliente primero para facturar desde su inventario de consignación.");
      return;
    }

    const maxStock = getMaxAvailableStock(prod);
    if (maxStock <= 0) {
      if (inventorySource === 'consignacion') {
        alert(`⚠️ El cliente seleccionado no posee existencias de "${prod.name}" en su inventario de consignación.`);
      } else {
        alert("⚠️ Alerta de stock: Este producto no tiene existencias disponibles en el inventario general.");
      }
      return;
    }

    const existing = cart.find(item => item.product.id === prod.id);
    if (existing) {
      if (existing.qty >= maxStock) {
        alert(
          inventorySource === 'consignacion'
            ? `⚠️ Límite alcanzado: El cliente solo tiene ${maxStock} unids en consignación.`
            : `⚠️ Límite alcanzado: Solo hay ${maxStock} unids disponibles en stock.`
        );
        return;
      }
      setCart(cart.map(item => item.product.id === prod.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { product: prod, qty: 1 }]);
    }
    setSearchTerm('');
  };

  const updateCartQty = (prodId: string, delta: number) => {
    const item = cart.find(item => item.product.id === prodId);
    if (!item) return;

    const newQty = item.qty + delta;
    if (newQty <= 0) {
      setCart(cart.filter(item => item.product.id !== prodId));
    } else {
      const maxStock = getMaxAvailableStock(item.product);
      if (newQty > maxStock) {
        alert(
          inventorySource === 'consignacion'
            ? `⚠️ El cliente solo tiene ${maxStock} unids en consignación.`
            : `⚠️ Solo hay ${maxStock} unids en existencia.`
        );
        return;
      }
      setCart(cart.map(item => item.product.id === prodId ? { ...item, qty: newQty } : item));
    }
  };

  const removeFromCart = (prodId: string) => {
    setCart(cart.filter(item => item.product.id !== prodId));
  };

  const triggerBarcodeInput = (scannedCode: string) => {
    const code = String(scannedCode || '').trim();
    const found = products.find(p => p && (String(p.id) === code || (p.sku || '').toUpperCase() === code.toUpperCase()));
    if (found) {
      addToCart(found);
    } else {
      alert(`Código de barras "${code}" no encontrado en el inventario actual.`);
    }
  };

  const handleCheckout = () => {
    if (currentUser.role === 'Solo Lectura') {
      alert("⛔ Operación Denegada: Su cuenta de rango SOLO LECTURA no posee privilegios para ingresar transacciones comerciales o emitir facturas en CIMA.");
      return;
    }

    if (cart.length === 0) {
      alert("⚠️ El carrito de compras se encuentra vacío.");
      return;
    }

    let client = clients.find(c => c.id === selectedClient);
    if (!client) {
      // Create a default walk-in client
      client = {
        id: "cli-default",
        name: "Consumidor Final",
        rif: "V-99999999-9",
        phone: "-",
        email: "-"
      };
    }

    const transactionItems: TransactionItem[] = cart.map(item => {
      const unitPrice = getItemUnitPrice(item);
      return {
        productId: item.product.id,
        name: item.product.name,
        qty: item.qty,
        priceUSD: unitPrice,
        priceVES: unitPrice * fixedRate,
        totalUSD: unitPrice * item.qty,
        totalVES: unitPrice * item.qty * fixedRate
      };
    });

    // Auto-incremental serial for documents
    const timestampNow = new Date().toISOString();
    
    // Generate sequential correlative document ID with multi-user and deletion protection
    const getNextDocumentId = (type: TransactionType): string => {
      const prefix = type === 'factura' ? 'FAC' : type === 'cotizacion' ? 'COT' : type === 'recibo' ? 'REC' : 'CON';
      const storageKey = `siga_seq_${type}`;
      
      // Layer 1: Check shared real-time sequences from Firestore settings collection
      let maxNum = sequences ? (sequences[type] || 0) : 0;

      // Layer 2: Check local sequences in client browser's localStorage
      const currentSeqVal = localStorage.getItem(storageKey);
      if (currentSeqVal !== null) {
        const localNum = parseInt(currentSeqVal, 10);
        if (!isNaN(localNum) && localNum > maxNum) {
          maxNum = localNum;
        }
      }

      // Layer 3: Scan the full active transaction records list to prevent collision with any existing ID
      if (Array.isArray(transactions)) {
        transactions.forEach(t => {
          if (t.type === type) {
            const match = t.id.match(/-(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
        });
      }

      // Increment sequence by exactly 1
      const nextSeq = maxNum + 1;
      localStorage.setItem(storageKey, nextSeq.toString());
      return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
    };

    const docId = getNextDocumentId(docType);

    const newTransaction: Transaction = {
      id: docId,
      type: docType,
      clientName: client.name,
      clientRif: client.rif,
      clientPhone: client.phone,
      clientEmail: docType === 'factura' ? client.email : undefined,
      items: transactionItems,
      subtotalUSD,
      subtotalVES,
      ivaPercent: ivaRateValue,
      ivaUSD,
      ivaVES,
      igtfPercent: igtfRateValue,
      igtfUSD,
      igtfVES,
      totalUSD,
      totalVES,
      exchangeRateUsed: fixedRate,
      inventorySource: inventorySource,
      paymentMethod: paymentMethod === 'Otro (Divisas)' ? (customPaymentMethod.trim() ? `Otro (${customPaymentMethod.trim()})` : 'Otro (Divisas)') : paymentMethod,
      status: (docType === 'cotizacion' || docType === 'consignacion') ? 'pendiente' : 'completado',
      createdById: currentUser.id,
      createdByName: currentUser.username,
      timestamp: timestampNow,
      additionalNotes: notes
    };

    onAddTransaction(newTransaction);
    setCompletedTrx(newTransaction);
    
    // Clear State
    setCart([]);
    setSelectedClient('');
    setClientSearchQuery('');
    setIsClientDropdownOpen(false);
    setNotes('');
    setCustomPaymentMethod('');
  };

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    } else {
      return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-1">
      {/* Title / Info Header */}
      <div className="lg:col-span-12 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
        <div>
          <span className="text-xs font-mono text-indigo-400 uppercase tracking-widest block font-bold">MÓDULO DE VENTAS Y EMISIÓN</span>
          <h2 className="text-xl font-semibold text-slate-100 mt-0.5">Operación Multimoneda</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setShowImportExport(!showImportExport)}
            className={`px-4 py-2 border rounded-xl font-bold text-xs select-none transition flex items-center gap-1.5 shadow-sm uppercase tracking-wider ${
              showImportExport
                ? 'bg-indigo-950/40 border-indigo-550 text-indigo-400'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-400" /> Cargar Ítems Excel
          </button>

          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-bold">Tasa Fija Transacción (Bs.)</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-indigo-400 font-extrabold text-xs">Bs.</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={fixedRate}
                  onChange={(e) => setFixedRate(Number(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700/60 rounded px-1 px-0.5 text-xs text-indigo-300 font-bold focus:outline-none focus:border-indigo-500 text-center"
                  title="Tasa de cambio fijada para esta transacción. Al alterarla, los valores en Bolívares quedarán asegurados a este valor en los reportes."
                />
              </div>
            </div>
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/15" title="Tasa Congelada de Facturación">
              🔒
            </div>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">ESTADO DE RED</span>
              <span className="text-slate-300 font-bold block">{isOnline ? 'EN LÍNEA' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible billing cart mass importer */}
      {showImportExport && (
        <div className="lg:col-span-12 p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-5 shadow-xl animate-slide-in font-mono">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-850 pb-3 gap-2 font-sans">
            <div>
              <h3 className="font-bold text-slate-105 text-xs uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Importar Lista de Pedidos a las Ventas
              </h3>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">Sube un Excel CSV o JSON con los códigos de barra y las cantidades para cargar de golpe los productos a facturar.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowImportExport(false)}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left side: Upload area */}
            <div className="space-y-3.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold block">📥 Cargar Datos</span>
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-950/10'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-750'
                }`}
                onClick={() => document.getElementById('billing-file-picker')?.click()}
              >
                <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                <p className="text-xs text-slate-300 font-medium">Arrastra tu archivo CSV o JSON aquí</p>
                <p className="text-[10px] text-slate-505 font-mono mt-1">o haz clic para explorar en tu equipo</p>
                <input
                  id="billing-file-picker"
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px bg-slate-850 flex-1"></div>
                <span className="text-[10px] text-slate-650 font-mono uppercase text-zinc-500">o pega texto sin formato</span>
                <div className="h-px bg-slate-850 flex-1"></div>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={3}
                  placeholder="Código_Barras,Cantidad"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded text-[11px] text-slate-350 font-mono placeholder-slate-700 focus:outline-none"
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
                        ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 cursor-pointer'
                        : 'bg-slate-950/30 border border-slate-850 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    Generar Carrito
                  </button>
                </div>
              </div>
            </div>

            {/* Right side: Instructions */}
            <div className="space-y-4 bg-slate-950/30 p-4 border border-slate-850 rounded-xl leading-relaxed">
              <div className="space-y-1.5 text-xs text-slate-350 font-sans">
                <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-mono font-bold block">💡 Columnas para Cargar Venta</span>
                <p className="text-[11px] text-slate-450 leading-normal">
                  Puedes estructurar tus planillas del cliente con las siguientes columnas descriptivas:
                </p>
                <ul className="list-disc list-inside text-[10.5px] text-slate-450 pl-1 space-y-1 font-mono">
                  <li><strong>Código de Barras / ID del Producto:</strong> <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">id, barcode, barras, código, sku</code></li>
                  <li><strong>Cantidad Deseada:</strong> <code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">qty, cantidad, unidades</code></li>
                </ul>
                <p className="text-[10.5px] text-slate-500 italic mt-2">
                  * Útil para cargar presupuestos de clientes mayoristas o pedidos tomados de forma manual en terreno.
                </p>
              </div>

              {cart.length > 0 && (
                <div className="pt-3 border-t border-slate-850 flex flex-col gap-2">
                  <span className="text-[10px] text-slate-450 uppercase tracking-widest block font-bold">📤 Exportar Carrito Actual</span>
                  <button
                    type="button"
                    onClick={handleExportCartCSV}
                    className="py-2.5 px-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-xl text-xs text-slate-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer font-bold"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" /> Exportar Planilla de Cotización Actual (CSV)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LEFT COLUMN: Selector, Cart and Client */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Document Type Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-sm">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">Tipo de Documento</span>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 font-mono">
                Fecha: <strong className="text-slate-200">{formatDateDDMMAAAA(new Date())}</strong>
              </span>
              <span className="text-[11px] text-indigo-400 font-mono font-bold bg-indigo-950/40 px-2.5 py-0.5 rounded border border-indigo-900/45">
                Siguiente Correlativo: {getPredictedNextId(docType)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {(['factura', 'cotizacion', 'recibo', 'consignacion'] as TransactionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setDocType(type);
                  if (type === 'consignacion') {
                    setPaymentMethod('Consignación Abierta');
                  } else if (paymentMethod === 'Consignación Abierta') {
                    setPaymentMethod('Dólares Efectivo');
                  }
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition select-none ${
                  docType === type 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'bg-slate-955 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {type === 'factura' ? '🧾 Factura' : type === 'cotizacion' ? '📋 Cotización' : type === 'recibo' ? '💵 Recibo' : '🚚 Consignación'}
              </button>
            ))}
          </div>
        </div>

        {/* Client Selection / Registration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span className="text-indigo-400">👤</span> Información del Cliente
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingClient(!isAddingClient)}
              className="text-xs text-indigo-400 hover:text-indigo-305 flex items-center gap-1 font-mono uppercase bg-indigo-500/10 px-2 py-1 rounded"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {isAddingClient ? 'Cancelar' : 'Nuevo Cliente'}
            </button>
          </div>

          {isAddingClient ? (
            <form onSubmit={handleAddClient} className="space-y-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800/60 animate-slide-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Nombre / Razón Social</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Comercial El Progreso C.A."
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">RIF / Cédula</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. J-12345678-9"
                    value={newClientRif}
                    onChange={(e) => setNewClientRif(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej. 0414-1234567"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Email</label>
                  <input
                    type="email"
                    placeholder="Ej. cliente@empresa.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1 font-mono">Dirección Fiscal</label>
                <textarea
                  placeholder="Calle, Local, Ciudad, Venezuela"
                  rows={2}
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-550"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 text-white hover:bg-indigo-550 font-semibold text-xs rounded-lg transition"
              >
                Guardar y Seleccionar Cliente
              </button>
            </form>
          ) : (
            <div className="space-y-3" ref={clientDropdownRef}>
              {/* Searchable Client Input + Dropdown */}
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar cliente por nombre, cédula, RIF, teléfono, email..."
                      value={clientSearchQuery}
                      onChange={(e) => {
                        setClientSearchQuery(e.target.value);
                        setIsClientDropdownOpen(true);
                      }}
                      onFocus={() => setIsClientDropdownOpen(true)}
                      className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition placeholder:text-slate-500"
                    />
                    {clientSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setClientSearchQuery('')}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 transition"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                    className="px-2.5 py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition"
                    title={isClientDropdownOpen ? "Cerrar lista" : "Desplegar lista de clientes"}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isClientDropdownOpen ? 'rotate-180 text-indigo-400' : ''}`} />
                  </button>
                </div>

                {/* Dropdown Floating Results */}
                {isClientDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-950/98 backdrop-blur border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden max-h-72 flex flex-col">
                    <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{clientSearchQuery ? `Coincidencias (${filteredClients.length})` : `Directorio de clientes (${clients.length}) • Orden A-Z`}</span>
                      {clientSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setClientSearchQuery('')}
                          className="text-indigo-400 hover:underline text-[10px]"
                        >
                          Ver todos
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto divide-y divide-slate-800/60 flex-1">
                      {/* Default Consumidor Final Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient('');
                          setClientSearchQuery('');
                          setIsClientDropdownOpen(false);
                        }}
                        className={`w-full text-left p-2.5 flex items-start justify-between gap-2 transition hover:bg-slate-900/90 cursor-pointer ${
                          !selectedClient ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5">👤</span>
                          <div>
                            <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                              Consumidor Final
                              <span className="text-[10px] font-normal font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
                                V-99999999-9
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-400">Cliente mostrador / Venta genérica al público</p>
                          </div>
                        </div>
                        {!selectedClient && (
                          <span className="text-indigo-400 font-bold text-xs shrink-0">✓ Activo</span>
                        )}
                      </button>

                      {/* Filtered Clients List */}
                      {filteredClients.map(c => {
                        const isSelected = selectedClient === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedClient(c.id);
                              setClientSearchQuery('');
                              setIsClientDropdownOpen(false);
                            }}
                            className={`w-full text-left p-2.5 flex items-start justify-between gap-2 transition hover:bg-slate-900/90 cursor-pointer ${
                              isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-indigo-950/70 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 font-bold text-xs mt-0.5">
                                {c.name ? c.name.charAt(0).toUpperCase() : 'C'}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-100">{c.name}</span>
                                  <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/80 border border-indigo-500/30 px-1.5 py-0.2 rounded font-semibold">
                                    {c.rif}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                                  {c.phone && (
                                    <span className="flex items-center gap-1 font-mono">
                                      📞 {c.phone}
                                    </span>
                                  )}
                                  {c.email && (
                                    <span className="flex items-center gap-1">
                                      ✉️ {c.email}
                                    </span>
                                  )}
                                  {c.address && (
                                    <span className="flex items-center gap-1 text-slate-500 truncate max-w-[200px]" title={c.address}>
                                      📍 {c.address}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-indigo-400 font-bold text-xs shrink-0">✓ Seleccionado</span>
                            )}
                          </button>
                        );
                      })}

                      {/* No Results matched */}
                      {filteredClients.length === 0 && (
                        <div className="p-4 text-center space-y-2">
                          <p className="text-xs text-slate-400">
                            No se encontraron clientes para "<span className="text-slate-200 font-semibold">{clientSearchQuery}</span>"
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setIsClientDropdownOpen(false);
                              setIsAddingClient(true);
                              const trimmed = clientSearchQuery.trim();
                              if (/^[VvJjEeGg]-\d+/.test(trimmed) || /^\d{6,}/.test(trimmed)) {
                                setNewClientRif(trimmed.toUpperCase());
                              } else {
                                setNewClientName(trimmed);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-550 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Registrar como nuevo cliente
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Client Card or Default Walk-in Indicator */}
              {activeClient ? (
                <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0">
                        {(activeClient.name || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-100">{activeClient.name}</span>
                          <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/90 border border-indigo-500/40 px-1.5 py-0.5 rounded font-bold">
                            {activeClient.rif}
                          </span>
                        </div>
                        <p className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                          ✓ Cliente Seleccionado
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsClientDropdownOpen(true)}
                        className="px-2 py-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 rounded-lg transition cursor-pointer"
                        title="Cambiar cliente"
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient('');
                          setClientSearchQuery('');
                        }}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition cursor-pointer"
                        title="Desvincular cliente y usar Consumidor Final"
                      >
                        ✕ Quitar
                      </button>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
                    {activeClient.phone && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Teléfono:</span>
                        <span className="text-slate-200">{activeClient.phone}</span>
                      </div>
                    )}
                    {activeClient.email && docType === 'factura' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Email:</span>
                        <span className="text-slate-200">{activeClient.email}</span>
                      </div>
                    )}
                    {activeClient.address && (
                      <div className="col-span-full flex items-start gap-1.5 font-sans">
                        <span className="text-slate-500 font-mono text-[10px]">Dirección:</span>
                        <span className="text-slate-300 text-[11px] line-clamp-1" title={activeClient.address}>{activeClient.address}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-slate-950/40 border border-slate-800/80 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">👤</span>
                    <span className="text-slate-300 font-medium">Consumidor Final (Genérico)</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      V-99999999-9
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsClientDropdownOpen(true)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    Buscar cliente
                  </button>
                </div>
              )}

              {/* Inventory Source Selector (Only for Invoices and Receipts) */}
              {(docType === 'factura' || docType === 'recibo') && (
                <div className="pt-2 border-t border-slate-800/40">
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5 font-mono">
                    Origen de Inventario para Deducción
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setInventorySource('general');
                        setCart([]); // Clear cart to avoid mixed stock sources
                      }}
                      className={`py-2 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border transition ${
                        inventorySource === 'general'
                          ? 'bg-slate-950 border-indigo-500/50 text-indigo-400 font-bold'
                          : 'bg-slate-955 border-slate-850 text-slate-450 hover:text-slate-200'
                      }`}
                    >
                      <span>📦</span> Almacén General
                    </button>
                    <button
                      type="button"
                      disabled={!selectedClient}
                      onClick={() => {
                        setInventorySource('consignacion');
                        setCart([]); // Clear cart to avoid mixed stock sources
                      }}
                      title={!selectedClient ? "Debe seleccionar un cliente primero" : "Deducir del inventario en consignación de este cliente"}
                      className={`py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border transition ${
                        !selectedClient
                          ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-900 text-slate-600'
                          : inventorySource === 'consignacion'
                          ? 'bg-slate-950 border-indigo-500/50 text-indigo-400 font-bold'
                          : 'bg-slate-955 border-slate-850 text-slate-450 hover:text-slate-200'
                      }`}
                    >
                      <span>🚚</span> Consignación
                    </button>
                  </div>
                  {!selectedClient && (
                    <p className="text-[9px] text-slate-500 mt-1.5 italic font-mono">
                      * Seleccione un cliente para habilitar la facturación desde su saldo de Consignación.
                    </p>
                  )}
                  {selectedClient && inventorySource === 'consignacion' && (
                    <p className="text-[10px] text-indigo-400 mt-1.5 font-medium font-mono leading-tight">
                      ℹ️ Descontando existencias del custodio. Solo aparecerán productos que este cliente posea en consignación.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Adding Products Search & Barcode Scan */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span className="text-indigo-405">🛍️</span> Agregar Productos
            </h3>
            <button
              type="button"
              onClick={() => onOpenScanner(triggerBarcodeInput)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-lg text-xs font-semibold select-none transition"
            >
              <Smartphone className="w-3.5 h-3.5" /> Escanear Código (Cámara)
            </button>
          </div>

          <div className="relative mb-3">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por nombre, código de barras o ID del producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-955 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-550"
            />
          </div>

          {searchTerm.trim() && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1 z-10 animate-fade-in shadow-md">
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No se encontraron productos coincidentes.</p>
              ) : (
                filteredProducts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="w-full flex items-center gap-3 p-2 hover:bg-slate-800/60 rounded-lg text-left text-xs transition border-b border-slate-900/40"
                  >
                    <div className="w-9 h-9 rounded bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img 
                        src={p.imageUrl || DEFAULT_PRODUCT_IMAGE} 
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-200 truncate capitalize">{p.name}</p>
                      <div className="flex items-center gap-1.5 text-[9.5px] text-slate-500 font-mono">
                        <span>ID Producto: {p.sku}</span>
                        <span>|</span>
                        <span>Cód: {p.id}</span>
                      </div>
                      {p.description && (
                        <p className="text-[10px] text-slate-400 italic line-clamp-1 mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 font-mono whitespace-nowrap space-y-0.5">
                      <p className="font-bold text-indigo-400 text-xs" title="Al detal en $">
                        Detal: {formatCurrency(p.priceUSD, 'USD')}
                      </p>
                      <p className="text-[10px] text-slate-400" title="Mayor en $">
                        Mayor: {formatCurrency(p.priceWholesaleUSD || Math.round(p.priceUSD*0.85*100)/100, 'USD')}
                      </p>
                      <p className="text-[9.5px] text-teal-400" title="Cuadrillas en Bs.">
                        Cuad: {formatCurrency(p.priceCuadrillasVES || Math.round((p.priceCuadrillasUSD || (p.priceUSD * 0.90)) * fixedRate * 100) / 100, 'VES')}
                      </p>
                      {p.binLocation && (
                        <p className="text-[9.5px] text-emerald-400" title="Ubicación BIN">
                          BIN: {p.binLocation}
                        </p>
                      )}
                      <span className="text-[9px] text-slate-450 block font-mono mt-0.5">
                        {inventorySource === 'consignacion' 
                          ? `En Consig: ${getMaxAvailableStock(p)} un` 
                          : `Stock: ${p.stock}`
                        }
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Current Sales Cart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-indigo-450" /> Descripción / Producto ({isBolivares ? 'Bs.' : '$'}) - Ítems ({cart.length})
          </h3>

          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-800/60 rounded-xl text-slate-500">
              <ShoppingCart className="w-10 h-10 mb-2 stroke-[1]" />
              <p className="text-xs">El carro de facturación está vacío.</p>
              <p className="text-[10px] text-slate-600 mt-1">Busca un producto arriba o escanea un código para comenzar.</p>
            </div>
          ) : (
            <div className="space-y-2.5 divide-y divide-slate-800/50">
              {cart.map((item, index) => (
                <div key={item.product.id} className={`flex items-center justify-between pt-2.5 ${index === 0 ? 'pt-0' : ''}`}>
                  <div className="w-8 h-8 rounded bg-slate-950 border border-slate-800 overflow-hidden flex-shrink-0 mr-2.5 self-center">
                    <img 
                      src={item.product.imageUrl || DEFAULT_PRODUCT_IMAGE} 
                      alt={item.product.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_PRODUCT_IMAGE;
                      }}
                    />
                  </div>
                  <div className="flex-1 pr-3 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 line-clamp-1 capitalize" title={item.product.name}>
                      <span className="text-indigo-400 font-mono font-bold mr-1">[{isBolivares ? 'Bs.' : '$'}]</span>
                      {item.product.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-slate-500 truncate max-w-[100px]">Cód: {item.product.id}</span>
                      
                      <select
                        value={item.selectedPriceType || 'detal'}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setCart(cart.map(x => x.product.id === item.product.id ? { ...x, selectedPriceType: val } : x));
                        }}
                        className="text-[10px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-indigo-400 font-bold font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        title="Seleccionar tipo de precio"
                      >
                        <option value="detal">
                          Al detal en $: {formatCurrency(item.product.priceUSD, 'USD')}
                        </option>
                        <option value="mayor">
                          Mayor en $: {formatCurrency(item.product.priceWholesaleUSD || Math.round(item.product.priceUSD * 0.85 * 100) / 100, 'USD')}
                        </option>
                        <option value="cuadrillas">
                          Cuadrillas en Bs.: {formatCurrency(item.product.priceCuadrillasVES || Math.round((item.product.priceCuadrillasUSD || (item.product.priceUSD * 0.90)) * fixedRate * 100) / 100, 'VES')}
                        </option>
                        <option value="detalVES">
                          Detal en Bs.: {formatCurrency(item.product.priceVES || Math.round(item.product.priceUSD * fixedRate * 100) / 100, 'VES')}
                        </option>
                        <option value="mayorVES">
                          Mayor en Bs.: {formatCurrency(item.product.priceWholesaleVES || Math.round((item.product.priceWholesaleUSD || (item.product.priceUSD * 0.85)) * fixedRate * 100) / 100, 'VES')}
                        </option>
                        {item.product.priceCuadrillasDetalUSD ? (
                          <option value="cuadrillasDetal">
                            Cuadrillas Detal en $: {formatCurrency(item.product.priceCuadrillasDetalUSD, 'USD')}
                          </option>
                        ) : null}
                        {item.product.priceMayorDetalUSD ? (
                          <option value="mayorDetal">
                            Mayor Detal en $: {formatCurrency(item.product.priceMayorDetalUSD, 'USD')}
                          </option>
                        ) : null}
                      </select>

                      <span className="text-[10px] bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded text-slate-400 font-mono">
                        P.U: {getItemUnitPriceDisplay(item)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Qty controller */}
                    <div className="flex items-center bg-slate-95 w-fit border border-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, -1)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.qty || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) {
                            const maxStock = getMaxAvailableStock(item.product);
                            let targetQty = val;
                            if (targetQty < 0) targetQty = 0;
                            if (targetQty > maxStock) {
                              alert(
                                inventorySource === 'consignacion'
                                  ? `⚠️ El cliente solo tiene ${maxStock} unids en consignación.`
                                  : `⚠️ Solo hay ${maxStock} unids en existencia.`
                              );
                              targetQty = maxStock;
                            }
                            setCart(cart.map(x => x.product.id === item.product.id ? { ...x, qty: targetQty } : x));
                          } else {
                            setCart(cart.map(x => x.product.id === item.product.id ? { ...x, qty: 0 } : x));
                          }
                        }}
                        onBlur={() => {
                          if (item.qty <= 0) {
                            setCart(cart.filter(x => x.product.id !== item.product.id));
                          }
                        }}
                        className="w-12 text-center text-xs font-bold text-slate-200 bg-slate-900 border-none outline-none font-mono focus:ring-1 focus:ring-indigo-500 rounded py-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-100 rounded transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Total USD / Bs */}
                    <div className="text-right w-28">
                      {isBolivares ? (
                        <>
                          <p className="text-xs font-bold text-indigo-400 font-mono">
                            {formatCurrency(getItemUnitPrice(item) * item.qty * fixedRate, 'VES')}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {formatCurrency(getItemUnitPrice(item) * item.qty, 'USD')}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-indigo-400 font-mono">
                            {formatCurrency(getItemUnitPrice(item) * item.qty, 'USD')}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {formatCurrency(getItemUnitPrice(item) * item.qty * fixedRate, 'VES')}
                          </p>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-slate-550 hover:text-rose-400 rounded transition"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Payments, Taxes and Summary */}
      <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
        {/* Payment Methods and Taxes */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-400" /> Método de Pago & Tasas
          </h3>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {(['Dólares Efectivo', 'Bolívares Pago Móvil', 'Bolívares Transferencia', 'Punto de Venta', 'Zelle', 'Binance', 'Zinli', 'Otro (Divisas)', 'Consignación Abierta'] as const).map((method) => {
              const active = paymentMethod === method;
              const isDivisa = method === 'Dólares Efectivo' || method === 'Zelle' || method === 'Binance' || method === 'Zinli' || method === 'Otro (Divisas)';
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`p-2 rounded-lg border text-left flex flex-col justify-between transition group h-16 select-none ${
                    active 
                      ? 'bg-indigo-600/10 border-indigo-500' 
                      : 'bg-slate-950 border-slate-850 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-[9px] font-mono block tracking-wider ${active ? 'text-indigo-400 font-extrabold' : 'text-slate-500'}`}>
                    {method === 'Consignación Abierta' ? 'CONSIGNACIÓN' : (isDivisa ? 'DIVISA ($)' : 'NACIONAL (Bs)')}
                  </span>
                  <p className={`text-xs font-semibold truncate ${active ? 'text-indigo-300' : 'text-slate-300'}`}>
                    {method}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Specify field for Other Foreign Currency payments */}
          {paymentMethod === 'Otro (Divisas)' && (
            <div className="mb-3 p-3 bg-slate-950 border border-slate-850 rounded-xl animate-scale-up">
              <label className="block text-[10px] text-indigo-400 uppercase font-bold mb-1 font-mono">Especifique el método (ej. PayPal, Mony, Wally):</label>
              <input
                type="text"
                required
                placeholder="Ej. PayPal, Wally, Mony, Banesco Panamá..."
                value={customPaymentMethod}
                onChange={(e) => setCustomPaymentMethod(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* IGTF Alert & Context Info */}
          {applyIgtf && docType === 'factura' && (
            <div className="flex items-start gap-2.5 bg-indigo-500/5 border border-indigo-505/20 rounded-xl p-3 mb-2">
              <AlertTriangle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-indigo-400/95 leading-normal font-sans">
                <strong>Alerta Impuesto IGTF (3%):</strong> De acuerdo a la providencia del SENIAT, los pagos recibidos en divisas (efectivo o canales electrónicos como Zelle, Binance o Zinli) están gravados con un 3% de recargo fiscal.
              </p>
            </div>
          )}

          {docType === 'consignacion' && (
            <div className="flex items-start gap-2.5 bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 mb-2">
              <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-indigo-400/95 leading-normal font-sans">
                <strong>Nota de Consignación:</strong> La mercancía se entrega en calidad de consignación para su venta periódica. El IVA se calculará una vez se facturen los reportes de venta correspondientes.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold font-mono block">Notas o Comentarios Adicionales</span>
            <textarea
              placeholder="Ej. Entregar en sede norte / pago verificado por caja..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-955 border border-slate-800 rounded-xl text-xs text-slate-205 placeholder-slate-600 focus:outline-none focus:border-indigo-550"
            />
          </div>
        </div>

        {/* Totals Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-indigo-450" /> Resumen de Totales
          </h3>

          <div className="bg-slate-950/60 rounded-xl border border-slate-850 p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 uppercase tracking-widest font-mono text-[10px]">Subtotal</span>
              <div className="text-right">
                {isBolivares ? (
                  <span className="font-semibold text-slate-200 block">{formatCurrency(subtotalVES, 'VES')}</span>
                ) : (
                  <span className="font-semibold text-slate-200 block">{formatCurrency(subtotalUSD, 'USD')}</span>
                )}
              </div>
            </div>

            {requiresIva && (
              <div className="flex justify-between items-center text-xs border-t border-slate-850 pt-2">
                <span className="text-slate-500 uppercase tracking-widest font-mono text-[10px]">I.V.A. (16% Seniat)</span>
                <div className="text-right">
                  {isBolivares ? (
                    <span className="font-semibold text-slate-200 block">{formatCurrency(ivaVES, 'VES')}</span>
                  ) : (
                    <span className="font-semibold text-slate-200 block">{formatCurrency(ivaUSD, 'USD')}</span>
                  )}
                </div>
              </div>
            )}

            {applyIgtf && docType === 'factura' && !isBolivares && (
              <div className="flex justify-between items-center text-xs border-t border-slate-850 pt-2">
                <span className="text-indigo-400 uppercase tracking-widest font-mono text-[10px]">I.G.T.F. (3% divisas)</span>
                <div className="text-right">
                  <span className="font-semibold text-indigo-400 block">{formatCurrency(igtfUSD, 'USD')}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center border-t border-slate-800 pt-3 mt-2">
              <span className="text-xs font-bold text-slate-100 uppercase tracking-widest font-mono">TOTAL FACTURADO</span>
              <div className="text-right">
                {isBolivares ? (
                  <span className="text-lg font-bold text-indigo-400 block">{formatCurrency(totalVES, 'VES')}</span>
                ) : (
                  <span className="text-lg font-bold text-indigo-400 block">{formatCurrency(totalUSD, 'USD')}</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest select-none shadow-lg mt-4 transition flex items-center justify-center gap-2 ${
              cart.length === 0
                ? 'bg-slate-950 border border-slate-850 text-slate-650 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-550 text-white shadow-xl'
            }`}
          >
            {docType === 'factura' ? '🧾 Emitir Factura Fiscal' : docType === 'cotizacion' ? '📋 Registrar Cotización' : docType === 'recibo' ? '💵 Emitir Recibo de Pago' : '🚚 Registrar Nota de Consignación'}
          </button>
        </div>
      </div>

      {/* COMPLETED TRANSACTION MODAL (RECEIPT GENERATOR) */}
      {completedTrx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div id="printable-billing-receipt" className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl p-6 relative animate-scale-up my-8">
            <button 
              type="button" 
              onClick={() => setCompletedTrx(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-900 no-print"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Stamp Logo & Document Header */}
            {completedTrx.type !== 'factura' ? (
              <div className="flex flex-col items-center text-center pb-4 mb-4 border-b border-zinc-900">
                <div className="w-12 h-12 bg-orange-500 text-zinc-950 rounded-xl flex items-center justify-center mb-2 font-black tracking-tighter text-base shadow-md shadow-orange-500/20">
                  CIMA
                </div>
                <h3 className="font-extrabold text-zinc-100 uppercase tracking-widest text-sm">
                  {companySettings.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A."}
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono">
                  RIF: {companySettings.rif || "J-50375018-9"} | Tel: {companySettings.phone || "0412 9862939 / 0212-9876543"}
                </p>
                <p className="text-[9px] text-zinc-500 italic max-w-md">
                  {companySettings.address || "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080"}
                </p>

                <div className="mt-3 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded px-3 py-1 font-mono text-xs uppercase font-extrabold tracking-wide">
                  {completedTrx.type === 'cotizacion' ? 'Cotización Formal' : completedTrx.type === 'recibo' ? 'Recibo de Pago de Caja' : 'Nota de Entrega en Consignación'}
                </div>
              </div>
            ) : (
              <div className="text-center pb-3 mb-3 border-b border-zinc-900/50 print:hidden">
                <span className="text-[10px] font-mono text-amber-400/80 uppercase tracking-widest px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 inline-block">
                  📄 Factura Fiscal (Formato para hoja membretada preimpresa)
                </span>
              </div>
            )}

            {/* Metadata Detail info */}
            <div className="grid grid-cols-2 gap-4 text-xs mb-4 p-3 bg-zinc-900/40 rounded-xl border border-zinc-900">
              <div>
                <p className="text-[10px] text-zinc-500 font-mono uppercase font-bold">Información del Cliente</p>
                <p className="font-bold text-zinc-200 mt-1">{completedTrx.clientName}</p>
                <p className="text-[11px] font-mono text-zinc-400">RIF: {completedTrx.clientRif}</p>
                {completedTrx.clientPhone && <p className="text-[10px] text-zinc-500">Tel: {completedTrx.clientPhone}</p>}
                {completedTrx.type === 'factura' && completedTrx.clientEmail && (
                  <p className="text-[10px] text-zinc-500">Envío: {completedTrx.clientEmail}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 font-mono uppercase font-bold">Detalle Documento</p>
                <p className="font-bold text-zinc-100 mt-1">{completedTrx.id}</p>
                <p className="text-[10px] font-mono text-zinc-400 mt-0.5">Fecha: {formatDateDDMMAAAA(completedTrx.timestamp)} {new Date(completedTrx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5"><span className="text-amber-500 font-bold">Vendedor:</span> {completedTrx.createdByName}</p>
                {isBolivaresPaymentMethod(completedTrx.paymentMethod) && (
                  <p className="text-[11px] font-mono font-bold text-amber-500 mt-1">Tasa BCV: {formatCurrency(completedTrx.exchangeRateUsed, 'VES')}</p>
                )}
              </div>
            </div>

            {/* Items table */}
            <div className="space-y-2 mb-4">
              {(() => {
                const isTrxBolivares = isBolivaresPaymentMethod(completedTrx.paymentMethod);
                return (
                  <>
                    <div className="grid grid-cols-12 gap-1 text-[10px] uppercase font-mono font-bold text-zinc-500 pb-1 border-b border-zinc-900">
                      <div className="col-span-6">Descripción / Producto ({isTrxBolivares ? 'Bs.' : '$'})</div>
                      <div className="col-span-2 text-center">Cant</div>
                      <div className="col-span-2 text-right">{isTrxBolivares ? 'P.U (Bs.)' : 'P.U ($)'}</div>
                      <div className="col-span-2 text-right">{isTrxBolivares ? 'Total (Bs.)' : 'Total ($)'}</div>
                    </div>
                    <div className="max-h-40 overflow-y-auto pr-1 space-y-1.5 divide-y divide-zinc-900/40">
                      {completedTrx.items.map((item, id) => (
                        <div key={id} className="grid grid-cols-12 gap-1 text-xs pt-1.5 first:pt-0">
                          <div className="col-span-6 font-medium text-zinc-300">
                            <p>
                              <span className="text-amber-400 font-mono font-bold mr-1">[{isTrxBolivares ? 'Bs.' : '$'}]</span>
                              {item.name}
                            </p>
                          </div>
                          <div className="col-span-2 text-center text-zinc-400 font-mono">{item.qty}</div>
                          <div className="col-span-2 text-right text-zinc-400 font-mono">
                            {isTrxBolivares 
                              ? formatCurrency(item.priceUSD * completedTrx.exchangeRateUsed, 'VES') 
                              : formatCurrency(item.priceUSD, 'USD')
                            }
                          </div>
                          <div className="col-span-2 text-right font-bold text-zinc-200 font-mono">
                            {isTrxBolivares 
                              ? formatCurrency(item.totalVES, 'VES') 
                              : formatCurrency(item.totalUSD, 'USD')
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Totals box */}
            {(() => {
              const isTrxBolivares = isBolivaresPaymentMethod(completedTrx.paymentMethod);
              return (
                <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-900 space-y-1.5 text-xs text-zinc-400 font-sans">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    {isTrxBolivares ? (
                      <span className="font-bold text-zinc-200">{formatCurrency(completedTrx.subtotalVES, 'VES')}</span>
                    ) : (
                      <span className="font-bold text-zinc-200">{formatCurrency(completedTrx.subtotalUSD, 'USD')}</span>
                    )}
                  </div>
                  {completedTrx.ivaPercent > 0 && (
                    <div className="flex justify-between">
                      <span>I.V.A. Seniat ({completedTrx.ivaPercent}%)</span>
                      {isTrxBolivares ? (
                        <span className="font-bold text-zinc-200">{formatCurrency(completedTrx.ivaVES, 'VES')}</span>
                      ) : (
                        <span className="font-bold text-zinc-200">{formatCurrency(completedTrx.ivaUSD, 'USD')}</span>
                      )}
                    </div>
                  )}
                  {!isTrxBolivares && completedTrx.igtfPercent > 0 && (
                    <div className="flex justify-between text-amber-500/95 font-medium">
                      <span>I.G.T.F. en Divisas ({completedTrx.igtfPercent}%)</span>
                      <span>{formatCurrency(completedTrx.igtfUSD, 'USD')}</span>
                    </div>
                  )}

                  <div className="border-t border-zinc-800 pt-2 flex justify-between items-center mt-2">
                    {isTrxBolivares ? (
                      <>
                        <span className="font-bold text-zinc-200 uppercase text-[10px]">Total en Bolívares (Bs.)</span>
                        <span className="text-base font-black text-amber-400">{formatCurrency(completedTrx.totalVES, 'VES')}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-zinc-200 uppercase text-[10px]">Total en Dólares ($)</span>
                        <span className="text-base font-black text-amber-400">{formatCurrency(completedTrx.totalUSD, 'USD')}</span>
                      </>
                    )}
                  </div>
                  <div className="border-t border-zinc-800 pt-2 text-[10px] text-zinc-500 font-mono text-center">
                    Pago realizado por medio de: <strong>{completedTrx.paymentMethod}</strong>
                  </div>
                </div>
              );
            })()}

            {/* Actions for Venezuela PDF Print Simulation */}
            <div className="flex gap-3 justify-end mt-5 border-t border-zinc-90 w-full pt-4 no-print">
              <div className="mr-auto text-left text-[9px] text-zinc-500 max-w-[200px] leading-snug">
                * Seniat provisión. Facturación electrónica bilingüe en divisas ley art 11 BCV.
              </div>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 hover:text-zinc-100 rounded-lg text-xs font-semibold select-none transition"
              >
                🖨️ Imprimir Recibo / Factura
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    downloadTransactionPDF(completedTrx, companySettings);
                  } catch (error) {
                    console.error("Error generating PDF:", error);
                    alert("Ocurrió un error al generar el archivo PDF.");
                  }
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
              >
                📥 Descargar PDF Formato Fiscal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
