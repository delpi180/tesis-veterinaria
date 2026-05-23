import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Stethoscope, UserPlus, DollarSign, AlertTriangle,
  Clock, PawPrint, ChevronRight, TrendingUp,
} from 'lucide-react'

// ── KPIs ──────────────────────────────────────────────────────────────────
const KPIS = [
  {
    label: 'Pacientes Atendidos Hoy',
    value: '12',
    sub:   '+3 vs ayer',
    Icon:  Stethoscope,
    bg:    'bg-purple-50',
    border:'border-purple-200',
    icon:  'text-purple-600',
    ring:  'bg-purple-100',
  },
  {
    label: 'Nuevos Clientes (Mes)',
    value: '45',
    sub:   'Mayo 2026',
    Icon:  UserPlus,
    bg:    'bg-sky-50',
    border:'border-sky-200',
    icon:  'text-sky-600',
    ring:  'bg-sky-100',
  },
  {
    label: 'Ingresos del Día',
    value: 'S/ 850',
    sub:   '+12% vs lunes',
    Icon:  DollarSign,
    bg:    'bg-emerald-50',
    border:'border-emerald-200',
    icon:  'text-emerald-600',
    ring:  'bg-emerald-100',
  },
  {
    label: 'Alertas de Inventario',
    value: '3',
    sub:   'Productos con stock bajo',
    Icon:  AlertTriangle,
    bg:    'bg-red-50',
    border:'border-red-200',
    icon:  'text-red-500',
    ring:  'bg-red-100',
  },
]

// ── Gráfico — consultas de la semana actual ────────────────────────────────
const SEMANA = [
  { dia: 'Lun', consultas: 8  },
  { dia: 'Mar', consultas: 12 },
  { dia: 'Mié', consultas: 6  },
  { dia: 'Jue', consultas: 10 },
  { dia: 'Vie', consultas: 9  },
  { dia: 'Sáb', consultas: 4  },
  { dia: 'Dom', consultas: 0  },
]

// índice del día actual (0=Lun … 6=Dom, JS: 0=Dom por eso ajustamos)
const HOY_IDX = ((new Date().getDay() + 6) % 7)

// ── Turnos del día ─────────────────────────────────────────────────────────
const TURNOS = [
  {
    hora: '09:00', mascota: 'Pelusa', especie: 'Felino',
    motivo: 'Vacunación anual', propietario: 'Lucía Martínez',
    pill: 'bg-emerald-100 text-emerald-700',
  },
  {
    hora: '11:30', mascota: 'Max', especie: 'Canino',
    motivo: 'Control post-cirugía', propietario: 'Roberto Sánchez',
    pill: 'bg-sky-100 text-sky-700',
  },
  {
    hora: '14:00', mascota: 'Luna', especie: 'Canino',
    motivo: 'Consulta general', propietario: 'Ana García',
    pill: 'bg-amber-100 text-amber-700',
  },
  {
    hora: '16:30', mascota: 'Simba', especie: 'Felino',
    motivo: 'Revisión dental', propietario: 'Miguel Torres',
    pill: 'bg-violet-100 text-violet-700',
  },
]

// ── Tooltip personalizado para el gráfico ─────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-purple-600 font-bold">{payload[0].value} consultas</p>
    </div>
  )
}

// ── Componente ─────────────────────────────────────────────────────────────
export default function Inicio() {
  const navigate = useNavigate()

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const totalSemana = SEMANA.reduce((s, d) => s + d.consultas, 0)

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">

      {/* Header ──────────────────────────────────────────────────────── */}
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

        {/* Banner ──────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 rounded-2xl px-7 py-5 text-white shadow-md flex items-center justify-between">
          <div>
            <p className="text-purple-200 text-sm font-medium mb-1">Bienvenido de nuevo</p>
            <h2 className="text-2xl font-bold">Dr. Veterinario</h2>
            <p className="text-purple-200 text-sm mt-1">
              Tienes <strong className="text-white">4 turnos</strong> programados hoy y{' '}
              <strong className="text-white">3 alertas</strong> de inventario pendientes.
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

        {/* KPIs ────────────────────────────────────────────────────────── */}
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
                <p className="text-3xl font-bold text-slate-800 leading-none">{value}</p>
                <p className="text-xs text-slate-400 mt-1.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico + Turnos ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

          {/* BarChart — Consultas por Día ─────────────────────── */}
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={SEMANA} barSize={32} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f3ff', radius: 6 }} />
                  <Bar dataKey="consultas" radius={[6, 6, 0, 0]}>
                    {SEMANA.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={index === HOY_IDX ? '#7c3aed' : '#ddd6fe'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-violet-700 inline-block" />
                  Hoy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-violet-200 inline-block" />
                  Otros días
                </span>
              </div>
            </div>
          </section>

          {/* Próximos Turnos ──────────────────────────────────── */}
          <section className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Próximos Turnos</h2>
              <button
                onClick={() => navigate('/turnos')}
                className="flex items-center gap-0.5 text-xs text-purple-600 hover:text-purple-800 font-semibold transition"
              >
                Ver todos <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col divide-y divide-slate-50 flex-1">
              {TURNOS.map(({ hora, mascota, especie, motivo, propietario, pill }) => (
                <div key={hora} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/60 transition">
                  {/* Hora */}
                  <div className="text-center shrink-0 w-12">
                    <span className="text-sm font-bold text-purple-700 block">{hora}</span>
                    <span className="text-xs text-slate-400">AM/PM</span>
                  </div>

                  {/* Detalle */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{motivo}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <PawPrint className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-500 truncate">{mascota} · {especie}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{propietario}</p>
                  </div>

                  {/* Estado */}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${pill}`}>
                    {mascota}
                  </span>
                </div>
              ))}
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

        {/* Acceso rápido ──────────────────────────────────────────────── */}
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
