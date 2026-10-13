import { useState } from 'react'
import { Lock, PenLine, MessageSquarePlus } from 'lucide-react'
import { api, esVeterinario } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'

const fmt = (iso) => new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** Sello «Firmada por…». Va en la cabecera de la consulta. */
export function SelloFirma({ h }) {
  if (!h.firmada) return null
  return (
    <span className="flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded"
      title={`Firmada el ${fmt(h.cerrada_en)}`}>
      <Lock className="w-3 h-3" /> Firmada · {h.cerrada_por}
    </span>
  )
}

/** Botón de firmar. Solo lo ve el veterinario y solo en consultas abiertas. */
export function BotonFirmar({ h, pacienteId, onActualizada, compacto = false }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [firmando, setFirmando] = useState(false)
  if (h.firmada || !esVeterinario()) return null

  const firmar = async () => {
    if (!await confirmar({
      titulo: 'Firmar la consulta',
      mensaje: 'Al firmar, la consulta queda cerrada: ya no se podrá editar ni eliminar.',
      detalle: 'Si después hay que corregir algo, se agrega una nota de corrección que queda a la vista.',
      confirmarTexto: 'Firmar consulta',
    })) return
    setFirmando(true)
    try {
      const actualizada = await api.post(`/api/pacientes/${pacienteId}/historias/${h.id}/firmar`, {})
      onActualizada?.(actualizada)
      toast.success('Consulta firmada')
    } catch (e) {
      toast.error(e.message ?? 'No se pudo firmar la consulta.')
    } finally { setFirmando(false) }
  }

  return (
    <button onClick={firmar} disabled={firmando} title="Firmar y cerrar esta consulta"
      className={compacto
        ? 'px-3 flex items-center justify-center border-l border-white/20 hover:bg-purple-800 transition shrink-0 disabled:opacity-50'
        : 'flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 transition-colors disabled:opacity-50'}>
      <PenLine className="w-4 h-4" />{!compacto && ' Firmar'}
    </button>
  )
}

/** Notas de corrección de una consulta firmada, y el formulario para sumar una. */
export function NotasCorreccion({ h, pacienteId, onActualizada }) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  if (!h.firmada) return null
  const notas = h.addendums || []
  const puedeAgregar = esVeterinario()
  if (!notas.length && !puedeAgregar) return null

  const agregar = async () => {
    if (texto.trim().length < 5) return
    setGuardando(true)
    try {
      const actualizada = await api.post(
        `/api/pacientes/${pacienteId}/historias/${h.id}/addendum`, { texto: texto.trim() })
      onActualizada?.(actualizada)
      setTexto(''); setAbierto(false)
      toast.success('Nota de corrección agregada')
    } catch (e) {
      toast.error(e.message ?? 'No se pudo agregar la nota.')
    } finally { setGuardando(false) }
  }

  return (
    <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
      {notas.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Notas de corrección</p>
          {notas.map(n => (
            <div key={n.id} className="text-sm text-slate-800 bg-white border border-slate-200 rounded-md px-3 py-2">
              <p className="whitespace-pre-wrap">{n.texto}</p>
              <p className="text-xs text-slate-500 mt-1">{n.autor_nombre} · {fmt(n.creado_en)}</p>
            </div>
          ))}
        </div>
      )}
      {puedeAgregar && (abierto ? (
        <div className="space-y-2">
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3}
            placeholder="Qué se corrige o se agrega (por ejemplo: el peso correcto era 12.5 kg)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <div className="flex gap-2">
            <button onClick={agregar} disabled={guardando || texto.trim().length < 5}
              className="text-xs font-medium bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded px-3 py-1.5">
              Guardar nota
            </button>
            <button onClick={() => { setAbierto(false); setTexto('') }}
              className="text-xs text-slate-600 hover:text-slate-800 px-2">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAbierto(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900">
          <MessageSquarePlus className="w-4 h-4" /> Agregar nota de corrección
        </button>
      ))}
    </div>
  )
}
