import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PhoneCall, MessageCircle, Phone, Search, RefreshCw, Check, CheckCircle2,
  AlertTriangle, Send, X, Pencil, ChevronDown,
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { Cargando } from '../components/Cargando'

const fmtFecha = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}
const fmtCuando = (iso) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''

const RESULTADOS_LLAMADA = [
  { v: 'contesto',    l: 'Contestó' },
  { v: 'agendo',      l: 'Agendó cita' },
  { v: 'no_contesto', l: 'No contestó' },
  { v: 'no_interesa', l: 'No le interesa' },
]
const ETIQUETA_RESULTADO = {
  enviado: 'Mensaje enviado', contesto: 'Contestó', agendo: 'Agendó cita',
  no_contesto: 'No contestó', no_interesa: 'No le interesa',
}

const waUrl = (p) => `https://wa.me/${p.wa}?text=${encodeURIComponent(p.mensaje)}`

export default function Contactos() {
  const toast = useToast()
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [motivo, setMotivo] = useState('todos')
  const [ocultarHechos, setOcultarHechos] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [cola, setCola] = useState(null)          // { items, i } mientras se envía por lote
  const [menu, setMenu] = useState(null)          // clave con el menú de llamada abierto
  const [editandoMensajes, setEditandoMensajes] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { setDatos(await api.get('/api/contactos/pendientes')) }
    catch (e) { setError(e.message || 'No se pudo cargar la lista') }
    finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizarItem = (clave, parche) =>
    setDatos(d => d && { ...d, items: d.items.map(p => p.clave === clave ? { ...p, ...parche } : p) })

  const registrar = async (p, canal, resultado) => {
    try {
      const r = await api.post('/api/contactos/', {
        cliente_id: p.cliente_id, paciente_id: p.paciente_id, motivo: p.motivo, clave: p.clave,
        canal, resultado, mensaje: canal === 'whatsapp' ? p.mensaje : null,
        // Para que la vacuna quede avisada también en Vacunación
        vacuna: p.motivo === 'vacuna' || p.motivo === 'antiparasitario' ? p.detalle : null,
        proxima_dosis: p.clave.split(':').slice(3).join(':') || null,
      })
      actualizarItem(p.clave, {
        contactado: r.contactado, intentos: r.intentos, ultimo_contacto: r.contacto,
      })
      setMenu(null)
      return true
    } catch (e) {
      toast.error(e.message || 'No se pudo registrar el contacto')
      return false
    }
  }

  const whatsapp = async (p) => {
    window.open(waUrl(p), '_blank', 'noopener')
    await registrar(p, 'whatsapp', 'enviado')
  }

  const items = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (datos?.items ?? []).filter(p =>
      (motivo === 'todos' || p.motivo === motivo) &&
      (!ocultarHechos || !p.contactado) &&
      (!q || `${p.propietario} ${p.paciente} ${p.detalle}`.toLowerCase().includes(q)))
  }, [datos, motivo, ocultarHechos, buscar])

  const enviables = items.filter(p => p.wa && !p.contactado)
  const todasMarcadas = enviables.length > 0 && enviables.every(p => seleccion.has(p.clave))

  const alternar = (clave) => setSeleccion(s => {
    const n = new Set(s); n.has(clave) ? n.delete(clave) : n.add(clave); return n
  })
  const marcarTodas = () => setSeleccion(todasMarcadas ? new Set() : new Set(enviables.map(p => p.clave)))

  // Lote: el navegador solo deja abrir un chat por clic, así que se avanza de a uno.
  const iniciarLote = () => {
    const lista = enviables.filter(p => seleccion.has(p.clave))
    if (lista.length) setCola({ items: lista, i: 0 })
  }
  const avanzarCola = () => {
    setCola(c => {
      if (!c) return c
      const siguiente = c.i + 1
      if (siguiente >= c.items.length) { setSeleccion(new Set()); return null }
      return { ...c, i: siguiente }
    })
  }
  const enviarDeCola = async () => {
    const p = cola.items[cola.i]
    await whatsapp(p)
    avanzarCola()
  }

  // Los contadores se sacan de la lista viva, no del resumen del servidor:
  // así bajan al instante cuando se contacta a alguien.
  const faltan = (k) => (datos?.items ?? []).filter(p => !p.contactado && (k === 'todos' || p.motivo === k)).length
  const tabs = [{ k: 'todos', l: 'Todos', n: faltan('todos') },
    ...Object.entries(datos?.motivos ?? {}).map(([k, l]) => ({ k, l, n: faltan(k) }))]

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center gap-3 flex-wrap">
        <PhoneCall className="w-5 h-5 text-purple-600" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-800">Contactar clientes</h1>
          <p className="text-xs text-slate-500">A quién escribir o llamar hoy, con el mensaje ya armado.</p>
        </div>
        <button onClick={() => setEditandoMensajes(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
          <Pencil className="w-3.5 h-3.5" /> Editar mensajes
        </button>
        <button onClick={cargar} disabled={cargando}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 max-w-5xl w-full mx-auto flex flex-col gap-4 pb-24">
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button key={t.k} onClick={() => setMotivo(t.k)}
              className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${
                motivo === t.k ? 'bg-purple-700 text-white border-purple-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
              {t.l} <span className={motivo === t.k ? 'text-purple-200' : 'text-slate-500'}>· {t.n}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar dueño, mascota o vacuna"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={ocultarHechos} onChange={e => setOcultarHechos(e.target.checked)} />
            Ocultar los ya contactados
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={todasMarcadas} onChange={marcarTodas} disabled={!enviables.length} />
            Marcar todos los que tienen WhatsApp ({enviables.length})
          </label>
        </div>

        {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        {cargando && !datos ? <Cargando /> : items.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl py-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No queda nadie por contactar aquí.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map(p => (
              <li key={p.clave}
                className={`bg-white border rounded-xl px-4 py-3 flex flex-col gap-2 ${
                  p.contactado ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" disabled={!p.wa || p.contactado}
                    checked={seleccion.has(p.clave)} onChange={() => alternar(p.clave)}
                    aria-label={`Seleccionar a ${p.propietario}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button onClick={() => navigate(`/clientes/${p.cliente_id}`)}
                        className="text-sm font-semibold text-slate-800 hover:text-purple-700 hover:underline">
                        {p.propietario}
                      </button>
                      <span className="text-sm text-slate-600">· {p.paciente}</span>
                      <span className="text-[11px] font-medium bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">
                        {datos.motivos[p.motivo]}
                      </span>
                      {p.urgente && !p.contactado && (
                        <span className="flex items-center gap-1 text-[11px] font-medium bg-rose-100 text-rose-700 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" /> Atrasado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {p.detalle} · {fmtFecha(p.fecha)}
                      {p.telefono ? ` · ${p.telefono}` : ' · sin teléfono'}
                    </p>
                    {!p.wa && p.telefono && (
                      <p className="text-xs text-amber-800 mt-0.5">
                        Ese número no parece un celular: revísalo en la ficha del cliente.
                      </p>
                    )}
                    {p.ultimo_contacto && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        {p.contactado ? <Check className="w-3 h-3 inline text-emerald-600 mr-1" /> : null}
                        {ETIQUETA_RESULTADO[p.ultimo_contacto.resultado]} por{' '}
                        {p.ultimo_contacto.canal === 'whatsapp' ? 'WhatsApp' : 'llamada'} ·{' '}
                        {fmtCuando(p.ultimo_contacto.creado_en)}
                        {p.intentos > 1 ? ` · ${p.intentos} intentos` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 relative">
                    <button onClick={() => whatsapp(p)} disabled={!p.wa}
                      title={p.wa ? 'Abrir WhatsApp con el mensaje' : 'Sin celular válido'}
                      className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 text-white rounded-lg px-3 py-2">
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                    {p.telefono && (
                      <a href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`}
                        onClick={() => setMenu(p.clave)}
                        className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3 py-2">
                        <Phone className="w-4 h-4" /> Llamar
                      </a>
                    )}
                    <button onClick={() => setMenu(menu === p.clave ? null : p.clave)}
                      title="Anotar el resultado" aria-label="Anotar el resultado"
                      className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {menu === p.clave && (
                      <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48">
                        <p className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Resultado de la llamada
                        </p>
                        {RESULTADOS_LLAMADA.map(r => (
                          <button key={r.v} onClick={() => registrar(p, 'llamada', r.v)}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                            {r.l}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Barra de lote */}
      {!cola && seleccion.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 md:left-64 bg-white border-t border-slate-200 px-4 py-3 flex items-center gap-3 z-30">
          <p className="text-sm text-slate-700 flex-1">{seleccion.size} seleccionado{seleccion.size > 1 ? 's' : ''}</p>
          <button onClick={() => setSeleccion(new Set())} className="text-xs text-slate-600 px-3 py-2">Quitar selección</button>
          <button onClick={iniciarLote}
            className="flex items-center gap-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2">
            <Send className="w-4 h-4" /> Enviar por WhatsApp
          </button>
        </div>
      )}
      {cola && (
        <div className="fixed bottom-0 inset-x-0 md:left-64 bg-purple-950 text-white px-4 py-3 flex items-center gap-3 z-30">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-purple-200">Envío en lote · {cola.i + 1} de {cola.items.length}</p>
            <p className="text-sm font-medium truncate">
              {cola.items[cola.i].propietario} · {cola.items[cola.i].paciente}
            </p>
          </div>
          <button onClick={avanzarCola} className="text-xs text-purple-200 hover:text-white px-3 py-2">Omitir</button>
          <button onClick={() => { setCola(null); setSeleccion(new Set()) }}
            className="text-xs text-purple-200 hover:text-white px-3 py-2">Terminar</button>
          <button onClick={enviarDeCola}
            className="flex items-center gap-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-4 py-2">
            <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
          </button>
        </div>
      )}

      {editandoMensajes && <EditorMensajes onCerrar={(cambio) => { setEditandoMensajes(false); if (cambio) cargar() }} />}
    </div>
  )
}

function EditorMensajes({ onCerrar }) {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [textos, setTextos] = useState({})
  const [cambio, setCambio] = useState(false)

  const cargar = useCallback(async () => {
    const d = await api.get('/api/contactos/plantillas')
    setData(d)
    setTextos(Object.fromEntries(d.plantillas.map(p => [p.motivo, p.texto])))
  }, [])
  useEffect(() => { cargar().catch(() => {}) }, [cargar])

  const guardar = async (m) => {
    try {
      await api.put(`/api/contactos/plantillas/${m}`, { texto: textos[m] })
      setCambio(true); await cargar(); toast.success('Mensaje guardado')
    } catch (e) { toast.error(e.message || 'No se pudo guardar') }
  }
  const restaurar = async (m) => {
    try { await api.del(`/api/contactos/plantillas/${m}`); setCambio(true); await cargar() }
    catch (e) { toast.error(e.message || 'No se pudo restaurar') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => onCerrar(cambio)}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 sticky top-0 bg-white">
          <h2 className="text-base font-bold text-slate-800 flex-1">Mensajes para los clientes</h2>
          <button onClick={() => onCerrar(cambio)} aria-label="Cerrar" className="p-1 text-slate-500 hover:text-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!data ? <Cargando /> : (
          <div className="p-5 flex flex-col gap-5">
            <p className="text-xs text-slate-600">
              Usa estos marcadores y el sistema los reemplaza: {data.marcadores.join('  ')}
            </p>
            {data.plantillas.map(p => (
              <div key={p.motivo} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  {p.etiqueta}{p.personalizada ? ' · personalizado' : ''}
                </label>
                <textarea rows={3} value={textos[p.motivo] ?? ''}
                  onChange={e => setTextos(t => ({ ...t, [p.motivo]: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
                <div className="flex gap-2">
                  <button onClick={() => guardar(p.motivo)} disabled={textos[p.motivo] === p.texto}
                    className="text-xs font-medium bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white rounded px-3 py-1.5">
                    Guardar
                  </button>
                  {p.personalizada && (
                    <button onClick={() => restaurar(p.motivo)} className="text-xs text-slate-600 hover:text-slate-900 px-2">
                      Volver al mensaje original
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
