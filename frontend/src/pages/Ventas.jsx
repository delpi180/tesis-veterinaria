import {
  TrendingUp, Users, Stethoscope, Package,
  CreditCard, CheckCircle, Clock, ArrowUpRight,
} from 'lucide-react'

const STATS = [
  {
    label: 'Ingresos del mes',    value: '$12,450', sub: '+18% vs abril',
    Icon: TrendingUp,  bg: 'bg-emerald-50', border: 'border-emerald-200',
    icon: 'text-emerald-600', trend: 'text-emerald-600',
  },
  {
    label: 'Consultas del mes',   value: '34',      sub: '+5 vs semana ant.',
    Icon: Stethoscope, bg: 'bg-purple-50',  border: 'border-purple-200',
    icon: 'text-purple-600',  trend: 'text-purple-600',
  },
  {
    label: 'Nuevos clientes',     value: '8',       sub: 'Mayo 2026',
    Icon: Users,       bg: 'bg-sky-50',     border: 'border-sky-200',
    icon: 'text-sky-600',     trend: 'text-sky-600',
  },
  {
    label: 'Productos vendidos',  value: '23',      sub: '7 ítems distintos',
    Icon: Package,     bg: 'bg-amber-50',   border: 'border-amber-200',
    icon: 'text-amber-600',   trend: 'text-amber-600',
  },
]

const TRANSACCIONES = [
  { fecha: '23/05/2026', hora: '11:30', concepto: 'Consulta General',              cliente: 'Lucía Martínez',  monto: 350,  estado: 'Pagado'   },
  { fecha: '22/05/2026', hora: '09:00', concepto: 'Vacunación Antirrábica',        cliente: 'Roberto Sánchez', monto: 450,  estado: 'Pagado'   },
  { fecha: '21/05/2026', hora: '14:00', concepto: 'Antiparasitario Frontline x2',  cliente: 'Ana García',      monto: 560,  estado: 'Pagado'   },
  { fecha: '20/05/2026', hora: '10:30', concepto: 'Consulta + Amoxicilina',        cliente: 'Pedro López',     monto: 470,  estado: 'Pagado'   },
  { fecha: '19/05/2026', hora: '16:00', concepto: 'Alimento Royal Canin 3 kg',     cliente: 'María Torres',    monto: 650,  estado: 'Pendiente'},
  { fecha: '17/05/2026', hora: '09:30', concepto: 'Control post-cirugía',          cliente: 'Carlos Ruiz',     monto: 300,  estado: 'Pagado'   },
  { fecha: '15/05/2026', hora: '15:00', concepto: 'Collar Antipulgas Seresto',     cliente: 'Sofía Navarro',   monto: 380,  estado: 'Pagado'   },
]

const SERVICIOS_TOP = [
  { nombre: 'Consulta General',     cantidad: 14, monto: 4900,  pct: 85 },
  { nombre: 'Vacunación',           cantidad: 9,  monto: 4050,  pct: 68 },
  { nombre: 'Venta de Productos',   cantidad: 23, monto: 2150,  pct: 45 },
  { nombre: 'Cirugías / Interv.',   cantidad: 2,  monto: 1350,  pct: 28 },
]

export default function Ventas() {
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Ventas y Reportes</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-3 py-1.5 rounded-lg border border-purple-200">
            Mayo 2026
          </span>
          <button className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition">
            Exportar PDF
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-5xl w-full mx-auto">

        {/* Tarjetas de KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map(({ label, value, sub, Icon, bg, border, icon, trend }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl px-5 py-4 flex flex-col gap-2 shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <Icon className={`w-4 h-4 ${icon}`} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className={`text-xs font-medium flex items-center gap-1 ${trend}`}>
                <ArrowUpRight className="w-3 h-3" /> {sub}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Servicios más vendidos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Servicios del Mes</h3>
            <div className="flex flex-col gap-3.5">
              {SERVICIOS_TOP.map(({ nombre, cantidad, monto, pct }) => (
                <div key={nombre}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs font-medium text-slate-700">{nombre}</p>
                    <p className="text-xs font-bold text-slate-600">${monto.toLocaleString('es-MX')}</p>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{cantidad} atenciones</p>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen rápido */}
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Resumen Financiero — Mayo 2026</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Ingresos brutos',      value: '$12,450', color: 'text-emerald-600' },
                { label: 'Gastos operativos',    value: '$3,200',  color: 'text-red-500'     },
                { label: 'Margen neto',           value: '$9,250',  color: 'text-slate-800'   },
                { label: 'Ticket promedio',       value: '$366',    color: 'text-purple-600'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="border border-slate-100 rounded-xl px-4 py-3 bg-slate-50">
              <p className="text-xs text-slate-500 font-medium mb-1">Meta mensual</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '83%' }} />
                </div>
                <span className="text-xs font-bold text-emerald-600">83%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">$12,450 de $15,000 meta</p>
            </div>
          </div>

        </div>

        {/* Últimas transacciones */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-purple-500" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Últimas Transacciones
            </h2>
            <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
              {TRANSACCIONES.length}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                <th className="text-left px-5 py-3 font-semibold">Concepto</th>
                <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                <th className="text-right px-5 py-3 font-semibold">Monto</th>
                <th className="text-center px-5 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {TRANSACCIONES.map((t, i) => (
                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-medium text-slate-700">{t.fecha}</p>
                    <p className="text-xs text-slate-400">{t.hora}</p>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-800">{t.concepto}</td>
                  <td className="px-5 py-3.5 text-slate-500">{t.cliente}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-800">
                    ${t.monto.toLocaleString('es-MX')}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {t.estado === 'Pagado' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3" /> Pagado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3" /> Pendiente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

      </main>
    </div>
  )
}
