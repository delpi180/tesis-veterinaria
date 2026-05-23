import { useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, User, PawPrint } from 'lucide-react'

const NOMBRES_MES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DIAS_SEMANA = ['Lu','Ma','Mi','Ju','Vi','Sa','Do']

const TURNOS_HOY = [
  {
    hora: '09:00', motivo: 'Vacunación anual',
    mascota: 'Pelusa', especie: 'Felino', propietario: 'Lucía Martínez',
    pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', estado: 'Confirmado',
  },
  {
    hora: '11:30', motivo: 'Control post-cirugía',
    mascota: 'Max', especie: 'Canino', propietario: 'Roberto Sánchez',
    pill: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', estado: 'Confirmado',
  },
  {
    hora: '16:00', motivo: 'Consulta general',
    mascota: 'Coco', especie: 'Canino', propietario: 'Ana García',
    pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', estado: 'Pendiente',
  },
]

// Días del mes que tienen al menos un turno (mock)
const DIAS_CON_TURNO = new Set([3, 5, 8, 10, 12, 15, 17, 19, 20, 23, 26, 28, 30])

function buildCalendar(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  if (weeks[weeks.length - 1].length < 7)
    weeks[weeks.length - 1].push(...Array(7 - weeks[weeks.length - 1].length).fill(null))
  return weeks
}

export default function Turnos() {
  const now = new Date()
  const [viewYear,  setViewYear]  = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected,  setSelected]  = useState(now.getDate())

  const todayDay   = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear  = now.getFullYear()
  const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth

  const weeks = buildCalendar(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setSelected(null)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setSelected(null)
  }

  const displayDate = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Turnos y Agenda</h1>
        <p className="text-xs text-slate-400 mt-0.5 capitalize">{displayDate}</p>
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* ── Calendario ──────────────────────────────────── */}
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Nav mes */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <button onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition text-slate-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-bold text-slate-700">
                {NOMBRES_MES[viewMonth]} {viewYear}
              </p>
              <button onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition text-slate-500">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Tabla del calendario */}
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {DIAS_SEMANA.map(d => (
                    <th key={d} className="text-center py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((semana, si) => (
                  <tr key={si}>
                    {semana.map((dia, di) => {
                      const isToday   = isCurrentMonth && dia === todayDay
                      const isSel     = isCurrentMonth && dia === selected
                      const hasTurno  = dia && DIAS_CON_TURNO.has(dia)
                      return (
                        <td key={di} className="text-center py-1 px-1">
                          {dia ? (
                            <button
                              onClick={() => setSelected(dia)}
                              className={[
                                'w-9 h-9 rounded-full mx-auto flex flex-col items-center justify-center text-sm font-medium transition-all',
                                isToday
                                  ? 'bg-purple-700 text-white shadow'
                                  : isSel
                                    ? 'bg-purple-100 text-purple-800 ring-2 ring-purple-300'
                                    : 'text-slate-700 hover:bg-slate-100',
                              ].join(' ')}
                            >
                              {dia}
                              {hasTurno && !isToday && (
                                <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" />
                              )}
                            </button>
                          ) : <span />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Leyenda */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-700 inline-block"/>&nbsp;Hoy</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>&nbsp;Con turnos</span>
            </div>
          </div>

          {/* ── Turnos de Hoy ───────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Turnos de Hoy</p>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">
                {now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="flex flex-col divide-y divide-slate-50 flex-1">
              {TURNOS_HOY.map(({ hora, motivo, mascota, especie, propietario, pill, dot, estado }) => (
                <div key={hora} className="px-4 py-3.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm font-bold">{hora}</span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pill}`}>
                      {estado}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{motivo}</p>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <PawPrint className="w-3 h-3" />
                    <span>{mascota} · {especie}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    <span>{propietario}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                className="w-full py-2 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition">
                + Nuevo Turno
              </button>
            </div>
          </div>

        </div>

        {/* Próximos turnos (semana) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Próximos Turnos</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                <th className="text-left px-5 py-3 font-semibold">Hora</th>
                <th className="text-left px-5 py-3 font-semibold">Paciente</th>
                <th className="text-left px-5 py-3 font-semibold">Motivo</th>
                <th className="text-left px-5 py-3 font-semibold">Propietario</th>
                <th className="text-left px-5 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {[
                { fecha: '26 May', hora: '10:00', paciente: 'Toby',   motivo: 'Desparasitación',    propietario: 'Carlos Ruiz',      estado: 'Confirmado', ec: 'bg-emerald-100 text-emerald-700' },
                { fecha: '26 May', hora: '14:30', paciente: 'Luna',   motivo: 'Baño y corte',        propietario: 'Sofía Navarro',    estado: 'Confirmado', ec: 'bg-emerald-100 text-emerald-700' },
                { fecha: '28 May', hora: '09:00', paciente: 'Simba',  motivo: 'Vacuna quíntuple',    propietario: 'Miguel Torres',    estado: 'Pendiente',  ec: 'bg-amber-100 text-amber-700'    },
                { fecha: '28 May', hora: '11:00', paciente: 'Nala',   motivo: 'Revisión dental',     propietario: 'Carmen López',     estado: 'Confirmado', ec: 'bg-emerald-100 text-emerald-700' },
                { fecha: '30 May', hora: '16:00', paciente: 'Rocky',  motivo: 'Control nutricional', propietario: 'Andrés Morales',   estado: 'Pendiente',  ec: 'bg-amber-100 text-amber-700'    },
              ].map((t, i) => (
                <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-3 font-medium text-slate-700">{t.fecha}</td>
                  <td className="px-5 py-3 text-slate-600">{t.hora}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{t.paciente}</td>
                  <td className="px-5 py-3 text-slate-600">{t.motivo}</td>
                  <td className="px-5 py-3 text-slate-500">{t.propietario}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${t.ec}`}>{t.estado}</span>
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
