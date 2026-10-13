import { useState, useEffect, useCallback } from 'react'
import { BookA, Plus, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const TIPOS = { medicamento: 'Medicamento', raza: 'Raza', abreviatura: 'Abreviatura', persona: 'Persona', otro: 'Otro' }
const VACIO = { termino: '', suena_como: '', tipo: 'medicamento' }

/** Palabras propias de la clínica para que el dictado las escriba bien. */
export default function GlosarioDictado() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try { setLista(await api.get('/api/glosario/')) } catch { /* se reintenta al volver */ }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const agregar = async (e) => {
    e.preventDefault()
    if (form.termino.trim().length < 2) return
    setGuardando(true)
    try {
      await api.post('/api/glosario/', { ...form, suena_como: form.suena_como.trim() || null })
      setForm(VACIO)
      await cargar()
      toast.success('Palabra agregada. El próximo dictado ya la usa.')
    } catch (err) {
      toast.error(err?.message || 'No se pudo agregar la palabra')
    } finally { setGuardando(false) }
  }

  const quitar = async (t) => {
    if (!(await confirmar({ titulo: 'Quitar del glosario', mensaje: `Se quitará «${t.termino}» del glosario.`, confirmarTexto: 'Quitar', peligroso: true }))) return
    try { await api.del(`/api/glosario/${t.id}`); await cargar() }
    catch (err) { toast.error(err?.message || 'No se pudo quitar') }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <BookA className="w-4 h-4 text-purple-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Glosario del dictado</h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600">
          Palabras que el dictado debe escribir bien: marcas nuevas, abreviaturas de la casa, nombres de colegas.
          En «suena como» pon cómo suele salir mal, separado por comas.
        </p>
        <form onSubmit={agregar} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input className={`${inputCls} sm:col-span-3`} placeholder="Se escribe: MELOXIVET"
            value={form.termino} onChange={e => setForm(f => ({ ...f, termino: e.target.value }))} />
          <input className={`${inputCls} sm:col-span-4`} placeholder="Suena como: melo si vet, melosivet"
            value={form.suena_como} onChange={e => setForm(f => ({ ...f, suena_como: e.target.value }))} />
          <select className={`${inputCls} sm:col-span-3`} value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" disabled={guardando}
            className="sm:col-span-2 flex items-center justify-center gap-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </form>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay palabras propias.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {lista.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{t.termino}</span>
                  <span className="text-slate-500"> · {TIPOS[t.tipo] || t.tipo}</span>
                  {t.suena_como && <p className="text-xs text-slate-500 truncate">suena como: {t.suena_como}</p>}
                </div>
                <button onClick={() => quitar(t)} aria-label={`Quitar ${t.termino}`}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
