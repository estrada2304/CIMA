import React, { useState, useRef } from 'react';
import { 
  User as UserIcon, Shield, Mail, Phone, FileText, Camera, Upload, Trash2, 
  Settings, LogOut, CheckCircle, Save, HelpCircle, Building2, Ticket,
  Database, RefreshCw, Cloud, Check, AlertCircle, Wifi
} from 'lucide-react';
import { User, CompanySettings, ExchangeRate, Product, Client, Supplier, Transaction, Purchase } from '../types';
import { backupToFirestore, restoreFromFirestore } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';

interface SettingsModuleProps {
  currentUser: User;
  onUpdateProfile: (updatedUser: User) => void;
  companySettings: CompanySettings;
  onUpdateCompany: (updatedCompany: CompanySettings) => void;
  onLogout: () => void;
  exchangeRate: ExchangeRate;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  purchases: Purchase[];
  setPurchases: React.Dispatch<React.SetStateAction<Purchase[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  isOnline: boolean;
  onAddSyncLog: (action: string, details: string) => void;
  onResetCommercialHistory?: () => void;
}

// 6 beautiful avatar presets with modern gradients
const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=70',
];

export default function SettingsModule({
  currentUser,
  onUpdateProfile,
  companySettings,
  onUpdateCompany,
  onLogout,
  exchangeRate,
  products,
  setProducts,
  clients,
  setClients,
  suppliers,
  setSuppliers,
  transactions,
  setTransactions,
  purchases,
  setPurchases,
  users,
  setUsers,
  isOnline,
  onAddSyncLog,
  onResetCommercialHistory
}: SettingsModuleProps) {
  // Firebase Sync State variables
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Profile settings state
  const [username, setUsername] = useState(currentUser.username);
  const [email, setEmail] = useState(currentUser.email);
  const [nombreCompleto, setNombreCompleto] = useState(currentUser.nombreCompleto || '');
  const [telefono, setTelefono] = useState(currentUser.telefono || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || AVATAR_PRESETS[0]);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Business settings state (for Administrators)
  const [companyName, setCompanyName] = useState(companySettings.name);
  const [companyRif, setCompanyRif] = useState(companySettings.rif);
  const [companyPhone, setCompanyPhone] = useState(companySettings.phone);
  const [companyEmail, setCompanyEmail] = useState(companySettings.email);
  const [companyAddress, setCompanyAddress] = useState(companySettings.address);
  const [companyIva, setCompanyIva] = useState(companySettings.ivaRate);
  const [companyIgtf, setCompanyIgtf] = useState(companySettings.igtfRate);
  const [companySuccess, setCompanySuccess] = useState(false);

  // Firestore Cloud Backup Handlers
  const handleBackupCloud = async () => {
    if (!isOnline) {
      alert("⚠️ Error: No se puede conectar a Firebase en modo Offline. Active el modo en línea primero.");
      return;
    }
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);
    setRestoreSuccess(false);
    try {
      const stateToBackup = {
        products,
        clients,
        suppliers,
        company: companySettings,
        exchangeRate,
        users,
        transactions,
        purchases
      };
      await backupToFirestore(stateToBackup);
      setSyncSuccess(true);
      onAddSyncLog("Respaldo Firebase", `Respaldo total de la base de datos local en Firestore finalizado con éxito.`);
    } catch (err: any) {
      console.error(err);
      setSyncError("Error de sincronización: " + (err.message || String(err)));
    } finally {
      setSyncing(false);
    }
  };

  const handleRestoreCloud = async () => {
    if (!isOnline) {
      alert("⚠️ Error: No se puede conectar a Firebase en modo Offline.");
      return;
    }
    const confirmRestore = window.confirm(
      "⚠️ ATENCIÓN: Esta acción reemplazará los datos de este navegador con la copia de seguridad de Firestore. ¿Deseas continuar?"
    );
    if (!confirmRestore) return;

    setRestoring(true);
    setSyncError(null);
    setSyncSuccess(false);
    setRestoreSuccess(false);
    try {
      const restoredState = await restoreFromFirestore();
      
      if (restoredState.products && restoredState.products.length > 0) {
        setProducts(restoredState.products);
      }
      if (restoredState.clients && restoredState.clients.length > 0) {
        setClients(restoredState.clients);
      }
      if (restoredState.suppliers && restoredState.suppliers.length > 0) {
        setSuppliers(restoredState.suppliers);
      }
      if (restoredState.company) {
        onUpdateCompany(restoredState.company);
      }
      if (restoredState.users && restoredState.users.length > 0) {
        setUsers(restoredState.users);
      }
      if (restoredState.transactions && restoredState.transactions.length > 0) {
        setTransactions(restoredState.transactions);
      }
      if (restoredState.purchases && restoredState.purchases.length > 0) {
        setPurchases(restoredState.purchases);
      }

      setRestoreSuccess(true);
      onAddSyncLog("Restaurar Firebase", `Restauración completa realizada desde Firebase Firestore.`);
    } catch (err: any) {
      console.error(err);
      setSyncError("Error de restauración: " + (err.message || String(err)));
    } finally {
      setRestoring(false);
    }
  };

  // File uploading refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Handle uploading files as base64 strings
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setAvatarUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...currentUser,
      username,
      email,
      nombreCompleto,
      telefono,
      avatarUrl
    };
    onUpdateProfile(updated);
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: CompanySettings = {
      name: companyName,
      rif: companyRif,
      phone: companyPhone,
      email: companyEmail,
      address: companyAddress,
      ivaRate: Number(companyIva),
      igtfRate: Number(companyIgtf)
    };
    onUpdateCompany(updated);
    setCompanySuccess(true);
    setTimeout(() => setCompanySuccess(false), 3000);
  };

  return (
    <div className="space-y-6 p-1 animate-fade-in text-slate-200">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <span className="text-xs font-mono text-indigo-400 uppercase tracking-widest block font-bold">MÓDULO DE PARAMETRIZACIÓN</span>
          <h2 className="text-lg font-bold text-white mt-0.5">Configuración de Usuario y Sistema</h2>
        </div>
        <div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full sm:w-auto px-4 py-2 bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/40 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 select-none"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión Activa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Profile Card & Bio Form */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl p-5 space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Mi Perfil de Guardia</h3>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            
            {/* Avatar Uploader Section and Presets */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block">
                Foto de Perfil / Personalización Visual
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-5 bg-slate-950 p-4 border border-slate-850 rounded-xl">
                {/* Active Image and file input */}
                <div className="relative group shrink-0">
                  <img
                    src={avatarUrl}
                    alt="Profile Avatar"
                    className="w-20 h-20 rounded-full border-2 border-indigo-500/50 object-cover bg-slate-900 shadow"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white cursor-pointer transition shadow"
                    title="Subir archivo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Drag and Drop Box & Preset selector */}
                <div className="flex-1 w-full space-y-3">
                  {/* Drag drop */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                      dragActive 
                        ? 'border-indigo-500 bg-indigo-500/5' 
                        : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
                    }`}
                  >
                    <Upload className="w-5 h-5 text-indigo-400 mx-auto mb-1.5" />
                    <p className="text-[10px] text-slate-400">
                      Arrastra tu foto de Guardia aquí o <span className="text-indigo-400 font-bold hover:underline">haz clic para examinar</span>
                    </p>
                    <p className="text-[8.5px] text-slate-500 mt-1">Soporta PNG, JPEG, WEBP (se almacena de forma segura en caché local)</p>
                  </div>

                  {/* Built-in high-fidelity presets */}
                  <div className="space-y-1">
                    <span className="text-[8.5px] uppercase font-black text-slate-500 font-mono">
                      O selecciona un Avatar Institucional preestablecido:
                    </span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {AVATAR_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatarUrl(preset)}
                          className={`w-9 h-9 rounded-full overflow-hidden border-2 transition ${
                            avatarUrl === preset ? 'border-indigo-500 scale-110 shadow-md shadow-indigo-500/10' : 'border-transparent hover:border-slate-700 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={preset} alt={`Preset ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Editable profile parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block mb-1">
                  Nombre de Usuario
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 px-3 text-xs outline-none text-slate-100 placeholder:text-slate-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block mb-1">
                  Rol Asignado (No Editable)
                </label>
                <div className="w-full bg-slate-950 border border-slate-850 rounded-lg py-1.5 px-3 text-xs text-indigo-400 font-bold font-mono">
                  🛡️ {currentUser.role}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={nombreCompleto}
                  onChange={e => setNombreCompleto(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 px-3 text-xs outline-none text-slate-100 placeholder:text-slate-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block mb-1">
                  Teléfono de Guardia
                </label>
                <input
                  type="text"
                  placeholder="0412-1234567"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 px-3 text-xs outline-none text-slate-100 placeholder:text-slate-500 transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-widest block mb-1">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 pl-9 pr-3 text-xs outline-none text-slate-100 placeholder:text-slate-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Success and action buttons */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <span className="text-[10px] text-slate-500 font-mono">
                Registrado con ID: <strong className="text-slate-400">{currentUser.id}</strong>
              </span>
              
              <div className="flex items-center gap-3">
                {profileSuccess && (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> ¡Datos guardados!
                  </span>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 select-none"
                >
                  <Save className="w-4 h-4" />
                  Guardar Cambios
                </button>
              </div>
            </div>

          </form>
        </div>

        {/* System & Company settings panel (Context values for admin) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Parámetros Fiscales</h3>
          </div>

          {currentUser.role !== 'Administrador' ? (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 text-center space-y-2 text-xs">
              <Shield className="w-8 h-8 text-amber-500/80 mx-auto" />
              <p className="font-bold text-slate-300">Acceso Administrativo Restringido</p>
              <p className="text-[10px] text-slate-500 leading-normal">
                Solo el personal con nivel **Administrador** puede editar los datos de RIF, tasas impositivas IVA/IGTF, y razón social de SigaInvent C.A.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveCompany} className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">Razón Social</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 outline-none font-medium focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">RIF Jurídico</label>
                <input
                  type="text"
                  required
                  value={companyRif}
                  onChange={e => setCompanyRif(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 outline-none font-mono focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">IVA Nacional (%)</label>
                  <input
                    type="number"
                    required
                    value={companyIva}
                    onChange={e => setCompanyIva(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 outline-none font-mono focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">IGTF Divisas (%)</label>
                  <input
                    type="number"
                    required
                    value={companyIgtf}
                    onChange={e => setCompanyIgtf(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 outline-none font-mono focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">Dirección Fiscal</label>
                <textarea
                  required
                  rows={2}
                  value={companyAddress}
                  onChange={e => setCompanyAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 outline-none leading-normal focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                {companySuccess && (
                  <span className="text-[10px] text-emerald-400 font-bold">¡Guardado fiscal!</span>
                )}
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  Actualizar Datos Fiscales
                </button>
              </div>
            </form>
          )}

          {/* Quick Stats list / Local Diagnostics info */}
          <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl space-y-2">
            <span className="text-[9px] uppercase font-bold text-slate-500 font-mono tracking-widest block">
              💻 Diagnóstico local de almacenamiento
            </span>
            <div className="space-y-1 font-mono text-[9.5px] text-slate-400">
              <p className="flex justify-between"><span>Base de datos primaria:</span> <span className="text-white">localStorage Cache</span></p>
              <p className="flex justify-between"><span>Respaldo de Nube:</span> <span className="text-indigo-400">Firestore Activo</span></p>
              <p className="flex justify-between"><span>Tasa del Día:</span> <span className="text-semibold text-emerald-400">{exchangeRate.rate} VES/$</span></p>
            </div>
          </div>

          {/* Firestore Cloud Sync engine (Real Option 1) */}
          <div className="bg-slate-950 border border-indigo-900/30 p-4 rounded-xl space-y-3.5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4 text-orange-500 animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-orange-400 font-mono tracking-wide">
                  🔥 Firebase Firestore Cloud
                </span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/10'}`}>
                {isOnline ? 'CONECTADO' : 'DESCONECTADO'}
              </span>
            </div>

            <div className="space-y-1 text-slate-400 font-mono text-[10px] leading-relaxed">
              <p><strong className="text-slate-300">Proyecto ID:</strong> <code className="bg-slate-900 px-1 py-0.5 rounded text-[9.5px] text-indigo-300">{firebaseConfig.projectId}</code></p>
              <p><strong className="text-slate-300">Región:</strong> <span className="text-slate-200">us-east1 (Google Cloud)</span></p>
              <p><strong className="text-slate-300">Status:</strong> <span className={isOnline ? "text-emerald-400" : "text-amber-500"}>{isOnline ? "Listo para sincronizar" : "Activa el modo en línea para sincronizar"}</span></p>
            </div>

            <div className="pt-2 border-t border-slate-900/80 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={syncing || restoring || !isOnline}
                onClick={handleBackupCloud}
                className={`py-2 px-2.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition select-none border ${
                  !isOnline
                    ? 'bg-slate-900/40 text-slate-500 border-slate-900 cursor-not-allowed'
                    : 'bg-orange-655/15 border-orange-500/20 text-orange-400 hover:bg-orange-650/25 active:scale-95 cursor-pointer'
                }`}
              >
                <Cloud className={`w-3.5 h-3.5 ${syncing ? 'animate-bounce' : ''}`} />
                {syncing ? 'Respaldando...' : 'Respaldar Cloud'}
              </button>
              
              <button
                type="button"
                disabled={syncing || restoring || !isOnline}
                onClick={handleRestoreCloud}
                className={`py-2 px-2.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition select-none border ${
                  !isOnline
                    ? 'bg-slate-900/40 text-slate-500 border-slate-900 cursor-not-allowed'
                    : 'bg-indigo-650/15 border-indigo-500/20 text-indigo-400 hover:bg-indigo-650/25 active:scale-95 cursor-pointer'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                {restoring ? 'Restaurando...' : 'Restaurar Cloud'}
              </button>
            </div>

            {syncSuccess && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" /> ¡Base de datos respaldada correctamente en Firestore!
              </div>
            )}

            {restoreSuccess && (
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center gap-1.5 text-[10px] text-indigo-300 font-medium">
                <Check className="w-3.5 h-3.5" /> ¡Copia de seguridad restaurada con éxito!
              </div>
            )}

            {syncError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-1.5 text-[10px] text-red-400 font-medium whitespace-normal break-all">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {syncError}
              </div>
            )}
          </div>

          {/* Clean Start / Reset Commercial History section (Admin only) */}
          {currentUser.role === 'Administrador' && (
            <div className="bg-slate-950 border border-red-900/30 p-4 rounded-xl space-y-3 shadow-md">
              <div className="flex items-center gap-2 text-red-400">
                <Trash2 className="w-4 h-4" />
                <span className="text-[10px] uppercase font-bold font-mono tracking-wide">
                  Puesta a Cero de Histórico y Analíticas
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                Reinicie a 0 todas las facturas, cotizaciones, recibos, consignaciones, compras y reportes para comenzar a operar en vivo sin registros de prueba.
              </p>
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="w-full py-2 px-3 bg-red-950/30 hover:bg-red-900/40 border border-red-900/40 text-red-400 hover:text-red-300 rounded-lg text-xs font-bold font-mono transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reiniciar Histórico y Reportes a 0
              </button>

              {resetSuccess && (
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium font-mono">
                  <Check className="w-3.5 h-3.5" /> ¡Historial comercial y analíticas restablecidos a 0 con éxito!
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* RESET CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up text-xs font-mono text-slate-200">
            <div className="p-4 bg-red-950/50 border-b border-red-900/40 flex justify-between items-center">
              <h3 className="text-xs font-extrabold uppercase text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-500" /> Confirmar Puesta a Cero
              </h3>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs font-bold text-white">
                ¿Desea restablecer a 0 el Histórico Comercial, Compras y Analíticas?
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2 text-[11px] text-slate-400">
                <p className="text-orange-400 font-bold">Resumen de la operación:</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>Limpia todas las facturas, cotizaciones, recibos y compras de prueba.</li>
                  <li>Las métricas, gráficos y reportes comenzarán en 0.</li>
                  <li>Los correlativos se reiniciarán (próxima factura: <span className="text-white font-bold">FAC-0001</span>).</li>
                  <li><span className="text-emerald-400 font-bold">No se borrarán</span> sus productos, inventario, clientes ni proveedores.</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold uppercase text-[10px] transition cursor-pointer"
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
                    setPurchases([]);
                  }
                  setShowResetModal(false);
                  setResetSuccess(true);
                  setTimeout(() => setResetSuccess(false), 4000);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-extrabold uppercase text-[10px] transition flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, Poner a 0</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
