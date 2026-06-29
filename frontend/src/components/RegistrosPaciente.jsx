import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from './Toast'

const fmtFecha = (iso) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})
const hoyStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Registro simple por mascota para antiparasitarios y estética.
 * tipo: 'antiparasitario' | 'estetica'
 */
export default function RegistrosPaciente({ pacienteId, tipo, labelProducto = 'Producto' }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [fecha, setFecha] = useState(hoyStr())
  const [producto, setProducto] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

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

  const agregar = async (e) => {
    e.preventDefault()
    if (!producto.trim() && !notas.trim()) { toast.error('Ingresa al menos el producto o una nota.'); return }
    setGuardando(true)
    try {
      const nuevo = await api.post(`/api/pacientes/${pacienteId}/registros/`, {
        tipo, fecha, producto: producto.trim() || null, notas: notas.trim() || null,
      })
      setItems(prev => [nuevo, ...prev])
      setProducto(''); setNotas(''); setFecha(hoyStr())
      toast.success('Registro agregado.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (it) => {
    if (!window.confirm('¿Eliminar este registro?')) return
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
          <input type="text" value={producto} onChange={e => setProducto(e.target.value)}
            placeholder={tipo === 'antiparasitario' ? 'Ej. Bravecto, Drontal…' : 'Ej. Baño, corte, limpieza dental…'}
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-semibold text-slate-500">Notas</label>
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
            placeholder="Opcional"
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <button type="submit" disabled={guardando}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Agregar
        </button>
      </form>

      {/* Lista */}
      {cargando ? (
        <p className="text-xs text-slate-400 text-center py-8">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin registros todavía</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 font-semibold">Fecha</th>
              <th className="text-left px-5 py-3 font-semibold">{labelProducto}</th>
              <th className="text-left px-5 py-3 font-semibold">Notas</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-b border-slate-50">
                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(it.fecha)}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{it.producto || '—'}</td>
                <td className="px-5 py-3 text-slate-500">{it.notas || '—'}</td>
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
