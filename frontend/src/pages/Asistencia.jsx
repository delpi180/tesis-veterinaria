import { useState, useEffect } from 'react'
import { Clock, LogIn, LogOut, Trash2, Stethoscope, Filter, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'

const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'

/** Fecha de hoy en hora local (YYYY-MM-DD), sin desfase por UTC. */
function hoyStr() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function haceUnaSemanaStr() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function fmtHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

function fmtFecha(f) {
  if (!f) return '—'
  // f viene como 'YYYY-MM-DD'; evitamos el desfase de zona horaria
  const [y, m, d] = f.split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function Asistencia() {
  const toast = useToast()
  const [doctores, setDoctores] = useState([])
  const [hoyRegs,  setHoyRegs]  = useState([])   // marcaciones de hoy (para los botones)
  const [registros, setRegistros] = useState([]) // reporte filtrado
  const [resumen,  setResumen]  = useState([])   // totales por doctor
  const [loading,  setLoading]  = useState(true)
  const [refrescando, setRefrescando] = useState(false)

  const [filtros, setFiltros] = useState({ usuarioId: '', desde: haceUnaSemanaStr(), hasta: hoyStr() })

  const cargarDoctores = async () => {
    const data = await api.get('/api/usuarios/doctores')
    setDoctores(Array.isArray(data) ? data : [])
  }

  const cargarHoy = async () => {
    const h = hoyStr()
    const data = await api.get(`/api/asistencia/?desde=${h}&hasta=${h}`)
    setHoyRegs(Array.isArray(data) ? data : [])
  }

  const cargarReporte = async () => {
    const p = new URLSearchParams()
    if (filtros.usuarioId) p.set('usuario_id', filtros.usuarioId)
    if (filtros.desde)     p.set('desde', filtros.desde)
    if (filtros.hasta)     p.set('hasta', filtros.hasta)
    const [data, res] = await Promise.all([
      api.get(`/api/asistencia/?${p.toString()}`),
      api.get(`/api/asistencia/resumen?${p.toString()}`),
    ])
    setRegistros(Array.isArray(data) ? data : [])
    setResumen(Array.isArray(res) ? res : [])
  }

  const cargarTodo = async () => {
    setLoading(true)
    try {
      await Promise.all([cargarDoctores(), cargarHoy(), cargarReporte()])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { cargarTodo() }, [])

  // Auto-actualización cada 20 s (silenciosa)
  useEffect(() => {
    const t = setInterval(() => { Promise.all([cargarHoy(), cargarReporte()]).catch(() => {}) }, 20000)
    return () => clearInterval(t)
  }, [filtros])

  const refrescar = async () => {
    setRefrescando(true)
    try { await Promise.all([cargarDoctores(), cargarHoy(), cargarReporte()]) }
    catch (e) { toast.error(e.message) }
    finally { setRefrescando(false) }
  }

  // Marcación abierta de hoy para un doctor (sin hora de salida)
  const abiertaDe = (docId) => hoyRegs.find(r => r.usuario_id === docId && !r.hora_salida)

  const marcarIngreso = async (doc) => {
    try {
      await api.post('/api/asistencia/ingreso', { usuario_id: doc.id })
      toast.success(`Ingreso de ${doc.nombre} registrado`)
      await Promise.all([cargarHoy(), cargarReporte()])
    } catch (err) {
      toast.error(err.message)
    }
  }

  const marcarSalida = async (reg, nombre) => {
    try {
      await api.post(`/api/asistencia/${reg.id}/salida`)
      toast.success(`Salida de ${nombre} registrada`)
      await Promise.all([cargarHoy(), cargarReporte()])
    } catch (err) {
      toast.error(err.message)
    }
  }

  const eliminar = async (reg) => {
    if (!window.confirm('¿Eliminar esta marcación?')) return
    try {
      await api.del(`/api/asistencia/${reg.id}`)
      setRegistros(prev => prev.filter(x => x.id !== reg.id))
      setHoyRegs(prev => prev.filter(x => x.id !== reg.id))
      toast.success('Marcación eliminada')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const today = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Control de Asistencia</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <button onClick={refrescar} disabled={refrescando}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-6 max-w-5xl w-full mx-auto">

        {/* ── Marcación rápida del día ──────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Marcación de hoy</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando…</span>
            </div>
          ) : doctores.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-10 text-center">
              No hay doctores registrados. Crea cuentas de veterinario en <strong>Usuarios</strong>.
            </p>
          ) : (
            <div className="divide-y divide-slate-50">
              {doctores.map(doc => {
                const abierta = abiertaDe(doc.id)
                return (
                  <div key={doc.id} className="px-5 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <Stethoscope className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{doc.nombre}</p>
                      <p className="text-xs text-slate-400">
                        {abierta
                          ? <span className="text-emerald-600 font-medium">En turno desde {fmtHora(abierta.hora_ingreso)}</span>
                          : 'Fuera de turno'}
                      </p>
                    </div>
                    {abierta ? (
                      <button onClick={() => marcarSalida(abierta, doc.nombre)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition">
                        <LogOut className="w-4 h-4" /> Marcar salida
                      </button>
                    ) : (
                      <button onClick={() => marcarIngreso(doc)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition">
                        <LogIn className="w-4 h-4" /> Marcar ingreso
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Resumen por doctor (según el rango filtrado) ──────────── */}
        {resumen.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-500" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Resumen de horas por doctor</h2>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Doctor</th>
                  <th className="text-center px-5 py-3 font-semibold">Días</th>
                  <th className="text-right px-5 py-3 font-semibold">Total horas</th>
                  <th className="text-center px-5 py-3 font-semibold">Tardanzas</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r, i) => (
                  <tr key={r.usuario_id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-5 py-3 font-medium text-slate-800">{r.usuario_nombre ?? `#${r.usuario_id}`}</td>
                    <td className="px-5 py-3 text-center text-slate-600">{r.dias}</td>
                    <td className="px-5 py-3 text-right font-semibold text-purple-700">{r.total_horas} h</td>
                    <td className="px-5 py-3 text-center">
                      {r.tardanzas > 0
                        ? <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{r.tardanzas}</span>
                        : <span className="text-xs text-emerald-600">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}

        {/* ── Reporte / historial ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Historial de marcaciones</h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select className={inputCls} value={filtros.usuarioId}
                onChange={e => setFiltros(f => ({ ...f, usuarioId: e.target.value }))}>
                <option value="">Todos los doctores</option>
                {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <input type="date" className={inputCls} value={filtros.desde}
                onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
              <input type="date" className={inputCls} value={filtros.hasta}
                onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
              <button onClick={cargarReporte}
                className="px-3 py-2 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-lg transition">
                Buscar
              </button>
            </div>
          </div>

          {registros.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-10 text-center">Sin marcaciones para los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Doctor</th>
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-5 py-3 font-semibold">Ingreso</th>
                  <th className="text-left px-5 py-3 font-semibold">Salida</th>
                  <th className="text-right px-5 py-3 font-semibold">Horas</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={r.id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                    <td className="px-5 py-3 font-medium text-slate-800">{r.usuario_nombre ?? `#${r.usuario_id}`}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtFecha(r.fecha)}</td>
                    <td className="px-5 py-3">
                      <span className="text-emerald-700">{fmtHora(r.hora_ingreso)}</span>
                      {r.tardanza_min > 0 ? (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" /> +{r.tardanza_min} min
                        </span>
                      ) : r.tardanza_min === 0 ? (
                        <span className="ml-2 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">A tiempo</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-rose-700">
                      {r.hora_salida ? fmtHora(r.hora_salida) : <span className="text-amber-500 font-medium">En turno</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-700">
                      {r.horas_trabajadas != null ? `${r.horas_trabajadas} h` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => eliminar(r)} title="Eliminar"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

      </main>
    </div>
  )
}
