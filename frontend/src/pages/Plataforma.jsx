import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Building2, Search, RefreshCw, X, Copy, KeyRound, PauseCircle, PlayCircle, Save, CalendarClock,
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { Cargando } from '../components/Cargando'
import { PanelPlanes, PanelSolicitudes, PanelPagos, SeccionSuscripcion } from '../components/PlataformaCobro'
import { soles } from '../utils/suscripcion'

const PLANES = [
  ['prueba', 'Prueba'], ['basico', 'Básico'], ['profesional', 'Profesional'], ['fundadora', 'Fundadora'],
]
const ETIQUETA_PLAN = Object.fromEntries(PLANES)

const ESTADOS = {
  activa:     { texto: 'Activa',     clase: 'bg-emerald-100 text-emerald-800' },
  vencida:    { texto: 'Vencida',    clase: 'bg-amber-100 text-amber-900' },
  suspendida: { texto: 'Suspendida', clase: 'bg-rose-100 text-rose-800' },
}

const ACCIONES = {
  suspender: 'Suspendió', reactivar: 'Reactivó', plan: 'Cambió el plan', vencimiento: 'Cambió el vencimiento',
  nota: 'Editó la nota', restablecer_clave: 'Restableció una contraseña',
  pago: 'Registró un pago', plan_edicion: 'Editó un plan', solicitud: 'Atendió una solicitud',
}

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10).split('-')
  return new Date(s[0], s[1] - 1, s[2]).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtFechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'
const hace = (iso) => {
  if (!iso) return 'Sin actividad'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
  return dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`
}

function Etiqueta({ estado }) {
  const e = ESTADOS[estado] ?? ESTADOS.activa
  return <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${e.clase}`}>{e.texto}</span>
}

