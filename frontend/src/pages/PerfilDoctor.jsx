import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ChevronLeft, User, IdCard, Phone, Stethoscope, Clock, CalendarClock,
  ClipboardList, PawPrint, CalendarCheck, BadgeCheck,
} from 'lucide-react'
import { api, esVeterinario } from '../services/api'
import { Cargando } from '../components/Cargando'

const DIA_LABEL = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }

const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—'
const fmtHora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', {
  hour: '2-digit', minute: '2-digit',
}) : '—'

function DatoPersonal({ Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-purple-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value || '—'}</p>
      </div>
    </div>
  )
}

function StatCard({ Icon, label, value, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

export default function PerfilDoctor() {
  const { usuarioId } = useParams()
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true); setError(null)
      try {
        setPerfil(await api.get(`/api/usuarios/${usuarioId}/perfil`))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [usuarioId])

  const rutaVolver = esVeterinario() ? '/mi-panel' : '/usuarios'

  if (loading) {
    return (
      <div className="flex-1 flex min-h-screen bg-slate-50">
        <Cargando texto="Cargando perfil…" alto="100vh" className="w-full" />
      </div>
    )
  }
  if (error || !perfil) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <p className="text-sm text-rose-600">⚠ {error || 'No se pudo cargar el perfil.'}</p>
        <button onClick={() => navigate(rutaVolver)} className="text-sm text-purple-700 font-medium hover:underline">Volver</button>
      </div>
    )
  }

  const { usuario: u, asistencia, pacientes_tratados, total_historias, seguimiento } = perfil
  const esVet = u.rol === 'veterinario'
  const dias = (u.dias_laborales || '').split(',').filter(Boolean)

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-3 static md:sticky md:top-0 md:z-10 flex-wrap">
        <button onClick={() => navigate(rutaVolver)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-purple-700 transition font-medium shrink-0">
          <ChevronLeft className="w-4 h-4" /> Volver
        </button>
        <span className="text-slate-300">/</span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800 truncate">Perfil — {u.nombre}</h1>
          <p className="text-xs text-slate-400">
            <span className={`inline-flex items-center gap-1 font-semibold ${esVet ? 'text-purple-600' : 'text-sky-600'}`}>
              {esVet ? <Stethoscope className="w-3 h-3" /> : <User className="w-3 h-3" />}
              {esVet ? 'Veterinario' : 'Recepcionista'}
            </span>
            {' · '}
            <span className={u.activo ? 'text-emerald-600' : 'text-slate-400'}>{u.activo ? 'Activo' : 'Inactivo'}</span>
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-4xl w-full mx-auto">

        {/* ── Datos personales ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Datos personales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatoPersonal Icon={User} label="Usuario" value={u.usuario} />
            <DatoPersonal Icon={IdCard} label="DNI" value={u.dni} />
            <DatoPersonal Icon={Phone} label="Teléfono" value={u.telefono} />
            {esVet && <DatoPersonal Icon={BadgeCheck} label="Especialidad" value={u.especialidad} />}
            <DatoPersonal Icon={CalendarClock} label="Usuario desde" value={fmtFecha(u.creado_en)} />
            {esVet && (
              <DatoPersonal Icon={Clock} label="Horario laboral"
                value={u.hora_entrada ? `${u.hora_entrada} · ${dias.map(d => DIA_LABEL[d] ?? d).join(', ') || 'sin días asignados'}` : 'No configurado'} />
            )}
          </div>
        </section>

        {/* ── Estadísticas ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {esVet && (
            <>
              <StatCard Icon={PawPrint} label="Pacientes tratados" value={pacientes_tratados.total} color="bg-purple-100 text-purple-600" />
              <StatCard Icon={ClipboardList} label="Historias registradas" value={total_historias} color="bg-sky-100 text-sky-600" />
              <StatCard Icon={CalendarCheck} label="En seguimiento" value={seguimiento.length} color="bg-amber-100 text-amber-600" />
            </>
          )}
          <StatCard Icon={Clock} label="Días de asistencia" value={asistencia.total_dias} color="bg-emerald-100 text-emerald-600" />
        </div>

        {/* ── Pacientes en seguimiento ─────────────────────────────────── */}
        {esVet && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pacientes en seguimiento</h2>
            </div>
            {seguimiento.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Sin controles próximos agendados</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold">Paciente</th>
                    <th className="text-left px-5 py-3 font-semibold">Propietario</th>
                    <th className="text-left px-5 py-3 font-semibold">Próximo control</th>
                  </tr>
                </thead>
                <tbody>
                  {seguimiento.map((s, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{s.paciente} <span className="text-slate-400 font-normal">({s.especie})</span></td>
                      <td className="px-5 py-3 text-slate-500">{s.propietario}</td>
                      <td className="px-5 py-3 text-slate-500">{fmtFecha(s.proxima_cita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        )}

        {/* ── Pacientes tratados ───────────────────────────────────────── */}
        {esVet && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Pacientes tratados</h2>
              <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{pacientes_tratados.total}</span>
            </div>
            {pacientes_tratados.lista.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Aún no ha atendido pacientes</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto"><table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold">Paciente</th>
                    <th className="text-left px-5 py-3 font-semibold">Propietario</th>
                    <th className="text-left px-5 py-3 font-semibold">Última atención</th>
                  </tr>
                </thead>
                <tbody>
                  {pacientes_tratados.lista.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-5 py-3">
                        {p.paciente_id ? (
                          <Link to={`/pacientes/${p.paciente_id}/historial`} className="font-medium text-purple-700 hover:underline">
                            {p.paciente}
                          </Link>
                        ) : <span className="font-medium text-slate-800">{p.paciente}</span>}
                        <span className="text-slate-400"> ({p.especie})</span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{p.propietario}</td>
                      <td className="px-5 py-3 text-slate-500">{fmtFecha(p.ultima_atencion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </section>
        )}

        {/* ── Asistencia reciente ──────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Asistencia reciente</h2>
            <span className="ml-auto text-xs text-slate-400">
              {asistencia.total_dias} día(s) registrado(s) · {asistencia.total_horas} h totales · {asistencia.tardanzas} tardanza(s)
            </span>
          </div>
          {asistencia.recientes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin marcaciones registradas</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-5 py-3 font-semibold">Ingreso</th>
                  <th className="text-left px-5 py-3 font-semibold">Salida</th>
                </tr>
              </thead>
              <tbody>
                {asistencia.recientes.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-5 py-3 text-slate-500">{fmtFecha(a.fecha)}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{fmtHora(a.hora_ingreso)}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtHora(a.hora_salida)}</td>
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
