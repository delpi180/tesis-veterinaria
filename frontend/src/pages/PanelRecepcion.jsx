import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, PawPrint, User, Stethoscope, AlertTriangle, Coins, CheckCircle2,
  XCircle, Package, RefreshCw, MessageCircle, CalendarClock,
} from 'lucide-react'
import { api, getNombre } from '../services/api'
import { estadoStyle, estadoLabel, waRecordatorio } from '../utils/citas'

const fmtMoneda = (n) => `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function PanelRecepcion() {
  const navigate = useNavigate()
  const [data, setData]   = useState(null)   // /dashboard/resumen
  const [caja, setCaja]   = useState(null)   // /dashboard/cierre-caja
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refrescando, setRefrescando] = useState(false)

  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    return Promise.all([
      api.get('/api/dashboard/resumen'),
      api.get('/api/dashboard/cierre-caja'),
    ])
      .then(([res, cj]) => { setData(res); setCaja(cj); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])
  // Auto-actualización cada 20 s
  useEffect(() => {
    const t = setInterval(() => cargar(true), 20000)
    return () => clearInterval(t)
  }, [])

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const cambiarEstado = async (id, estado) => {
    try {
      await api.put(`/api/citas/${id}`, { estado })
      setData(d => ({ ...d, citas_hoy: d.citas_hoy.map(c => c.id === id ? { ...c, estado } : c) }))
    } catch (e) { alert(e.message) }
  }

  const nombre = getNombre() || 'Recepción'
  const hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const citasHoy   = data?.citas_hoy ?? []
  const pendientes = citasHoy.filter(c => c.estado === 'pendiente')
  const activas    = citasHoy.filter(c => c.estado !== 'cancelada')
  const stockBajo  = data?.stock_bajo ?? []
  const cajaTotal  = caja?.total ?? 0
  const cajaVentas = caja?.num_ventas ?? 0

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Panel de Recepción — {nombre}</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{hoy}</p>
        </div>
        <button onClick={refrescar} disabled={refrescando}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
        ) : (
          <>
            {/* Alertas / resumen del día */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button onClick={() => navigate('/turnos')}
                className={`text-left rounded-xl border px-5 py-4 transition ${pendientes.length ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Citas sin confirmar</p>
                  <CalendarClock className={`w-5 h-5 ${pendientes.length ? 'text-amber-500' : 'text-slate-300'}`} />
                </div>
                <p className={`text-3xl font-bold mt-1 ${pendientes.length ? 'text-amber-700' : 'text-slate-700'}`}>{pendientes.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">de {activas.length} hoy</p>
              </button>

              <button onClick={() => navigate('/inventario')}
                className={`text-left rounded-xl border px-5 py-4 transition ${stockBajo.length ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock bajo</p>
                  <AlertTriangle className={`w-5 h-5 ${stockBajo.length ? 'text-rose-500' : 'text-slate-300'}`} />
                </div>
                <p className={`text-3xl font-bold mt-1 ${stockBajo.length ? 'text-rose-700' : 'text-slate-700'}`}>{stockBajo.length}</p>
                <p className="text-xs text-slate-400 mt-0.5">{stockBajo.length ? 'productos por reponer' : 'todo en orden'}</p>
              </button>

              <button onClick={() => navigate('/caja')}
                className="text-left rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-5 py-4 transition">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Caja de hoy</p>
                  <Coins className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-2xl font-bold mt-1 text-emerald-800">{fmtMoneda(cajaTotal)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">{cajaVentas} venta(s)</p>
              </button>
            </div>

            {/* Stock bajo — detalle rápido */}
            {stockBajo.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Package className="w-4 h-4 text-rose-500" />
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Productos por reponer</h2>
                </div>
                <ul className="divide-y divide-slate-50">
                  {stockBajo.slice(0, 6).map(p => (
                    <li key={p.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-slate-700">{p.nombre} <span className="text-xs font-mono text-slate-400">{p.codigo}</span></span>
                      <span className="text-xs font-semibold text-rose-600">{p.stock} / mín {p.stock_minimo}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Turnos del día con acciones rápidas */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-500" />
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Turnos de hoy</h2>
                  <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{activas.length}</span>
                </div>
                <button onClick={() => navigate('/turnos')} className="text-xs text-purple-600 hover:text-purple-800 font-semibold">Ir a la agenda →</button>
              </div>

              {citasHoy.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-10 text-center">Sin turnos para hoy.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {citasHoy.map(c => {
                    const { pill } = estadoStyle(c.estado)
                    const cancelada = c.estado === 'cancelada'
                    return (
                      <li key={c.id} className={`px-5 py-3 flex flex-wrap items-center gap-3 ${cancelada ? 'opacity-50' : ''}`}>
                        <span className="text-sm font-bold text-purple-700 w-14 shrink-0">{fmtHora(c.fecha_hora)}</span>
                        <button onClick={() => c.cliente_id && navigate(`/clientes/${c.cliente_id}`)} className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-semibold text-slate-800 truncate">{c.motivo || '(sin motivo)'}</p>
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <PawPrint className="w-3 h-3" />{c.paciente} · {c.especie}
                            <span className="text-slate-300">·</span>
                            <User className="w-3 h-3" />{c.propietario}
                          </p>
                          {c.veterinario && <p className="text-xs text-purple-600 flex items-center gap-1"><Stethoscope className="w-3 h-3" />{c.veterinario}</p>}
                        </button>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${pill}`}>{estadoLabel(c.estado)}</span>
                        {/* Acciones rápidas */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.estado === 'pendiente' && (
                            <button onClick={() => cambiarEstado(c.id, 'confirmada')} title="Confirmar"
                              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar
                            </button>
                          )}
                          {c.estado !== 'atendida' && c.estado !== 'cancelada' && (
                            <button onClick={() => cambiarEstado(c.id, 'atendida')} title="Marcar atendida"
                              className="px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition">
                              Atendida
                            </button>
                          )}
                          {!cancelada && (
                            <button onClick={() => cambiarEstado(c.id, 'cancelada')} title="Cancelar"
                              className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 transition">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.telefono && (
                            <a href={waRecordatorio(c.telefono, c.propietario, c.paciente, c)} target="_blank" rel="noopener noreferrer"
                              title="Recordatorio por WhatsApp"
                              className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-600 hover:bg-green-500 text-white transition">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
