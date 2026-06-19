import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, PawPrint, Syringe, FileText, Clock, LogIn, LogOut, ClipboardList, RefreshCw,
} from 'lucide-react'
import { api, getNombre } from '../services/api'

const DIAS = [
  ['lun', 'Lun'], ['mar', 'Mar'], ['mie', 'Mié'], ['jue', 'Jue'],
  ['vie', 'Vie'], ['sab', 'Sáb'], ['dom', 'Dom'],
]

const fmtFechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtFecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtHora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

function Card({ title, Icon, count, children }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Icon className="w-4 h-4 text-purple-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{title}</h2>
        {count != null && (
          <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

export default function MiPanel() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState(null)

  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    return api.get('/api/mi-panel/')
      .then(d => { setData(d); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])

  // Auto-actualización cada 20 s (silenciosa)
  useEffect(() => {
    const t = setInterval(() => cargar(true), 20000)
    return () => clearInterval(t)
  }, [])

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const nombre = getNombre() || 'Doctor'
  const hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const irACliente = (cid) => cid && navigate(`/clientes/${cid}`)

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mi panel — {nombre}</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{hoy}</p>
        </div>
        <button onClick={refrescar} disabled={refrescando}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        ) : (
          <>
            {/* Asistencia de hoy + horario */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Mi asistencia de hoy</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {data.asistencia_hoy.marcado ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-emerald-700"><LogIn className="w-4 h-4" />{fmtHora(data.asistencia_hoy.hora_ingreso)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 text-rose-700"><LogOut className="w-4 h-4" />
                      {data.asistencia_hoy.hora_salida ? fmtHora(data.asistencia_hoy.hora_salida) : <span className="text-amber-500 font-medium">En turno</span>}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Aún sin marcar ingreso hoy</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Horario:</span>
                <span>{data.asistencia_hoy.hora_entrada_perfil ? `Ingreso ${data.asistencia_hoy.hora_entrada_perfil}` : 'Sin hora asignada'}</span>
                <span className="flex items-center gap-1">
                  {DIAS.map(([code, lbl]) => {
                    const activo = (data.asistencia_hoy.dias_laborales || '').split(',').includes(code)
                    return (
                      <span key={code} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${activo ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-300'}`}>{lbl}</span>
                    )
                  })}
                </span>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Mis turnos próximos */}
              <Card title="Mis próximos turnos" Icon={Calendar} count={data.mis_turnos.length}>
                {data.mis_turnos.length === 0 ? (
                  <p className="text-xs text-slate-400 px-5 py-10 text-center">No tienes turnos asignados próximamente.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {data.mis_turnos.map(t => (
                      <div key={t.id} className="px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
                        <div className="text-center shrink-0 w-16">
                          <p className="text-sm font-bold text-purple-700">{fmtHora(t.fecha_hora)}</p>
                          <p className="text-[10px] text-slate-400">{fmtFecha(t.fecha_hora)}</p>
                        </div>
                        <button onClick={() => irACliente(t.cliente_id)} className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-semibold text-slate-800 truncate">{t.motivo || '(sin motivo)'}</p>
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1"><PawPrint className="w-3 h-3" />{t.paciente} · {t.especie} — {t.propietario}</p>
                        </button>
                        {t.paciente_id && (
                          <button
                            onClick={() => navigate(`/consultas/${t.paciente_id}`, { state: { citaId: t.id } })}
                            className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-lg transition">
                            Atender
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Seguimiento de mis pacientes */}
              <Card title="Controles / vacunas próximas" Icon={Syringe} count={data.seguimiento.length}>
                {data.seguimiento.length === 0 ? (
                  <p className="text-xs text-slate-400 px-5 py-10 text-center">Sin controles próximos de tus pacientes.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {data.seguimiento.map(s => (
                      <button key={s.paciente_id} onClick={() => irACliente(s.cliente_id)}
                        className="w-full text-left px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <PawPrint className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{s.paciente} · {s.especie}</p>
                          <p className="text-xs text-slate-500 truncate">{s.propietario}</p>
                        </div>
                        <span className="text-xs font-medium text-amber-700 shrink-0">{fmtFechaHora(s.proxima_cita)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Resumen de mis historias */}
            <Card title="Mis historias registradas" Icon={FileText} count={data.resumen_historias.total}>
              {data.resumen_historias.recientes.length === 0 ? (
                <p className="text-xs text-slate-400 px-5 py-10 text-center">Aún no has registrado historias clínicas.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {data.resumen_historias.recientes.map(h => (
                    <button key={h.id} onClick={() => irACliente(h.cliente_id)}
                      className="w-full text-left px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
                      <ClipboardList className="w-4 h-4 text-slate-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{h.paciente} · {h.especie}</p>
                        <p className="text-xs text-slate-500 truncate">{h.motivo || '(sin motivo)'} — {h.propietario}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{fmtFecha(h.fecha)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
