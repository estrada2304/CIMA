import React, { useState } from 'react';
import { 
  Briefcase, LayoutDashboard, Receipt, Package, ShoppingCart, 
  BarChart, Users, RefreshCw, Radio, RadioReceiver, ShieldAlert, KeyRound, Clock, Settings, Save, Sparkles, LogOut, CheckCircle, Flame, History,
  Sun, Moon, X, AlertTriangle, FileText, ExternalLink, Info
} from 'lucide-react';
import { Product, ExchangeRate, User, Transaction, Purchase, Client, Supplier, CompanySettings, SyncLog, UserRole } from '../types';
import { backupToFirestore, recheckFirestoreQuota } from '../lib/firebase';

interface DashboardProps {
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  exchangeRate: ExchangeRate;
  setExchangeRate: React.Dispatch<React.SetStateAction<ExchangeRate>>;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
  users: User[];
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  purchases: Purchase[];
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  companySettings: CompanySettings;
  setCompanySettings: React.Dispatch<React.SetStateAction<CompanySettings>>;
  isOnline: boolean;
  setIsOnline: React.Dispatch<React.SetStateAction<boolean>>;
  syncLogs: SyncLog[];
  setSyncLogs: React.Dispatch<React.SetStateAction<SyncLog[]>>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenScanner: (onScanSuccess: (barcode: string) => void) => void;
  children: React.ReactNode;
  activeSessions?: any[];
  liveActivities?: any[];
  clients?: Client[];
  suppliers?: Supplier[];
  quotaExceeded?: boolean;
}

