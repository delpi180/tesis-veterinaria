import { useState, useEffect, useCallback } from 'react'
import { Save, CheckCircle2 } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from './Toast'
import { Cargando } from './Cargando'
import { soles, textoTope } from '../utils/suscripcion'

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtFechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'

const METODOS = [['yape', 'Yape'], ['plin', 'Plin'], ['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta'], ['otro', 'Otro']]

const campo = 'border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400'

// ── Planes ───────────────────────────────────────────────────────────────────

const TOPES = [
  ['max_usuarios', 'Usuarios'], ['max_mascotas', 'Mascotas'],
  ['max_almacenamiento_mb', 'MB docs'], ['max_ia_mes', 'IA / mes'],
]

function FilaPlan({ plan, onGuardado }) {
  const toast = useToast()
  const [f, setF] = useState(plan)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setF(plan) }, [plan])
  const cambiado = JSON.stringify(f) !== JSON.stringify(plan)

  const guardar = async () => {
    setGuardando(true)
    try {
      const cuerpo = {
        nombre: f.nombre, precio_mensual: Number(f.precio_mensual), incluye_planilla: f.incluye_planilla,
        incluye_contactos: f.incluye_contactos, publico: f.publico,
        // Vacío = sin límite (null explícito)
        ...Object.fromEntries(TOPES.map(([k]) => [k, f[k] === '' || f[k] == null ? null : Number(f[k])])),
      }
      onGuardado(await api.put(`/api/plataforma/planes/${plan.codigo}`, cuerpo))
      toast.success(`Plan ${f.nombre} guardado`)
    } catch (e) { toast.error(e.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const num = 'w-20 text-right ' + campo
  return (
    <tr className="border-b border-slate-100 align-middle">
      <td className="px-3 py-2"><input className={`${campo} w-32`} value={f.nombre} aria-label={`Nombre del plan ${plan.codigo}`}
        onChange={e => setF({ ...f, nombre: e.target.value })} />
        <span className="block text-[11px] text-slate-500 font-mono">{plan.codigo}</span></td>
      <td className="px-2 py-2"><input type="number" min="0" step="0.01" className={num} value={f.precio_mensual}
        aria-label={`Precio de ${plan.codigo}`} onChange={e => setF({ ...f, precio_mensual: e.target.value })} /></td>
      {TOPES.map(([k, t]) => (
        <td key={k} className="px-2 py-2">
          <input type="number" min="0" className={num} placeholder="∞" value={f[k] ?? ''} aria-label={`${t} de ${plan.codigo}`}
            onChange={e => setF({ ...f, [k]: e.target.value })} />
        </td>
      ))}
      {['incluye_planilla', 'incluye_contactos', 'publico'].map(k => (
        <td key={k} className="px-2 py-2 text-center">
          <input type="checkbox" checked={!!f[k]} aria-label={`${k} de ${plan.codigo}`}
            onChange={e => setF({ ...f, [k]: e.target.checked })} />
        </td>
      ))}
      <td className="px-2 py-2">
        <button onClick={guardar} disabled={!cambiado || guardando} aria-label={`Guardar plan ${plan.codigo}`}
          className="flex items-center gap-1 text-xs font-medium bg-brand-700 hover:bg-brand-800 disabled:opacity-30 text-white rounded-md px-2.5 py-1.5">
          <Save className="w-3.5 h-3.5" /> Guardar
        </button>
      </td>
    </tr>
  )
}

export function PanelPlanes() {
  const toast = useToast()
  const [planes, setPlanes] = useState(null)
  useEffect(() => {
    api.get('/api/plataforma/planes').then(setPlanes).catch(e => toast.error(e.message))
  }, [toast])
  if (!planes) return <Cargando />
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-xs text-slate-500 text-left border-b border-slate-100 bg-slate-50">
            <th className="px-3 py-2 font-semibold">Plan</th>
            <th className="px-2 py-2 font-semibold">Precio / mes (S/)</th>
            {TOPES.map(([k, t]) => <th key={k} className="px-2 py-2 font-semibold">{t}</th>)}
            <th className="px-2 py-2 font-semibold text-center">Planilla</th>
            <th className="px-2 py-2 font-semibold text-center">Contactos</th>
            <th className="px-2 py-2 font-semibold text-center">Se ofrece</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {planes.map(p => <FilaPlan key={p.codigo} plan={p}
            onGuardado={nuevo => setPlanes(ps => ps.map(x => x.codigo === nuevo.codigo ? nuevo : x))} />)}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 px-4 py-3 border-t border-slate-100">
        Un tope vacío (∞) es sin límite. Los cambios rigen de inmediato para todas las clínicas de ese plan.
        Bajar un tope por debajo de lo que una clínica ya tiene no le borra nada: solo le impide agregar más.
        Los precios y topes iniciales son ejemplos: ajústalos a tu negocio.
      </p>
    </div>
  )
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

export function PanelSolicitudes({ onAbrir, onCambio }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const cargar = useCallback(() => {
    api.get('/api/plataforma/solicitudes').then(setLista).catch(e => toast.error(e.message))
  }, [toast])
  useEffect(() => { cargar() }, [cargar])

  const atender = async (s) => {
    try { await api.post(`/api/plataforma/solicitudes/${s.id}/atender`, {}); cargar(); onCambio?.() }
    catch (e) { toast.error(e.message || 'No se pudo marcar') }
  }
  if (!lista) return <Cargando />
  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      {lista.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">No hay solicitudes pendientes.</p> : (
        <ul className="divide-y divide-slate-100">
          {lista.map(s => (
            <li key={s.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm"><button onClick={() => onAbrir(s.clinica_id)} className="font-semibold text-slate-900 hover:underline">{s.clinica}</button>
                  <span className="text-slate-700"> pide el plan <strong>{s.plan}</strong></span></p>
                {s.mensaje && <p className="text-sm text-slate-600">“{s.mensaje}”</p>}
                <p className="text-xs text-slate-500">{s.creada_por} · {fmtFechaHora(s.creada_en)}</p>
              </div>
              <button onClick={() => onAbrir(s.clinica_id)}
                className="text-xs font-medium border border-slate-300 hover:bg-slate-50 rounded-md px-3 py-1.5">Abrir y registrar el pago</button>
              <button onClick={() => atender(s)}
                className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 px-2 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar atendida
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Pagos ────────────────────────────────────────────────────────────────────

export function PanelPagos() {
  const toast = useToast()
  const [pagos, setPagos] = useState(null)
  useEffect(() => { api.get('/api/plataforma/pagos?limite=100').then(setPagos).catch(e => toast.error(e.message)) }, [toast])
  if (!pagos) return <Cargando />
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
      {pagos.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">Todavía no hay pagos registrados.</p> : (
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-slate-500 text-left border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2 font-semibold">Fecha</th><th className="px-3 py-2 font-semibold">Clínica</th>
              <th className="px-3 py-2 font-semibold">Plan</th><th className="px-3 py-2 font-semibold">Cubre hasta</th>
              <th className="px-3 py-2 font-semibold">Método</th><th className="px-3 py-2 font-semibold text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map(p => (
              <tr key={p.id} className="border-b border-slate-50 text-slate-700">
                <td className="px-4 py-2">{fmtFechaHora(p.fecha)}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{p.clinica}</td>
                <td className="px-3 py-2">{p.plan_nombre}</td>
                <td className="px-3 py-2">{fmtFecha(p.hasta)}</td>
                <td className="px-3 py-2">{p.metodo}{p.referencia ? ` · ${p.referencia}` : ''}</td>
                <td className="px-3 py-2 text-right font-medium">{soles(p.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Sección dentro del detalle de una clínica ────────────────────────────────

const ETIQUETAS_USO = [['usuarios', 'Usuarios'], ['mascotas', 'Mascotas'], ['almacenamiento', 'Documentos'], ['ia', 'IA este mes']]

export function SeccionSuscripcion({ clinicaId, onCambio }) {
  const toast = useToast()
  const [s, setS] = useState(null)
  const [planes, setPlanes] = useState([])
  const [f, setF] = useState({ plan: '', meses: 1, monto: '', metodo: 'yape', referencia: '', nota: '', reactivar: false })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [datos, lista] = await Promise.all([
        api.get(`/api/plataforma/clinicas/${clinicaId}/suscripcion`), api.get('/api/plataforma/planes')])
      setS(datos); setPlanes(lista)
      setF(prev => ({ ...prev, plan: prev.plan || datos.solicitudes.find(x => x.estado === 'pendiente')?.plan || datos.plan.codigo }))
    } catch (e) { toast.error(e.message) }
  }, [clinicaId, toast])
  useEffect(() => { cargar() }, [cargar])

  const precio = planes.find(p => p.codigo === f.plan)?.precio_mensual ?? 0
  const registrar = async () => {
    setGuardando(true)
    try {
      const r = await api.post(`/api/plataforma/clinicas/${clinicaId}/pagos`, {
        plan: f.plan, meses: Number(f.meses), metodo: f.metodo, reactivar: f.reactivar,
        monto: f.monto === '' ? null : Number(f.monto), referencia: f.referencia || null, nota: f.nota || null,
      })
      toast.success(r.creado ? 'Pago registrado' : 'Ese pago ya estaba registrado: no se acreditó otra vez')
      setF(p => ({ ...p, monto: '', referencia: '', nota: '', reactivar: false }))
      await cargar(); onCambio?.()
    } catch (e) { toast.error(e.message || 'No se pudo registrar el pago') }
    finally { setGuardando(false) }
  }

  if (!s) return <Cargando />
  const pendiente = s.solicitudes.find(x => x.estado === 'pendiente')
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-700">Suscripción</h3>
      <p className="text-sm text-slate-700">
        Plan <strong>{s.plan.nombre}</strong> · {soles(s.plan.precio_mensual)} al mes ·{' '}
        {s.vence_en ? `hasta el ${fmtFecha(s.vence_en)}` : 'sin vencimiento'}
      </p>
      {pendiente && <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
        Pide el plan <strong>{pendiente.plan}</strong>{pendiente.mensaje ? `: “${pendiente.mensaje}”` : ''}.</p>}

      <div className="grid grid-cols-2 gap-2 text-sm">
        {ETIQUETAS_USO.map(([k, t]) => {
          const r = s.limites[k]
          return (
            <div key={k} className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500">{t}</p>
              <p className={`font-semibold ${r.porcentaje >= 100 ? 'text-rose-700' : 'text-slate-800'}`}>
                {r.uso.toLocaleString('es-PE')}{r.unidad ? ` ${r.unidad}` : ''} <span className="font-normal text-slate-500">/ {textoTope(r.limite, r.unidad)}</span>
              </p>
            </div>
          )
        })}
      </div>

      <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-3">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Registrar un pago</h4>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Plan
            <select className={`${campo} font-normal`} value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })}>
              {planes.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Meses
            <input type="number" min="1" max="24" className={`${campo} font-normal`} value={f.meses}
              onChange={e => setF({ ...f, meses: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Monto (S/)
            <input type="number" min="0" step="0.01" className={`${campo} font-normal`} value={f.monto}
              placeholder={String((precio * (Number(f.meses) || 1)).toFixed(2))} onChange={e => setF({ ...f, monto: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Método
            <select className={`${campo} font-normal`} value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
              {METODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select></label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">Referencia (n.º de operación)
            <input className={`${campo} font-normal`} value={f.referencia} placeholder="Evita acreditar dos veces el mismo pago"
              onChange={e => setF({ ...f, referencia: e.target.value })} /></label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">Nota
            <input className={`${campo} font-normal`} value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></label>
        </div>
        {s.estado === 'suspendida' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.reactivar} onChange={e => setF({ ...f, reactivar: e.target.checked })} />
            Reactivar la clínica (está suspendida)
          </label>
        )}
        <button onClick={registrar} disabled={guardando || !f.plan}
          className="self-start text-sm font-medium bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white rounded-md px-4 py-2">
          Registrar pago
        </button>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Pagos</h4>
        {s.pagos.length === 0 ? <p className="text-sm text-slate-500">Sin pagos todavía.</p> : (
          <ul className="text-sm text-slate-700 flex flex-col gap-1.5">
            {s.pagos.map(p => (
              <li key={p.id}><span className="font-medium">{soles(p.monto)}</span> · {p.plan_nombre} · {p.meses} mes{p.meses > 1 ? 'es' : ''}
                {' '}· hasta {fmtFecha(p.hasta)}
                <span className="block text-xs text-slate-500">{p.metodo}{p.referencia ? ` · ${p.referencia}` : ''} · {p.registrado_por} · {fmtFechaHora(p.fecha)}</span></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
