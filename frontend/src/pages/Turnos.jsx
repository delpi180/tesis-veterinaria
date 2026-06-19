import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, User, PawPrint, X, MessageCircle, Stethoscope, Pencil, RefreshCw } from 'lucide-react'
import { api, esVeterinario } from '../services/api'
import { estadoStyle, estadoLabel, ESTADOS_CITA, waRecordatorio } from '../utils/citas'

const NOMBRES_MES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DIAS_SEMANA = ['Lu','Ma','Mi','Ju','Vi','Sa','Do']

const FORM_INICIAL = {
  pacienteId:    '',
  fecha:         '',
  hora:          '09:00',
  motivo:        '',
  estado:        'pendiente',
  notas:         '',
  veterinarioId: '',
}

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function buildCalendar(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDow).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  if (weeks[weeks.length - 1].length < 7)
    weeks[weeks.length - 1].push(...Array(7 - weeks[weeks.length - 1].length).fill(null))
  return weeks
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

export default function Turnos() {
  const now = new Date()
  const navigate = useNavigate()

  const [viewYear,    setViewYear]    = useState(now.getFullYear())
  const [viewMonth,   setViewMonth]   = useState(now.getMonth())
  const [selected,    setSelected]    = useState(now.getDate())
  const [citas,       setCitas]       = useState([])
  const [pacienteMap, setPacienteMap] = useState({})
  const [doctores,    setDoctores]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(FORM_INICIAL)
  const [guardando,    setGuardando]    = useState(false)
  const [errorModal,   setErrorModal]   = useState(null)
  const [filtroDoctor, setFiltroDoctor] = useState('')   // filtrar agenda por doctor
  const [refrescando,  setRefrescando]  = useState(false)

  const todayDay   = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear  = now.getFullYear()
  const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth

  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setError(null)
    return Promise.all([
      api.get('/api/clientes/'),
      api.get('/api/citas/'),
      api.get('/api/usuarios/doctores'),
    ])
      .then(([clientes, citasData, doctoresData]) => {
        const map = {}
        clientes.forEach(c => {
          c.pacientes.forEach(p => {
            map[p.id] = {
              nombre: p.nombre, especie: p.especie,
              propietario: c.nombre, clienteId: c.id, telefono: c.telefono,
            }
          })
        })
        setPacienteMap(map)
        setCitas(citasData)
        setDoctores(doctoresData)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])

  // Auto-actualización cada 20 s (no mientras el modal está abierto)
  useEffect(() => {
    const t = setInterval(() => { if (!modalAbierto) cargar(true) }, 20000)
    return () => clearInterval(t)
  }, [modalAbierto])

  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  // Cambia el estado de una cita (confirmar / atender / cancelar) — alineado con la agenda
  const cambiarEstado = async (cita, nuevoEstado) => {
    if (nuevoEstado === cita.estado) return
    try {
      await api.put(`/api/citas/${cita.id}`, { estado: nuevoEstado })
      setCitas(prev => prev.map(c => c.id === cita.id ? { ...c, estado: nuevoEstado } : c))
    } catch (err) {
      alert(err.message)
    }
  }

  // Agenda filtrada opcionalmente por doctor asignado
  const citasVisibles = filtroDoctor
    ? citas.filter(c => String(c.veterinario_id) === String(filtroDoctor))
    : citas

  const citasDelDia = (dia) => {
    if (!dia) return []
    return citasVisibles.filter(c => {
      const d = new Date(c.fecha_hora)
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === dia
    })
  }

  const diasConTurno = new Set(
    citasVisibles
      .filter(c => {
        const d = new Date(c.fecha_hora)
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth
      })
      .map(c => new Date(c.fecha_hora).getDate())
  )

  const hoyInicio = new Date(todayYear, todayMonth, todayDay)
  const citasProximas = [...citasVisibles]
    .filter(c => new Date(c.fecha_hora) >= hoyInicio)
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))
    .slice(0, 20)

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

  const displayDate = now.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const panelDia   = selected ?? todayDay
  const panelFecha = new Date(viewYear, viewMonth, panelDia)
    .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  const panelEsHoy = isCurrentMonth && panelDia === todayDay
  const turnosDia  = citasDelDia(panelDia)

  // ── Handlers del modal ────────────────────────────────────────────────────

  const abrirModal = () => {
    const dia = selected ?? todayDay
    const mm  = String(viewMonth + 1).padStart(2, '0')
    const dd  = String(dia).padStart(2, '0')
    setEditId(null)
    setForm({ ...FORM_INICIAL, fecha: `${viewYear}-${mm}-${dd}` })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const abrirEditar = (cita) => {
    const d = new Date(cita.fecha_hora)
    const pad = (n) => String(n).padStart(2, '0')
    setEditId(cita.id)
    setForm({
      pacienteId:    String(cita.paciente_id),
      fecha:         `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hora:          `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      motivo:        cita.motivo ?? '',
      estado:        cita.estado,
      notas:         cita.notas ?? '',
      veterinarioId: cita.veterinario_id ? String(cita.veterinario_id) : '',
    })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!form.pacienteId || !form.fecha || !form.hora) {
      setErrorModal('Paciente, fecha y hora son obligatorios.')
      return
    }
    setGuardando(true)
    setErrorModal(null)
    const payload = {
      fecha_hora:     `${form.fecha}T${form.hora}:00`,
      motivo:         form.motivo.trim() || null,
      estado:         form.estado,
      notas:          form.notas.trim() || null,
      veterinario_id: form.veterinarioId ? parseInt(form.veterinarioId, 10) : null,
    }
    try {
      if (editId) {
        await api.put(`/api/citas/${editId}`, payload)
      } else {
        await api.post('/api/citas/', { ...payload, paciente_id: parseInt(form.pacienteId, 10) })
      }
      const nuevasCitas = await api.get('/api/citas/')
      setCitas(nuevasCitas)
      cerrarModal()
    } catch (err) {
      setErrorModal(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // Aviso si el doctor asignado no labora ese día (según su perfil)
  const avisoHorario = (() => {
    if (!form.veterinarioId || !form.fecha) return null
    const doc = doctores.find(d => String(d.id) === String(form.veterinarioId))
    if (!doc || !doc.dias_laborales) return null
    const codigos = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
    const [y, m, d] = form.fecha.split('-').map(Number)
    const code = codigos[new Date(y, m - 1, d).getDay()]
    const labora = doc.dias_laborales.split(',').includes(code)
    return labora ? null : `${doc.nombre} no tiene ese día en su horario laboral.`
  })()

  // Aviso si el doctor ya tiene otro turno a esa misma fecha y hora
  const avisoChoque = (() => {
    if (!form.veterinarioId || !form.fecha || !form.hora) return null
    const pad = (n) => String(n).padStart(2, '0')
    const choca = citas.some(c => {
      if (editId && c.id === editId) return false
      if (String(c.veterinario_id) !== String(form.veterinarioId)) return false
      const d = new Date(c.fecha_hora)
      const fechaC = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const horaC = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      return fechaC === form.fecha && horaC === form.hora
    })
    return choca ? 'Este doctor ya tiene un turno a esa hora.' : null
  })()

  const opcionesPacientes = Object.entries(pacienteMap)
    .sort(([, a], [, b]) =>
      a.propietario.localeCompare(b.propietario) || a.nombre.localeCompare(b.nombre)
    )

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Turnos y Agenda</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Doctor:</span>
          <select
            value={filtroDoctor}
            onChange={e => setFiltroDoctor(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Todos</option>
            {doctores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button onClick={refrescar} disabled={refrescando}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto flex flex-col gap-5">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* ── Calendario ───────────────────────────────────────── */}
          <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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

            <div className="overflow-x-auto"><table className="w-full text-sm">
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
                      const isToday  = isCurrentMonth && dia === todayDay
                      const isSel    = dia === selected
                      const hasTurno = dia && diasConTurno.has(dia)
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
            </table></div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-700 inline-block" />&nbsp;Hoy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />&nbsp;Con turnos
              </span>
            </div>
          </div>

          {/* ── Panel del día seleccionado ───────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {panelEsHoy ? 'Turnos de Hoy' : `Turnos del día ${panelDia}`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 capitalize">{panelFecha}</p>
            </div>

            <div className="flex flex-col divide-y divide-slate-50 flex-1">
              {loading ? (
                <p className="text-xs text-slate-400 px-4 py-8 text-center">Cargando...</p>
              ) : turnosDia.length === 0 ? (
                <p className="text-xs text-slate-400 px-4 py-8 text-center">Sin turnos para este día</p>
              ) : (
                turnosDia.map(cita => {
                  const info = pacienteMap[cita.paciente_id] ?? { nombre: '(sin nombre)', especie: '-', propietario: '-' }
                  const { pill } = estadoStyle(cita.estado)
                  return (
                    <div key={cita.id} className="px-4 py-3.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm font-bold">{formatHora(cita.fecha_hora)}</span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pill}`}>
                          {estadoLabel(cita.estado)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{cita.motivo ?? '(sin motivo)'}</p>
                      <button
                        type="button"
                        disabled={!info.clienteId}
                        onClick={() => info.clienteId && navigate(`/clientes/${info.clienteId}`)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-purple-700 transition disabled:hover:text-slate-500 w-fit"
                      >
                        <PawPrint className="w-3 h-3" />
                        <span>{info.nombre} · {info.especie}</span>
                      </button>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="w-3 h-3" />
                        <span>{info.propietario}</span>
                      </div>
                      {cita.veterinario_nombre && (
                        <div className="flex items-center gap-1 text-xs text-purple-700 font-medium">
                          <Stethoscope className="w-3 h-3" />
                          <span>{cita.veterinario_nombre}</span>
                        </div>
                      )}
                      {/* Acciones: estado + editar + recordatorio */}
                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={cita.estado}
                          onChange={e => cambiarEstado(cita, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300 flex-1"
                        >
                          {ESTADOS_CITA.map(s => <option key={s} value={s}>{estadoLabel(s)}</option>)}
                        </select>
                        {esVeterinario() && (
                          <button
                            type="button"
                            onClick={() => navigate(`/consultas/${cita.paciente_id}`, { state: { citaId: cita.id } })}
                            title="Atender (registrar historia)"
                            className="px-2.5 h-7 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold transition shrink-0"
                          >
                            Atender
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => abrirEditar(cita)}
                          title="Editar turno"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-700 hover:border-purple-300 transition shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {info.telefono && (
                          <a
                            href={waRecordatorio(info.telefono, info.propietario, info.nombre, cita)}
                            target="_blank" rel="noopener noreferrer"
                            title="Enviar recordatorio por WhatsApp"
                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-600 hover:bg-green-500 text-white transition shrink-0"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={abrirModal}
                className="w-full py-2 text-xs font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition"
              >
                + Nuevo Turno
              </button>
            </div>
          </div>

        </div>

        {/* Próximos turnos */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Próximos Turnos</p>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400 px-5 py-8 text-center">Cargando...</p>
          ) : citasProximas.length === 0 ? (
            <p className="text-xs text-slate-400 px-5 py-8 text-center">No hay turnos próximos registrados</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-5 py-3 font-semibold">Hora</th>
                  <th className="text-left px-5 py-3 font-semibold">Paciente</th>
                  <th className="text-left px-5 py-3 font-semibold">Motivo</th>
                  <th className="text-left px-5 py-3 font-semibold">Propietario</th>
                  <th className="text-left px-5 py-3 font-semibold">Doctor</th>
                  <th className="text-left px-5 py-3 font-semibold">Estado</th>
                  <th className="text-center px-5 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {citasProximas.map((cita, i) => {
                  const info = pacienteMap[cita.paciente_id] ?? { nombre: '(sin nombre)', especie: '-', propietario: '-' }
                  return (
                    <tr
                      key={cita.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}
                    >
                      <td className="px-5 py-3 font-medium text-slate-700">{formatFecha(cita.fecha_hora)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatHora(cita.fecha_hora)}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          disabled={!info.clienteId}
                          onClick={() => info.clienteId && navigate(`/clientes/${info.clienteId}`)}
                          className="font-semibold text-slate-800 hover:text-purple-700 transition disabled:hover:text-slate-800"
                        >
                          {info.nombre}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{cita.motivo ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-500">{info.propietario}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {cita.veterinario_nombre
                          ? <span className="inline-flex items-center gap-1 text-purple-700"><Stethoscope className="w-3 h-3" />{cita.veterinario_nombre}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={cita.estado}
                          onChange={e => cambiarEstado(cita, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300"
                        >
                          {ESTADOS_CITA.map(s => <option key={s} value={s}>{estadoLabel(s)}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirEditar(cita)}
                            title="Editar turno"
                            className="flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-700 hover:border-purple-300 transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {info.telefono && (
                            <a
                              href={waRecordatorio(info.telefono, info.propietario, info.nombre, cita)}
                              target="_blank" rel="noopener noreferrer"
                              title="Recordatorio por WhatsApp"
                              className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-600 hover:bg-green-500 text-white transition"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </section>

      </main>

      {/* ── Modal Nuevo Turno ─────────────────────────────────────────────── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal() }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

            {/* Cabecera */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">{editId ? 'Editar Turno' : 'Nuevo Turno'}</p>
              <button
                onClick={cerrarModal}
                className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo */}
            <form onSubmit={handleGuardar}>
              <div className="px-5 py-4 flex flex-col gap-4">

                {/* Paciente */}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>
                    Paciente <span className="text-rose-500">*</span>
                  </label>
                  <select
                    className={inputCls}
                    value={form.pacienteId}
                    disabled={!!editId}
                    onChange={e => setForm(f => ({ ...f, pacienteId: e.target.value }))}
                  >
                    <option value="">— Seleccionar mascota —</option>
                    {opcionesPacientes.map(([id, info]) => (
                      <option key={id} value={id}>
                        {info.nombre} ({info.especie}) — {info.propietario}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fecha y Hora */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>
                      Fecha <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      className={inputCls}
                      value={form.fecha}
                      onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>
                      Hora <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      className={inputCls}
                      value={form.hora}
                      onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Motivo */}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Motivo</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ej. Control anual, Vacunación..."
                    value={form.motivo}
                    onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  />
                </div>

                {/* Veterinario asignado */}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Veterinario asignado</label>
                  <select
                    className={inputCls}
                    value={form.veterinarioId}
                    onChange={e => setForm(f => ({ ...f, veterinarioId: e.target.value }))}
                  >
                    <option value="">— Sin asignar —</option>
                    {doctores.map(d => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                  {avisoHorario && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg">
                      ⚠️ {avisoHorario}
                    </p>
                  )}
                  {avisoChoque && (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1.5 rounded-lg">
                      ⛔ {avisoChoque}
                    </p>
                  )}
                </div>

                {/* Estado */}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Estado</label>
                  <select
                    className={inputCls}
                    value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="confirmada">Confirmada</option>
                    <option value="atendida">Atendida</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>

                {/* Notas */}
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Notas</label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={3}
                    placeholder="Observaciones opcionales..."
                    value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  />
                </div>

                {/* Error del modal */}
                {errorModal && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                    {errorModal}
                  </p>
                )}

              </div>

              {/* Pie */}
              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar Turno'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
