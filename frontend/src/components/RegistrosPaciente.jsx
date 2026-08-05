import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Paperclip, Eye } from 'lucide-react'
import { api, authHeaders } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'
import { Cargando } from './Cargando'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const fmtFecha = (iso) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})
const hoyStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Se compara como texto ISO para no meter husos horarios en una fecha simple. */
const vencida = (iso) => !!iso && iso < hoyStr()

/**
 * Registro simple por mascota para antiparasitarios y estética.
 * tipo: 'antiparasitario' | 'estetica'
 */
export default function RegistrosPaciente({ pacienteId, tipo, labelProducto = 'Producto' }) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const esComplementario = tipo === 'complementario'
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [fecha, setFecha] = useState(hoyStr())
  // Cuándo toca repetirlo. Es lo que hace que la desparasitación entre en la
  // bandeja de pendientes de recepción: antes quedaba anotado que se hizo y
  // nadie se enteraba cuándo tocaba de nuevo.
  const esAntiparasitario = tipo === 'antiparasitario'
  const [proximaFecha, setProximaFecha] = useState('')
  const [catalogo, setCatalogo] = useState([])
  const [producto, setProducto] = useState('')
  const [notas, setNotas] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [abriendoId, setAbriendoId] = useState(null)

  const cargar = async () => {
    setCargando(true)
    try {
      setItems(await api.get(`/api/pacientes/${pacienteId}/registros/?tipo=${tipo}`))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId, tipo])

  useEffect(() => {
    if (!esAntiparasitario) return
    api.get('/api/catalogos/antiparasitarios')
      .then(c => setCatalogo(Array.isArray(c) ? c : []))
      .catch(() => setCatalogo([]))
  }, [esAntiparasitario])

  // Al elegir un producto del catálogo se propone la próxima fecha con su
  // intervalo habitual; se puede corregir a mano.
  const elegirProducto = (nombre) => {
    setProducto(nombre)
    const entrada = catalogo.find(c => c.nombre === nombre)
    if (entrada?.intervalo_dias) {
      const base = new Date(fecha || hoyStr())
      if (!isNaN(base.getTime())) {
        base.setDate(base.getDate() + entrada.intervalo_dias)
        setProximaFecha(base.toISOString().slice(0, 10))
      }
    }
  }

  const agregar = async (e) => {
    e.preventDefault()
    if (!producto.trim() && !notas.trim()) { toast.error('Ingresa al menos el producto o una nota.'); return }
    setGuardando(true)
    try {
      let nuevo = await api.post(`/api/pacientes/${pacienteId}/registros/`, {
        tipo, fecha, producto: producto.trim() || null, notas: notas.trim() || null,
        proxima_fecha: esAntiparasitario ? (proximaFecha || null) : null,
      })
      if (esComplementario && archivo) {
        const fd = new FormData()
        fd.append('archivo', archivo)
        const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/registros/${nuevo.id}/documento`, {
          method: 'POST', body: fd, headers: authHeaders(),
        })
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          toast.error(b?.detail ?? 'El registro se guardó, pero el archivo no se pudo adjuntar.')
        } else {
          nuevo = await res.json()
        }
      }
      setItems(prev => [nuevo, ...prev])
      setProducto(''); setNotas(''); setFecha(hoyStr()); setArchivo(null); setProximaFecha('')
      toast.success('Registro agregado.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  // Ver/descargar el archivo adjunto (blob autenticado, igual que Documentos).
  const abrirDocumento = async (doc) => {
    setAbriendoId(doc.id)
    try {
      const res = await fetch(`${BASE_URL}/api/pacientes/${pacienteId}/documentos/${doc.id}/descargar`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error(`No se pudo abrir (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAbriendoId(null)
    }
  }

  const eliminarDocumento = async (it, doc) => {
    if (!await confirmar({
      titulo: 'Eliminar archivo',
      mensaje: `Se borrará "${doc.nombre}" de este registro.`,
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/documentos/${doc.id}`)
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, documentos: (x.documentos || []).filter(d => d.id !== doc.id) } : x))
      toast.success('Archivo eliminado.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const eliminar = async (it) => {
    if (!await confirmar({
      titulo: 'Eliminar registro',
      mensaje: 'Se borrará este registro clínico y los archivos que tenga adjuntos.',
      detalle: 'No se puede deshacer.',
      confirmarTexto: 'Eliminar',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/registros/${it.id}`)
      setItems(prev => prev.filter(x => x.id !== it.id))
      toast.success('Registro eliminado.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Formulario */}
      <form onSubmit={agregar} className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-semibold text-slate-500">{labelProducto}</label>
          {esAntiparasitario && catalogo.length > 0 && (
            <select
              value={catalogo.some(c => c.nombre === producto) ? producto : ''}
              onChange={e => e.target.value && elegirProducto(e.target.value)}
              className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">Elegir del catálogo…</option>
              {catalogo.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
            </select>
          )}
          <input type="text" value={producto} onChange={e => setProducto(e.target.value)}
            placeholder={{
              antiparasitario: 'Ej. Bravecto, Drontal…',
              estetica: 'Ej. Baño, corte, limpieza dental…',
              complementario: 'Ej. Citología, ecografía, hemograma…',
            }[tipo] ?? ''}
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-semibold text-slate-500">Notas</label>
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
            placeholder="Opcional"
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        {esAntiparasitario && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Próxima aplicación</label>
            <input type="date" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)}
              className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
        )}
        {esComplementario && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Archivo (opcional)</label>
            <input
              type="file"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)}
              className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-purple-100 file:text-purple-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:cursor-pointer max-w-[220px]"
            />
          </div>
        )}
        <button type="submit" disabled={guardando}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Agregar
        </button>
      </form>

      {/* Lista */}
      {cargando ? (
        <Cargando alto={140} />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin registros todavía</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 font-semibold">Fecha</th>
              <th className="text-left px-5 py-3 font-semibold">{labelProducto}</th>
              {esAntiparasitario && <th className="text-left px-5 py-3 font-semibold">Próxima</th>}
              <th className="text-left px-5 py-3 font-semibold">Notas</th>
              {esComplementario && <th className="text-left px-5 py-3 font-semibold">Archivo</th>}
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-b border-slate-50">
                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(it.fecha)}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{it.producto || '—'}</td>
                {esAntiparasitario && (
                  <td className="px-5 py-3 whitespace-nowrap">
                    {it.proxima_fecha
                      ? <span className={vencida(it.proxima_fecha) ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                          {fmtFecha(it.proxima_fecha)}{vencida(it.proxima_fecha) ? ' · vencida' : ''}
                        </span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                )}
                <td className="px-5 py-3 text-slate-500">{it.notas || '—'}</td>
                {esComplementario && (
                  <td className="px-5 py-3">
                    {(it.documentos || []).length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {it.documentos.map(doc => (
                          <div key={doc.id} className="flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span className="text-xs text-slate-600 truncate max-w-[140px]">{doc.nombre}</span>
                            <button onClick={() => abrirDocumento(doc)} disabled={abriendoId === doc.id} title="Ver / descargar"
                              className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition disabled:opacity-50">
                              {abriendoId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => eliminarDocumento(it, doc)} title="Eliminar archivo"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-5 py-3 text-right">
                  <button onClick={() => eliminar(it)} title="Eliminar"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  )
}
