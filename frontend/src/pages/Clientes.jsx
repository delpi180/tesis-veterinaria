import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../services/api'

// ── Iconos ────────────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
)
const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 text-purple-600">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)
const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-500">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)

// ── Formulario ────────────────────────────────────────────────────────────
const EMPTY_FORM = { dni: '', nombre: '', telefono: '', direccion: '' }

function ClienteForm({ onSuccess, onCancel, visible }) {
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (visible) { setForm(EMPTY_FORM); setError(null); setSaving(false) }
  }, [visible])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const dni = form.dni.trim()
    const tel = form.telefono.replace(/\D/g, '')
    if (!dni)                { setError('El DNI es obligatorio.');    return }
    if (!/^\d{8}$/.test(dni)) { setError('El DNI debe tener exactamente 8 dígitos.'); return }
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    if (form.telefono.trim() && (tel.length < 6 || tel.length > 12)) {
      setError('El teléfono debe tener entre 6 y 12 dígitos.'); return
    }
    setSaving(true); setError(null)
    try {
      const nuevo = await api.post('/api/clientes/', form)
      onSuccess(nuevo)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const FIELDS = [
    { key: 'dni',       label: 'DNI *',             placeholder: 'Ej: 12345678'         },
    { key: 'nombre',    label: 'Nombre completo *',  placeholder: 'Ej: María González'   },
    { key: 'telefono',  label: 'Teléfono',           placeholder: 'Ej: 555-1234'         },
    { key: 'direccion', label: 'Dirección',          placeholder: 'Ej: Av. Principal 45' },
  ]

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 flex flex-col gap-3${visible ? '' : ' hidden'}`}
    >
      <p className="text-sm font-semibold text-purple-800">Nuevo Dueño / Propietario</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
            <input
              type="text"
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent bg-white"
            />
          </div>
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
        >
          Cancelar
        </button>
        <button
          type="submit" disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition disabled:opacity-60"
        >
          {saving ? <Spinner /> : null}
          {saving ? 'Guardando…' : 'Guardar Cliente'}
        </button>
      </div>
    </form>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────
export default function Clientes() {
  const navigate = useNavigate()
  const [clientes,    setClientes]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [showForm,    setShowForm]    = useState(false)
  const [searchTerm,  setSearchTerm]  = useState('')

  const cargar = async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get('/api/clientes/')
      setClientes(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const handleSuccess = (nuevo) => {
    setShowForm(false)
    setTimeout(() => setClientes(prev => [nuevo, ...prev]), 100)
  }

  // Filtro en memoria — sin petición extra al backend
  const term = searchTerm.trim().toLowerCase()
  const clientesFiltrados = term
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        (c.dni ?? '').toLowerCase().includes(term)
      )
    : clientes

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Clientes</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition"
        >
          <PlusIcon />
          Nuevo Cliente
        </button>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-5xl w-full mx-auto">
        <ClienteForm
          visible={showForm}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />

        {/* Tabla */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Cabecera de sección con buscador */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 flex-wrap">
            <UsersIcon />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Propietarios registrados
            </h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
              {clientesFiltrados.length}
              {term ? ` de ${clientes.length}` : ''}
            </span>

            {/* Buscador */}
            <div className="ml-auto relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o DNI…"
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-52"
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando clientes…</span>
            </div>
          )}

          {error && (
            <div className="mx-5 my-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              ⚠ No se pudo conectar con el servidor: {error}
            </div>
          )}

          {!loading && !error && clientes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <UsersIcon />
              <p className="text-sm font-medium mt-3">Aún no hay clientes registrados</p>
              <p className="text-xs mt-1">Usa el botón "Nuevo Cliente" para comenzar</p>
            </div>
          )}

          {!loading && !error && clientes.length > 0 && clientesFiltrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Sin resultados para "{searchTerm}"</p>
              <p className="text-xs mt-1">Prueba con otro nombre o DNI</p>
            </div>
          )}

          {!loading && clientesFiltrados.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">DNI</th>
                  <th className="text-left px-5 py-3 font-semibold">Nombre</th>
                  <th className="text-left px-5 py-3 font-semibold">Teléfono</th>
                  <th className="text-left px-5 py-3 font-semibold">Dirección</th>
                  <th className="text-center px-5 py-3 font-semibold">Mascotas</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 hover:bg-purple-50/40 transition cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {c.dni || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{c.nombre}</td>
                    <td className="px-5 py-3.5 text-slate-500">{c.telefono || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{c.direccion || '—'}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-block bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                        {c.pacientes?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/clientes/${c.id}`) }}
                        className="flex items-center gap-1 ml-auto text-purple-600 hover:text-purple-800 font-medium text-xs"
                      >
                        Ver detalle <ChevronRightIcon />
                      </button>
                    </td>
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
