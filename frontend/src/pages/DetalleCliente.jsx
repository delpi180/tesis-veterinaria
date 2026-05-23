import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../services/api'

// ── Iconos ────────────────────────────────────────────────────────────────
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
)
const PawIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-purple-500">
    <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5.5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm13 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 10c-3.3 0-6 2.7-6 6 0 2.2 1.8 4 4 4h4c2.2 0 4-1.8 4-4 0-3.3-2.7-6-6-6z"/>
  </svg>
)
const StethoscopeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3a2 2 0 010 4M5 7a2 2 0 000 4m14-4a2 2 0 010 4m0 0v6a4 4 0 01-8 0v-1" />
  </svg>
)
const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)

const ESPECIE_COLORS = {
  canino:  'bg-amber-100 text-amber-700',
  felino:  'bg-blue-100 text-blue-700',
  ave:     'bg-green-100 text-green-700',
  reptil:  'bg-emerald-100 text-emerald-700',
  default: 'bg-slate-100 text-slate-600',
}
const especieColor = (e = '') =>
  ESPECIE_COLORS[e.toLowerCase()] ?? ESPECIE_COLORS.default

// ── Formulario nueva mascota ──────────────────────────────────────────────
const EMPTY_PACIENTE = { nombre: '', especie: 'Canino', raza: '', edad: '' }

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
      const body = { ...form, edad: form.edad ? parseInt(form.edad) : null }
      const nuevo = await api.post(`/api/clientes/${clienteId}/pacientes/`, body)
      onSuccess(nuevo)   // desmonta este componente — no hay más setState después
    } catch (err) {
      setError(err.message)
      setSaving(false)   // solo reseteamos si el componente sigue montado (error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 flex flex-col gap-3${visible ? '' : ' hidden'}`}>
      <p className="text-sm font-semibold text-purple-800">Nueva Mascota</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: 'nombre',  label: 'Nombre *',  placeholder: 'Ej: Rex',    type: 'text'   },
          { key: 'especie', label: 'Especie',   placeholder: 'Canino',     type: 'text'   },
          { key: 'raza',    label: 'Raza',      placeholder: 'Ej: Labrador', type: 'text' },
          { key: 'edad',    label: 'Edad (años)', placeholder: '3',        type: 'number' },
        ].map(({ key, label, placeholder, type }) => (
          <div key={key}>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
            <input
              type={type}
              min={type === 'number' ? 0 : undefined}
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent bg-white"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition disabled:opacity-60">
          {saving ? <Spinner /> : null}
          {saving ? 'Guardando…' : 'Registrar Mascota'}
        </button>
      </div>
    </form>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────
export default function DetalleCliente() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const [cliente, setCliente]   = useState(null)
  const [pacientes, setPacientes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [busqueda, setBusqueda]   = useState('')

  useEffect(() => {
    const cargar = async () => {
      setLoading(true); setError(null)
      try {
        const [c, p] = await Promise.all([
          api.get(`/api/clientes/${id}`),
          api.get(`/api/clientes/${id}/pacientes/`),
        ])
        setCliente(c ?? null)
        setPacientes(Array.isArray(p) ? p : [])
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
    setTimeout(() => setPacientes(prev => [...prev, nuevo]), 100)
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 gap-3 text-slate-400">
      <Spinner /> <span className="text-sm">Cargando…</span>
    </div>
  )

  if (error) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-6 py-4">
        ⚠ {error}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={() => navigate('/clientes')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-purple-700 transition font-medium"
        >
          <BackIcon /> Clientes
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-800">{cliente?.nombre}</h1>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-5xl w-full mx-auto">
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

        {/* Lista de mascotas */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
            <PawIcon />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Mascotas
            </h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2.5 py-0.5 rounded-full">
              {pacientesFiltrados.length}
              {term ? ` de ${pacientes.length}` : ''}
            </span>

            {/* Buscador */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar mascota…"
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-44"
              />
            </div>

            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition ml-auto"
            >
              <PlusIcon /> Agregar
            </button>
          </div>

          {pacientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400">
              <PawIcon />
              <p className="text-sm font-medium mt-3">Sin mascotas registradas</p>
              <p className="text-xs mt-1">Usa "Agregar" para registrar la primera mascota</p>
            </div>
          ) : pacientesFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Sin resultados para "{busqueda}"</p>
              <p className="text-xs mt-1">Prueba con otro nombre</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Nombre</th>
                  <th className="text-left px-5 py-3 font-semibold">Especie</th>
                  <th className="text-left px-5 py-3 font-semibold">Raza</th>
                  <th className="text-left px-5 py-3 font-semibold">Edad</th>
                  <th className="text-right px-5 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pacientesFiltrados.map((p, i) => (
                  <tr key={p.id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{p.nombre}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${especieColor(p.especie)}`}>
                        {p.especie}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{p.raza || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {p.edad != null ? `${p.edad} año${p.edad !== 1 ? 's' : ''}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => navigate(`/consultas/${p.id}`, { state: { paciente: p, cliente } })}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition"
                      >
                        <StethoscopeIcon /> Atender
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  )
}
