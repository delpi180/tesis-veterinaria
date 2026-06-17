import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Stethoscope, Users, Coins, AlertTriangle,
  Clock, PawPrint, ChevronRight, TrendingUp, Syringe, MessageCircle, Package,
} from 'lucide-react'
import { api, getUsuario } from '../services/api'
import { estadoStyle, estadoLabel, waRecordatorio } from '../utils/citas'

const fmtMoneda = (n) => `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

const HOY_IDX = ((new Date().getDay() + 6) % 7)

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-purple-600 font-bold">{payload[0].value} consultas</p>
    </div>
  )
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

export default function Inicio() {
  const navigate = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    api.get('/api/dashboard/resumen')
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const usuario = getUsuario() || 'Veterinario'
  const citasHoy       = data?.citas_hoy ?? []
  const citasPendientes = citasHoy.filter(c => c.estado !== 'cancelada' && c.estado !== 'atendida')
  const semana         = data?.consultas_semana ?? []
  const totalSemana    = semana.reduce((s, d) => s + d.consultas, 0)
  const stockBajo      = data?.stock_bajo ?? []
  const vacunas        = data?.vacunas_proximas ?? []

  const KPIS = [
    {
      label: 'Consultas Hoy', value: data?.consultas_hoy ?? '—',
      sub: `${totalSemana} esta semana`,
      Icon: Stethoscope, bg: 'bg-purple-50', border: 'border-purple-200',
      icon: 'text-purple-600', ring: 'bg-purple-100',
    },
    {
      label: 'Ingresos del Día', value: fmtMoneda(data?.ingresos_dia),
      sub: `${fmtMoneda(data?.ingresos_mes)} en el mes`,
      Icon: Coins, bg: 'bg-emerald-50', border: 'border-emerald-200',
      icon: 'text-emerald-600', ring: 'bg-emerald-100',
    },
    {
      label: 'Clientes / Mascotas', value: `${data?.total_clientes ?? '—'} / ${data?.total_pacientes ?? '—'}`,
      sub: 'Registrados en el sistema',
      Icon: Users, bg: 'bg-sky-50', border: 'border-sky-200',
      icon: 'text-sky-600', ring: 'bg-sky-100',
    },
    {
      label: 'Alertas de Inventario', value: stockBajo.length,
      sub: stockBajo.length ? 'Productos con stock bajo' : 'Todo en orden',
      Icon: AlertTriangle, bg: stockBajo.length ? 'bg-red-50' : 'bg-slate-50',
      border: stockBajo.length ? 'border-red-200' : 'border-slate-200',
      icon: stockBajo.length ? 'text-red-500' : 'text-slate-400',
      ring: stockBajo.length ? 'bg-red-100' : 'bg-slate-100',
    },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Panel de Control</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-600">Sistema operativo</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-5xl w-full mx-auto">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
            ⚠ No se pudo conectar con el servidor: {error}
          </div>
        )}

        {/* Banner */}
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 rounded-2xl px-7 py-5 text-white shadow-md flex items-center justify-between">
          <div>
            <p className="text-purple-200 text-sm font-medium mb-1">Bienvenido de nuevo</p>
            <h2 className="text-2xl font-bold capitalize">{usuario}</h2>
            <p className="text-purple-200 text-sm mt-1">
              {loading ? 'Cargando resumen del día…' : (
                <>
                  Tienes <strong className="text-white">{citasPendientes.length} turno{citasPendientes.length !== 1 ? 's' : ''}</strong> pendiente{citasPendientes.length !== 1 ? 's' : ''} hoy
                  {stockBajo.length > 0 && (
                    <> y <strong className="text-white">{stockBajo.length} alerta{stockBajo.length !== 1 ? 's' : ''}</strong> de inventario</>
                  )}
                  {vacunas.length > 0 && (
                    <>, con <strong className="text-white">{vacunas.length} vacuna{vacunas.length !== 1 ? 's' : ''}</strong> por recordar</>
                  )}.
                </>
              )}
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2">
            <button
              onClick={() => navigate('/turnos')}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg transition backdrop-blur-sm"
            >
              <Clock className="w-4 h-4" /> Ver turnos
            </button>
            <button
              onClick={() => navigate('/clientes')}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-lg transition backdrop-blur-sm"
            >
              <PawPrint className="w-4 h-4" /> Ver clientes
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {KPIS.map(({ label, value, sub, Icon, bg, border, icon, ring }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl px-5 py-4 flex flex-col gap-3 shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500 leading-snug">{label}</p>
                <div className={`w-8 h-8 rounded-xl ${ring} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${icon}`} />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800 leading-none">{loading ? '—' : value}</p>
                <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico + Turnos de hoy */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

          {/* Consultas por día (semana real) */}
          <section className="md:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Consultas por Día</h2>
                <p className="text-xs text-slate-400 mt-0.5">Semana actual — {totalSemana} total</p>
              </div>
              <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2.5 py-0.5 rounded-full">
                Esta semana
              </span>
            </div>
            <div className="px-4 py-5">
              {loading ? (
                <div className="flex items-center justify-center h-[220px] gap-3 text-slate-400">
                  <Spinner /> <span className="text-sm">Cargando…</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={semana} barSize={32} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f3ff', radius: 6 }} />
                    <Bar dataKey="consultas" radius={[6, 6, 0, 0]}>
                      {semana.map((entry, index) => (
                        <Cell key={index} fill={index === HOY_IDX ? '#7c3aed' : '#ddd6fe'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 mt-2 justify-center text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-violet-700 inline-block" /> Hoy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-violet-200 inline-block" /> Otros días
                </span>
              </div>
            </div>
          </section>

          {/* Turnos de hoy (reales) */}
          <section className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Turnos de Hoy</h2>
              <button
                onClick={() => navigate('/turnos')}
                className="flex items-center gap-0.5 text-xs text-purple-600 hover:text-purple-800 font-semibold transition"
              >
                Ver todos <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col divide-y divide-slate-50 flex-1 overflow-y-auto max-h-[280px]">
              {loading ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">Cargando…</p>
              ) : citasHoy.length === 0 ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">Sin turnos para hoy</p>
              ) : (
                citasHoy.map(c => (
                  <button
                    key={c.id}
                    onClick={() => c.cliente_id && navigate(`/clientes/${c.cliente_id}`)}
                    className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/60 transition text-left"
                  >
                    <div className="text-center shrink-0 w-12">
                      <span className="text-sm font-bold text-purple-700 block">{fmtHora(c.fecha_hora)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.motivo || '(sin motivo)'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <PawPrint className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500 truncate">{c.paciente} · {c.especie}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.propietario}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${estadoStyle(c.estado).pill}`}>
                      {estadoLabel(c.estado)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => navigate('/turnos')}
                className="w-full py-2 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition"
              >
                + Agendar nuevo turno
              </button>
            </div>
          </section>

        </div>

        {/* Vacunas por recordar + Stock bajo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Recordatorios de vacunación */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Syringe className="w-4 h-4 text-sky-500" />
              <h2 className="text-sm font-semibold text-slate-700">Vacunas por Recordar</h2>
              <span className="ml-auto text-xs bg-sky-100 text-sky-700 font-semibold px-2 py-0.5 rounded-full">
                {vacunas.length}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-slate-50 flex-1 overflow-y-auto max-h-[300px]">
              {loading ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">Cargando…</p>
              ) : vacunas.length === 0 ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">Sin vacunas con próxima dosis registrada</p>
              ) : (
                vacunas.map((v, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {v.vacuna}
                        {v.vencida && (
                          <span className="ml-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">Vencida</span>
                        )}
                      </p>
                      <button
                        onClick={() => v.cliente_id && navigate(`/clientes/${v.cliente_id}`)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-purple-700 transition"
                      >
                        <PawPrint className="w-3 h-3" /> {v.paciente} · {v.propietario}
                      </button>
                      <p className="text-xs text-slate-400 mt-0.5">Próxima dosis: {v.proxima_dosis}</p>
                    </div>
                    {v.telefono && (
                      <a
                        href={waRecordatorio(v.telefono, v.propietario, v.paciente, null)}
                        target="_blank" rel="noopener noreferrer"
                        title="Recordatorio por WhatsApp"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-600 hover:bg-green-500 text-white transition shrink-0"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Stock bajo */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Package className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-slate-700">Stock Bajo</h2>
              <button
                onClick={() => navigate('/inventario')}
                className="ml-auto flex items-center gap-0.5 text-xs text-purple-600 hover:text-purple-800 font-semibold transition"
              >
                Ir a inventario <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col divide-y divide-slate-50 flex-1 overflow-y-auto max-h-[300px]">
              {loading ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">Cargando…</p>
              ) : stockBajo.length === 0 ? (
                <p className="text-xs text-slate-400 px-5 py-8 text-center">✓ Todo el inventario está en orden</p>
              ) : (
                stockBajo.map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.codigo}</p>
                    </div>
                    <span className="text-xs font-bold text-red-600 shrink-0">
                      {p.stock} / mín {p.stock_minimo}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>

        {/* Acceso rápido */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Acceso Rápido</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Clientes',          to: '/clientes',   color: 'bg-purple-700 hover:bg-purple-600' },
              { label: 'Turnos',            to: '/turnos',     color: 'bg-sky-600    hover:bg-sky-500'    },
              { label: 'Inventario',        to: '/inventario', color: 'bg-emerald-600 hover:bg-emerald-500'},
              { label: 'Ventas y Reportes', to: '/ventas',     color: 'bg-amber-600  hover:bg-amber-500'  },
            ].map(({ label, to, color }) => (
              <button
                key={label}
                onClick={() => navigate(to)}
                className={`${color} text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition shadow-sm flex items-center justify-center gap-2`}
              >
                {label}
                <ChevronRight className="w-4 h-4 opacity-70" />
              </button>
            ))}
          </div>
        </section>

      </main>
    </div>
  )
}
