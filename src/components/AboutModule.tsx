import React, { useState } from 'react';
import { 
  FileText, ShieldCheck, Scale, Building2, Phone, Mail, MapPin, 
  Search, Printer, CheckCircle2, Lock, AlertCircle, Info, Landmark, 
  Server, Cpu, Eye, Copy, Check
} from 'lucide-react';
import { CompanySettings, User } from '../types';

interface AboutModuleProps {
  companySettings: CompanySettings;
  currentUser: User;
}

export default function AboutModule({ companySettings, currentUser }: AboutModuleProps) {
  const [activeSubTab, setActiveSubTab] = useState<'terminos' | 'privacidad' | 'normativa' | 'sistema'>('terminos');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 font-sans animate-fade-in text-white selection:bg-orange-600 selection:text-black">
      
      {/* Top Header Card */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-orange-600 text-black rounded-xl flex items-center justify-center font-black text-xl tracking-tighter shadow-lg shadow-orange-600/20 shrink-0">
              CIMA
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 bg-orange-500/10 border border-orange-500/25 text-orange-400 font-mono text-[10px] font-bold rounded uppercase tracking-wider">
                  Módulo Institucional
                </span>
                <span className="text-zinc-500 text-xs font-mono">• Versión 2.6.4 Enterprise</span>
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-wider font-mono">
                ACERCA DE
              </h2>
              <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Marco normativo, términos legales de operación, políticas de confidencialidad y especificaciones del sistema <strong className="text-zinc-200">CIMA</strong> (Control Integrado de Mercancía y Almacenes).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs font-mono font-bold rounded-lg text-zinc-300 hover:text-white flex items-center gap-2 transition"
              title="Imprimir o guardar como PDF este documento"
            >
              <Printer className="w-4 h-4 text-orange-400" />
              Imprimir Documento
            </button>
          </div>
        </div>

        {/* Corporate details summary bar */}
        <div className="mt-6 pt-5 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="flex items-center gap-2.5 text-zinc-400">
            <Building2 className="w-4 h-4 text-orange-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-zinc-550 block uppercase tracking-wider">Razón Social</span>
              <span className="text-zinc-200 font-bold text-[11px] truncate block" title={companySettings.name}>
                {companySettings.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-zinc-400">
            <Landmark className="w-4 h-4 text-orange-500 shrink-0" />
            <div>
              <span className="text-[10px] text-zinc-550 block uppercase tracking-wider">R.I.F. Fiscal</span>
              <span className="text-zinc-200 font-bold text-[11px]">
                {companySettings.rif || "J-50375018-9"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-zinc-400">
            <Phone className="w-4 h-4 text-orange-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-zinc-550 block uppercase tracking-wider">Atención y Soporte</span>
              <span className="text-zinc-200 font-bold text-[11px] truncate block">
                {companySettings.phone || "0412 9862939 / 0212-9876543"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-zinc-400">
            <Mail className="w-4 h-4 text-orange-500 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-zinc-550 block uppercase tracking-wider">Correo Electrónico</span>
              <span className="text-zinc-200 font-bold text-[11px] truncate block">
                {companySettings.email || "contacto@cima.com.ve"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSubTab('terminos')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition ${
              activeSubTab === 'terminos'
                ? 'bg-orange-600 text-black shadow-md shadow-orange-600/20'
                : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850'
            }`}
          >
            <Scale className="w-4 h-4" />
            Términos y Condiciones de Uso
          </button>

          <button
            onClick={() => setActiveSubTab('privacidad')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition ${
              activeSubTab === 'privacidad'
                ? 'bg-orange-600 text-black shadow-md shadow-orange-600/20'
                : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Política de Privacidad
          </button>

          <button
            onClick={() => setActiveSubTab('normativa')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition ${
              activeSubTab === 'normativa'
                ? 'bg-orange-600 text-black shadow-md shadow-orange-600/20'
                : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850'
            }`}
          >
            <Landmark className="w-4 h-4" />
            Normativa Fiscal y SENIAT
          </button>

          <button
            onClick={() => setActiveSubTab('sistema')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition ${
              activeSubTab === 'sistema'
                ? 'bg-orange-600 text-black shadow-md shadow-orange-600/20'
                : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Ficha Técnica del Sistema
          </button>
        </div>

        {/* Filter / Search input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar cláusula o término..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 font-mono"
          />
        </div>
      </div>

      {/* Operator Session Acknowledgement Banner */}
      <div className="p-3 bg-zinc-900/40 border border-zinc-900 rounded-lg flex items-center justify-between text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            Sesión activa: <strong className="text-zinc-200">{currentUser.nombreCompleto || currentUser.username}</strong> ({currentUser.role}). Acceso autorizado bajo los términos corporativos CIMA.
          </span>
        </div>
        <span className="text-[10px] text-zinc-550 hidden sm:inline">
          ID: {currentUser.id} • Seguridad Cifrada
        </span>
      </div>

      {/* TAB 1: TÉRMINOS Y CONDICIONES DE USO */}
      {activeSubTab === 'terminos' && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 space-y-6">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Scale className="w-5 h-5 text-orange-500" />
                Términos y Condiciones de Uso del Sistema CIMA
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Última actualización: Septiembre de 2026 • Aplicable a todo el personal administrativo, de ventas, almacén y supervisión de INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.
              </p>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-zinc-300">
              
              {/* Cláusula 1 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    1. Ámbito de Aplicación y Objeto del Sistema
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 1: Ámbito de Aplicación...", "cl-1")}
                    className="text-zinc-500 hover:text-white"
                    title="Copiar texto"
                  >
                    {copiedSection === "cl-1" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  El presente aplicativo informático <strong>CIMA SISTEMAS (Control Integrado de Mercancía y Almacenes)</strong> constituye una herramienta de uso estrictamente profesional, diseñada para la gestión integral de inventarios, catalogación de productos con costos y precios escalonados (Detal, Mayor, Cuadrillas), facturación fiscal y comercial, control de consignaciones abiertas, surtido de compras y directorios comerciales de <strong>INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.</strong> (R.I.F. J-50375018-9).
                </p>
                <p className="text-zinc-400 text-[11px]">
                  El acceso a las bases de datos y módulos del sistema está restringido únicamente a colaboradores debidamente autorizados por la Dirección de la empresa.
                </p>
              </div>

              {/* Cláusula 2 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    2. Custodia de Credenciales y Responsabilidad Individual
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 2: Custodia de Credenciales...", "cl-2")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-2" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  Las cuentas de usuario y contraseñas asignadas a cada colaborador son de carácter <strong>personal, intransferible y confidencial</strong>. Cada operador asume la total responsabilidad administrativa, contable y jurídica por cualquier movimiento de almacén, egreso de mercancía, emisión de facturas, cotizaciones, notas de consignación o anulación de operaciones registradas bajo su perfil de usuario.
                </p>
                <div className="p-2.5 bg-orange-500/10 border border-orange-500/20 rounded text-[11px] text-orange-350 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-orange-400 mt-0.5" />
                  <span>
                    Queda expresamente prohibido compartir contraseñas, operar sesiones ajenas o abandonar terminales de trabajo activas sin haber cerrado la sesión o bloqueado el equipo.
                  </span>
                </div>
              </div>

              {/* Cláusula 3 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    3. Emisión Fiscal y Respeto a Formatos Preimpresos Oficiales
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 3: Emisión Fiscal...", "cl-3")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-3" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  El sistema CIMA cuenta con una arquitectura de impresión diferenciada diseñada para cumplir con las normativas del Servicio Nacional Integrado de Administración Aduanera y Tributaria (SENIAT):
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-300">
                  <li>
                    <strong>Facturas Fiscales de Venta:</strong> Se generan con margen superior reservado de 48 mm y sin encabezado digital repetitivo, destinadas a ser impresas directamente sobre las <strong>hojas fiscales preimpresas</strong> autorizadas por la imprenta digital asignada a la empresa.
                  </li>
                  <li>
                    <strong>Recibos, Cotizaciones y Notas de Consignación:</strong> Incorporan el membrete corporativo completo con logotipo CIMA, datos fiscales de la empresa, dirección y medios de contacto oficiales.
                  </li>
                </ul>
                <p className="text-zinc-400 text-[11px]">
                  Cualquier alteración a la secuencialidad numérica correlativa (FAC-XXXX, REC-XXXX, COT-XXXX, CON-XXXX) debe ser justificada formalmente ante la Gerencia de Administración.
                </p>
              </div>

              {/* Cláusula 4 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    4. Control de Inventario, Bins y Consignaciones
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 4: Control de Inventario...", "cl-4")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-4" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  Todo movimiento de inventario físico debe tener correspondencia inmediata en el sistema. Los despachos bajo modalidad de <strong>Consignación Abierta</strong> deben registrarse con el R.I.F. y nombre del cliente receptor, quedando asociadas las cantidades hasta su posterior facturación o devolución al almacén central.
                </p>
                <p>
                  La manipulación fraudulenta de existencias, asignación indebida de ubicaciones de gaveta (BIN) o despacho sin comprobante digital emitido será considerada falta grave contra el patrimonio de la empresa.
                </p>
              </div>

              {/* Cláusula 5 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    5. Gestión Multimoneda y Tasa Oficial del Banco Central de Venezuela
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 5: Gestión Multimoneda...", "cl-5")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-5" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  En estricto apego a las disposiciones legales vigentes en la República Bolivariana de Venezuela, las conversiones de divisas a moneda nacional (Bolívares) dentro del sistema se rigen obligatoriamente por la <strong>Tasa de Cambio Oficial del Banco Central de Venezuela (BCV)</strong>.
                </p>
                <p className="text-zinc-400 text-[11px]">
                  El sistema calcula de forma transparente la base imponible, el Impuesto al Valor Agregado (I.V.A. 16%) y, cuando corresponda a pagos en divisas o moneda extranjera, el Impuesto a las Grandes Transacciones Financieras (I.G.T.F. 3%).
                </p>
              </div>

              {/* Cláusula 6 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    6. Política de Anulación y Auditoría Comercial
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 6: Política de Anulación...", "cl-6")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-6" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  La anulación de transacciones fiscales o notas de entrega requiere obligatoriamente:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-300">
                  <li>Permisos de nivel <strong>Administrador</strong> o <strong>Supervisor</strong>.</li>
                  <li>Ingreso detallado y obligatorio del motivo comercial de la anulación.</li>
                  <li>Reversión automática del inventario al stock disponible del almacén.</li>
                  <li>Marcaje indeleble en el PDF con la marca de agua y advertencia <em>"DOCUMENTO ANULADO - SIN VALIDEZ FISCAL NI COMERCIAL"</em>.</li>
                </ul>
              </div>

              {/* Cláusula 7 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2 hover:border-zinc-800 transition">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-orange-400 font-mono">
                    7. Sincronización en la Nube y Respaldo Local-First
                  </h4>
                  <button
                    onClick={() => handleCopy("Cláusula 7: Sincronización...", "cl-7")}
                    className="text-zinc-500 hover:text-white"
                  >
                    {copiedSection === "cl-7" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p>
                  El sistema opera bajo un modelo híbrido <em>Local-First</em> con sincronización centralizada en Cloud Firestore y base de datos local en el navegador (LocalStorage / IndexedDB). Los operadores deben verificar que el indicador de conexión se encuentre en estado activo al finalizar cada turno de guardia para garantizar la integridad de las copias de seguridad.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* TAB 2: POLÍTICA DE PRIVACIDAD */}
      {activeSubTab === 'privacidad' && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 space-y-6">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-500" />
                Política de Privacidad y Tratamiento de Datos Comerciales
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Garantía de confidencialidad, resguardo de datos fiscales y protección de secreto comercial de INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.
              </p>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-zinc-300">
              
              {/* Sección 1 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <h4 className="font-bold text-sm text-orange-400 font-mono flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  1. Naturaleza de los Datos Tratados
                </h4>
                <p>
                  El sistema CIMA recopila, almacena y procesa exclusivamente información necesaria para el cumplimiento de actividades mercantiles y obligaciones tributarias:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 font-mono text-[11px]">
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
                    <span className="text-orange-400 font-bold block mb-1">Datos de Clientes:</span>
                    Razón social o nombres, R.I.F. o Cédula de Identidad, número telefónico, correo electrónico y dirección física de entrega.
                  </div>
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
                    <span className="text-orange-400 font-bold block mb-1">Datos de Proveedores:</span>
                    Denominación comercial, R.I.F., persona de contacto, condiciones de pago y registro de compras efectuadas.
                  </div>
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
                    <span className="text-orange-400 font-bold block mb-1">Auditoría de Personal:</span>
                    Identificador de usuario, nombre, rol asignado, bitácora de transacciones realizadas y fecha/hora de inicio de sesión.
                  </div>
                </div>
              </div>

              {/* Sección 2 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <h4 className="font-bold text-sm text-orange-400 font-mono">
                  2. Finalidad Exclusiva del Tratamiento
                </h4>
                <p>
                  Los datos incorporados en la plataforma se destinan de manera exclusiva a:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-300">
                  <li>La elaboración y emisión de facturas fiscales de venta, cotizaciones, recibos y notas de entrega en consignación.</li>
                  <li>El control contable y administrativo de cobros, pagos y estados de cuenta en bolívares y divisas.</li>
                  <li>La conciliación de existencias físicas en almacenes y trazabilidad de productos.</li>
                  <li>El cumplimiento de requerimientos formales ante el SENIAT y autoridades tributarias municipales o nacionales.</li>
                </ul>
              </div>

              {/* Sección 3 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <h4 className="font-bold text-sm text-orange-400 font-mono">
                  3. Secreto Comercial y Confidencialidad Rigurosa
                </h4>
                <p>
                  Toda la información referente a:
                </p>
                <div className="p-3 bg-zinc-900/80 border border-zinc-850 rounded font-mono text-[11px] text-zinc-300 space-y-1">
                  <p>• Costos de adquisición y compra en USD de maquinarias y herramientas.</p>
                  <p>• Tarifas diferenciadas de cuadrilla y márgenes de utilidad mayorista.</p>
                  <p>• Listados de clientes corporativos y carteras de crédito en consignación.</p>
                </div>
                <p className="mt-2">
                  Constituye <strong>secreto comercial propiedad de CIMA C.A.</strong> Su divulgación, copia no autorizada, extracción masiva en hojas de cálculo para beneficio particular o suministro a terceros constituye violación a los deberes laborales y acarreará responsabilidades legales civiles y penales.
                </p>
              </div>

              {/* Sección 4 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <h4 className="font-bold text-sm text-orange-400 font-mono">
                  4. Protocolos de Seguridad y Cifrado
                </h4>
                <p>
                  El sistema aplica directrices de seguridad de la información:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-300">
                  <li>Canales de transmisión seguros cifrados bajo protocolo SSL/TLS (HTTPS).</li>
                  <li>Control de accesos basado en roles (RBAC) con separación de privilegios entre facturadores, almacenistas y administradores.</li>
                  <li>Reglas de seguridad en Firestore que impiden modificaciones anónimas no autenticadas.</li>
                  <li>Registro indeleble de bitácoras de sincronización y auditoría interna.</li>
                </ul>
              </div>

              {/* Sección 5 */}
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <h4 className="font-bold text-sm text-orange-400 font-mono">
                  5. Derechos de Clientes y Proveedores (Acceso y Rectificación)
                </h4>
                <p>
                  Los clientes y proveedores cuyos datos reposen en el directorio del sistema tienen derecho a solicitar la actualización, corrección o aclaratoria de su información de facturación o contacto comunicándose a través de la cuenta oficial: <span className="font-mono text-orange-400">contacto@cima.com.ve</span> o visitando el domicilio fiscal de la empresa en Caracas.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NORMATIVA FISCAL SENIAT */}
      {activeSubTab === 'normativa' && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 space-y-6">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Landmark className="w-5 h-5 text-orange-500" />
                Marco Legal y Normativa Tributaria Venezolana
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Conformidad del sistema con las providencias del SENIAT, leyes de tributación nacional y Código de Comercio.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold rounded text-[10px] uppercase">
                  Providencia SNAT/2011/00071
                </span>
                <h4 className="font-bold text-white text-sm">Normas Generales de Emisión de Facturas</h4>
                <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                  Establece las especificaciones obligatorias para la emisión de facturas y documentos equivalentes mediante formatos y formas libres elaboradas por imprentas autorizadas.
                </p>
                <div className="text-[11px] text-zinc-500 font-mono pt-1">
                  ✓ Cumplido: Impresión limpia sobre formato preimpreso sin solapamiento de datos.
                </div>
              </div>

              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold rounded text-[10px] uppercase">
                  Ley de Impuesto al Valor Agregado
                </span>
                <h4 className="font-bold text-white text-sm">Alícuota General I.V.A. (16%)</h4>
                <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                  Desglose automático de la Base Imponible y del impuesto correspondiente en todas las operaciones de venta comercial, con visualización simultánea en divisas y bolívares.
                </p>
                <div className="text-[11px] text-zinc-500 font-mono pt-1">
                  ✓ Cumplido: Cálculo exacto al 16.00% con redondeo oficial a 2 decimales.
                </div>
              </div>

              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold rounded text-[10px] uppercase">
                  Reforma de Ley I.G.T.F.
                </span>
                <h4 className="font-bold text-white text-sm">Impuesto a Transacciones en Divisas (3%)</h4>
                <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                  Aplicación del 3% sobre los pagos percibidos en moneda extranjera o criptoactivos no emitidos por la República, calculado sobre el monto efectivamente cancelado.
                </p>
                <div className="text-[11px] text-zinc-500 font-mono pt-1">
                  ✓ Cumplido: Selección dinámica en métodos de pago en divisas con cálculo automático.
                </div>
              </div>

              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold rounded text-[10px] uppercase">
                  Convenio Cambiario N° 1
                </span>
                <h4 className="font-bold text-white text-sm">Tasa Oficial del Banco Central de Venezuela</h4>
                <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                  Obligatoriedad de expresar los valores en bolívares utilizando como referencia la cotización ponderada oficial publicada por el BCV para la fecha de la operación.
                </p>
                <div className="text-[11px] text-zinc-500 font-mono pt-1">
                  ✓ Cumplido: Tasa referencial registrada y sincronizada en cada transacción.
                </div>
              </div>

            </div>

            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg text-xs font-mono text-zinc-400 space-y-1">
              <span className="text-orange-400 font-bold block mb-1">Código de Comercio de Venezuela (Art. 32 y 44):</span>
              <p>
                La empresa conserva el historial digital, correlativos de facturación y respaldos de operaciones por el período legal mínimo de diez (10) años, garantizando la inalterabilidad de los asientos contables registrados.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FICHA TÉCNICA DEL SISTEMA */}
      {activeSubTab === 'sistema' && (
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-6 space-y-6">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-500" />
                Ficha Técnica y Arquitectura del Software CIMA
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Especificaciones de ingeniería, infraestructura de datos y capacidades operativas de la plataforma.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="text-orange-400 font-bold text-[10px] uppercase block tracking-wider">Frontend & Renderizado</span>
                <h4 className="font-bold text-white text-sm">Single Page Application (SPA)</h4>
                <ul className="space-y-1 text-zinc-400 text-[11px]">
                  <li>• Motor: React 18+ con TypeScript estricto.</li>
                  <li>• Entorno de Construcción: Vite 6 optimizado.</li>
                  <li>• Estilos: Tailwind CSS con paleta CIMA Dark (Zinc-950 / Orange-600).</li>
                  <li>• Generador de Documentos: jsPDF vectorial de alta resolución.</li>
                  <li>• Lectura Óptica: Escáner de códigos de barra integrado con cámara.</li>
                </ul>
              </div>

              <div className="p-4 bg-black border border-zinc-900 rounded-lg space-y-2">
                <span className="text-orange-400 font-bold text-[10px] uppercase block tracking-wider">Persistencia & Nube</span>
                <h4 className="font-bold text-white text-sm">Arquitectura Híbrida Local-First</h4>
                <ul className="space-y-1 text-zinc-400 text-[11px]">
                  <li>• Base de Datos Cloud: Google Cloud Firestore en tiempo real.</li>
                  <li>• Servidor Local / Docker: Express.js con sincronización bidireccional.</li>
                  <li>• Caché de Contingencia: LocalStorage con recuperación offline automática.</li>
                  <li>• Tolerancia a Fallas: Protección ante cuotas con persistencia local garantizada.</li>
                </ul>
              </div>
            </div>

            {/* Roles Matrix Table */}
            <div className="border border-zinc-900 rounded-lg overflow-hidden font-mono text-xs">
              <div className="p-3 bg-zinc-900/60 border-b border-zinc-900 font-bold text-orange-400 uppercase tracking-wider text-[11px]">
                Matriz de Control de Acceso por Roles (RBAC)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-black text-[10px] text-zinc-500 uppercase border-b border-zinc-900">
                    <tr>
                      <th className="p-2.5">Rol Institucional</th>
                      <th className="p-2.5">Facturación</th>
                      <th className="p-2.5">Inventario</th>
                      <th className="p-2.5">Compras</th>
                      <th className="p-2.5">Anulación</th>
                      <th className="p-2.5">Personal y Config</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 text-zinc-300 text-[11px]">
                    <tr className="hover:bg-zinc-900/30">
                      <td className="p-2.5 font-bold text-white">🛡️ Administrador</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Autorizado</td>
                      <td className="p-2.5 text-emerald-400">Autorizado</td>
                    </tr>
                    <tr className="hover:bg-zinc-900/30">
                      <td className="p-2.5 font-bold text-white">⭐ Supervisor</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Total</td>
                      <td className="p-2.5 text-emerald-400">Autorizado</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                    </tr>
                    <tr className="hover:bg-zinc-900/30">
                      <td className="p-2.5 font-bold text-white">💼 Vendedor</td>
                      <td className="p-2.5 text-emerald-400">Emisión</td>
                      <td className="p-2.5 text-amber-400">Consulta</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                    </tr>
                    <tr className="hover:bg-zinc-900/30">
                      <td className="p-2.5 font-bold text-white">📦 Almacenista</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                      <td className="p-2.5 text-emerald-400">Total Bins/Stock</td>
                      <td className="p-2.5 text-emerald-400">Recepción</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                    </tr>
                    <tr className="hover:bg-zinc-900/30">
                      <td className="p-2.5 font-bold text-white">👁️ Solo Lectura</td>
                      <td className="p-2.5 text-amber-400">Consulta</td>
                      <td className="p-2.5 text-amber-400">Consulta</td>
                      <td className="p-2.5 text-amber-400">Consulta</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                      <td className="p-2.5 text-zinc-600">Restringido</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Technical Contact Footer */}
            <div className="p-4 bg-black border border-zinc-900 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
              <div>
                <span className="text-zinc-500 block text-[10px]">PROPIEDAD INTELECTUAL Y DERECHOS RESERVADOS</span>
                <span className="text-white font-bold">© 2026 INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.</span>
              </div>
              <div className="text-zinc-450 text-[11px]">
                Desarrollado para entornos comerciales y de almacenamiento en Venezuela.
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
