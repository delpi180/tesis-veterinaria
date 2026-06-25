import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Syringe, Search, AlertTriangle, Clock, CheckCircle2, MessageCircle, Download, RefreshCw } from 'lucide-react'
import { api } from '../services/api'

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO = {
  vencida:    { label: 'Vencida',    cls: 'bg-rose-100 text-rose-700',     Icon: AlertTriangle },
  proxima:    { label: 'Próxima',    cls: 'bg-amber-100 text-amber-700',   Icon: Clock },
  programada: { label: 'Programada', cls: 'bg-sky-100 text-sky-700',       Icon: CheckCircle2 },
  null:       { label: 'Sin fecha',  cls: 'bg-slate-100 text-slate-500',   Icon: Clock },
}

const FILTROS = [
  { key: 'todas',      label: 'Todas' },
  { key: 'vencida',    label: 'Vencidas' },
  { key: 'proxima',    label: 'Próximas (30 días)' },
  { key: 'sin',        label: 'Sin próxima dosis' },
]

const waLink = (tel, propietario, paciente, vacuna) => {
  const num = (tel || '').replace(/\D/g, '')
  const msg = `Hola ${propietario || ''}, le recordamos que ${paciente || 'su mascota'} tiene pendiente la vacuna *${vacuna}* en Veterinaria Los Pinos. ¡Le esperamos!`
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function Vacunacion() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState('todas')
  const [busq, setBusq] = useState('')

  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    return api.get('/api/dashboard/vacunas')
      .then(d => { setItems(Array.isArray(d) ? d : []); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])
  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const term = busq.trim().toLowerCase()
  const filtrados = items.filter(v => {
    if (filtro === 'vencida'  && v.estado !== 'vencida') return false
    if (filtro === 'proxima'  && v.estado !== 'proxima') return false
    if (filtro === 'sin'      && v.estado !== null) return false
    if (term) {
      const txt = `${v.paciente ?? ''} ${v.propietario ?? ''} ${v.vacuna ?? ''}`.toLowerCase()
      if (!txt.includes(term)) return false
    }
    return true
  })

  const vencidas = items.filter(v => v.estado === 'vencida').length
  const proximas = items.filter(v => v.estado === 'proxima').length

  const exportarCSV = () => {
    const cab = ['Paciente', 'Especie', 'Vacuna', 'Aplicada', 'Proxima dosis', 'Estado', 'Dueno', 'Telefono']
    const filas = filtrados.map(v => [
      v.paciente, v.especie, v.vacuna, fmtFecha(v.fecha_aplicada), v.proxima_dosis ?? '',
      (ESTADO[v.estado] ?? ESTADO.null).label, v.propietario, v.telefono ?? '',
    ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `vacunacion_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Vacunación</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{hoy}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarCSV} disabled={filtrados.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={refrescar} disabled={refrescando}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className={`rounded-xl border px-5 py-4 ${vencidas ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vencidas</p>
            <p className={`text-3xl font-bold mt-1 ${vencidas ? 'text-rose-700' : 'text-slate-700'}`}>{vencidas}</p>
          </div>
          <div className={`rounded-xl border px-5 py-4 ${proximas ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próximas (30 días)</p>
            <p className={`text-3xl font-bold mt-1 ${proximas ? 'text-amber-700' : 'text-slate-700'}`}>{proximas}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 col-span-2 sm:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total registros</p>
            <p className="text-3xl font-bold mt-1 text-slate-700">{items.length}</p>
          </div>
        </div>

        {/* Filtros + búsqueda */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${filtro === f.key
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={busq} onChange={e => setBusq(e.target.value)}
              placeholder="Buscar mascota, dueño o vacuna…"
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-56" />
          </div>
        </div>

        {/* Tabla */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Syringe className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Vacunas</h2>
            <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{filtrados.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
          ) : error ? (
            <div className="m-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</div>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-12 text-center">Sin registros de vacunación para este filtro.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Paciente</th>
                  <th className="text-left px-5 py-3 font-semibold">Vacuna</th>
                  <th className="text-left px-5 py-3 font-semibold">Aplicada</th>
                  <th className="text-left px-5 py-3 font-semibold">Próxima dosis</th>
                  <th className="text-center px-5 py-3 font-semibold">Estado</th>
                  <th className="text-left px-5 py-3 font-semibold">Dueño</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((v, i) => {
                  const est = ESTADO[v.estado] ?? ESTADO.null
                  return (
                    <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <button onClick={() => v.cliente_id && navigate(`/clientes/${v.cliente_id}`)}
                          className="font-semibold text-slate-800 hover:text-purple-700 transition text-left">
                          {v.paciente}
                        </button>
                        <p className="text-xs text-slate-400">{v.especie}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{v.vacuna}</td>
                      <td className="px-5 py-3 text-slate-500">{fmtFecha(v.fecha_aplicada)}</td>
                      <td className="px-5 py-3 text-slate-600">{v.proxima_dosis || '—'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${est.cls}`}>
                          <est.Icon className="w-3 h-3" />{est.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{v.propietario}</td>
                      <td className="px-5 py-3 text-right">
                        {v.telefono && (
                          <a href={waLink(v.telefono, v.propietario, v.paciente, v.vacuna)} target="_blank" rel="noopener noreferrer"
                            title="Recordar por WhatsApp"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-green-600 hover:bg-green-500 text-white transition">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </section>
      </main>
    </div>
  )
}
