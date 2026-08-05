/**
 * Tratamientos: la lista de trabajo que no existía.
 *
 * Lo indicado en una consulta se escribía y se olvidaba. No había forma de
 * saber qué mascotas están medicadas hoy, cuáles terminan esta semana ni —lo
 * que de verdad se cae entre las sillas— cuáles terminaron sin que el dueño
 * volviera nunca.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Pill, RefreshCw, Search, AlertTriangle, CheckCircle2, Clock,
  MessageCircle, Download, Ban, Undo2, CalendarClock, PackageCheck,
} from 'lucide-react'
import { api } from '../services/api'
import { Cargando } from '../components/Cargando'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { clinicaActual } from '../services/clinica'

const fmt = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO = {
  en_curso:     { label: 'En curso',      cls: 'bg-emerald-100 text-emerald-700', Icon: Clock },
  terminado:    { label: 'Terminado',     cls: 'bg-slate-100 text-slate-600',     Icon: CheckCircle2 },
  suspendido:   { label: 'Suspendido',    cls: 'bg-rose-100 text-rose-700',       Icon: Ban },
  sin_duracion: { label: 'Sin duración',  cls: 'bg-amber-100 text-amber-700',     Icon: AlertTriangle },
}

const FILTROS = [
  { key: 'en_curso',     label: 'En curso' },
  { key: 'termina',      label: 'Terminan esta semana' },
  { key: 'sin_control',  label: 'Terminó y no volvió' },
  { key: 'sin_duracion', label: 'Sin duración' },
  { key: 'todos',        label: 'Todos' },
]

const waLink = (t) => {
  const num = (t.telefono || '').replace(/\D/g, '')
  const intl = num.length === 9 ? `51${num}` : num
  const msg = t.sin_control
    ? `Hola ${t.propietario || ''}, ${t.paciente || 'su mascota'} terminó su tratamiento con *${t.medicamento}* el ${fmt(t.fin)}. ¿Cómo sigue? En ${clinicaActual().nombre} quedamos atentos para el control.`
    : `Hola ${t.propietario || ''}, le recordamos el tratamiento de ${t.paciente || 'su mascota'}: *${t.medicamento}*${t.dosis ? ` ${t.dosis}` : ''}${t.frecuencia ? `, ${t.frecuencia}` : ''}${t.fin ? `, hasta el ${fmt(t.fin)}` : ''}. ${clinicaActual().nombre}`
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}

export default function Tratamientos() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const [filtro, setFiltro] = useState('en_curso')
  const [busq, setBusq] = useState('')

  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    return api.get('/api/tratamientos/')
      .then(d => { setItems(Array.isArray(d) ? d : []); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])
  const refrescar = async () => { setRefrescando(true); await cargar(true); setRefrescando(false) }

  const cerrar = async (t, estado) => {
    let motivo = null
    if (estado === 'suspendido') {
      // El motivo del corte es información clínica: por qué se suspendió
      // (reacción adversa, no lo toleró, el dueño lo dejó) importa más que el
      // hecho de suspenderlo.
      motivo = window.prompt(`¿Por qué se suspende ${t.medicamento} en ${t.paciente}?`)
      if (motivo === null) return
      if (!motivo.trim()) { toast.error('Hace falta el motivo para suspenderlo.'); return }
    } else if (!await confirmar({
      titulo: 'Marcar como terminado',
      mensaje: `${t.medicamento} en ${t.paciente} queda cerrado como cumplido.`,
      confirmarTexto: 'Marcar terminado',
      peligroso: false,
    })) return

    try {
      const r = await api.put(`/api/tratamientos/${t.id}`, { estado, motivo })
      setItems(prev => prev.map(x => x.id === t.id ? r : x))
      toast.success(estado === 'suspendido' ? 'Tratamiento suspendido.' : 'Tratamiento terminado.')
    } catch (e) { toast.error(e.message) }
  }

  const reabrir = async (t) => {
    try {
      const r = await api.post(`/api/tratamientos/${t.id}/reabrir`, {})
      setItems(prev => prev.map(x => x.id === t.id ? r : x))
      toast.success('Tratamiento reabierto.')
    } catch (e) { toast.error(e.message) }
  }

  const term = busq.trim().toLowerCase()
  const filtrados = items.filter(t => {
    if (filtro === 'en_curso'     && t.estado !== 'en_curso') return false
    if (filtro === 'termina'      && !(t.estado === 'en_curso' && t.dias_restantes !== null && t.dias_restantes <= 7)) return false
    if (filtro === 'sin_control'  && !t.sin_control) return false
    if (filtro === 'sin_duracion' && t.estado !== 'sin_duracion') return false
    if (term) {
      const txt = `${t.paciente ?? ''} ${t.propietario ?? ''} ${t.medicamento ?? ''}`.toLowerCase()
      if (!txt.includes(term)) return false
    }
    return true
  })

  const enCurso    = items.filter(t => t.estado === 'en_curso').length
  const terminan   = items.filter(t => t.estado === 'en_curso' && t.dias_restantes !== null && t.dias_restantes <= 7).length
  const sinControl = items.filter(t => t.sin_control).length

  const exportarCSV = () => {
    const cab = ['Paciente', 'Medicamento', 'Dosis', 'Frecuencia', 'Inicio', 'Fin', 'Estado', 'Dueno', 'Telefono']
    const filas = filtrados.map(t => [
      t.paciente, t.medicamento, t.dosis ?? '', t.frecuencia ?? '',
      fmt(t.inicio), fmt(t.fin), (ESTADO[t.estado] ?? {}).label ?? t.estado,
      t.propietario, t.telefono ?? '',
    ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cab.join(','), ...filas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `tratamientos_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const hoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between flex-wrap gap-3 static md:sticky md:top-0 md:z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tratamientos</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{hoy}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportarCSV} disabled={filtrados.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={refrescar} disabled={refrescando}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-6xl w-full mx-auto">
        {/* Los tres números que importan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { n: enCurso,    l: 'Medicados hoy',        Icon: Pill,          cls: 'text-emerald-600 bg-emerald-50' },
            { n: terminan,   l: 'Terminan en 7 días',   Icon: CalendarClock, cls: 'text-amber-600 bg-amber-50' },
            { n: sinControl, l: 'Terminó y no volvió',  Icon: AlertTriangle, cls: 'text-rose-600 bg-rose-50' },
          ].map(({ n, l, Icon, cls }) => (
            <div key={l} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-800 leading-none">{n}</p>
                <p className="text-xs text-slate-500 mt-1">{l}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 flex-wrap">
            <Pill className="w-4 h-4 text-purple-500 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Seguimiento</h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">
              {filtrados.length}
            </span>
            <div className="relative w-full sm:w-auto sm:ml-auto">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text" value={busq} onChange={e => setBusq(e.target.value)}
                placeholder="Mascota, dueño o medicamento…"
                className="text-base sm:text-xs pl-8 pr-3 py-2 sm:py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white w-full sm:w-56"
              />
            </div>
          </div>

          <div className="px-4 md:px-5 py-2 border-b border-slate-100 flex gap-2 overflow-x-auto">
            {FILTROS.map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)}
                className={`text-xs font-semibold px-3 py-2 sm:py-1.5 rounded-full whitespace-nowrap transition ${
                  filtro === f.key ? 'bg-purple-700 text-white' : 'text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {loading && <Cargando texto="Cargando tratamientos…" />}

          {error && (
            <div className="mx-5 my-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              ⚠ {error}
            </div>
          )}

          {!loading && !error && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400">
              <Pill className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">
                {filtro === 'sin_control' ? 'Nadie quedó sin control. Bien ahí.' : 'Nada por acá'}
              </p>
            </div>
          )}

          {!loading && filtrados.length > 0 && (
            <div className="divide-y divide-slate-100">
              {filtrados.map(t => {
                const est = ESTADO[t.estado] ?? ESTADO.terminado
                return (
                  <div key={t.id} className="px-4 md:px-5 py-3 flex flex-col gap-2 hover:bg-slate-50/60 transition">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <button onClick={() => navigate(`/pacientes/${t.paciente_id}/historial`)}
                          className="font-semibold text-slate-800 hover:text-purple-700 transition text-left">
                          {t.paciente}
                        </button>
                        <span className="text-xs text-slate-400"> · {t.especie}</span>
                        <p className="text-sm text-slate-700">
                          {t.medicamento}
                          <span className="text-slate-500">
                            {[t.dosis, t.via, t.frecuencia].filter(Boolean).map(x => ` · ${x}`).join('')}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.entregado && (
                          <span title="Se cobró este medicamento para esta mascota"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                            <PackageCheck className="w-3 h-3" /> Entregado
                          </span>
                        )}
                        {t.producto_id && t.vencido && (
                          <span title={`El lote vence el ${fmt(t.vence_el)}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Lote vencido
                          </span>
                        )}
                        {t.producto_id && !t.vencido && t.stock === 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Sin stock
                          </span>
                        )}
                        {t.sin_control && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Sin control
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${est.cls}`}>
                          <est.Icon className="w-3 h-3" />{est.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-slate-500">
                        {t.dias
                          ? <>Del {fmt(t.inicio)} al {fmt(t.fin)} · {t.dias} día{t.dias > 1 ? 's' : ''}</>
                          : <>Desde el {fmt(t.inicio)} · <span className="text-amber-700">sin duración anotada</span></>}
                        {t.estado === 'en_curso' && t.dias_restantes !== null && (
                          <span className="text-slate-700 font-medium">
                            {' · '}{t.dias_restantes === 0 ? 'termina hoy' : `quedan ${t.dias_restantes} día${t.dias_restantes > 1 ? 's' : ''}`}
                          </span>
                        )}
                        {t.motivo_corte && <span className="text-rose-600"> · {t.motivo_corte}</span>}
                      </p>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs text-slate-400 hidden sm:inline">{t.propietario}</span>
                        {t.telefono && (
                          <a href={waLink(t)} target="_blank" rel="noopener noreferrer"
                            title="Escribir por WhatsApp"
                            className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-green-600 hover:bg-green-500 text-white transition">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        {['en_curso', 'sin_duracion'].includes(t.estado) ? (
                          <>
                            <button onClick={() => cerrar(t, 'terminado')} title="Marcar como terminado"
                              className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => cerrar(t, 'suspendido')} title="Suspender"
                              className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 transition">
                              <Ban className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => reabrir(t)} title="Reabrir"
                            className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-purple-700 hover:border-purple-300 hover:bg-purple-50 transition">
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