function Cifra({ titulo, valor, aviso }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`text-2xl font-bold ${aviso && valor > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{valor ?? '—'}</p>
    </div>
  )
}

// ── Detalle de una clínica ───────────────────────────────────────────────────

function DetalleClinica({ id, onCerrar, onCambio }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [d, setD] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [vence, setVence] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [clave, setClave] = useState(null)

  const aplicar = useCallback((datos) => {
    setD(datos)
    setNota(datos.nota_interna ?? '')
    setVence(datos.vence_en ? String(datos.vence_en).slice(0, 10) : '')
  }, [])

  useEffect(() => {
    setD(null)
    api.get(`/api/plataforma/clinicas/${id}`).then(aplicar).catch(e => toast.error(e.message))
  }, [id, aplicar, toast])

  const cambiar = async (cuerpo, ok) => {
    setGuardando(true)
    try {
      aplicar(await api.put(`/api/plataforma/clinicas/${id}`, cuerpo))
      toast.success(ok)
      onCambio()
    } catch (e) { toast.error(e.message || 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  const suspender = async () => {
    if (motivo.trim().length < 5) { toast.error('Escribe el motivo de la suspensión.'); return }
    if (!await confirmar({
      titulo: `Suspender ${d.nombre}`,
      mensaje: 'Nadie de esta clínica podrá usar el sistema, y las sesiones abiertas se cortan ahora mismo.',
      detalle: `Motivo: ${motivo.trim()}`,
      confirmarTexto: 'Suspender', peligroso: true,
    })) return
    await cambiar({ estado: 'suspendida', motivo: motivo.trim() }, 'Clínica suspendida')
    setMotivo('')
  }

  const reactivar = () => cambiar({ estado: 'activa' }, 'Clínica reactivada')

  const restablecer = async () => {
    if (!await confirmar({
      titulo: 'Restablecer la contraseña',
      mensaje: `Se creará una contraseña temporal para ${d.administradora?.nombre ?? 'la administradora'} (${d.administradora?.usuario}).`,
      detalle: 'Sus sesiones abiertas se cerrarán. La contraseña se muestra una sola vez.',
      confirmarTexto: 'Restablecer',
    })) return
    try {
      setClave(await api.post(`/api/plataforma/clinicas/${id}/restablecer-clave`, {}))
      onCambio()
      aplicar(await api.get(`/api/plataforma/clinicas/${id}`))
    } catch (e) { toast.error(e.message || 'No se pudo restablecer') }
  }

  const copiar = async () => {
    try { await navigator.clipboard.writeText(clave.clave_temporal); toast.success('Copiada') }
    catch { toast.error('No se pudo copiar; selecciónala y cópiala a mano.') }
  }

  const campo = 'border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
      <aside className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{d?.nombre ?? 'Cargando…'}</h2>
            {d && <div className="flex items-center gap-2 mt-1"><Etiqueta estado={d.estado} />
              <span className="text-xs text-slate-500">Plan {ETIQUETA_PLAN[d.plan] ?? d.plan} · alta {fmtFecha(d.creado_en)}</span></div>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1 text-slate-500 hover:text-slate-800"><X className="w-5 h-5" /></button>
        </div>

        {!d ? <Cargando /> : (
          <div className="p-5 flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-3 text-sm">
              {[['Usuarios activos', d.usuarios], ['Clientes', d.clientes], ['Mascotas', d.pacientes],
                ['Consultas (30 días)', d.consultas_30d]].map(([t, v]) => (
                <div key={t} className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500">{t}</p><p className="font-bold text-slate-800">{v}</p>
                </div>
              ))}
              <p className="col-span-2 text-xs text-slate-500">Última actividad: {hace(d.ultima_actividad)}</p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Contacto</h3>
              <p className="text-sm text-slate-700">
                {d.administradora ? <>{d.administradora.nombre} · <span className="font-mono">{d.administradora.usuario}</span></> : 'Sin administradora activa'}
                {d.administradora?.telefono ? ` · ${d.administradora.telefono}` : ''}
              </p>
              {d.contacto && (d.contacto.email || d.contacto.telefono) && (
                <p className="text-xs text-slate-500">{[d.contacto.email, d.contacto.telefono].filter(Boolean).join(' · ')}</p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Estado</h3>
              {d.estado_guardado === 'suspendida' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                    Suspendida el {fmtFecha(d.suspendida_en)}: {d.suspendida_motivo}
                  </p>
                  <button onClick={reactivar} disabled={guardando}
                    className="flex items-center justify-center gap-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md px-3 py-2">
                    <PlayCircle className="w-4 h-4" /> Reactivar
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className={`${campo} flex-1`} placeholder="Motivo de la suspensión" value={motivo}
                    onChange={e => setMotivo(e.target.value)} />
                  <button onClick={suspender} disabled={guardando}
                    className="flex items-center gap-1.5 text-sm font-medium border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50 rounded-md px-3 py-2">
                    <PauseCircle className="w-4 h-4" /> Suspender
                  </button>
                </div>
              )}
              {d.estado === 'vencida' && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Su periodo de uso terminó el {fmtFecha(d.vence_en)}: está bloqueada hasta que lo extiendas.
                </p>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Plan
                <select className={`${campo} font-normal`} value={d.plan} disabled={guardando}
                  onChange={e => cambiar({ plan: e.target.value }, 'Plan actualizado')}>
                  {PLANES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Puede usarlo hasta
                <div className="flex gap-1">
                  <input type="date" className={`${campo} font-normal flex-1 min-w-0`} value={vence}
                    onChange={e => setVence(e.target.value)} />
                  <button onClick={() => cambiar({ vence_en: vence || null }, 'Vencimiento actualizado')}
                    disabled={guardando || vence === (d.vence_en ? String(d.vence_en).slice(0, 10) : '')}
                    aria-label="Guardar vencimiento"
                    className="px-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    <CalendarClock className="w-4 h-4" />
                  </button>
                </div>
                {d.vence_en && <button className="text-left text-xs font-normal underline text-slate-600"
                  onClick={() => cambiar({ vence_en: null }, 'Sin vencimiento')}>Quitar el vencimiento</button>}
              </label>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Nota interna <span className="font-normal text-slate-500">(la clínica no la ve)</span></h3>
              <textarea rows={3} className={campo} value={nota} onChange={e => setNota(e.target.value)} />
              <button onClick={() => cambiar({ nota_interna: nota }, 'Nota guardada')}
                disabled={guardando || nota === (d.nota_interna ?? '')}
                className="self-start flex items-center gap-1.5 text-xs font-medium bg-brand-700 hover:bg-brand-800 disabled:opacity-40 text-white rounded-md px-3 py-1.5">
                <Save className="w-3.5 h-3.5" /> Guardar nota
              </button>
            </section>

            <SeccionSuscripcion clinicaId={id} onCambio={async () => { onCambio(); aplicar(await api.get(`/api/plataforma/clinicas/${id}`)) }} />

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Equipo ({d.equipo.length})</h3>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md text-sm">
                {d.equipo.map(u => (
                  <li key={u.id} className="px-3 py-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate">{u.nombre} <span className="font-mono text-xs text-slate-500">{u.usuario}</span></span>
                    <span className="text-xs text-slate-500">{u.rol === 'recepcionista' ? 'Administra' : 'Veterinario'}{u.activo ? '' : ' · inactivo'}</span>
                  </li>
                ))}
              </ul>
              <button onClick={restablecer} disabled={!d.administradora}
                className="self-start flex items-center gap-1.5 text-xs font-medium border border-slate-300 hover:bg-slate-50 disabled:opacity-40 text-slate-700 rounded-md px-3 py-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Restablecer la contraseña de la administradora
              </button>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Historial</h3>
              {d.acciones.length === 0 ? <p className="text-sm text-slate-500">Sin acciones todavía.</p> : (
                <ul className="text-sm text-slate-700 flex flex-col gap-1.5">
                  {d.acciones.map(a => (
                    <li key={a.id}>
                      <span className="font-medium">{ACCIONES[a.accion] ?? a.accion}</span>
                      {a.detalle ? `: ${a.detalle}` : ''}
                      <span className="block text-xs text-slate-500">{a.operador} · {fmtFechaHora(a.fecha)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>

      {clave && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-xl max-w-sm w-full p-5 flex flex-col gap-3">
            <h3 className="font-bold text-slate-900">Contraseña temporal</h3>
            <p className="text-sm text-slate-600">Para <strong>{clave.nombre}</strong> (<span className="font-mono">{clave.usuario}</span>).
              Cópiala y envíasela por un canal seguro: <strong>no se volverá a mostrar</strong>.</p>
            <p className="font-mono text-lg bg-slate-100 rounded-md px-3 py-2 text-center select-all">{clave.clave_temporal}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={copiar} className="flex items-center gap-1.5 text-sm border border-slate-300 rounded-md px-3 py-2 hover:bg-slate-50">
                <Copy className="w-4 h-4" /> Copiar
              </button>
              <button onClick={() => setClave(null)} className="text-sm font-medium bg-brand-700 hover:bg-brand-800 text-white rounded-md px-4 py-2">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function Plataforma() {
  const toast = useToast()
  const [resumen, setResumen] = useState(null)
  const [clinicas, setClinicas] = useState(null)
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [vista, setVista] = useState('clinicas')
  const [acciones, setAcciones] = useState([])
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [r, c, a] = await Promise.all([
        api.get('/api/plataforma/resumen'), api.get('/api/plataforma/clinicas'),
        api.get('/api/plataforma/acciones?limite=50'),
      ])
      setResumen(r); setClinicas(c); setAcciones(a)
    } catch (e) { toast.error(e.message || 'No se pudo cargar') }
    finally { setCargando(false) }
  }, [toast])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (clinicas ?? []).filter(c =>
      (!estado || c.estado === estado) &&
      (!t || c.nombre.toLowerCase().includes(t) ||
        (c.administradora && `${c.administradora.nombre} ${c.administradora.usuario}`.toLowerCase().includes(t))))
  }, [clinicas, q, estado])

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-brand-600" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-900">Clínicas</h1>
          <p className="text-xs text-slate-500">Operación de la plataforma. Aquí no se ven datos clínicos de nadie.</p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 max-w-6xl w-full mx-auto flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Cifra titulo="Clínicas" valor={resumen?.clinicas} />
          <Cifra titulo="Activas" valor={resumen?.activas} />
          <Cifra titulo="Suspendidas" valor={resumen?.suspendidas} aviso />
          <Cifra titulo="Vencidas" valor={resumen?.vencidas} aviso />
          <Cifra titulo="En prueba" valor={resumen?.en_prueba} />
          <Cifra titulo="Vencen en 7 días" valor={resumen?.por_vencer_7d} aviso />
          <Cifra titulo="Altas (30 días)" valor={resumen?.nuevas_30d} />
          <Cifra titulo="Consultas (30 días)" valor={resumen?.consultas_30d} />
          <Cifra titulo="Ingresos del mes" valor={resumen ? soles(resumen.ingresos_mes) : null} />
          <Cifra titulo="Recurrente mensual" valor={resumen ? soles(resumen.mrr) : null} />
          <Cifra titulo="Solicitudes de plan" valor={resumen?.solicitudes_pendientes} aviso />
        </div>

        <div className="flex gap-2 border-b border-slate-200">
          {[['clinicas', 'Clínicas'], ['solicitudes', `Solicitudes${resumen?.solicitudes_pendientes ? ` (${resumen.solicitudes_pendientes})` : ''}`],
            ['pagos', 'Pagos'], ['planes', 'Planes'], ['actividad', 'Actividad del operador']].map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${vista === k
                ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{t}</button>
          ))}
        </div>

        {vista === 'clinicas' ? (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar clínica o administradora"
                  className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </div>
              <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Filtrar por estado"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Todos los estados</option>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
              </select>
            </div>

            {clinicas === null ? <Cargando /> : visibles.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl py-10 text-center">
                No hay clínicas con ese filtro.</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 text-left border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2 font-semibold">Clínica</th>
                      <th className="px-3 py-2 font-semibold">Estado</th>
                      <th className="px-3 py-2 font-semibold">Plan</th>
                      <th className="px-3 py-2 font-semibold">Vence</th>
                      <th className="px-3 py-2 font-semibold text-right">Usuarios</th>
                      <th className="px-3 py-2 font-semibold text-right">Clientes</th>
                      <th className="px-3 py-2 font-semibold text-right">Consultas 30 d</th>
                      <th className="px-3 py-2 font-semibold">Actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(c => (
                      <tr key={c.id} onClick={() => setAbierta(c.id)} tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') setAbierta(c.id) }}
                        className="border-b border-slate-50 hover:bg-brand-50 cursor-pointer focus:outline-none focus:bg-brand-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{c.nombre}</p>
                          <p className="text-xs text-slate-500">{c.administradora ? `${c.administradora.nombre} · ${c.administradora.usuario}` : 'Sin administradora'}</p>
                        </td>
                        <td className="px-3 py-2.5"><Etiqueta estado={c.estado} /></td>
                        <td className="px-3 py-2.5 text-slate-700">{ETIQUETA_PLAN[c.plan] ?? c.plan}</td>
                        <td className="px-3 py-2.5 text-slate-700">{c.vence_en ? fmtFecha(c.vence_en) : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{c.usuarios}</td>
                        <td className="px-3 py-2.5 text-right">{c.clientes}</td>
                        <td className="px-3 py-2.5 text-right">{c.consultas_30d}</td>
                        <td className="px-3 py-2.5 text-slate-600">{hace(c.ultima_actividad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : vista === 'solicitudes' ? (
          <PanelSolicitudes onAbrir={setAbierta} onCambio={cargar} />
        ) : vista === 'pagos' ? (
          <PanelPagos />
        ) : vista === 'planes' ? (
          <PanelPlanes />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl">
            {acciones.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">Todavía no hay acciones.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {acciones.map(a => (
                  <li key={a.id} className="px-4 py-2.5">
                    <span className="font-medium text-slate-900">{a.clinica ?? '—'}</span>
                    <span className="text-slate-700"> · {ACCIONES[a.accion] ?? a.accion}{a.detalle ? `: ${a.detalle}` : ''}</span>
                    <span className="block text-xs text-slate-500">{a.operador} · {fmtFechaHora(a.fecha)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {abierta && <DetalleClinica id={abierta} onCerrar={() => setAbierta(null)} onCambio={cargar} />}
    </div>
  )
}
