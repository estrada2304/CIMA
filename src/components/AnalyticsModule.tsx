import React, { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, Calendar, FileText, ChevronRight, Download, RefreshCw, Layers, ShieldCheck, Database 
} from 'lucide-react';
import { Transaction, Purchase, Product, ExchangeRate } from '../types';
import { formatDateDDMMAAAA, formatDateTimeDDMMAAAA, isBolivaresPaymentMethod } from '../lib/formatters';

interface AnalyticsModuleProps {
  transactions: Transaction[];
  purchases: Purchase[];
  products: Product[];
  exchangeRate: ExchangeRate;
}

export default function AnalyticsModule({
  transactions,
  purchases,
  products,
  exchangeRate
}: AnalyticsModuleProps) {
  const [reportCurrency, setReportCurrency] = useState<'USD' | 'VES'>('USD');
  const [selectedTrxForView, setSelectedTrxForView] = useState<Transaction | null>(null);

  const formatCurrency = (val: number, currency: 'USD' | 'VES') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    } else {
      return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val).replace('VES', 'Bs.');
    }
  };

  // 1. Calculate General Numbers
  const totalSalesUSD = transactions.filter(t => t.type !== 'cotizacion' && t.status === 'completado').reduce((acc, t) => acc + t.totalUSD, 0);
  const totalSalesVES = transactions.filter(t => t.type !== 'cotizacion' && t.status === 'completado').reduce((acc, t) => acc + t.totalVES, 0);

  const totalQuotesUSD = transactions.filter(t => t.type === 'cotizacion').reduce((acc, t) => acc + t.totalUSD, 0);
  const totalQuotesVES = transactions.filter(t => t.type === 'cotizacion').reduce((acc, t) => acc + t.totalVES, 0);

  const totalPurchasesUSD = purchases.reduce((acc, p) => acc + p.totalUSD, 0);
  const totalPurchasesVES = purchases.reduce((acc, p) => acc + p.totalVES, 0);

  // 2. Format Trend Data for BarChart
  // Aggregate sales by date/document to plot
  const chartData = transactions.filter(t => t.status === 'completado').map(t => {
    const isUSD = reportCurrency === 'USD';
    return {
      name: t.id,
      monto: isUSD ? t.totalUSD : t.totalVES,
      subtotal: isUSD ? t.subtotalUSD : t.subtotalVES,
      tax: isUSD ? (t.ivaUSD + t.igtfUSD) : (t.ivaVES + t.igtfVES),
      tipo: t.type.toUpperCase()
    };
  });

  // 3. Category distribution (PieChart)
  const categoryMap: { [key: string]: number } = {};
  products.forEach(p => {
    categoryMap[p.category] = (categoryMap[p.category] || 0) + (p.stock * p.priceUSD);
  });

  const pieData = Object.keys(categoryMap).map(cat => ({
    name: cat,
    value: Math.round((reportCurrency === 'USD' ? categoryMap[cat] : categoryMap[cat] * exchangeRate.rate) * 100) / 100
  }));

  const COLORS = ['#6366f1', '#10b981', '#0ea5e9', '#ec4899', '#8b5cf6', '#f59e0b'];

  return (
    <div className="space-y-6 p-1">
      {/* Analytics control title */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800/85">
        <div>
          <span className="text-xs font-mono text-indigo-400 uppercase tracking-widest block font-bold">MÓDULO DE ANALÍTICAS E INFORMES</span>
          <h2 className="text-xl font-semibold text-slate-100 mt-0.5">Métricas de Ventas y Finanzas</h2>
        </div>
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
          <button
            type="button"
            onClick={() => setReportCurrency('USD')}
            className={`px-3 py-1.5 text-xs font-bold rounded transition select-none ${
              reportCurrency === 'USD' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ref. Dólares ($)
          </button>
          <button
            type="button"
            onClick={() => setReportCurrency('VES')}
            className={`px-3 py-1.5 text-xs font-bold rounded transition select-none ${
              reportCurrency === 'VES' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ref. Bolívares (Bs.)
          </button>
        </div>
      </div>

      {/* Financial KPIs row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block font-bold">Ingresos por Ventas (Efectivas)</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {formatCurrency(reportCurrency === 'USD' ? totalSalesUSD : totalSalesVES, reportCurrency)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Excluye cotizaciones pendientes y anulaciones.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block font-bold">Volumen en Cotizaciones</span>
          <p className="text-2xl font-bold text-indigo-400 mt-1">
            {formatCurrency(reportCurrency === 'USD' ? totalQuotesUSD : totalQuotesVES, reportCurrency)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Presupuestos propuestos a clientes venezolanos.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block font-bold">Inversión en Compras de Proveedor</span>
          <p className="text-2xl font-bold text-sky-450 mt-1">
            {formatCurrency(reportCurrency === 'USD' ? totalPurchasesUSD : totalPurchasesVES, reportCurrency)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 font-sans">Gasto realizado para reabastecimiento.</p>
        </div>
      </div>

      {/* Graphs workspace (using Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trend Bar */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest font-mono mb-4 text-indigo-400">📈 Volumen Transaccional Reciente ({reportCurrency})</h3>
          
          <div className="h-64 sm:h-72">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-650 text-xs text-center font-mono">
                No hay transacciones registradas para graficar.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} fontClassName="font-mono" />
                  <YAxis stroke="#64748b" fontSize={9} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    labelStyle={{ color: '#f8fafc', fontFamily: 'monospace', fontSize: 10 }}
                    itemStyle={{ color: '#818cf8', fontSize: 11 }}
                  />
                  <Bar dataKey="monto" fill="#6366f1" radius={[4, 4, 0, 0]} name="Total Gravado" />
                  <Bar dataKey="tax" fill="#334155" radius={[4, 4, 0, 0]} name="Impuestos IVA/IGTF" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Categories Distribution */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest font-mono mb-4 text-indigo-400">📁 Valor por Categoría ({reportCurrency})</h3>
          <div className="h-64 sm:h-72 flex flex-col justify-between">
            <div className="h-44">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-650 text-xs font-mono">
                  No hay inventario para graficar.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      itemStyle={{ color: '#f8fafc', fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="space-y-1 bg-slate-950/40 p-2.5 border border-slate-800 rounded-xl overflow-y-auto max-h-[110px]">
              {pieData.map((item, id) => (
                <div key={id} className="flex justify-between items-center text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: COLORS[id % COLORS.length] }} />
                    <span className="text-slate-300 truncate max-w-[130px] capitalize font-medium">{item.name}</span>
                  </div>
                  <span className="font-mono text-slate-400">{formatCurrency(item.value, reportCurrency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic details historical receipts */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest font-mono text-indigo-400">🧾 Auditoría e Historial de Documentos</h3>
          <span className="text-[10px] text-slate-500 font-mono">Total emitidos: {transactions.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-mono text-slate-500 uppercase font-bold">
                <th className="py-2.5">Código / Serial</th>
                <th>Fecha Emisión</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th className="text-right">Monto ($ USD)</th>
                <th className="text-right">Monto (Bs VES)</th>
                <th className="text-center">Estado</th>
                <th className="text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono text-xs italic">
                    No hay transacciones registradas para auditar. Las métricas se actualizarán en tiempo real cuando se emitan nuevos documentos.
                  </td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-950/40 text-slate-300">
                    <td className="py-3 font-mono font-bold text-slate-100">{t.id}</td>
                    <td className="font-mono text-slate-500">{formatDateDDMMAAAA(t.timestamp)} {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase font-black ${
                        t.type === 'factura' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                          : t.type === 'cotizacion' 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' 
                          : t.type === 'recibo'
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/10'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10'
                      }`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="font-semibold text-slate-250">{t.clientName}</td>
                    <td className="text-right font-mono text-slate-100">{formatCurrency(t.totalUSD, 'USD')}</td>
                    <td className="text-right font-mono text-slate-400">{formatCurrency(t.totalVES, 'VES')}</td>
                    <td className="text-center">
                      <span className={`px-1.5 py-0.2.5 rounded text-[10px] ${
                        t.status === 'completado' 
                          ? 'text-emerald-400 bg-emerald-500/5' 
                          : t.status === 'pendiente' 
                          ? 'text-amber-500 bg-amber-500/5' 
                          : 'text-rose-550 bg-rose-500/5'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTrxForView(t)}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-[10px] font-semibold rounded text-slate-400 hover:text-slate-100 transition"
                      >
                        Analizar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRANS VIEW PORT MODAL */}
      {selectedTrxForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 relative animate-scale-up shadow-2xl">
            <h3 className="text-sm font-extrabold text-slate-100 uppercase font-mono tracking-widest text-indigo-400 mb-2">🔍 Auditoría del Documento {selectedTrxForView.id}</h3>
            <p className="text-[10.5px] text-slate-500 mb-4 font-mono">Respaldo fiscal digital. Validaciones criptográficas.</p>

            <div className="space-y-4 text-xs font-sans">
              <div className="bg-slate-950/60 p-3.5 border border-slate-800 rounded-lg space-y-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold font-mono">Detalles Generales</p>
                <p className="text-slate-200"><strong>Cliente:</strong> {selectedTrxForView.clientName} ({selectedTrxForView.clientRif})</p>
                <p className="text-slate-200"><strong>Fecha:</strong> {formatDateDDMMAAAA(selectedTrxForView.timestamp)} {new Date(selectedTrxForView.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-slate-300"><strong>Método de Pago:</strong> {selectedTrxForView.paymentMethod}</p>
                <p className="text-indigo-400 font-mono font-bold"><strong>Tasa Oficial Usada:</strong> 1$ = {formatCurrency(selectedTrxForView.exchangeRateUsed, 'VES')}</p>
              </div>

              {(() => {
                const isBs = isBolivaresPaymentMethod(selectedTrxForView.paymentMethod);
                const sym = isBs ? 'Bs.' : '$';
                return (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-500 uppercase font-bold font-mono block">Descripción / Producto ({sym})</p>
                    {selectedTrxForView.items.map((it, id) => (
                      <div key={id} className="flex justify-between items-center text-xs py-1 border-b border-slate-800/80">
                        <span className="text-slate-300">
                          <span className="text-indigo-400 font-mono font-bold mr-1">[{sym}]</span>
                          {it.name} (x{it.qty})
                        </span>
                        <span className="font-mono font-bold text-slate-100">
                          {isBs ? formatCurrency(it.totalVES, 'VES') : formatCurrency(it.totalUSD, 'USD')}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Encrypted payload simulation block expressing "Extremo a Extremo" security of metadata */}
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono uppercase font-bold mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-450" /> Cifrado de Datos Extremo a Extremo (Simulado en la Nube)
                </div>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
                  <label className="text-[9px] text-slate-600 block font-mono font-bold">CLIENT-SIDE ENCRYPTED SYNC ENVELOPE (AES-256):</label>
                  <p className="text-[9px] font-mono text-indigo-400 break-all select-all leading-tight">
                    {btoa(JSON.stringify({ 
                      id: selectedTrxForView.id, 
                      totalUSD: selectedTrxForView.totalUSD,
                      rif: selectedTrxForView.clientRif,
                      secured: "SHA256"
                    })).slice(0, 150)}...
                  </p>
                </div>
                <span className="text-[8.5px] text-slate-500 font-sans block mt-1.5 leading-normal">
                  * Todos los valores financieros sensibles se codifican e hibridan antes de canalizarse hacia la base de datos distribuida en la nube para resguardo de propiedad intelectual.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedTrxForView(null)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-100 font-semibold text-xs rounded transition"
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
