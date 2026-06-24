import { useState, useEffect, useRef } from 'react'
import { History, RefreshCw, User, Stethoscope, Download, Filter } from 'lucide-react'
import { api } from '../services/api'

const INTERVALO_MS = 15000  // auto-actualización cada 15 s

function fmtFechaHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// "hace X" relativo
function hace(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function Actividad() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [auto, setAuto] = useState(true)
  const [ultima, setUltima] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [filtros, setFiltros] = useState({ usuario: '', desde: '', hasta: '' })
  const timer = useRef(null)

  const cargar = (silencioso = false, f = filtros) => {
    if (!silencioso) setLoading(true)
    const p = new URLSearchParams({ limite: '200' })
    if (f.usuario) p.set('usuario', f.usuario)
    if (f.desde)   p.set('desde', f.desde)
    if (f.hasta)   p.set('hasta', f.hasta)
    return api.get(`/api/actividad/?${p.toString()}`)
      .then(d => { setItems(Array.isArray(d) ? d : []); setError(null); setUltima(new Date()) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])
  useEffect(() => { api.get('/api/usuarios/').then(u => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {}) }, [])

  const exportarCSV = () => {
    const cab = ['Fecha', 'Usuario', 'Rol', 'Accion', 'Detalle', 'Metodo', 'Ruta', 'Estado']
    const filas = items.map(a => [
      fmtFechaHora(a.fecha), a.usuario ?? '', a.rol ?? '', a.accion ?? '',
      a.detalle ?? '', a.metodo ?? '', a.ruta ?? '', a.estado ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `actividad_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // Auto-actualización (respeta los filtros vigentes)
  useEffect(() => {
    if (auto) {
      timer.current = setInterval(() => cargar(true), INTERVALO_MS)
      return () => clearInterval(timer.current)
    }
  }, [auto, filtros])

  const rolPill = (rol) => rol === 'recepcionista'
    ? 'bg-sky-100 text-sky-700'
    : 'bg-purple-100 text-purple-700'

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bitácora de actividad</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Quién hizo qué y cuándo {ultima && `· actualizado ${ultima.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300" />
            Auto-actualizar
          </label>
          <button onClick={exportarCSV} disabled={items.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={() => cargar()} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-4xl w-full mx-auto">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-purple-500" />
          <select value={filtros.usuario} onChange={e => setFiltros(f => ({ ...f, usuario: e.target.value }))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300">
            <option value="">Todos los usuarios</option>
            {usuarios.map(u => <option key={u.id} value={u.usuario}>{u.nombre} ({u.usuario})</option>)}
          </select>
          <input type="date" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700" />
          <input type="date" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700" />
          <button onClick={() => cargar()}
            className="px-3 py-1.5 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-lg transition">Buscar</button>
          {(filtros.usuario || filtros.desde || filtros.hasta) && (
            <button onClick={() => { const vacio = { usuario: '', desde: '', hasta: '' }; setFiltros(vacio); cargar(false, vacio) }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
          )}
        </div>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <History className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Últimas acciones</h2>
            <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{items.length}</span>
          </div>

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-12 text-center">Aún no hay acciones registradas.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {items.map(a => (
                <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                    {a.rol === 'recepcionista' ? <User className="w-4 h-4" /> : <Stethoscope className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-semibold">{a.usuario}</span> — {a.accion}
                      {a.detalle && <span className="text-slate-500"> · {a.detalle}</span>}
                    </p>
                    <p className="text-xs text-slate-400">{fmtFechaHora(a.fecha)} · {hace(a.fecha)}</p>
                  </div>
                  {a.rol && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${rolPill(a.rol)}`}>{a.rol}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
