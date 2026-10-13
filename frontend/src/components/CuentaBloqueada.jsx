import { useState } from 'react'
import { LogOut, Lock } from 'lucide-react'
import { api, cerrarSesion } from '../services/api'
import { useSuscripcion } from '../services/suscripcion'
import { useToast } from './Toast'
import { soles } from '../utils/suscripcion'

/**
 * Pantalla completa cuando la clínica está vencida o suspendida.
 *
 * Se muestra en lugar de la aplicación: todo lo demás está cerrado por el
 * servidor, y lo único útil es saber por qué y cómo regularizarse.
 */
export default function CuentaBloqueada() {
  const toast = useToast()
  const { datos, recargar } = useSuscripcion()
  const [plan, setPlan] = useState('')
  const [enviando, setEnviando] = useState(false)
  if (!datos) return null

  const vencida = datos.estado === 'vencida'
  const elegido = plan || (vencida && datos.planes.some(p => p.codigo === datos.plan.codigo)
    ? datos.plan.codigo : datos.planes[0]?.codigo ?? '')

  const solicitar = async () => {
    setEnviando(true)
    try {
      await api.post('/api/suscripcion/solicitar', { plan: elegido, mensaje: vencida ? 'Quiero renovar mi plan' : null })
      toast.success('Listo. Te contactaremos pronto.')
      await recargar()
    } catch (e) { toast.error(e.message || 'No se pudo enviar la solicitud') }
    finally { setEnviando(false) }
  }

  const salir = () => { cerrarSesion(); window.location.href = '/login' }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-800"><Lock className="w-5 h-5" /></div>
          <h1 className="text-lg font-bold text-slate-900">
            {vencida ? 'Tu periodo de uso terminó' : 'La cuenta está suspendida'}
          </h1>
        </div>
        <p className="text-sm text-slate-700">
          {vencida
            ? 'Tus datos están a salvo y no se borró nada. Para volver a usar el sistema hay que renovar el plan.'
            : 'Tus datos están a salvo. Contacta al soporte para resolverlo.'}
        </p>

        {vencida && datos.planes.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor="plan-renovar">Plan que quieres</label>
            <select id="plan-renovar" value={elegido} onChange={e => setPlan(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white">
              {datos.planes.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre} · {soles(p.precio_mensual)} al mes</option>)}
            </select>
            {datos.solicitud_pendiente ? (
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                Ya pediste el plan {datos.solicitud_pendiente.plan}. Te contactaremos pronto.
              </p>
            ) : (
              <button onClick={solicitar} disabled={enviando || !elegido}
                className="text-sm font-semibold bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white rounded-md px-4 py-2">
                Pedir la renovación
              </button>
            )}
          </div>
        )}

        <p className="text-sm text-slate-600 border-t border-slate-100 pt-3">
          {datos.instrucciones_pago ?? 'Escríbenos para coordinar el pago.'}
        </p>
        <button onClick={salir} className="self-start flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900">
          <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