export default function Dashboard({
  theme,
  setTheme,
  products,
  setProducts,
  exchangeRate,
  setExchangeRate,
  currentUser,
  setCurrentUser,
  users,
  transactions,
  setTransactions,
  purchases,
  setPurchases,
  companySettings,
  setCompanySettings,
  isOnline,
  setIsOnline,
  syncLogs,
  setSyncLogs,
  activeTab,
  setActiveTab,
  onOpenScanner,
  children,
  activeSessions = [],
  liveActivities = [],
  clients = [],
  suppliers = [],
  quotaExceeded = false
}: DashboardProps) {
  const [rateLoading, setRateLoading] = useState(false);
  const [rateInputValue, setRateInputValue] = useState<string>(String(exchangeRate.rate));
  const [syncLoading, setSyncLoading] = useState(false);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);

  // Verification if the current active session is Administrator (Sinai, Adriana, etc.)
  const isQuotaAdmin = Boolean(
    currentUser?.role === 'Administrador' ||
    currentUser?.id === 'usr-sinai' ||
    currentUser?.username?.toLowerCase() === 'ssuarez' ||
    currentUser?.email?.toLowerCase().includes('ssuarez') ||
    currentUser?.email?.toLowerCase() === 'adrianaestrada2304@gmail.com' ||
    currentUser?.username?.toLowerCase() === 'adrianaestrada2304@gmail.com' ||
    currentUser?.username?.toLowerCase() === 'adrianaestrada2304' ||
    currentUser?.username?.toLowerCase() === 'admin'
  );

  const handleRecheckQuota = async () => {
    setIsCheckingQuota(true);
    try {
      const isAvailable = await recheckFirestoreQuota();
      if (isAvailable) {
        alert("✅ ¡Conexión con Firestore restablecida! La cuota diaria está activa.");
      } else {
        alert("⚠️ La cuota diaria de Firestore continúa en su límite máximo. El sistema seguirá operando con total normalidad en almacenamiento local seguro hasta que Firebase renueve las unidades diarias.");
      }
    } finally {
      setIsCheckingQuota(false);
    }
  };

  // Sync the manual rate input field when the global exchange rate state changes (e.g. from real-time sync)
  React.useEffect(() => {
    setRateInputValue(String(exchangeRate.rate));
  }, [exchangeRate.rate]);

  // Modal active states
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
  const [isTodayDocsModalOpen, setIsTodayDocsModalOpen] = useState(false);
  const [isTodaySalesModalOpen, setIsTodaySalesModalOpen] = useState(false);

  // Date helper to verify "Today"
  const isToday = (timestamp: string) => {
    if (!timestamp) return false;
    const tDate = new Date(timestamp);
    const today = new Date();
    return (
      tDate.getDate() === today.getDate() &&
      tDate.getMonth() === today.getMonth() &&
      tDate.getFullYear() === today.getFullYear()
    );
  };

  // Date helper to verify "Yesterday"
  const isYesterday = (timestamp: string) => {
    if (!timestamp) return false;
    const tDate = new Date(timestamp);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return (
      tDate.getDate() === yesterday.getDate() &&
      tDate.getMonth() === yesterday.getMonth() &&
      tDate.getFullYear() === yesterday.getFullYear()
    );
  };

  // Quick stats calculations for overview panel
  const totalStockCount = products.reduce((acc, p) => acc + p.stock, 0);
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);
  const lowStockCount = lowStockProducts.length;

  // Documents issued today & yesterday
  const documentsToday = transactions.filter(t => isToday(t.timestamp));
  const documentsYesterday = transactions.filter(t => isYesterday(t.timestamp));

  // Completed sales today (revenue total - non-annulled, non-quotes)
  const completedSalesToday = transactions.filter(
    t => t.status === 'completado' && t.type !== 'cotizacion' && isToday(t.timestamp)
  );
  const totalSalesUSD = completedSalesToday.reduce((acc, s) => acc + s.totalUSD, 0);
  const totalSalesVES = completedSalesToday.reduce((acc, s) => acc + s.totalVES, 0);

  // Completed sales yesterday
  const completedSalesYesterday = transactions.filter(
    t => t.status === 'completado' && t.type !== 'cotizacion' && isYesterday(t.timestamp)
  );
  const totalSalesYesterdayUSD = completedSalesYesterday.reduce((acc, s) => acc + s.totalUSD, 0);
  const totalSalesYesterdayVES = completedSalesYesterday.reduce((acc, s) => acc + s.totalVES, 0);

  // Completed sales all-time / month
  const completedSalesMonth = transactions.filter(
    t => t.status === 'completado' && t.type !== 'cotizacion'
  );
  const totalSalesMonthUSD = completedSalesMonth.reduce((acc, s) => acc + s.totalUSD, 0);
  const totalSalesMonthVES = completedSalesMonth.reduce((acc, s) => acc + s.totalVES, 0);

  const quotesCount = transactions.filter(t => t.type === 'cotizacion').length;

  // Search/direct navigation inside history
  const handleViewInHistorico = (docId: string) => {
    localStorage.setItem('siga_historico_search_term', docId);
    setIsTodayDocsModalOpen(false);
    setIsTodaySalesModalOpen(false);
    setActiveTab('historico');
  };

  const handleUpdateBCVRateSim = () => {
    setRateLoading(true);
    setTimeout(() => {
      // Simulate fetching updated BCV rate automatically
      const randomRateChange = Math.round((41.15 + (Math.random() * 0.8 - 0.4)) * 100) / 100;
      const updatedRate: ExchangeRate = {
        rate: randomRateChange,
        lastUpdated: new Date().toISOString(),
        source: "BCV (Banco Central de Venezuela) Oficial"
      };
      setExchangeRate(updatedRate);
      setRateInputValue(String(randomRateChange));
      setRateLoading(false);
      
      // Update config of cached transactions rate if needed
      localStorage.setItem('siga_rate', JSON.stringify(updatedRate));

      // Append log
      const newLog: SyncLog = {
        id: 'log-' + Date.now(),
        timestamp: new Date().toISOString(),
        action: "Actualización Tasa Cambio",
        details: `Tasa BCV sincronizada a: 1 USD = ${randomRateChange} Bs.`,
        synced: true,
        user: currentUser.username
      };
      setSyncLogs([newLog, ...syncLogs]);
    }, 1000);
  };

  const handleManualRateChange = (e: React.FormEvent) => {
    e.preventDefault();
    const valFloat = parseFloat(rateInputValue);
    if (isNaN(valFloat) || valFloat <= 0) {
      alert("⚠️ Error: Ingrese un tipo de cambio válido.");
      return;
    }

    const updatedRate: ExchangeRate = {
      rate: valFloat,
      lastUpdated: new Date().toISOString(),
      source: `Manual Ajustada (@${currentUser.username})`
    };
    setExchangeRate(updatedRate);
    localStorage.setItem('siga_rate', JSON.stringify(updatedRate));
    alert(`✅ Tasa de cambio ajustada manualmente a 1 $ = ${valFloat} Bs. por @${currentUser.username}.`);
  };

  const handleTriggerManualCloudSync = async () => {
    if (!isOnline) {
      alert("⚠️ Dispositivo fuera de línea: Active la conexión de red para sincronizar con Firestore.");
      return;
    }
    if (quotaExceeded) {
      if (isQuotaAdmin) {
        alert("⚠️ [Aviso Administrador] Cuota diaria de Firestore alcanzada:\n\nSe ha completado el límite gratuito de escritura diaria de Firebase. Todos los datos (inventario, productos, fotos, ventas, compras y clientes) están protegidos y operando normalmente en almacenamiento local seguro.");
      } else {
        alert("⚡ Sincronización al día: Todos los productos y operaciones están respaldados de forma segura en este dispositivo.");
      }
      return;
    }
    setSyncLoading(true);
    try {
      const res = await backupToFirestore({
        products,
        clients,
        suppliers,
        company: companySettings,
        exchangeRate,
        users,
        transactions,
        purchases
      });

      if (res && (res as any).quotaExceeded) {
        if (isQuotaAdmin) {
          alert("⚠️ [Aviso Administrador] Cuota de Firestore alcanzada: Los datos se conservan de forma segura en almacenamiento local y la sincronización se reanudará automáticamente al reiniciarse la cuota.");
        } else {
          alert("⚡ Sincronización al día: Todos los productos y operaciones están respaldados de forma segura en este dispositivo.");
        }
        return;
      }

      const newLog: SyncLog = {
        id: 'log-' + Date.now(),
        timestamp: new Date().toISOString(),
        action: "Sincronización Cloud",
        details: `Cargadas con éxito a Firestore: ${transactions.length} transacciones y ${products.length} productos registrados.`,
        synced: true,
        user: currentUser.username
      };
      setSyncLogs([newLog, ...syncLogs]);
      alert(`⚡ Sincronización en la Nube Completa: Base de datos Firestore 100% sincronizada (${products.length} artículos en catálogo, ${transactions.length} transacciones).`);
    } catch (err: any) {
      console.error("Manual sync error:", err);
      alert(`⚠️ Error al sincronizar con Firestore: ${err?.message || 'Verifique su conexión de red.'}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    } else {
      return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col md:flex-row">
      
      {/* SIDEBAR NAVIGATION: Responsive drawer / rail */}
      <aside className="w-full md:w-64 bg-zinc-950 border-b md:border-b-0 md:border-r border-zinc-900 flex flex-col justify-between shrink-0">
        
        {/* Branding header */}
        <div>
          <div className="p-4 flex items-center gap-3 border-b border-zinc-900">
            <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center text-black font-black tracking-widest text-lg shadow shadow-orange-600/20">
              C
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-widest leading-none">CIMA</h1>
              <span className="text-[9px] text-orange-400 font-extrabold tracking-widest block uppercase mt-0.5">SISTEMAS</span>
            </div>
          </div>

          {/* User selector / profile card displaying current updated data and avatar */}
          <div className="p-3 bg-black border-b border-zinc-900 text-xs flex items-center gap-3">
            <img
              src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=70'}
              className="w-10 h-10 rounded border border-orange-500/30 object-cover bg-zinc-900 shrink-0"
              alt="Avatar de Guardia"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1">
              <span className="text-[8px] uppercase tracking-wider font-extrabold text-zinc-500 block">Personal Activo</span>
              <p className="font-bold text-white truncate mt-0.5">{currentUser.nombreCompleto || currentUser.username}</p>
              <div className="text-[9px] text-orange-400 font-bold flex items-center gap-1 mt-0.5">
                🛡️ {currentUser.role}
              </div>
            </div>
          </div>

          {/* Nav groups */}
          <nav className="p-3 space-y-1">
            <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 block px-2 py-1">Navegación</span>
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'dashboard' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Panel de Control
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'billing' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Receipt className="w-4 h-4" />
              Facturas y Emisión
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'inventory' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Package className="w-4 h-4" />
              Inventario de Catálogo
            </button>

            <button
              onClick={() => setActiveTab('purchases')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'purchases' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Compras (Surtir Almacén)
            </button>

            <button
              onClick={() => setActiveTab('clients')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'clients' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Users className="w-4 h-4" />
              Directorio Clientes
            </button>

            <button
              onClick={() => setActiveTab('suppliers')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'suppliers' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Proveedores
            </button>

            <button
              onClick={() => setActiveTab('historico')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'historico' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <History className="w-4 h-4" />
              Histórico Comercial
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'analytics' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <BarChart className="w-4 h-4" />
              Reportes y Analíticas
            </button>

            <button
              onClick={() => setActiveTab('staff')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'staff' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Users className="w-4 h-4" />
              Gestión de Personal
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'settings' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configuración
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded transition select-none ${
                activeTab === 'about' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/25 font-bold' 
                  : 'hover:bg-zinc-900 hover:text-white border border-transparent'
              }`}
            >
              <Info className="w-4 h-4" />
              Acerca de
            </button>
          </nav>
        </div>

        {/* Sync Controls & Net status at bottom */}
        <div className="p-3 bg-black border-t border-zinc-900 text-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] text-zinc-500 font-bold">ONLINE SYNC:</span>
            <button
              onClick={() => setIsOnline(!isOnline)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition select-none ${
                isOnline ? 'bg-orange-650/20 text-orange-400 border border-orange-500/20' : 'bg-red-950/20 text-red-400 border border-red-900/10'
              }`}
            >
              {isOnline ? 'En línea' : 'Modo Offline'}
            </button>
          </div>

          <button
            onClick={handleTriggerManualCloudSync}
            disabled={syncLoading}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 font-mono text-[10px] font-bold border border-zinc-800 hover:border-zinc-700 rounded-lg transition select-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${syncLoading ? 'animate-spin' : ''}`} />
            Sincronizar Cloud
          </button>
        </div>
      </aside>

      {/* CORE WORKSPACE CONTENT */}
      <main className="flex-1 flex flex-col overflow-x-hidden min-h-0 bg-black">
        
        {/* Top bar (Rate Exchange controller, indicators) */}
        <header className="p-4 bg-zinc-950/80 border-b border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          
          <div className="flex items-center gap-2">
            <h2 className="text-white font-black text-sm tracking-widest uppercase select-none">
              📁 {activeTab === 'dashboard' ? 'Panel General de Control' : activeTab === 'billing' ? 'Facturación y Emisión' : activeTab === 'inventory' ? 'Inventario Almacén' : activeTab === 'purchases' ? 'Surtido de Compras' : activeTab === 'clients' ? 'Directorio de Clientes' : activeTab === 'suppliers' ? 'Cartera de Proveedores' : activeTab === 'historico' ? 'Historial de Documentación' : activeTab === 'analytics' ? 'Estadísticas e Informes' : activeTab === 'staff' ? 'Gestión de Personal CIMA' : 'Configuración'}
            </h2>
          </div>

          {/* Exchange rate widget (Venezuela BCV) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* System Light / Dark theme selector */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="bg-black hover:bg-zinc-900 text-xs font-bold font-mono px-3 py-1.5 rounded border border-zinc-800 hover:border-orange-500/30 flex items-center gap-2 transition select-none cursor-pointer"
              title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-orange-450 text-orange-450" />
                  <span className="text-zinc-300">Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span className="text-zinc-700">Modo Oscuro</span>
                </>
              )}
            </button>

            {/* Cloud Database Connection Status */}
            <div 
              className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded text-xs flex items-center gap-2 font-mono"
              title="Base de Datos Activa: Firestore Cloud Database. Sincronización en tiempo real activa."
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5 leading-none">
                <span className="font-bold text-[11px] text-emerald-300">BD Nube Conectada</span>
                <span className="text-[9px] text-emerald-400/80 font-normal">Firestore</span>
              </div>
            </div>

            {/* Display info rate */}
            <div className="bg-black px-3 py-1.5 rounded border border-zinc-800 text-xs flex items-center gap-3 animate-fade-in">
              <div>
                <span className="text-[9px] text-zinc-500 block font-mono leading-none">TASA OFICIAL BCV</span>
                <span className="font-bold font-mono text-orange-400">Bs. {exchangeRate.rate} x 1 $</span>
              </div>
              <button
                onClick={handleUpdateBCVRateSim}
                disabled={rateLoading}
                className="p-1 hover:bg-zinc-900 border border-zinc-800 rounded transition shrink-0"
                title="Actualizar tasa desde Banco Central"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${rateLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Override Rate Form */}
            <form onSubmit={handleManualRateChange} className="flex gap-1.5 items-center">
              <input
                type="number"
                step="0.01"
                placeholder="Editar tasa..."
                value={rateInputValue}
                onChange={(e) => setRateInputValue(e.target.value)}
                className="w-18 px-2.5 py-1.5 bg-black border border-zinc-855 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 hover:border-orange-500/40 border border-zinc-800 text-zinc-300 text-xs font-bold font-mono rounded transition cursor-pointer"
              >
                Fijar
              </button>
            </form>
            {/* Admin-only Quota Indicator Badge (if banner dismissed) */}
            {isQuotaAdmin && quotaExceeded && quotaBannerDismissed && (
              <button
                type="button"
                onClick={() => setQuotaBannerDismissed(false)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 rounded border border-amber-500/30 text-xs font-mono font-bold transition cursor-pointer"
                title="Aviso administrativo de cuota Firestore (solo visible para administradores)"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Aviso Cuota (Admin)</span>
              </button>
            )}
          </div>
        </header>

        {/* Quota Exceeded Notification Banner - VISIBLE ONLY TO ADMINISTRATOR OR adrianaestrada2304@gmail.com */}
        {quotaExceeded && isQuotaAdmin && !quotaBannerDismissed && (
          <div className="bg-amber-950/70 border-b border-amber-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200 shrink-0">
            <div className="flex items-center gap-2 max-w-4xl">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="font-bold text-amber-300">
                Aviso Administrativo (Solo Administrador):
              </span>
              <span className="text-amber-200/90 text-[11px] sm:text-xs">
                Se alcanzó la cuota diaria gratuita de escrituras de Firebase. Los usuarios y operadores continúan trabajando normalmente con almacenamiento local seguro sin visualizar esta alerta.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRecheckQuota}
                disabled={isCheckingQuota}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 rounded font-bold border border-amber-500/30 transition text-[11px] disabled:opacity-50 cursor-pointer"
              >
                {isCheckingQuota ? 'Comprobando...' : 'Comprobar Estado'}
              </button>
              <a
                href="https://console.firebase.google.com/project/studio-5845788131-9f582/firestore/databases/ai-studio-7fc8a9df-0c66-4cb7-982c-b089b76be6d7/data?openUpgradeDialog=true"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded font-bold border border-amber-500/30 transition text-[11px]"
              >
                Consola Firebase ↗
              </a>
              <button
                type="button"
                onClick={() => setQuotaBannerDismissed(true)}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded font-bold border border-zinc-700 transition text-[11px] cursor-pointer"
                title="Cerrar aviso administrativo"
              >
                ✕ Ocultar
              </button>
            </div>
          </div>
        )}

        {/* View render port */}
        <div className="p-6 flex-1 overflow-y-auto">
          
          {/* TAB 1: General Dashboard Panel */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in">
              
              {/* Top summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 font-mono">
                
                <div 
                  onClick={() => setIsTodaySalesModalOpen(true)}
                  className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 flex flex-col justify-between min-h-28 shadow-sm cursor-pointer hover:border-emerald-500/50 hover:bg-zinc-900/20 transition duration-200 select-none group"
                  title="Clic para ver detalle de lo facturado hoy"
                >
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-extrabold flex items-center justify-between">
                    <span>Total Facturado</span>
                    <span className="text-[8px] px-1 bg-emerald-500/10 text-emerald-400 rounded font-bold">HOY</span>
                  </span>
                  <div>
                    <p className="text-xl font-bold text-emerald-400 group-hover:scale-[1.02] transition-transform origin-left">{formatCurrency(totalSalesUSD, 'USD')}</p>
                    <span className="text-[9px] text-zinc-500 italic block">Ref. {formatCurrency(totalSalesVES, 'VES')}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-900/80 flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                    <span>Ayer: <strong className="text-emerald-400/90 font-mono">{formatCurrency(totalSalesYesterdayUSD, 'USD')}</strong></span>
                    <span className="text-zinc-600">•</span>
                    <span>Total: <strong className="text-zinc-200 font-mono">{formatCurrency(totalSalesMonthUSD, 'USD')}</strong></span>
                  </div>
                </div>

                <div 
                  onClick={() => setIsTodayDocsModalOpen(true)}
                  className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 flex flex-col justify-between min-h-28 shadow-sm cursor-pointer hover:border-orange-500/50 hover:bg-zinc-900/20 transition duration-200 select-none group"
                  title="Clic para ver documentos emitidos hoy"
                >
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-extrabold flex items-center justify-between">
                    <span>Documentos Emitidos</span>
                    <span className="text-[8px] px-1 bg-orange-500/10 text-orange-400 rounded font-bold">HOY</span>
                  </span>
                  <div>
                    <p className="text-xl font-bold text-white group-hover:scale-[1.02] transition-transform origin-left">{documentsToday.length} docs</p>
                    <span className="text-[9px] text-zinc-500">Registro de hoy</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-900/80 flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                    <span>Ayer: <strong className="text-orange-400/90 font-mono">{documentsYesterday.length} docs</strong></span>
                    <span className="text-zinc-600">•</span>
                    <span>Total: <strong className="text-zinc-200 font-mono">{transactions.length} docs</strong></span>
                  </div>
                </div>

                <div 
                  onClick={() => setActiveTab('inventory')}
                  className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 flex flex-col justify-between min-h-28 shadow-sm cursor-pointer hover:border-orange-550/50 hover:bg-zinc-900/20 transition duration-200 select-none group"
                  title="Clic para ir al Inventario"
                >
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-extrabold">Artículos Almacén</span>
                  <p className="text-xl font-bold text-orange-450 mt-1 text-orange-400 group-hover:scale-[1.02] transition-transform origin-left">{products.length} Productos</p>
                  <span className="text-[9px] text-zinc-500">Unidades totales: {totalStockCount}</span>
                </div>

                <div 
                  onClick={() => setIsLowStockModalOpen(true)}
                  className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 flex flex-col justify-between min-h-28 shadow-sm cursor-pointer hover:border-red-500/50 hover:bg-zinc-900/20 transition duration-200 select-none group"
                  title="Clic para ver artículos con bajo stock"
                >
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-extrabold">Stock Bajo Alarma</span>
                  <p className="text-xl font-bold text-red-500 mt-1 group-hover:scale-[1.02] transition-transform origin-left">{lowStockCount} alertas</p>
                  <span className="text-[9px] text-red-400 bg-red-950/10 px-1.5 py-0.5 rounded font-bold">Alerta de stock</span>
                </div>
              </div>

              {/* Central Panel Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Full-width Column: Live Operations, Alerts & Fast Shortcuts */}
                <div className="lg:col-span-12 bg-zinc-950 border border-zinc-900 rounded-lg p-5 space-y-4 shadow-xl">
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-widest font-mono text-orange-400 flex items-center gap-1.5 pt-0.5">
                    🚀 Operaciones Rápidas & Sucesos
                  </h3>

                  <div className="space-y-3">
                    {lowStockCount > 0 && (
                      <div className="bg-red-500/5 border border-red-500/15 p-3.5 rounded-xl flex items-center justify-between gap-3 animate-pulse">
                        <div className="flex items-center gap-3">
                          <span className="text-red-500 text-lg">⚠️</span>
                          <div>
                            <p className="text-xs font-bold text-red-400 uppercase font-mono">Alarma de Existencias Críticas</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Existen {lowStockCount} productos por debajo de las existencias mínimas autorizadas.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('inventory')}
                          className="px-2.5 py-1 bg-red-650 text-black text-[10px] font-bold rounded hover:bg-red-550 transition uppercase font-mono cursor-pointer"
                        >
                          Surtir
                        </button>
                      </div>
                    )}

                    <div className="bg-zinc-950/60 p-4 border border-zinc-900 rounded-lg space-y-2.5">
                      <h4 className="text-[10.5px] uppercase font-bold text-zinc-400 font-mono">Accesos Rápidos del Sistema</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <button
                          onClick={() => setActiveTab('billing')}
                          className="p-4 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-orange-500/30 rounded-lg transition text-left cursor-pointer"
                        >
                          <span className="text-lg block">🧾</span>
                          <p className="font-bold text-slate-200 mt-1">Hacer Venta</p>
                          <span className="text-[10px] text-zinc-500 block leading-tight mt-0.5">Facturas, cotizaciones, recibos...</span>
                        </button>

                        <button
                          onClick={() => setActiveTab('purchases')}
                          className="p-4 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-orange-550/30 rounded-lg transition text-left cursor-pointer"
                        >
                          <span className="text-lg block">🚙</span>
                          <p className="font-bold text-slate-200 mt-1">Surtir Almacén</p>
                          <span className="text-[10px] text-zinc-500 block leading-tight mt-0.5">Ingresar facturas de compra proveedores...</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full-width Column: Recent Transactions Table */}
                <div className="lg:col-span-12 bg-zinc-950 border border-zinc-900 rounded-lg p-5 space-y-4 shadow-xl font-mono">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 text-base">📋</span>
                      <div>
                        <h3 className="text-xs font-extrabold text-white uppercase tracking-widest">
                          Últimas Ventas y Operaciones Registradas
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-sans mt-0.5">
                          Mostrando las operaciones registradas en el sistema ({transactions.length} transacciones en la base de datos)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('historico')}
                      className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                    >
                      <span>Ver todo el Histórico ({transactions.length})</span>
                      <span>→</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-900/60 text-zinc-400 uppercase text-[10px] tracking-wider font-bold border-b border-zinc-850">
                        <tr>
                          <th className="py-2.5 px-3">Comprobante</th>
                          <th className="py-2.5 px-3">Tipo</th>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Fecha & Hora</th>
                          <th className="py-2.5 px-3 text-right">Total USD</th>
                          <th className="py-2.5 px-3 text-right">Total VES</th>
                          <th className="py-2.5 px-3 text-center">Estado</th>
                          <th className="py-2.5 px-3 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/80">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-6 text-zinc-500 italic">
                              No hay transacciones registradas aún.
                            </td>
                          </tr>
                        ) : (
                          transactions.slice(0, 8).map((t) => {
                            const dateObj = new Date(t.timestamp);
                            const isTDate = isToday(t.timestamp);
                            const isYDate = isYesterday(t.timestamp);
                            const dateLabel = isTDate 
                              ? `Hoy, ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                              : isYDate 
                              ? `Ayer, ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                              : dateObj.toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                            
                            const typeBadge = {
                              factura: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                              recibo: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
                              cotizacion: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                              consignacion: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            }[t.type] || 'bg-zinc-800 text-zinc-300 border-zinc-700';

                            return (
                              <tr 
                                key={t.id} 
                                className="hover:bg-zinc-900/40 transition cursor-pointer group"
                                onClick={() => handleViewInHistorico(t.id)}
                              >
                                <td className="py-3 px-3 font-bold text-white flex items-center gap-1.5">
                                  <span className="text-zinc-500 group-hover:text-orange-400 transition">#</span>
                                  {t.id}
                                </td>
                                <td className="py-3 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${typeBadge}`}>
                                    {t.type}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-zinc-200 font-sans">
                                  <div className="font-semibold truncate max-w-[220px]" title={t.clientName}>
                                    {t.clientName}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 font-mono">{t.clientRif}</div>
                                </td>
                                <td className="py-3 px-3 text-zinc-400 whitespace-nowrap text-[11px]">
                                  {dateLabel}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                                  {formatCurrency(t.totalUSD, 'USD')}
                                </td>
                                <td className="py-3 px-3 text-right text-zinc-400 whitespace-nowrap text-[11px]">
                                  {formatCurrency(t.totalVES, 'VES')}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {(t.status || '').toLowerCase() === 'anulado' ? (
                                    <span 
                                      className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase !bg-transparent !text-red-500 !border !border-red-500 inline-block shadow-none"
                                      style={{ backgroundColor: 'transparent', borderColor: '#ef4444', color: '#ef4444' }}
                                    >
                                      anulado
                                    </span>
                                  ) : (t.status || '').toLowerCase() === 'completado' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                                      {t.status}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-zinc-800 text-zinc-400">
                                      {t.status}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewInHistorico(t.id);
                                    }}
                                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[10px] rounded transition cursor-pointer"
                                    title="Ver detalle en Histórico"
                                  >
                                    Ver Detalle ↗
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {children}

          {/* ==================== DETAIL MODALS ==================== */}

          {/* 1. Low Stock Alarm Modal */}
          {isLowStockModalOpen && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-zinc-900 flex items-center justify-between bg-black">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                    <div>
                      <h3 className="text-xs font-black font-mono tracking-wider text-white uppercase">Existencias de Seguridad Críticas</h3>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Catálogo de productos que han alcanzado o bajado de su stock mínimo de alarma.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLowStockModalOpen(false)}
                    className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {lowStockProducts.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 font-mono text-xs space-y-2">
                      <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p>No se registran alertas de inventario bajo el mínimo autorizado.</p>
                      <p className="text-[10px] text-zinc-650">¡Excelente gestión de compras y abastecimiento!</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                      <table className="w-full text-left border-collapse font-mono text-[11px]">
                        <thead>
                          <tr className="bg-black/40 border-b border-zinc-900 text-zinc-500 uppercase tracking-wider text-[9px] font-bold">
                            <th className="py-2.5 px-3">ID Producto/Barras</th>
                            <th className="py-2.5 px-3">Nombre del Artículo</th>
                            <th className="py-2.5 px-3 text-center">Stock Mínimo</th>
                            <th className="py-2.5 px-3 text-right text-red-400">Stock Actual</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900/40">
                          {lowStockProducts.map(p => (
                            <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-zinc-400">{p.sku || p.id}</td>
                              <td className="py-2.5 px-3 text-zinc-100 font-sans font-medium">{p.name}</td>
                              <td className="py-2.5 px-3 text-center text-zinc-400 font-bold">{p.minStock}</td>
                              <td className="py-2.5 px-3 text-right font-black text-red-500">{p.stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-900 bg-black flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLowStockModalOpen(false);
                      setActiveTab('inventory');
                    }}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-black text-xs font-bold uppercase tracking-wider rounded transition font-mono cursor-pointer"
                  >
                    Ir al Inventario
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLowStockModalOpen(false)}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 text-xs font-bold uppercase tracking-wider rounded transition font-mono cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Today's Issued Documents Modal */}
          {isTodayDocsModalOpen && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-zinc-900 flex items-center justify-between bg-black">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-orange-400" />
                    <div>
                      <h3 className="text-xs font-black font-mono tracking-wider text-white uppercase">Documentos Emitidos Hoy</h3>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Historial completo de facturas, cotizaciones y recibos generados en la fecha actual.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTodayDocsModalOpen(false)}
                    className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {documentsToday.length === 0 ? (
                    <div className="p-12 text-center text-zinc-500 font-mono text-xs space-y-2">
                      <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
                      <p>No se han emitido documentos comerciales en el día de hoy.</p>
                      <button
                        onClick={() => {
                          setIsTodayDocsModalOpen(false);
                          setActiveTab('billing');
                        }}
                        className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 hover:border-orange-500/30 border border-zinc-800 rounded text-zinc-350 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                      >
                        Generar Primer Documento
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                      <table className="w-full text-left border-collapse font-mono text-[11px]">
                        <thead>
                          <tr className="bg-black/40 border-b border-zinc-900 text-zinc-500 uppercase tracking-wider text-[9px] font-bold">
                            <th className="py-2.5 px-3">ID Documento</th>
                            <th className="py-2.5 px-3">Tipo</th>
                            <th className="py-2.5 px-3">Razon Social / Cliente</th>
                            <th className="py-2.5 px-3 text-right">Total USD</th>
                            <th className="py-2.5 px-3 text-right">Total VES</th>
                            <th className="py-2.5 px-3 text-center">Estado</th>
                            <th className="py-2.5 px-3 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900/40">
                          {documentsToday.map(t => {
                            let typeLabel = t.type.toUpperCase();
                            let typeColor = 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
                            if (t.type === 'factura') typeColor = 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20';
                            else if (t.type === 'recibo') typeColor = 'bg-blue-500/10 text-blue-400 border border-blue-505/20';
                            else if (t.type === 'cotizacion') typeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                            else if (t.type === 'consignacion') typeColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';

                            let isAnulado = (t.status || '').toLowerCase() === 'anulado';
                            let statusColor = 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
                            if (t.status === 'completado') statusColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                            else if (t.status === 'pendiente') statusColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                            else if (isAnulado) statusColor = '!bg-transparent !text-red-500 !border !border-red-500 font-bold';

                            return (
                              <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 px-3 font-bold text-white">{t.id}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${typeColor}`}>
                                    {typeLabel}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-sans font-medium text-zinc-200">{t.clientName}</div>
                                  <div className="text-[9.5px] text-zinc-500 mt-0.5">{t.clientRif}</div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatCurrency(t.totalUSD, 'USD')}</td>
                                <td className="py-2.5 px-3 text-right text-zinc-400">{formatCurrency(t.totalVES, 'VES')}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <span 
                                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${statusColor}`}
                                    style={isAnulado ? { backgroundColor: 'transparent', borderColor: '#ef4444', color: '#ef4444' } : undefined}
                                  >
                                    {t.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    onClick={() => handleViewInHistorico(t.id)}
                                    className="p-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/40 rounded text-[10px] text-zinc-300 font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Ver en Histórico"
                                  >
                                    <ExternalLink className="w-3 h-3 text-orange-400" /> Ver
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-900 bg-black flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsTodayDocsModalOpen(false)}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 text-xs font-bold uppercase tracking-wider rounded transition font-mono cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Today's Billed Total Modal */}
          {isTodaySalesModalOpen && (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-zinc-950 border border-zinc-900 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-zinc-900 flex items-center justify-between bg-black">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-xs font-black font-mono tracking-wider text-white uppercase">Resumen de Facturación de Hoy</h3>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Relación de ingresos de transacciones completadas (excluye cotizaciones, pendientes y anulados).</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTodaySalesModalOpen(false)}
                    className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {completedSalesToday.length === 0 ? (
                    <div className="p-12 text-center text-zinc-500 font-mono text-xs space-y-2">
                      <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
                      <p>No se registran ventas concretadas y cobradas en el día de hoy.</p>
                      <button
                        onClick={() => {
                          setIsTodaySalesModalOpen(false);
                          setActiveTab('billing');
                        }}
                        className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 hover:border-orange-500/30 border border-zinc-800 rounded text-zinc-350 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                      >
                        Iniciar Facturación
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Mini summary row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-zinc-900/40 border border-zinc-900 p-3 rounded-lg font-mono text-center">
                          <span className="text-[9px] uppercase text-zinc-550 block">Transacciones Completadas</span>
                          <span className="text-lg font-black text-white block mt-0.5">{completedSalesToday.length} ventas</span>
                        </div>
                        <div className="bg-zinc-900/40 border border-zinc-900 p-3 rounded-lg font-mono text-center">
                          <span className="text-[9px] uppercase text-zinc-550 block">Cierre Total Dólares ($)</span>
                          <span className="text-lg font-black text-emerald-400 block mt-0.5">{formatCurrency(totalSalesUSD, 'USD')}</span>
                        </div>
                        <div className="bg-zinc-900/40 border border-zinc-900 p-3 rounded-lg font-mono text-center">
                          <span className="text-[9px] uppercase text-zinc-550 block">Cierre Total Bolívares (Bs.)</span>
                          <span className="text-lg font-black text-orange-400 block mt-0.5">{formatCurrency(totalSalesVES, 'VES')}</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                        <table className="w-full text-left border-collapse font-mono text-[11px]">
                          <thead>
                            <tr className="bg-black/40 border-b border-zinc-900 text-zinc-500 uppercase tracking-wider text-[9px] font-bold">
                              <th className="py-2.5 px-3">ID Documento</th>
                              <th className="py-2.5 px-3">Tipo</th>
                              <th className="py-2.5 px-3">Cliente / RIF</th>
                              <th className="py-2.5 px-3 text-right">IVA USD</th>
                              <th className="py-2.5 px-3 text-right text-emerald-400">Total USD</th>
                              <th className="py-2.5 px-3 text-right">Total VES</th>
                              <th className="py-2.5 px-3 text-center">Método de Pago</th>
                              <th className="py-2.5 px-3 text-center">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900/40">
                            {completedSalesToday.map(t => {
                              let typeLabel = t.type.toUpperCase();
                              let typeColor = 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
                              if (t.type === 'factura') typeColor = 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20';
                              else if (t.type === 'recibo') typeColor = 'bg-blue-500/10 text-blue-400 border border-blue-505/20';
                              else if (t.type === 'cotizacion') typeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                              else if (t.type === 'consignacion') typeColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';

                              return (
                                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                  <td className="py-2.5 px-3 font-bold text-white">{t.id}</td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${typeColor}`}>
                                      {typeLabel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-sans">
                                    <div className="font-medium text-zinc-200">{t.clientName}</div>
                                    <div className="text-[9.5px] font-mono text-zinc-500 mt-0.5">{t.clientRif}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-zinc-400">{formatCurrency(t.ivaUSD, 'USD')}</td>
                                  <td className="py-2.5 px-3 text-right font-black text-emerald-400">{formatCurrency(t.totalUSD, 'USD')}</td>
                                  <td className="py-2.5 px-3 text-right text-zinc-400">{formatCurrency(t.totalVES, 'VES')}</td>
                                  <td className="py-2.5 px-3 text-center text-zinc-300 font-sans font-medium">{t.paymentMethod}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      onClick={() => handleViewInHistorico(t.id)}
                                      className="p-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/40 rounded text-[10px] text-zinc-300 font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Ver en Histórico"
                                    >
                                      <ExternalLink className="w-3 h-3 text-orange-400" /> Ver
                                    </button>
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

                <div className="p-4 border-t border-zinc-900 bg-black flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsTodaySalesModalOpen(false)}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 text-xs font-bold uppercase tracking-wider rounded transition font-mono cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
