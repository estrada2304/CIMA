import React, { useState } from 'react';
import { 
  Users, User, Plus, Search, Trash, Edit2, X, Mail, Shield, Phone, 
  ShieldAlert, KeyRound, CheckCircle, Smartphone, UserCheck 
} from 'lucide-react';
import { User as UserType, UserRole } from '../types';

interface StaffModuleProps {
  users: UserType[];
  setUsers: React.Dispatch<React.SetStateAction<UserType[]>>;
  currentUser: UserType;
}

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=70",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=70"
];

export default function StaffModule({ users, setUsers, currentUser }: StaffModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('todos');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Vendedor');
  const [telefono, setTelefono] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_PRESETS[0]);
  
  // Feedback states
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Check editing privileges
  const isReadOnlyUser = currentUser.role === 'Solo Lectura';
  const canModify = currentUser.role === 'Administrador' || currentUser.role === 'Supervisor';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const resetForm = () => {
    setEditingUser(null);
    setNombreCompleto('');
    setUsername('');
    setEmail('');
    setRole('Vendedor');
    setTelefono('');
    setAvatarUrl(AVATAR_PRESETS[0]);
    setErrorMessage('');
  };

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido (PNG, JPG, etc.).');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Compress/resize the avatar to a standard 256x256 resolution
        const maxDim = 256;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          setAvatarUrl(compressedBase64);
        } else {
          setAvatarUrl(e.target?.result as string);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCreateForm = () => {
    if (!canModify) {
      alert("⛔ Permiso Denegado: Solo el Administrador o Supervisor pueden registrar nuevo personal de resguardo.");
      return;
    }
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (user: UserType) => {
    if (!canModify) {
      alert("⛔ Permiso Denegado: Solo el Administrador o Supervisor de CIMA pueden modificar perfiles de guardia.");
      return;
    }
    setEditingUser(user);
    setNombreCompleto(user.nombreCompleto || '');
    setUsername(user.username);
    setEmail(user.email);
    setRole(user.role);
    setTelefono(user.telefono || '');
    setAvatarUrl(user.avatarUrl || AVATAR_PRESETS[0]);
    setErrorMessage('');
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (isReadOnlyUser) {
      setErrorMessage('Su rol de guardia actual está configurado como SOLO LECTURA. No puede modificar el personal.');
      return;
    }

    if (!canModify) {
      setErrorMessage('No posee privilegios suficientes para guardar o actualizar perfiles de personal.');
      return;
    }

    if (!nombreCompleto.trim()) {
      setErrorMessage('El nombre completo es obligatorio.');
      return;
    }

    if (!username.trim()) {
      setErrorMessage('El usuario de sesión es obligatorio.');
      return;
    }

    if (!email.trim()) {
      setErrorMessage('El correo institucional es obligatorio.');
      return;
    }

    // Verify duplication on email/username (excluding current edits)
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const isDuplicateEmail = users.some(u => u.email.toLowerCase().trim() === normalizedEmail && (!editingUser || u.id !== editingUser.id));
    const isDuplicateUsername = users.some(u => u.username.toLowerCase().trim() === normalizedUsername && (!editingUser || u.id !== editingUser.id));

    if (isDuplicateEmail) {
      setErrorMessage('Este correo institucional ya se encuentra asignado a otra cuenta.');
      return;
    }

    if (isDuplicateUsername) {
      setErrorMessage('Este nombre de usuario ya está en uso por otro operador de guardia.');
      return;
    }

    if (editingUser) {
      // Edit User
      const updatedList = users.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            nombreCompleto,
            username: normalizedUsername,
            email: normalizedEmail,
            role,
            telefono,
            avatarUrl
          };
        }
        return u;
      });
      setUsers(updatedList);
      showToast(`Personal "${nombreCompleto}" actualizado con éxito.`);
    } else {
      // Create new User
      const newUser: UserType = {
        id: 'usr-' + Date.now().toString(36),
        username: normalizedUsername,
        email: normalizedEmail,
        role,
        nombreCompleto,
        telefono,
        avatarUrl
      };
      setUsers([...users, newUser]);
      showToast(`Nuevo oficial "${nombreCompleto}" registrado de forma segura.`);
    }

    setIsFormOpen(false);
    resetForm();
  };

  const handleDeleteUser = (user: UserType) => {
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador pueden desvincular personal.");
      return;
    }

    if (user.id === currentUser.id) {
      alert("⚠️ Acción inválida: No puede desvincularse a sí mismo mientras mantiene activa la sesión actual.");
      return;
    }

    // Protection to not delete Sinai (our first admin)
    if (user.id === 'usr-sinai' || user.email === 'ssuarez@bst') {
      alert("⛔ Protección del Sistema: La cuenta principal del Administrador raíz no puede ser eliminada.");
      return;
    }

    if (confirm(`¿Confirma que desea desvincular permanentemente a "${user.nombreCompleto || user.username}" de los registros de Siga / CIMA?`)) {
      setUsers(users.filter(u => u.id !== user.id));
      showToast(`Personal eliminado del sistema de seguridad.`);
    }
  };

  // Filter users list
  const filteredUsers = users.filter(u => {
    if (!u) return false;
    const term = (searchTerm || '').toLowerCase().trim();
    const matchesSearch = !term ||
      (u.nombreCompleto || '').toLowerCase().includes(term) ||
      (u.username || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.telefono || '').includes(term);

    const matchesRole = selectedRoleFilter === 'todos' || u.role === selectedRoleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-4">
      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-500 text-black px-4 py-2.5 rounded-lg border border-emerald-600 shadow-xl text-xs font-bold font-mono animate-bounce flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Widget */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-900 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-orange-600/10 text-orange-500 rounded-lg border border-orange-500/20">
                <Users className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-widest uppercase font-mono">
                  RESGUARDO DE PERSONAL Y ROLES (CIMA)
                </h2>
                <p className="text-[10px] text-zinc-500 tracking-wider uppercase font-mono mt-0.5">
                  Directorio de Oficiales, Supervisores, Operadores y Lecturas de Guardia
                </p>
              </div>
            </div>
            
            {isReadOnlyUser ? (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-orange-400 bg-orange-950/15 border border-orange-500/20 p-2 rounded-lg font-mono">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>MODO DE LECTURA ACTIVO: Alexis Bruzual tiene denegadas las facultades de registro o guardado.</span>
              </div>
            ) : !canModify ? (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-900 p-2 rounded-lg font-mono">
                <Shield className="w-3.5 h-3.5" />
                <span>Nivel operativo básico: Puede ver el directorio, pero no tiene permisos para coordinar personal.</span>
              </div>
            ) : (
              <p className="text-zinc-400 font-sans text-xs mt-2.5 leading-relaxed">
                Usted cuenta con credenciales de <strong>{currentUser.role}</strong>. Puede agregar nuevos oficiales de guardia, corregir datos asignados, definir sus roles operativos, y mantener actualizado el personal apto para CIMA.
              </p>
            )}
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={handleOpenCreateForm}
              disabled={isReadOnlyUser || !canModify}
              className="w-full md:w-auto px-4 py-2.5 bg-orange-600 disabled:bg-zinc-900 disabled:text-zinc-650 disabled:border-transparent hover:bg-orange-550 border border-orange-600 hover:border-orange-550 text-black font-extrabold uppercase font-mono rounded-lg text-[10.5px] transition flex items-center justify-center gap-2 tracking-wider shadow-lg select-none"
            >
              <Plus className="w-4 h-4 text-black" />
              Registrar Nuevo Personal
            </button>
          </div>
        </div>
      </div>

      {/* Filter and stats segment */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="md:col-span-2 relative">
          <span className="absolute left-3.5 top-3 text-zinc-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, usuario, correo o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 hover:bg-zinc-900/60 border border-zinc-900 hover:border-zinc-850 focus:border-zinc-700 rounded-lg py-2.5 pl-10 pr-4 text-xs outline-none text-zinc-300 placeholder:text-zinc-600 font-mono transition-all"
          />
        </div>

        {/* Filter Role */}
        <div>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-900 hover:border-zinc-850 rounded-lg py-2.5 px-3 text-xs outline-none text-zinc-300 font-bold font-mono"
          >
            <option value="todos">Todos los Roles de CIMA</option>
            <option value="Administrador">👑 Administradores</option>
            <option value="Supervisor">👔 Supervisores / Coordinación</option>
            <option value="Vendedor">💼 Personal de Ventas</option>
            <option value="Almacenista">📦 Almacenistas / Despacho</option>
            <option value="Solo Lectura">👓 Modo Consulta (Lecturas)</option>
          </select>
        </div>

        {/* Personal Count */}
        <div className="bg-zinc-950 border border-zinc-900 p-2.5 rounded-lg flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase font-black font-mono">Guardias Registrados:</span>
          <span className="text-sm font-black font-mono text-orange-400">{filteredUsers.length} / {users.length}</span>
        </div>
      </div>

      {/* CRUD TABLE GRID */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                <th className="p-4 font-black">Personal / ID</th>
                <th className="p-4 font-black">Usuario</th>
                <th className="p-4 font-black">Contacto Institucional</th>
                <th className="p-4 font-black">Rol Operativo</th>
                <th className="p-4 font-black">Acceso Inicial</th>
                <th className="p-4 font-black text-right pr-6">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 bg-black/40 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-zinc-600 font-mono">
                    <Users className="w-8 h-8 text-zinc-800 mx-auto mb-3" />
                    No se encontraron guardias registrados con el criterio de búsqueda solicitado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCur = u.id === currentUser.id;
                  let roleColor = "bg-zinc-900 text-zinc-400 border-zinc-850";
                  let roleLabel: string = u.role;

                  if (u.role === 'Administrador') {
                    roleColor = "bg-orange-500/10 text-orange-400 border-orange-500/20";
                    roleLabel = "👑 Admin Raíz";
                  } else if (u.role === 'Supervisor') {
                    roleColor = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                    roleLabel = "👔 Supervisor";
                  } else if (u.role === 'Vendedor') {
                    roleColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    roleLabel = "💼 Vendedor(a)";
                  } else if (u.role === 'Almacenista') {
                    roleColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                    roleLabel = "📦 Almacenista";
                  } else if (u.role === 'Solo Lectura') {
                    roleColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                    roleLabel = "👓 Solo Lectura";
                  }

                  const derivedPass = `${u.email.toLowerCase().split('@')[0]}123`;

                  return (
                    <tr 
                      key={u.id} 
                      className={`hover:bg-zinc-950/60 transition ${isCur ? 'bg-orange-950/[0.02]/30 border-l-2 border-l-orange-500' : ''}`}
                    >
                      {/* Personal Info */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 self-start">
                            <img 
                              src={u.avatarUrl || AVATAR_PRESETS[0]} 
                              alt={u.nombreCompleto || u.username}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-zinc-100 text-xs truncate capitalize flex items-center gap-1.5">
                              {u.nombreCompleto || "Sin Nombre Registrado"}
                              {isCur && (
                                <span className="bg-orange-500/15 text-orange-400 text-[8px] uppercase tracking-widest font-extrabold px-1.5 py-0.2 rounded font-mono border border-orange-500/10">
                                  Tú
                                </span>
                              )}
                            </h4>
                            <span className="text-[10px] text-zinc-500 font-semibold font-mono block mt-0.5">ID: {u.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="p-4 font-bold font-mono text-zinc-300">
                        {u.username}
                      </td>

                      {/* Contact Info */}
                      <td className="p-4 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-350">
                          <Mail className="w-3.5 h-3.5 text-zinc-650 shrink-0" />
                          <span className="font-mono text-[11px] truncate" title={u.email}>{u.email}</span>
                        </div>
                        {u.telefono && (
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            <Smartphone className="w-3.5 h-3.5 text-zinc-650 shrink-0" />
                            <span className="font-mono text-[10.5px]">{u.telefono}</span>
                          </div>
                        )}
                      </td>

                      {/* Operative Role */}
                      <td className="p-4">
                        <span className={`px-2.5 py-1 border text-[9.5px] font-bold font-mono rounded-md uppercase ${roleColor} tracking-wider`}>
                          {roleLabel}
                        </span>
                      </td>

                      {/* Quick Password */}
                      <td className="p-4 font-mono text-zinc-500 text-[10.5px]">
                        <div className="flex items-center gap-1 text-[10.5px]">
                          <KeyRound className="w-3 h-3 text-zinc-600" />
                          <span className="bg-black/60 px-1.5 py-0.5 rounded border border-zinc-900 text-orange-455 text-[10px] font-bold select-all">
                            {derivedPass}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right pr-6 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditForm(u)}
                            disabled={!canModify}
                            type="button"
                            className="p-1 px-2.5 bg-zinc-905 hover:bg-zinc-800 border border-zinc-900 hover:border-zinc-700 text-zinc-300 rounded font-black text-[10px] transition uppercase flex items-center gap-1 disabled:opacity-30 disabled:hover:border-zinc-900"
                            title="Modificar perfil"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
                          </button>
                          
                          {currentUser.role === 'Administrador' && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={isCur || u.id === 'usr-sinai'}
                              type="button"
                              className="p-1 px-2 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 text-red-400 hover:text-red-300 rounded font-black text-[10px] transition uppercase flex items-center gap-1 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              title="Dar de baja (Solo Administrador)"
                            >
                              <Trash className="w-3 h-3" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRUD EDITING OR CREATING SIDEBAR MODAL SHEET (OVERLAY) */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in relative">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-xl shadow-2xl p-6 overflow-hidden relative">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-orange-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white font-mono">
                  {editingUser ? 'MODIFICAR OFICIAL REGISTRADO' : 'REGISTRAR NUEVO OFICIAL EN CIMA'}
                </h3>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-900 transition"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-950/40 border border-red-900/40 text-red-400 rounded-lg text-xs flex gap-2 font-mono mb-4 animate-slide-in">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="space-y-3">
                {/* Nombre completo */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-505 font-mono block mb-1">Nombre Completo de la Persona</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sinaí Suárez"
                    value={nombreCompleto}
                    onChange={(e) => setNombreCompleto(e.target.value)}
                    className="w-full px-3 py-2 bg-black border border-zinc-900 rounded-lg text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-700 capitalize font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Usuario de Guardia */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-550 font-mono block mb-1">Usuario de Sesión</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. ssuarez"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-black border border-zinc-900 rounded-lg text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-700 font-mono lowercase"
                    />
                  </div>

                  {/* Rol Operativo */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-550 font-mono block mb-1">Rol Operativo</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full px-2.5 py-2 bg-black border border-zinc-900 rounded-lg text-xs text-white focus:outline-none focus:border-zinc-700 font-bold font-mono"
                    >
                      <option value="Administrador">👑 Administrador</option>
                      <option value="Supervisor">👔 Supervisor</option>
                      <option value="Vendedor">💼 Vendedor(a)</option>
                      <option value="Almacenista">📦 Almacenista</option>
                      <option value="Solo Lectura">👓 Solo Lectura (Boss)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Correo Institucional */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-550 font-mono block mb-1">Correo Institucional</label>
                    <input
                      type="email"
                      required
                      placeholder="Ej. ssuarez@bst"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-black border border-zinc-900 rounded-lg text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-700 font-mono"
                    />
                    <span className="text-[9px] text-zinc-650 block mt-0.5">La contraseña de acceso será "{email.toLowerCase().split('@')[0] || 'usuario'}123"</span>
                  </div>

                  {/* Telefono */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-550 font-mono block mb-1">Teléfono Móvil (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. +58 412 1234567"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className="w-full px-3 py-2 bg-black border border-zinc-900 rounded-lg text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-700 font-mono"
                    />
                  </div>
                </div>

                {/* Avatar Selection */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 font-mono block mb-1.5">Foto de Perfil (Avatar)</label>
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 relative">
                        <img src={avatarUrl} alt="Vista previa avatar" className="w-full h-full object-cover" />
                      </div>
                      
                      {/* Drag & Drop Zone */}
                      <div 
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const files = e.dataTransfer.files;
                          if (files && files.length > 0) {
                            handleImageUpload(files[0]);
                          }
                        }}
                        onClick={() => document.getElementById('avatar-file-input')?.click()}
                        className="flex-1 w-full border border-dashed border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-900/30 rounded-lg p-3 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1 group"
                      >
                        <input 
                          type="file" 
                          id="avatar-file-input" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              handleImageUpload(files[0]);
                            }
                          }}
                        />
                        <span className="text-[11px] text-zinc-300 font-bold font-mono group-hover:text-orange-400 transition-colors">
                          Subir Foto de Perfil
                        </span>
                        <span className="text-[9px] text-zinc-650 font-mono">
                          Arrastra o haz clic para subir desde PC, Teléfono o Cámara
                        </span>
                      </div>
                    </div>

                    {/* Presets alternative */}
                    <div>
                      <span className="text-[9px] uppercase font-black tracking-widest text-zinc-600 font-mono block mb-1.5">O elige una ilustración:</span>
                      <div className="flex gap-2 overflow-x-auto py-1">
                        {AVATAR_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setAvatarUrl(preset)}
                            className={`w-9 h-9 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${
                              avatarUrl === preset ? 'border-orange-500 scale-105' : 'border-zinc-900 hover:border-zinc-700'
                            }`}
                          >
                            <img src={preset} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 border-t border-zinc-905 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 hover:bg-zinc-900 border border-zinc-900 text-zinc-400 hover:text-white rounded font-bold uppercase text-[10px] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-550 active:bg-orange-700 border border-orange-600 hover:border-orange-550 text-black rounded font-black uppercase text-[10px] transition shadow-md"
                >
                  {editingUser ? 'Actualizar Ficha' : 'Dar de Alta del Sistema'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
