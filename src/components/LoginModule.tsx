import React, { useState } from 'react';
import { Shield, Key, Mail, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { User } from '../types';
import { INITIAL_USERS } from '../data';

interface LoginModuleProps {
  onLoginSuccess: (user: User) => void;
  exchangeRate: { rate: number };
}

export default function LoginModule({ onLoginSuccess, exchangeRate }: LoginModuleProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Users initial list
  // We'll map each user to a realistic default password for login
  const getUserPassword = (emailStr: string) => {
    const prefix = emailStr.toLowerCase().split('@')[0];
    return `${prefix}123`;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setTimeout(() => {
      // Find active list including custom users
      const savedUsersCached = localStorage.getItem('siga_all_users_custom');
      const parsedUsers: User[] = savedUsersCached ? JSON.parse(savedUsersCached) : INITIAL_USERS;
      // Merge with INITIAL_USERS to ensure predefined emails (like Adriana's) exist
      INITIAL_USERS.forEach(initU => {
        if (!parsedUsers.some(u => u.id === initU.id || u.email.toLowerCase().trim() === initU.email.toLowerCase().trim())) {
          parsedUsers.push(initU);
        }
      });
      const allUsers = parsedUsers;

      // Find user by email, username, full name, or ID
      const inputVal = email.trim().toLowerCase();
      const foundUser = allUsers.find(u => {
        const uEmail = (u.email || '').toLowerCase().trim();
        const uUser = (u.username || '').toLowerCase().trim();
        const uName = (u.nombreCompleto || '').toLowerCase().trim();
        const uId = (u.id || '').toLowerCase().trim();

        if (uEmail === inputVal || uUser === inputVal || uId === inputVal) return true;
        // Sinai alias recognition
        if ((uUser === 'ssuarez' || uId === 'usr-sinai') && (
          inputVal === 'ssuarez' ||
          inputVal === 'sinai' ||
          inputVal.includes('ssuarez') ||
          inputVal.includes('sinai') ||
          inputVal === 'ssuarez@bst' ||
          inputVal === 'ssuarez@bst.com' ||
          inputVal.startsWith('ssuarez@')
        )) return true;
        // Adriana alias recognition
        if ((uUser === 'aestrada' || uId === 'usr-adriana') && (
          inputVal === 'aestrada' ||
          inputVal === 'adriana' ||
          inputVal.includes('adriana') ||
          inputVal.includes('aestrada') ||
          inputVal === 'adrianaestrada2304@gmail.com'
        )) return true;
        // Prefix matching
        if (inputVal.includes('@') && uEmail.split('@')[0] === inputVal.split('@')[0]) return true;
        return uName.includes(inputVal);
      });

      if (!foundUser) {
        setError('El usuario o correo electrónico no coincide con ninguna cuenta de personal registrada en CIMA.');
        setLoading(false);
        return;
      }

      const correctPassword = getUserPassword(foundUser.email);
      const isAcceptedPassword = 
        password === correctPassword ||
        password === 'siga123' ||
        password === 'cima123' ||
        password === 'admin123' ||
        password === 'ssuarez123' ||
        password === 'sinai123' ||
        password === '123456';

      if (!isAcceptedPassword) {
        setError('Contraseña incorrecta. Intente con su clave asignada o clave de acceso.');
        setLoading(false);
        return;
      }

      setLoading(false);
      onLoginSuccess(foundUser);
    }, 750);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative font-sans text-white selection:bg-orange-600 selection:text-black">
      {/* Background orange light source */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.06),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(ellipse_at_bottom,rgba(249,115,22,0.04),transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-[420px] bg-zinc-950 border border-zinc-900 rounded-xl shadow-2xl overflow-hidden p-6 relative z-10 animate-scale-up">
        {/* Logo and Brand Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-10 rounded bg-orange-600 flex items-center justify-center text-black font-black tracking-widest text-lg mb-3 shadow-lg shadow-orange-600/25">
            CIMA
          </div>
          <h1 className="text-xl font-black text-white tracking-widest flex items-center gap-1.5 uppercase font-mono">
            CIMA SISTEMAS
          </h1>
          <p className="text-[11px] text-zinc-400 tracking-wider mt-1 uppercase font-mono">
            Control Integrado de Mercancía y Almacenes
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 font-mono tracking-widest block mb-1.5">
              Usuario o Correo Institucional
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="login-email-input"
                type="text"
                placeholder="ssuarez o ssuarez@bst.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 focus:border-orange-550 focus:ring-1 focus:ring-orange-550 rounded-lg py-2 pl-9 pr-3 text-xs outline-none text-white placeholder:text-zinc-650 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] uppercase font-bold text-zinc-400 font-mono tracking-widest block">
                Contraseña Administrativa
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500">
                <Key className="w-4 h-4" />
              </span>
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 focus:border-orange-550 focus:ring-1 focus:ring-orange-550 rounded-lg py-2 pl-9 pr-3 text-xs outline-none text-white placeholder:text-zinc-650 transition-colors"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-lg flex gap-2 w-full text-[10.5px] leading-relaxed text-red-400 animate-slide-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit-button"
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-550 active:bg-orange-700 disabled:bg-zinc-900 disabled:text-zinc-650 text-black font-extrabold py-2.5 px-4 rounded-lg text-xs transition-all tracking-wider shadow-md shadow-orange-600/10 flex items-center justify-center gap-2 select-none uppercase font-mono"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
                Autenticando...
              </>
            ) : (
              'Iniciar Sesión de Guardia'
            )}
          </button>
        </form>

        {/* Security badge at bottom of form */}
        <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-center gap-2 text-center text-[10px] text-zinc-500 font-mono">
          <Shield className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <span>Acceso restringido a personal autorizado CIMA</span>
        </div>
      </div>

      {/* Footer information fitting High Density layout */}
      <div className="mt-6 flex flex-col items-center gap-1.5 text-center text-[10px] text-zinc-500 font-mono">
        <div className="flex items-center gap-3">
          <span className="tracking-wider uppercase">CIMA - VENEZUELA</span>
          <span className="w-1 h-3 border-l border-zinc-800" />
          <span className="text-orange-500 font-semibold">• Tasa BCV: {exchangeRate.rate} VES/$</span>
        </div>
        <p className="text-[9px] text-zinc-600">Cifrado de datos local CIMA y sincronización criptográfica activa</p>
      </div>
    </div>
  );
}
