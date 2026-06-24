import { useState, useEffect } from 'react'
import { BarChart3, Package, Stethoscope, Filter, Download, Coins, ShoppingCart } from 'lucide-react'
import { api } from '../services/api'

const fmtMoneda = (n) => `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function hoyStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inicioMesStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

function TablaTop({ title, Icon, rows, money }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Icon className="w-4 h-4 text-purple-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 px-5 py-8 text-center">Sin datos en el periodo.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <th className="text-left px-5 py-2.5 font-semibold">{money ? 'Producto/Servicio' : 'Doctor'}</th>
              <th className="text-center px-5 py-2.5 font-semibold">{money ? 'Cant.' : 'Atenciones'}</th>
              {money && <th className="text-right px-5 py-2.5 font-semibold">Monto</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                <td className="px-5 py-2.5 font-medium text-slate-800">{r.nombre ?? r.doctor}</td>
                <td className="px-5 py-2.5 text-center text-slate-600">{r.cantidad ?? r.atenciones}</td>
                {money && <td className="px-5 py-2.5 text-right font-semibold text-slate-700">{fmtMoneda(r.monto)}</td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  )
}

export default function Reportes() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtros, setFiltros] = useState({ desde: inicioMesStr(), hasta: hoyStr() })

  const cargar = (f = filtros) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (f.desde) p.set('desde', f.desde)
    if (f.hasta) p.set('hasta', f.hasta)
    return api.get(`/api/dashboard/reportes?${p.toString()}`)
      .then(d => { setData(d); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])

  const exportarCSV = () => {
    if (!data) return
    const lineas = ['Tipo,Nombre,Cantidad,Monto']
    data.top_productos.forEach(r => lineas.push(`Producto,"${r.nombre}",${r.cantidad},${r.monto}`))
    data.top_servicios.forEach(r => lineas.push(`Servicio,"${r.nombre}",${r.cantidad},${r.monto}`))
    data.atenciones_por_doctor.forEach(r => lineas.push(`Atencion,"${r.doctor}",${r.atenciones},`))
    const csv = '﻿' + lineas.join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `reporte_${data.desde}_a_${data.hasta}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reportes</h1>
          <p className="text-xs text-slate-400 mt-0.5">Productos/servicios más vendidos y atenciones por doctor</p>
        </div>
        <button onClick={exportarCSV} disabled={!data}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
          <Download className="w-4 h-4" /> Exportar
        </button>
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold text-slate-500">Periodo:</span>
          <input type="date" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700" />
          <input type="date" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700" />
          <button onClick={() => cargar()}
            className="px-3 py-1.5 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-lg transition">Buscar</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        ) : data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Ingreso del periodo</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1">{fmtMoneda(data.ingreso_total)}</p>
                </div>
                <Coins className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-sky-700 font-semibold uppercase tracking-wide">Ventas del periodo</p>
                  <p className="text-2xl font-bold text-sky-800 mt-1">{data.total_ventas}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-sky-400" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <TablaTop title="Productos más vendidos" Icon={Package} rows={data.top_productos} money />
              <TablaTop title="Servicios más vendidos" Icon={BarChart3} rows={data.top_servicios} money />
            </div>

            <TablaTop title="Atenciones por doctor" Icon={Stethoscope} rows={data.atenciones_por_doctor} money={false} />
          </>
        )}
      </main>
    </div>
  )
}
