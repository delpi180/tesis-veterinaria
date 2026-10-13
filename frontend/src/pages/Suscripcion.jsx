import { useState } from 'react'
import { CreditCard, Check, Minus, Info } from 'lucide-react'
import { api } from '../services/api'
import { useSuscripcion } from '../services/suscripcion'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { Cargando } from '../components/Cargando'
import { soles, textoTope } from '../utils/suscripcion'

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO = {
  activa: ['Activa', 'bg-emerald-100 text-emerald-800'],
  vencida: ['Vencida', 'bg-amber-100 text-amber-900'],
  suspendida: ['Suspendida', 'bg-rose-100 text-rose-800'],
}

const RECURSOS = [
  ['usuarios', 'Usuarios activos'], ['mascotas', 'Mascotas'],
  ['almacenamiento', 'Documentos'], ['ia', 'Usos de IA este mes'],
]

function Barra({ titulo, r }) {
  const pct = r.porcentaje
  const color = pct == null ? 'bg-brand-500' : pct >= 100 ? 'bg-rose-600' : pct >= 90 ? 'bg-amber-500' : 'bg-brand-600'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{titulo}</span>
        <span className="text-slate-600">
          {r.uso.toLocaleString('es-PE')}{r.unidad ? ` ${r.unidad}` : ''} de {textoTope(r.limite, r.unidad)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar"
        aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={titulo}>
        <div className={`h-full ${color}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )
}

const Si = () => <Check className="w-4 h-4 text-emerald-600 inline" aria-label="Incluido" />
const No = () => <Minus className="w-4 h-4 text-slate-400 inline" aria-label="No incluido" />

export default function Suscripcion() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { datos, cargando, recargar } = useSuscripcion()
  const [enviando, setEnviando] = useState(false)

  if (cargando && !datos) return <Cargando />
  if (!datos) return <p className="p-6 text-sm text-slate-600">No se pudo cargar tu suscripción.</p>

  const [textoEstado, claseEstado] = ESTADO[datos.estado] ?? ESTADO.activa
  const sinCosto = datos.plan.precio_mensual === 0

  const pedir = async (p) => {
    if (!await confirmar({
      titulo: `Pedir el plan ${p.nombre}`,
      mensaje: `${soles(p.precio_mensual)} al mes. Te contactaremos para coordinar el pago y activarlo.`,
      confirmarTexto: 'Enviar solicitud',
    })) return
    setEnviando(true)
    try {
      await api.post('/api/suscripcion/solicitar', { plan: p.codigo })
      toast.success('Solicitud enviada. Te contactaremos pronto.')
      await recargar()
    } catch (e) { toast.error(e.message || 'No se pudo enviar la solicitud') }
    finally { setEnviando(false) }
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-brand-600" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">Mi plan</h1>
          <p className="text-xs text-slate-500">Qué incluye, cuánto usas y cómo pagar.</p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 max-w-4xl w-full mx-auto flex flex-col gap-5">
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Plan {datos.plan.nombre}</h2>
              <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${claseEstado}`}>{textoEstado}</span>
            </div>
            {datos.plan.descripcion && <p className="text-sm text-slate-600 mt-0.5">{datos.plan.descripcion}</p>}
            <p className="text-sm text-slate-700 mt-2">
              {sinCosto ? 'Sin costo' : `${soles(datos.plan.precio_mensual)} al mes`}
            </p>
          </div>
          <div className="text-sm text-slate-700">
            <p className="text-xs text-slate-500">Puedes usarlo hasta</p>
            <p className="font-semibold">{datos.vence_en ? fmtFecha(datos.vence_en) : 'Sin vencimiento'}</p>
            {datos.dias_restantes != null && datos.dias_restantes >= 0 && (
              <p className="text-xs text-slate-500">Faltan {datos.dias_restantes} día{datos.dias_restantes === 1 ? '' : 's'}</p>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700">Lo que usas</h2>
          {RECURSOS.map(([k, t]) => <Barra key={k} titulo={t} r={datos.limites[k]} />)}
          <p className="text-xs text-slate-500">
            Si llegas a un tope, lo que ya tienes se conserva: solo no podrás agregar más hasta pasar a un plan mayor.
          </p>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-700">Planes</h2>
          {datos.solicitud_pendiente && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              Pediste el plan <strong>{datos.solicitud_pendiente.plan}</strong> el {fmtFecha(datos.solicitud_pendiente.creada_en)}.
              Te contactaremos pronto.
            </p>
          )}
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2 font-semibold"></th>
                {datos.planes.map(p => (
                  <th key={p.codigo} className="py-2 font-semibold text-slate-800">
                    {p.nombre}{p.codigo === datos.plan.codigo ? ' · actual' : ''}
                    <span className="block font-normal text-slate-500">{soles(p.precio_mensual)} al mes</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {[
                ['Usuarios activos', p => textoTope(p.max_usuarios)],
                ['Mascotas', p => textoTope(p.max_mascotas)],
                ['Documentos', p => textoTope(p.max_almacenamiento_mb, 'MB')],
                ['Usos de IA por mes', p => textoTope(p.max_ia_mes)],
                ['Planilla del personal', p => p.incluye_planilla ? <Si /> : <No />],
                ['Contacto con clientes', p => p.incluye_contactos ? <Si /> : <No />],
              ].map(([t, f]) => (
                <tr key={t} className="border-b border-slate-50">
                  <td className="py-2 pr-3 text-slate-600">{t}</td>
                  {datos.planes.map(p => <td key={p.codigo} className="py-2">{f(p)}</td>)}
                </tr>
              ))}
              <tr>
                <td />
                {datos.planes.map(p => (
                  <td key={p.codigo} className="py-3">
                    {p.codigo === datos.plan.codigo ? <span className="text-xs text-slate-500">Tu plan</span> : (
                      <button onClick={() => pedir(p)} disabled={enviando || !!datos.solicitud_pendiente}
                        className="text-xs font-semibold border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-40 rounded-md px-3 py-1.5">
                        Pedir este plan
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Cómo pagar</h2>
          <p className="text-sm text-slate-700 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
            {datos.instrucciones_pago ?? 'Escríbenos para coordinar el pago.'}
          </p>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-2 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-700">Tus pagos</h2>
          {datos.pagos.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay pagos registrados.</p> : (
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2 font-semibold">Fecha</th><th className="py-2 font-semibold">Plan</th>
                  <th className="py-2 font-semibold">Periodo</th><th className="py-2 font-semibold text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {datos.pagos.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 text-slate-700">
                    <td className="py-2">{fmtFecha(p.fecha)}</td>
                    <td className="py-2">{p.plan_nombre}</td>
                    <td className="py-2">{fmtFecha(p.desde)} → {fmtFecha(p.hasta)}</td>
                    <td className="py-2 text-right font-medium">{soles(p.monto)}</td>
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
