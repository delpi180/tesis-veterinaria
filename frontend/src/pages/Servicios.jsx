import { useState, useEffect } from 'react'
import { Stethoscope, Search, Pencil, Trash2, X, Tag, Coins, Sparkles, Mic, StopCircle } from 'lucide-react'
import { api, authHeaders } from '../services/api'
import { useToast } from '../components/Toast'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const EJEMPLO_SERV = 'consulta general 50 soles, baño y corte 40, vacunación 35, cirugía precio variable'

const FORM_INICIAL = {
  nombre:          '',
  descripcion:     '',
  precio:          '',
  precio_variable: false,
  activo:          true,
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const fmtMoneda = (n) => `S/ ${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-500">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

function ServiciosIAModal({ onClose, onAplicado }) {
  const toast = useToast()
  const [texto, setTexto]   = useState('')
  const [items, setItems]   = useState(null)   // null = aún no interpretado
  const [cargando, setCargando]   = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const { isRecording, seconds, micError, start, stop } = useAudioRecorder()

  const interpretarTexto = async () => {
    if (!texto.trim()) { toast.error('Escribe o dicta los servicios.'); return }
    setCargando(true)
    try {
      setItems(await api.post('/api/servicios/interpretar', { texto }))
    } catch (e) { toast.error(e.message) } finally { setCargando(false) }
  }

  const grabar = async () => {
    if (isRecording) {
      setCargando(true)
      try {
        const blob = await stop()
        if (!blob) throw new Error('No se capturó audio.')
        const fd = new FormData()
        fd.append('audio', blob, 'servicios.webm')
        const res = await fetch(`${BASE_URL}/api/servicios/interpretar-audio`, {
          method: 'POST', body: fd, headers: authHeaders(),
        })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error(b?.detail ?? `Error (HTTP ${res.status})`)
        }
        setItems(await res.json())
      } catch (e) { toast.error(e.message) } finally { setCargando(false) }
    } else {
      await start()
    }
  }

  const setItem = (i, campo, valor) => setItems(its => its.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it))
  const quitar  = (i) => setItems(its => its.filter((_, idx) => idx !== i))

  const aplicar = async () => {
    const faltaPrecio = items.find(it => !it.precio_variable && !(Number(it.precio) > 0))
    if (faltaPrecio) { toast.error(`"${faltaPrecio.nombre}" necesita precio o marcarlo como variable.`); return }
    setAplicando(true)
    try {
      const r = await api.post('/api/servicios/aplicar', {
        items: items.map(it => ({
          nombre: it.nombre,
          descripcion: it.descripcion || null,
          precio: it.precio_variable ? null : Number(it.precio),
          precio_variable: !!it.precio_variable,
          accion: it.accion,
          servicio_id: it.servicio_id || null,
        })),
      })
      toast.success(`Servicios: ${r.creados.length} nuevo(s), ${r.actualizados.length} actualizado(s).`)
      onAplicado()
    } catch (e) { toast.error(e.message) } finally { setAplicando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" /> Agregar servicios por voz/texto
          </p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-slate-500">
            Dicta o escribe los servicios y sus precios. La IA arma la lista; tú la revisas y confirmas.
          </p>
          <textarea
            rows={3} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={`Ej: ${EJEMPLO_SERV}`}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white resize-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={grabar} disabled={cargando}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 ${isRecording ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {isRecording ? <><StopCircle className="w-4 h-4" /> Detener ({seconds}s)</> : <><Mic className="w-4 h-4" /> Dictar</>}
            </button>
            <button onClick={interpretarTexto} disabled={cargando || isRecording}
              className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              <Sparkles className="w-4 h-4" /> {cargando ? 'Interpretando…' : 'Interpretar'}
            </button>
            {micError && <span className="text-xs text-rose-600">{micError}</span>}
          </div>

          {items && (
            items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                No se detectaron servicios. Reformula el texto.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-3 py-2 font-semibold">Servicio</th>
                      <th className="text-right px-3 py-2 font-semibold">Precio</th>
                      <th className="text-center px-3 py-2 font-semibold">Variable</th>
                      <th className="text-center px-3 py-2 font-semibold">Acción</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-3 py-2">
                          <input value={it.nombre} onChange={e => setItem(i, 'nombre', e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300" />
                          {it.descripcion && <span className="text-xs text-slate-400">{it.descripcion}</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0" step="0.01" value={it.precio ?? ''} disabled={it.precio_variable}
                            onChange={e => setItem(i, 'precio', e.target.value)}
                            className="w-24 text-sm text-right border border-slate-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300 disabled:bg-slate-100 disabled:text-slate-300" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={!!it.precio_variable}
                            onChange={e => setItem(i, 'precio_variable', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${it.accion === 'nuevo' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                            {it.accion === 'nuevo' ? 'Nuevo' : 'Actualizar'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => quitar(i)} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={aplicar} disabled={!items || items.length === 0 || aplicando}
            className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
            {aplicando ? 'Guardando…' : 'Confirmar y guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Servicios() {
  const [servicios, setServicios] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [busqueda,  setBusqueda]  = useState('')

  // ── Modal crear/editar ────────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(FORM_INICIAL)
  const [guardando,    setGuardando]    = useState(false)
  const [errorModal,   setErrorModal]   = useState(null)
  const [voiceIA,      setVoiceIA]      = useState(false)

  const cargar = async () => {
    setLoading(true); setError(null)
    try {
      const data = await api.get('/api/servicios/?solo_activos=false')
      setServicios(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const term = busqueda.trim().toLowerCase()
  const filtrados = term
    ? servicios.filter(s =>
        s.nombre.toLowerCase().includes(term) ||
        (s.descripcion ?? '').toLowerCase().includes(term))
    : servicios

  const totalActivos = servicios.filter(s => s.activo).length

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Handlers del modal ──────────────────────────────────────────────────────
  const abrirNuevo = () => {
    setEditId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
    setModalAbierto(true)
  }

  const abrirEditar = (s) => {
    setEditId(s.id)
    setForm({
      nombre:          s.nombre,
      descripcion:     s.descripcion ?? '',
      precio:          s.precio != null ? String(s.precio) : '',
      precio_variable: s.precio_variable,
      activo:          s.activo,
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
    if (!form.nombre.trim()) { setErrorModal('El nombre es obligatorio.'); return }
    if (!form.precio_variable) {
      const precio = parseFloat(form.precio)
      if (!(precio > 0)) { setErrorModal('Un servicio de precio fijo requiere un precio mayor a 0.'); return }
    }

    const payload = {
      nombre:          form.nombre.trim(),
      descripcion:     form.descripcion.trim() || null,
      precio:          form.precio_variable ? null : parseFloat(form.precio),
      precio_variable: form.precio_variable,
      activo:          form.activo,
    }

    setGuardando(true); setErrorModal(null)
    try {
      if (editId) {
        await api.put(`/api/servicios/${editId}`, payload)
      } else {
        await api.post('/api/servicios/', payload)
      }
      await cargar()
      cerrarModal()
    } catch (err) {
      setErrorModal(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (s) => {
    if (!window.confirm(`¿Eliminar el servicio "${s.nombre}"?`)) return
    try {
      await api.del(`/api/servicios/${s.id}`)
      setServicios(prev => prev.filter(x => x.id !== s.id))
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between static md:sticky md:top-0 md:z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Servicios</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVoiceIA(true)}
            className="flex items-center gap-2 px-4 py-2 border border-purple-200 text-purple-700 hover:bg-purple-50 text-sm font-semibold rounded-lg transition"
          >
            <Sparkles className="w-4 h-4" /> Por voz/texto
          </button>
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition"
          >
            + Nuevo Servicio
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-5xl w-full mx-auto">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
            ⚠ No se pudo conectar con el servidor: {error}
          </div>
        )}

        {/* Tarjetas resumen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Servicios registrados</p>
              <p className="text-2xl font-bold text-slate-800">{servicios.length}</p>
            </div>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Coins className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Activos (disponibles para venta)</p>
              <p className="text-2xl font-bold text-slate-800">{totalActivos}</p>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-sky-500" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Catálogo de servicios</h2>
              <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
                {filtrados.length}{term ? ` de ${servicios.length}` : ''}
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar servicio…"
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-48"
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando servicios…</span>
            </div>
          )}

          {!loading && !error && servicios.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Stethoscope className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">Aún no hay servicios registrados</p>
              <p className="text-xs mt-1">Usa el botón "Nuevo Servicio" para comenzar</p>
            </div>
          )}

          {!loading && servicios.length > 0 && (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-5 py-3 font-semibold">Servicio</th>
                  <th className="text-left px-5 py-3 font-semibold">Descripción</th>
                  <th className="text-right px-5 py-3 font-semibold">Precio</th>
                  <th className="text-center px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((s, i) => (
                  <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''} ${!s.activo ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{s.nombre}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{s.descripcion || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      {s.precio_variable ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600">
                          <Tag className="w-3 h-3" /> Monto variable
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-700">{fmtMoneda(s.precio)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(s)} title="Editar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEliminar(s)} title="Eliminar"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}

          {!loading && servicios.length > 0 && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Search className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No se encontraron servicios para "{busqueda}"</p>
            </div>
          )}
        </section>

      </main>

      {/* ── Modal crear/editar servicio ──────────────────────────────────────── */}
      {voiceIA && (
        <ServiciosIAModal
          onClose={() => setVoiceIA(false)}
          onAplicado={() => { setVoiceIA(false); cargar() }}
        />
      )}

      {modalAbierto && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal() }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">
                {editId ? 'Editar Servicio' : 'Nuevo Servicio'}
              </p>
              <button onClick={cerrarModal} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardar}>
              <div className="px-5 py-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Nombre <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Ej. Consulta general, Baño, Operación…"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Descripción</label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="Detalle opcional del servicio…"
                    value={form.descripcion}
                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                    checked={form.precio_variable}
                    onChange={e => setForm(f => ({ ...f, precio_variable: e.target.checked }))}
                  />
                  Monto variable (se ingresa al momento de la venta)
                </label>

                {!form.precio_variable && (
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Precio <span className="text-rose-500">*</span></label>
                    <input
                      type="number" min="0" step="0.01"
                      className={inputCls}
                      placeholder="0.00"
                      value={form.precio}
                      onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-300"
                    checked={form.activo}
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                  />
                  Servicio activo
                </label>

                {errorModal && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
                    {errorModal}
                  </p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button" onClick={cerrarModal}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : editId ? 'Guardar Cambios' : 'Crear Servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
