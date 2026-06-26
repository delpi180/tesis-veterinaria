import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Plus, Search, Stethoscope, Calendar, Clock,
  MessageCircle, FileText, ClipboardList, X, PawPrint, ChevronRight, Phone,
  Pencil, Trash2, ShoppingCart, AlertTriangle, Activity, Paperclip,
} from 'lucide-react'
import { api } from '../services/api'
import { estadoStyle, estadoLabel, waRecordatorio } from '../utils/citas'
import DocumentosPaciente from '../components/DocumentosPaciente'

const Spinner = ({ className = 'text-purple-400' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`w-5 h-5 animate-spin ${className}`}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

const ESPECIE_COLORS = {
  canino:  'bg-amber-100 text-amber-700',
  felino:  'bg-blue-100 text-blue-700',
  ave:     'bg-green-100 text-green-700',
  reptil:  'bg-emerald-100 text-emerald-700',
  default: 'bg-slate-100 text-slate-600',
}
const especieColor = (e = '') => ESPECIE_COLORS[e.toLowerCase()] ?? ESPECIE_COLORS.default

const inputCls ='w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const fmtFechaLarga = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

// ── Formulario nueva mascota ──────────────────────────────────────────────
const EMPTY_PACIENTE = {
  nombre: '', especie: 'Canino', raza: '', edad: '',
  sexo: '', esterilizado: false, fecha_nacimiento: '', microchip: '',
  color: '', alergias: '', condiciones_cronicas: '',
}

// Convierte el form a payload limpio (campos vacíos → null)
function pacientePayload(form) {
  return {
    nombre:  form.nombre.trim(),
    especie: form.especie.trim() || 'Canino',
    raza:    form.raza.trim() || null,
    edad:    form.edad !== '' ? parseInt(form.edad, 10) : null,
    sexo:                 form.sexo || null,
    esterilizado:         !!form.esterilizado,
    fecha_nacimiento:     form.fecha_nacimiento || null,
    microchip:            form.microchip.trim() || null,
    color:                form.color.trim() || null,
    alergias:             form.alergias.trim() || null,
    condiciones_cronicas: form.condiciones_cronicas.trim() || null,
  }
}

function CamposMascota({ form, setForm }) {
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Nombre <span className="text-rose-500">*</span></label>
          <input type="text" className={inputCls} value={form.nombre} onChange={set('nombre')} placeholder="Ej: Rex" />
        </div>
        <div>
          <label className={labelCls}>Especie</label>
          <input type="text" className={inputCls} value={form.especie} onChange={set('especie')} placeholder="Canino" />
        </div>
        <div>
          <label className={labelCls}>Raza</label>
          <input type="text" className={inputCls} value={form.raza} onChange={set('raza')} placeholder="Ej: Labrador" />
        </div>
        <div>
          <label className={labelCls}>Sexo</label>
          <select className={inputCls} value={form.sexo} onChange={set('sexo')}>
            <option value="">—</option>
            <option value="macho">Macho</option>
            <option value="hembra">Hembra</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className={labelCls}>Fecha nacimiento</label>
          <input type="date" className={inputCls} value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
        </div>
        <div>
          <label className={labelCls}>Edad (años)</label>
          <input type="number" min="0" className={inputCls} value={form.edad} onChange={set('edad')} placeholder="3" />
        </div>
        <div>
          <label className={labelCls}>Color</label>
          <input type="text" className={inputCls} value={form.color} onChange={set('color')} placeholder="Ej: Marrón" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 py-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300"
            checked={form.esterilizado} onChange={e => setForm(p => ({ ...p, esterilizado: e.target.checked }))} />
          Esterilizado
        </label>
      </div>
      <div>
        <label className={labelCls}>Microchip</label>
        <input type="text" className={inputCls} value={form.microchip} onChange={set('microchip')} placeholder="N° de microchip (opcional)" />
      </div>
      <div>
        <label className={labelCls}>Alergias <span className="text-rose-400 font-normal">(se mostrarán como alerta)</span></label>
        <textarea rows={2} className={`${inputCls} resize-none`} value={form.alergias} onChange={set('alergias')}
          placeholder="Ej: Penicilina, picadura de pulga…" />
      </div>
      <div>
        <label className={labelCls}>Condiciones crónicas</label>
        <textarea rows={2} className={`${inputCls} resize-none`} value={form.condiciones_cronicas} onChange={set('condiciones_cronicas')}
          placeholder="Ej: Diabetes, insuficiencia renal…" />
      </div>
    </>
  )
}

