import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, PawPrint, Syringe, FileText, Clock, LogIn, LogOut, ClipboardList, RefreshCw, IdCard,
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
      <div className="px-4 md:px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
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

  // Sincronización en tiempo real vía Server-Sent Events (SSE)
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    const es = new EventSource(`/api/citas/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      if (e.data === 'citas_updated') {
        cargar(true);
      }
    };
    return () => {
      es.close();
    };
  }, []);

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  // La marcación de asistencia la registra la recepción (es quien controla los
  // horarios de ingreso/salida, que además varían). Aquí el doctor solo la consulta.

  const nombre = getNombre() || 'Doctor'
  const hoy = new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const irACliente = (cid) => cid && navigate(`/clientes/${cid}`)

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 static md:sticky md:top-0 md:z-10 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mi panel — {nombre}</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{hoy}</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.doctor?.id && (
            <button onClick={() => navigate(`/usuarios/${data.doctor.id}/perfil`)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition">
              <IdCard className="w-4 h-4" /> Ver mi perfil
            </button>
          )}
          <button onClick={refrescar} disabled={refrescando}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400"><Spinner /> <span className="text-sm">Cargando…</span></div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        ) : (
          <>
            {/* Asistencia de hoy + horario rediseñada */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Bloque izquierdo: Estado y Acciones de Marcación */}
              <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    data.asistencia_hoy.marcado && !data.asistencia_hoy.hora_salida
                      ? 'bg-emerald-100 text-emerald-700 animate-pulse'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mi asistencia de hoy</h3>
                    <p className={`text-base font-bold mt-0.5 ${
                      data.asistencia_hoy.marcado
                        ? data.asistencia_hoy.hora_salida
                          ? 'text-slate-600'
                          : 'text-emerald-600'
                        : 'text-amber-500'
                    }`}>
                      {data.asistencia_hoy.marcado
                        ? data.asistencia_hoy.hora_salida
                          ? 'Turno Finalizado'
                          : 'En Turno (Trabajando)'
                        : 'Aún sin marcar ingreso'}
                    </p>
                  </div>
                </div>

                {/* La marcación la registra la recepción, que es quien controla
                    los horarios de ingreso y salida (y los ajusta cuando varían).
                    Aquí el doctor solo consulta cómo quedó la suya. */}
                <div className="w-full sm:w-auto text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  {data.asistencia_hoy.marcado && data.asistencia_hoy.hora_salida
                    ? 'Marcación del día completa.'
                    : data.asistencia_hoy.marcado
                      ? 'Tu ingreso ya fue registrado por recepción.'
                      : 'Recepción registra tu ingreso y salida.'}
                </div>
              </div>

              {/* Bloque derecho: Horario y Marcaciones detalladas */}
              <div className="w-full md:w-[380px] p-5 bg-slate-50/50 flex flex-col justify-center gap-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">Horario Pactado</span>
                  <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                    {data.asistencia_hoy.hora_entrada_perfil ? `${data.asistencia_hoy.hora_entrada_perfil} hrs` : 'No asignado'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">Días Laborales</span>
                  <div className="flex items-center gap-0.5">
                    {DIAS.map(([code, lbl]) => {
                      const activo = (data.asistencia_hoy.dias_laborales || '').split(',').includes(code)
                      return (
                        <span key={code} className={`px-1 rounded text-[9px] font-bold ${
                          activo ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-300'
                        }`}>{lbl}</span>
                      )
                    })}
                  </div>
                </div>

                {data.asistencia_hoy.marcado && (
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 bg-white border border-slate-100 rounded-lg px-3 py-2 mt-1">
                    <div className="flex items-center gap-1">
                      <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ingreso: <strong className="text-slate-700">{fmtHora(data.asistencia_hoy.hora_ingreso)}</strong></span>
                    </div>
                    {data.asistencia_hoy.hora_salida && (
                      <div className="flex items-center gap-1 border-l border-slate-100 pl-3">
                        <LogOut className="w-3.5 h-3.5 text-rose-500" />
                        <span>Salida: <strong className="text-slate-700">{fmtHora(data.asistencia_hoy.hora_salida)}</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Mis turnos próximos */}
              <Card title="Mis próximos turnos" Icon={Calendar} count={data.mis_turnos.length}>
                {data.mis_turnos.length === 0 ? (
                  <p className="text-xs text-slate-400 px-4 md:px-5 py-10 text-center">No tienes turnos asignados próximamente.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {data.mis_turnos.map(t => (
                      <div key={t.id} className="px-4 md:px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
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
                  <p className="text-xs text-slate-400 px-4 md:px-5 py-10 text-center">Sin controles próximos de tus pacientes.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {data.seguimiento.map(s => (
                      <button key={s.paciente_id} onClick={() => irACliente(s.cliente_id)}
                        className="w-full text-left px-4 md:px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
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
                <p className="text-xs text-slate-400 px-4 md:px-5 py-10 text-center">Aún no has registrado historias clínicas.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {data.resumen_historias.recientes.map(h => (
                    <button key={h.id} onClick={() => irACliente(h.cliente_id)}
                      className="w-full text-left px-4 md:px-5 py-3 hover:bg-slate-50/70 transition flex items-center gap-3">
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
