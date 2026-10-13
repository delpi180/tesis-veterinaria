import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from './Toast'

const RESULTADOS = {
  enviado: 'Mensaje enviado', contesto: 'Contestó', agendo: 'Agendó cita',
  no_contesto: 'No contestó', no_interesa: 'No le interesa',
}
const fmt = (iso) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** Cada vez que la clínica se comunicó con este dueño, y un registro rápido de llamadas. */
export default function HistorialContactos({ clienteId, pacientes = [] }) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState({ canal: 'llamada', resultado: 'contesto', nota: '', paciente_id: '' })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try { setLista(await api.get(`/api/contactos/cliente/${clienteId}`)) }
    catch { setLista([]) }
  }, [clienteId])
  useEffect(() => { if (abierto && lista === null) cargar() }, [abierto, lista, cargar])

  const guardar = async () => {
    setGuardando(true)
    try {
      await api.post('/api/contactos/', {
        cliente_id: Number(clienteId), motivo: 'otro',
        paciente_id: form.paciente_id ? Number(form.paciente_id) : null,
        canal: form.canal, resultado: form.resultado, nota: form.nota,
      })
      setForm(f => ({ ...f, nota: '' }))
      await cargar()
      toast.success('Contacto registrado')
    } catch (e) { toast.error(e.message || 'No se pudo registrar') }
    finally { setGuardando(false) }
  }

  const campo = 'border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <button onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center gap-2 px-6 py-3 text-left">
        <PhoneCall className="w-4 h-4 text-purple-500" />
        <span className="flex-1 text-sm font-semibold text-slate-700">Contactos con el dueño</span>
        {abierto ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {abierto && (
        <div className="px-6 pb-4 flex flex-col gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select className={campo} value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
              <option value="llamada">Llamada</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <select className={campo} value={form.resultado} onChange={e => setForm(f => ({ ...f, resultado: e.target.value }))}>
              {Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {pacientes.length > 1 && (
              <select className={campo} value={form.paciente_id} onChange={e => setForm(f => ({ ...f, paciente_id: e.target.value }))}>
                <option value="">Todas las mascotas</option>
                {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            <input className={`${campo} flex-1 min-w-[160px]`} placeholder="Nota (opcional)"
              value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
            <button onClick={guardar} disabled={guardando}
              className="text-xs font-medium bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg px-3 py-2">
              Registrar
            </button>
          </div>
          {lista === null ? <p className="text-xs text-slate-500">Cargando…</p>
            : lista.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay contactos registrados.</p>
            : (
              <ul className="divide-y divide-slate-100">
                {lista.map(c => (
                  <li key={c.id} className="py-2 text-sm text-slate-700">
                    <span className="font-medium">{RESULTADOS[c.resultado]}</span>
                    {' · '}{c.canal === 'whatsapp' ? 'WhatsApp' : 'Llamada'}
                    {c.etiqueta && c.motivo !== 'otro' ? ` · ${c.etiqueta}` : ''}
                    {c.paciente ? ` · ${c.paciente}` : ''}
                    <span className="block text-xs text-slate-500">
                      {fmt(c.creado_en)}{c.creado_por ? ` · ${c.creado_por}` : ''}
                      {c.nota ? ` — ${c.nota}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </section>
  )
}