function PacienteForm({ clienteId, onSuccess, onCancel, visible }) {
  const [form, setForm]     = useState(EMPTY_PACIENTE)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (visible) { setForm(EMPTY_PACIENTE); setError(null); setSaving(false) }
  }, [visible])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError(null)
    try {
      const nuevo = await api.post(`/api/clientes/${clienteId}/pacientes/`, pacientePayload(form))
      onSuccess(nuevo)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 flex flex-col gap-3${visible ? '' : ' hidden'}`}>
      <p className="text-sm font-semibold text-purple-800">Nueva Mascota</p>
      <CamposMascota form={form} setForm={setForm} />
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition disabled:opacity-60">
          {saving ? <Spinner className="text-white" /> : null}
          {saving ? 'Guardando…' : 'Registrar Mascota'}
        </button>
      </div>
    </form>
  )
}

// ── Modal Agendar cita ──────────────────────────────────────────────────────
function AgendarCitaModal({ paciente, onClose, onCreated }) {
  const _d = new Date()
  const hoy = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
  const [form, setForm] = useState({ fecha: hoy, hora: '09:00', motivo: '', notas: '', veterinario_id: '' })
  const [doctores, setDoctores] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    api.get('/api/usuarios/doctores')
      .then(setDoctores)
      .catch(err => console.error('Error al obtener doctores:', err))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.fecha || !form.hora || !form.veterinario_id) { 
      setError('Fecha, hora y veterinario son obligatorios.'); 
      return 
    }
    setSaving(true); setError(null)
    try {
      await api.post('/api/citas/', {
        paciente_id: paciente.id,
        fecha_hora:  `${form.fecha}T${form.hora}:00`,
        motivo:      form.motivo.trim() || null,
        estado:      'pendiente',
        notas:       form.notas.trim() || null,
        veterinario_id: parseInt(form.veterinario_id, 10),
      })
      onCreated()
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Agendar cita — {paciente.nombre}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Fecha <span className="text-rose-500">*</span></label>
                <input type="date" className={inputCls} value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Hora <span className="text-rose-500">*</span></label>
                <input type="time" className={inputCls} value={form.hora}
                  onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Motivo</label>
              <input type="text" className={inputCls} placeholder="Ej. Control, Vacunación…"
                value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Veterinario asignado <span className="text-rose-500">*</span></label>
              <select className={inputCls} value={form.veterinario_id}
                onChange={e => setForm(f => ({ ...f, veterinario_id: e.target.value }))} required>
                <option value="">— Seleccione un veterinario —</option>
                {doctores.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Notas</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Observaciones opcionales…"
                value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
            </div>
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
              {saving ? 'Guardando…' : 'Agendar Cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal editar mascota ─────────────────────────────────────────────────────
function EditarMascotaModal({ paciente, onClose, onGuardado }) {
  const [form, setForm] = useState({
    nombre:  paciente.nombre,
    especie: paciente.especie,
    raza:    paciente.raza ?? '',
    edad:    paciente.edad != null ? String(paciente.edad) : '',
    sexo:                 paciente.sexo ?? '',
    esterilizado:         !!paciente.esterilizado,
    fecha_nacimiento:     paciente.fecha_nacimiento ?? '',
    microchip:            paciente.microchip ?? '',
    color:                paciente.color ?? '',
    alergias:             paciente.alergias ?? '',
    condiciones_cronicas: paciente.condiciones_cronicas ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true); setError(null)
    try {
      const actualizado = await api.put(`/api/pacientes/${paciente.id}`, pacientePayload(form))
      onGuardado(actualizado)
    } catch (err) {
      setError(err.message); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Editar Mascota</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
            <CamposMascota form={form} setForm={setForm} />
            {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Panel de perfil de la mascota ───────────────────────────────────────────
function PanelMascota({ paciente, cliente, onAtender, onAgendar, onEditar, onEliminar }) {
  const navigate = useNavigate()
  const [historias, setHistorias] = useState([])
  const [citas, setCitas]         = useState([])
  const [cargando, setCargando]   = useState(true)
  const [verAntecedentes, setVerAntecedentes] = useState(false)
  const [verDocumentos, setVerDocumentos] = useState(false)

  const cargarDetalle = async () => {
    setCargando(true)
    try {
      const [h, c] = await Promise.all([
        api.get(`/api/pacientes/${paciente.id}/historias/`),
        api.get(`/api/citas/?paciente_id=${paciente.id}`),
      ])
      setHistorias(Array.isArray(h) ? h : [])
      setCitas(Array.isArray(c) ? c : [])
    } catch {
      setHistorias([]); setCitas([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { setVerAntecedentes(false); setVerDocumentos(false); cargarDetalle() }, [paciente.id])

  const ahora = new Date()
  const proximaCita = [...citas]
    .filter(c => new Date(c.fecha_hora) >= ahora && c.estado !== 'cancelada')
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0] ?? null

  const historiasOrden = [...historias].sort(
    (a, b) => new Date(b.fecha || b.creado_en) - new Date(a.fecha || a.creado_en))
  const ultima = historiasOrden[0] ?? null
  const sinTelefono = !(cliente?.telefono || '').trim()

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Cabecera de la mascota */}
      <div className="px-5 py-5 bg-gradient-to-br from-purple-700 to-purple-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
            <PawPrint className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight truncate">{paciente.nombre}</p>
            <p className="text-xs text-purple-200">
              {paciente.especie}{paciente.raza ? ` · ${paciente.raza}` : ''}
              {paciente.edad != null ? ` · ${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''}
              {paciente.sexo ? ` · ${paciente.sexo}` : ''}
              {paciente.esterilizado ? ' · esterilizado' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEditar(paciente)} title="Editar mascota"
              className="p-2 rounded-lg text-purple-200 hover:text-white hover:bg-white/15 transition">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => onEliminar(paciente)} title="Eliminar mascota"
              className="p-2 rounded-lg text-purple-200 hover:text-white hover:bg-white/15 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Alertas clínicas */}
      {(paciente.alergias || paciente.condiciones_cronicas) && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex flex-col gap-1">
          {paciente.alergias && (
            <div className="flex items-start gap-2 text-xs text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span><strong>Alergias:</strong> {paciente.alergias}</span>
            </div>
          )}
          {paciente.condiciones_cronicas && (
            <div className="flex items-start gap-2 text-xs text-amber-700">
              <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span><strong>Crónico:</strong> {paciente.condiciones_cronicas}</span>
            </div>
          )}
        </div>
      )}

      {/* Mini-stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-bold text-slate-800">{cargando ? '—' : historias.length}</p>
          <p className="text-xs text-slate-400">Consultas</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-xs font-bold text-slate-800">{ultima ? fmtFecha(ultima.fecha || ultima.creado_en) : '—'}</p>
          <p className="text-xs text-slate-400">Última visita</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-xs font-bold text-slate-800">{proximaCita ? fmtFecha(proximaCita.fecha_hora) : 'Sin cita'}</p>
          <p className="text-xs text-slate-400">Próxima cita</p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Próxima cita destacada */}
        {proximaCita && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-800 capitalize">{fmtFechaLarga(proximaCita.fecha_hora)}</p>
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {fmtHora(proximaCita.fecha_hora)}
                {proximaCita.motivo ? ` · ${proximaCita.motivo}` : ''}
              </p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estadoStyle(proximaCita.estado).pill}`}>
              {estadoLabel(proximaCita.estado)}
            </span>
          </div>
        )}

        {/* Acciones */}
        <button onClick={() => onAtender(paciente)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-sm transition">
          <Stethoscope className="w-4 h-4" /> Atender / Iniciar consulta
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={() => navigate(`/pacientes/${paciente.id}/historial`, { state: { paciente, cliente } })}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition">
            <FileText className="w-4 h-4 text-purple-600" /> Historia clínica
          </button>
          <button onClick={() => setVerAntecedentes(v => !v)}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition">
            <ClipboardList className="w-4 h-4 text-purple-600" /> Antecedentes
          </button>
        </div>

        {/* Documentos complementarios (radiografías, análisis, etc.) */}
        <button onClick={() => setVerDocumentos(v => !v)}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 border text-sm font-medium rounded-lg transition ${
            verDocumentos ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}>
          <Paperclip className="w-4 h-4 text-purple-600" /> Documentos (radiografías, análisis…)
        </button>
        {verDocumentos && <DocumentosPaciente pacienteId={paciente.id} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={() => onAgendar(paciente)}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-purple-200 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-50 transition">
            <Calendar className="w-4 h-4" /> Agendar cita
          </button>
          {sinTelefono ? (
            <button disabled title="El cliente no tiene teléfono registrado"
              className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-400 text-sm font-medium rounded-lg cursor-not-allowed">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
          ) : (
            <a href={waRecordatorio(cliente?.telefono, cliente?.nombre, paciente.nombre, proximaCita)} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          )}
        </div>

        <button
          onClick={() => navigate('/ventas', { state: { clienteId: cliente?.id, abrirVenta: true } })}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-amber-200 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50 transition"
        >
          <ShoppingCart className="w-4 h-4" /> Cobrar venta (productos / servicios)
        </button>

        {/* Antecedentes (desplegable) */}
        {verAntecedentes && (
          <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-3 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Antecedentes</p>
            {cargando ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : ultima?.antecedentes ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{ultima.antecedentes}</p>
            ) : (
              <p className="text-xs text-slate-400">Sin antecedentes registrados en la última consulta.</p>
            )}

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">Historial reciente</p>
            {cargando ? (
              <p className="text-xs text-slate-400">Cargando…</p>
            ) : historiasOrden.length === 0 ? (
              <p className="text-xs text-slate-400">Aún no hay consultas registradas.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {historiasOrden.slice(0, 5).map(h => (
                  <li key={h.id}>
                    <button
                      onClick={() => navigate(`/pacientes/${paciente.id}/historial`, { state: { paciente, cliente } })}
                      className="w-full text-left py-2 flex items-start gap-2 hover:bg-white rounded transition"
                    >
                      <span className="text-xs font-mono text-slate-400 mt-0.5 shrink-0">{fmtFecha(h.fecha || h.creado_en)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-700 truncate">{h.motivo_consulta || '(sin motivo)'}</span>
                        {h.diagnostico_presuntivo && (
                          <span className="block text-xs text-slate-400 truncate">Dx: {h.diagnostico_presuntivo}</span>
                        )}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────
export default function DetalleCliente() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente]     = useState(null)
  const [pacientes, setPacientes] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [busqueda, setBusqueda]   = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [agendarPaciente, setAgendarPaciente] = useState(null)
  const [editarPaciente,  setEditarPaciente]  = useState(null)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true); setError(null)
      try {
        const [c, p] = await Promise.all([
          api.get(`/api/clientes/${id}`),
          api.get(`/api/clientes/${id}/pacientes/`),
        ])
        setCliente(c ?? null)
        const lista = Array.isArray(p) ? p : []
        setPacientes(lista)
        if (lista.length === 1) setSelectedId(lista[0].id)  // autoselección si hay una sola
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [id])

  const term = busqueda.trim().toLowerCase()
  const pacientesFiltrados = term
    ? pacientes.filter(p => p.nombre.toLowerCase().includes(term))
    : pacientes

  const handlePacienteCreado = (nuevo) => {
    setShowForm(false)
    setTimeout(() => {
      setPacientes(prev => [...prev, nuevo])
      setSelectedId(nuevo.id)
    }, 100)
  }

  const seleccionado = pacientes.find(p => p.id === selectedId) ?? null

  const irAtender = (p) => navigate(`/consultas/${p.id}`, { state: { paciente: p, cliente } })

  const handleMascotaEditada = (actualizado) => {
    setPacientes(prev => prev.map(p => p.id === actualizado.id ? { ...p, ...actualizado } : p))
    setEditarPaciente(null)
  }

  const handleEliminarMascota = async (p) => {
    if (!window.confirm(
      `¿Eliminar a "${p.nombre}"? Se borrarán también sus historias clínicas y citas. Esta acción no se puede deshacer.`
    )) return
    try {
      await api.del(`/api/pacientes/${p.id}`)
      setPacientes(prev => prev.filter(x => x.id !== p.id))
      if (selectedId === p.id) setSelectedId(null)
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 gap-3 text-slate-400">
      <Spinner /> <span className="text-sm">Cargando…</span>
    </div>
  )

  if (error) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-6 py-4">⚠ {error}</div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center gap-4 static md:sticky md:top-0 md:z-10 flex-wrap">
        <button onClick={() => navigate('/clientes')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-purple-700 transition font-medium">
          <ChevronLeft className="w-4 h-4" /> Clientes
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-800">{cliente?.nombre}</h1>
        {cliente?.telefono && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
            <Phone className="w-3.5 h-3.5" /> {cliente.telefono}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-6xl w-full mx-auto">
        {/* Tarjeta del cliente */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'DNI',       value: cliente?.dni       || '—' },
              { label: 'Teléfono',  value: cliente?.telefono  || '—' },
              { label: 'Dirección', value: cliente?.direccion || '—' },
              { label: 'Mascotas',  value: `${pacientes.length} registradas` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                <p className="text-sm text-slate-700 font-medium">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Formulario nueva mascota */}
        <PacienteForm
          visible={showForm}
          clienteId={id}
          onSuccess={handlePacienteCreado}
          onCancel={() => setShowForm(false)}
        />

        {/* Lista (izq) + Panel (der) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* Lista de mascotas */}
          <section className={`lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${selectedId ? 'hidden lg:block' : 'block'}`}>
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
              <PawPrint className="w-4 h-4 text-purple-500" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Mascotas</h2>
              <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2.5 py-0.5 rounded-full">
                {pacientesFiltrados.length}{term ? ` de ${pacientes.length}` : ''}
              </span>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar mascota…"
                  className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-40" />
              </div>

              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition ml-auto">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </div>

            {pacientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                <PawPrint className="w-8 h-8 opacity-40" />
                <p className="text-sm font-medium mt-3">Sin mascotas registradas</p>
                <p className="text-xs mt-1">Usa "Agregar" para registrar la primera mascota</p>
              </div>
            ) : pacientesFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Search className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">Sin resultados para "{busqueda}"</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {pacientesFiltrados.map(p => {
                  const activo = p.id === selectedId
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setSelectedId(p.id)}
                        className={`w-full text-left px-5 py-3.5 flex items-center gap-3 transition ${activo ? 'bg-purple-50' : 'hover:bg-slate-50/60'}`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${activo ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <PawPrint className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 truncate">{p.nombre}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {p.raza || 'Sin raza'}{p.edad != null ? ` · ${p.edad} año${p.edad !== 1 ? 's' : ''}` : ''}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${especieColor(p.especie)}`}>
                          {p.especie}
                        </span>
                        <ChevronRight className={`w-4 h-4 shrink-0 ${activo ? 'text-purple-500' : 'text-slate-300'}`} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Panel de perfil */}
          <aside className={`lg:col-span-5 lg:sticky lg:top-24 ${selectedId ? 'block' : 'hidden lg:block'}`}>
            {selectedId && (
              <button
                onClick={() => setSelectedId(null)}
                className="lg:hidden mb-4 flex items-center gap-1 text-sm font-semibold text-purple-700 hover:text-purple-900"
              >
                <ChevronLeft className="w-4 h-4" /> Volver a la lista de mascotas
              </button>
            )}
            {seleccionado ? (
              <PanelMascota
                key={seleccionado.id}
                paciente={seleccionado}
                cliente={cliente}
                onAtender={irAtender}
                onAgendar={setAgendarPaciente}
                onEditar={setEditarPaciente}
                onEliminar={handleEliminarMascota}
              />
            ) : (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 shadow-sm flex flex-col items-center justify-center text-center py-16 px-6 text-slate-400">
                <PawPrint className="w-10 h-10 opacity-30 mb-3" />
                <p className="text-sm font-medium text-slate-500">Selecciona una mascota</p>
                <p className="text-xs mt-1">Haz clic en una mascota de la lista para ver su perfil, historia clínica y citas.</p>
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* Modal editar mascota */}
      {editarPaciente && (
        <EditarMascotaModal
          paciente={editarPaciente}
          onClose={() => setEditarPaciente(null)}
          onGuardado={handleMascotaEditada}
        />
      )}

      {/* Modal agendar cita */}
      {agendarPaciente && (
        <AgendarCitaModal
          paciente={agendarPaciente}
          onClose={() => setAgendarPaciente(null)}
          onCreated={() => {
            const pid = agendarPaciente.id
            setAgendarPaciente(null)
            // Reseleccionar fuerza el remount del panel y recarga sus citas
            setSelectedId(null)
            setTimeout(() => setSelectedId(pid), 0)
          }}
        />
      )}
    </div>
  )
}
