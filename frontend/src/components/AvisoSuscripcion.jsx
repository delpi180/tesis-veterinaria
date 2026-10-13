import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useSuscripcion } from '../services/suscripcion'
import { avisosDeSuscripcion } from '../utils/suscripcion'

/** Franja sobre el contenido: lo más grave del plan, con un enlace para resolverlo. */
export default function AvisoSuscripcion() {
  const { datos } = useSuscripcion()
  const avisos = avisosDeSuscripcion(datos)
  if (!avisos.length) return null
  const [principal, ...resto] = avisos
  const urgente = principal.nivel === 'urgente'
  return (
    <div role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-6 py-2 text-sm border-b ${
        urgente ? 'bg-rose-50 text-rose-900 border-rose-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        {principal.texto}{resto.length ? ` (y ${resto.length} aviso${resto.length > 1 ? 's' : ''} más)` : ''}
      </span>
      <Link to="/suscripcion" className="font-semibold underline whitespace-nowrap">Ver mi plan</Link>
    </div>
  )
}
