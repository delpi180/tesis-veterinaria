import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { CheckCircle, ClipboardList, BarChart3, Cpu, Check, RefreshCw, Sparkles, Zap, Timer, Clock, Target, Hand, Gauge, ShieldCheck, AlertTriangle, Sigma } from 'lucide-react'
import { api } from '../services/api'

// Color del badge de Cronbach's alpha según fiabilidad
const alphaColor = (a) =>
  a == null ? 'bg-slate-100 text-slate-500'
  : a >= 0.8 ? 'bg-emerald-100 text-emerald-700'
  : a >= 0.7 ? 'bg-sky-100 text-sky-700'
  : a >= 0.6 ? 'bg-amber-100 text-amber-700'
  : 'bg-rose-100 text-rose-700'

const fmtN = (v) => (v == null ? '—' : v)

// ── Panel: Rigor estadístico (descriptivos + IC + Cronbach + interpretación) ──
function PanelEstadistico({ estad }) {
  if (!estad) return null
  const { sus, tam, n_evaluadores, muestra_suficiente } = estad
  const ip = sus.interpretacion || {}

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Sigma className="w-5 h-5 text-purple-600" />
        <h3 className="text-sm font-bold text-slate-800">Rigor estadístico</h3>
        <span className="text-xs text-slate-400">N = {n_evaluadores} evaluadores</span>
      </div>

      {!muestra_suficiente && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Muestra pequeña (N = {n_evaluadores}). Los resultados son válidos pero la potencia estadística es limitada;
            para la sustentación se recomienda <strong>N ≥ 12</strong>.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SUS */}
        <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">SUS</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alphaColor(sus.alpha)}`}>
              α = {fmtN(sus.alpha)} · {sus.alpha_interp}
            </span>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-800">{fmtN(sus.media)}<span className="text-base font-bold text-slate-400"> ± {fmtN(sus.sd)}</span></p>
            <p className="text-xs text-slate-400">Media ± DE · Mediana {fmtN(sus.mediana)} · Rango {fmtN(sus.min)}–{fmtN(sus.max)}</p>
            <p className="text-xs text-slate-500 mt-1">IC 95%: <strong>[{fmtN(sus.ic95_low)} – {fmtN(sus.ic95_high)}]</strong></p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{ip.adjetivo}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ip.aceptabilidad === 'Aceptable' ? 'bg-emerald-100 text-emerald-700' : ip.aceptabilidad === 'Marginal' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{ip.aceptabilidad}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Percentil {fmtN(ip.percentil)}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Nota {ip.nota}</span>
          </div>
        </div>

        {/* TAM */}
        <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">TAM</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alphaColor(tam.alpha_global)}`}>
              α global = {fmtN(tam.alpha_global)} · {tam.alpha_global_interp}
            </span>
          </div>
          {[
            { k: 'utilidad',  l: 'Utilidad percibida' },
            { k: 'facilidad', l: 'Facilidad de uso' },
            { k: 'intencion', l: 'Intención de uso' },
          ].map(({ k, l }) => {
            const d = tam[k] || {}
            return (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">{l}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-slate-800">{fmtN(d.media)} <span className="text-xs text-slate-400">± {fmtN(d.sd)}</span></span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${alphaColor(d.alpha)}`}>α {fmtN(d.alpha)}</span>
                </div>
              </div>
            )
          })}
          <p className="text-xs text-slate-400 mt-1">Escala 1–7 · Media ± DE por dimensión</p>
        </div>
      </div>
    </div>
  )
}

const fmtSeg = (s) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return m ? `${m}m ${r}s` : `${r}s`
}

// ── Panel: Tiempo de registro (manual vs IA) ─────────────────────────────────
function TiemposPanel() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = () => {
    setLoading(true)
    api.get('/api/encuestas/tiempos').then(setD).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])

  if (loading) return <p className="text-xs text-slate-400 py-6 text-center">Cargando tiempos…</p>
  if (!d || d.total === 0) return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl py-10 text-center">
      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm font-medium text-slate-500">Aún no hay registros cronometrados</p>
      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
        Registra historias en <strong>Consultas</strong> — a mano y con voz/IA — y el sistema medirá el tiempo automáticamente.
      </p>
    </div>
  )

  const chart = [
    { metodo: 'Manual', seg: d.manual.promedio_seg || 0, fill: '#f59e0b' },
    { metodo: 'Con IA', seg: d.ia.promedio_seg || 0, fill: '#7c3aed' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Promedio manual</p><Hand className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtSeg(d.manual.promedio_seg)}</p>
          <p className="text-xs text-slate-400">{d.manual.n} reg.{d.manual.sd_seg != null ? ` · DE ${fmtSeg(d.manual.sd_seg)}` : ''}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Promedio con IA</p><Sparkles className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{fmtSeg(d.ia.promedio_seg)}</p>
          <p className="text-xs text-slate-400">{d.ia.n} reg.{d.ia.sd_seg != null ? ` · DE ${fmtSeg(d.ia.sd_seg)}` : ''}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Ahorro de tiempo</p><Zap className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600">{d.ahorro_pct != null ? `${d.ahorro_pct}%` : '—'}</p>
          <p className="text-xs text-slate-400">IA vs. manual</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Total medido</p><Timer className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{d.total}</p>
          <p className="text-xs text-slate-400">historias</p>
        </div>
      </div>

      {/* Significancia estadística (prueba t de Welch) */}
      {d.prueba_t && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${d.prueba_t.significativo ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <ShieldCheck className={`w-5 h-5 mt-0.5 shrink-0 ${d.prueba_t.significativo ? 'text-emerald-600' : 'text-slate-400'}`} />
          <div className="text-sm">
            <p className={`font-semibold ${d.prueba_t.significativo ? 'text-emerald-800' : 'text-slate-600'}`}>
              {d.prueba_t.significativo
                ? 'La diferencia de tiempo es estadísticamente significativa'
                : 'La diferencia aún no es estadísticamente significativa'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Prueba t de Welch: t = {d.prueba_t.t}, gl = {d.prueba_t.df}, <strong>p {d.prueba_t.p < 0.001 ? '< 0.001' : `= ${d.prueba_t.p}`}</strong>
              {' · '}Tamaño del efecto (Cohen's d) = {d.prueba_t.cohen_d} (<span className="capitalize">{d.prueba_t.efecto}</span>)
            </p>
          </div>
        </div>
      )}

      {/* Gráfico comparativo */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3">Tiempo promedio de registro</h4>
        {(d.manual.n === 0 || d.ia.n === 0) && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Para comparar necesitas registros de ambos métodos (manual y con IA).
          </p>
        )}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="metodo" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 60) || v + 's'}`} />
            <Tooltip formatter={(v) => [fmtSeg(v), 'Promedio']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <Bar dataKey="seg" radius={[6, 6, 0, 0]} barSize={70}>
              {chart.map((e, i) => <Cell key={i} fill={e.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Historial de registros cronometrados */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Timer className="w-4 h-4 text-purple-500" />
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Historial de registros</h4>
          <span className="ml-auto text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{d.recientes.length}</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 sticky top-0 bg-white">
                <th className="text-left px-5 py-2.5 font-semibold">Fecha</th>
                <th className="text-left px-5 py-2.5 font-semibold">Paciente</th>
                <th className="text-center px-5 py-2.5 font-semibold">Método</th>
                <th className="text-right px-5 py-2.5 font-semibold">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {d.recientes.map((h, i) => (
                <tr key={h.id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                  <td className="px-5 py-2.5 text-xs text-slate-500">
                    {h.fecha ? new Date(h.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-2.5 font-medium text-slate-700">{h.paciente}</td>
                  <td className="px-5 py-2.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${h.metodo === 'ia' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                      {h.metodo === 'ia' ? 'Con IA' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right font-bold text-slate-700">{fmtSeg(h.segundos)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  )
}

// ── Panel: Exactitud vs. referencia ──────────────────────────────────────────
const ACC_CAMPOS = [
  { k: 'motivo_consulta',        l: 'Motivo de consulta' },
  { k: 'diagnostico_presuntivo', l: 'Dx presuntivo' },
  { k: 'temperatura_c',          l: 'Temperatura (°C)' },
  { k: 'peso_kg',                l: 'Peso (kg)' },
  { k: 'frecuencia_cardiaca',    l: 'Frec. cardiaca' },
  { k: 'mucosas',                l: 'Mucosas' },
  { k: 'hidratacion',            l: 'Hidratación' },
  { k: 'indicaciones',           l: 'Indicaciones' },
]
const ACC_EJEMPLO = 'Perro labrador viene por vómitos y diarrea hace dos días. Temperatura 39.2, mucosas pálidas, un poco deshidratado. Sospecho gastroenteritis. Le indico dieta blanda y reposo.'
const ESTADO_ACC = {
  correcto:    { pill: 'bg-emerald-100 text-emerald-700', label: 'Correcto' },
  omitido:     { pill: 'bg-amber-100 text-amber-700',     label: 'Omitido' },
  extra:       { pill: 'bg-sky-100 text-sky-700',         label: 'Extra' },
  incorrecto:  { pill: 'bg-rose-100 text-rose-700',       label: 'Incorrecto' },
  '—':         { pill: 'bg-slate-100 text-slate-400',     label: '—' },
}

function ExactitudPanel() {
  const [texto, setTexto] = useState(ACC_EJEMPLO)
  const [ref, setRef] = useState({
    motivo_consulta: 'vómitos y diarrea', diagnostico_presuntivo: 'gastroenteritis',
    temperatura_c: '39.2', mucosas: 'palidas', hidratacion: 'leve_5',
    indicaciones: 'dieta blanda y reposo',
  })
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const evaluar = async () => {
    if (!texto.trim()) { setError('Ingresa la transcripción.'); return }
    setLoading(true); setError(null); setRes(null)
    try {
      const referencia = Object.fromEntries(Object.entries(ref).filter(([, v]) => v !== ''))
      setRes(await api.post('/api/comparar-exactitud', { texto, referencia }))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const Metrica = ({ label, val, suf = '' }) => (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-center">
      <p className="text-2xl font-black text-slate-800">{val != null ? `${val}${suf}` : '—'}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  )

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-800">Exactitud vs. referencia (gold-standard)</h3>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Escribe la transcripción y los valores correctos esperados; la IA extrae y se compara campo por campo (precisión / recall / F1).
      </p>

      <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white resize-none"
        placeholder="Transcripción de la consulta…" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {ACC_CAMPOS.map(({ k, l }) => (
          <div key={k} className="flex items-center gap-2">
            <label className="text-xs text-slate-500 w-32 shrink-0">{l}</label>
            <input type="text" value={ref[k] ?? ''} onChange={e => setRef(r => ({ ...r, [k]: e.target.value }))}
              placeholder="(vacío = no esperado)"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white" />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}
      <button onClick={evaluar} disabled={loading}
        className="self-start flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow transition disabled:opacity-50">
        <Gauge className="w-4 h-4" /> {loading ? 'Evaluando…' : 'Evaluar exactitud'}
      </button>

      {res && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metrica label="Exactitud" val={res.exactitud_pct} suf="%" />
            <Metrica label="Precisión" val={res.precision} />
            <Metrica label="Recall" val={res.recall} />
            <Metrica label="F1-score" val={res.f1} />
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold">Campo</th>
                  <th className="text-left px-4 py-2 font-semibold">Referencia</th>
                  <th className="text-left px-4 py-2 font-semibold">IA extrajo</th>
                  <th className="text-center px-4 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {res.detalle.map((d, i) => {
                  const e = ESTADO_ACC[d.estado] ?? ESTADO_ACC['—']
                  return (
                    <tr key={i} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-2 font-medium text-slate-700">{d.campo}</td>
                      <td className="px-4 py-2 text-slate-500">{d.referencia ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{d.ia ?? '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.pill}`}>{e.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Comparativa IA vs. método léxico (evaluación de tesis) ───────────────────
const TEXTO_EJEMPLO =
  'El paciente llega por vómitos y diarrea desde hace dos días. Está decaído y no quiere comer. ' +
  'Temperatura 39.5 grados, frecuencia cardiaca 120. Mucosas pálidas. ' +
  'Sospecho de gastroenteritis. Le indico dieta blanda y metronidazol cada 12 horas por 5 días.'

function ComparativaIA() {
  const [texto, setTexto] = useState(TEXTO_EJEMPLO)
  const [res, setRes] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const comparar = async () => {
    if (!texto.trim()) { setError('Ingresa un texto de consulta.'); return }
    setCargando(true); setError(null); setRes(null)
    try {
      setRes(await api.post('/api/comparar-extraccion', { texto }))
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }

  const Tarjeta = ({ titulo, Icon, color, dato }) => {
    const pct = dato.total_campos ? Math.round((dato.campos_completados / dato.total_campos) * 100) : 0
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color.bg}`}>
            <Icon className={`w-5 h-5 ${color.text}`} />
          </div>
          <h4 className="text-sm font-bold text-slate-800">{titulo}</h4>
        </div>
        {dato.error ? (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{dato.error}</p>
        ) : (
          <>
            <div>
              <div className="flex justify-between items-end mb-1">
                <span className="text-xs text-slate-400">Campos completados</span>
                <span className="text-lg font-bold text-slate-800">{dato.campos_completados}/{dato.total_campos}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${color.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Timer className="w-3.5 h-3.5" /> {dato.tiempo_ms != null ? `${dato.tiempo_ms} ms` : '—'}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4 mt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-purple-600" />
        <h3 className="text-sm font-bold text-slate-800">Comparativa: IA vs. método léxico</h3>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Procesa el mismo texto con ambos métodos y compara cuántos campos clínicos completa cada uno y su tiempo.
      </p>
      <textarea
        rows={4} value={texto} onChange={e => setTexto(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white resize-none"
        placeholder="Pega aquí la transcripción de una consulta…"
      />
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}
      <button onClick={comparar} disabled={cargando}
        className="self-start flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition disabled:opacity-50">
        <Zap className="w-4 h-4" /> {cargando ? 'Comparando…' : 'Comparar métodos'}
      </button>

      {res && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Tarjeta titulo="Método léxico (reglas)" Icon={ClipboardList}
            color={{ bg: 'bg-amber-100', text: 'text-amber-600', bar: 'bg-amber-500' }} dato={res.lexico} />
          <Tarjeta titulo="Método IA (GPT)" Icon={Cpu}
            color={{ bg: 'bg-purple-100', text: 'text-purple-600', bar: 'bg-purple-600' }} dato={res.ia} />
        </div>
      )}
    </section>
  )
}

// ── Textos de preguntas ───────────────────────────────────────────────────

const PREGUNTAS_SUS = [
  'Creo que me gustaría usar VetIA con frecuencia.',
  'Encuentro VetIA innecesariamente complejo.',
  'Creo que VetIA es fácil de usar.',
  'Creo que necesitaría apoyo técnico para poder usar VetIA.',
  'Encuentro que las distintas funciones de VetIA están bien integradas.',
  'Creo que VetIA presenta demasiada inconsistencia.',
  'Imagino que la mayoría de personas aprendería a usar VetIA muy rápidamente.',
  'Encuentro VetIA muy engorroso de usar.',
  'Me sentí muy seguro y confiado al usar VetIA.',
  'Necesité aprender muchas cosas antes de poder empezar a usar VetIA.',
]

const PREGUNTAS_TAM = [
  'Usar VetIA me permite registrar las historias clínicas más rápido.',
  'VetIA mejora la calidad de la documentación clínica que genero.',
  'Usar VetIA aumenta mi productividad durante la consulta.',
  'VetIA me resulta útil en mi trabajo diario en la clínica.',
  'Usar VetIA me facilita realizar mis tareas de documentación.',
  'Aprender a usar VetIA fue fácil para mí.',
  'Encuentro que VetIA es claro y fácil de entender.',
  'Me resulta fácil llegar a dominar el uso de VetIA.',
  'En general, VetIA es fácil de usar.',
  'Tengo la intención de usar VetIA de forma regular en mis consultas.',
  'Recomendaría VetIA a otros colegas veterinarios.',
  'Si tuviera acceso, usaría VetIA en mi práctica clínica habitual.',
]

// ── Helpers generales ─────────────────────────────────────────────────────

const initRespuestas = (n) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, 0]))

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white'
const labelCls = 'text-xs font-semibold text-slate-600'

const TABS = [
  { id: 'encuestas',  label: 'Responder Encuestas', Icon: ClipboardList },
  { id: 'resultados', label: 'Resultados',          Icon: BarChart3     },
  { id: 'pipeline',   label: 'Métricas IA',         Icon: Cpu           },
]

const PASOS = [
  { n: 1, label: 'Evaluador' },
  { n: 2, label: 'SUS'       },
  { n: 3, label: 'TAM'       },
]

// ── Helpers del dashboard ─────────────────────────────────────────────────

function susGrade(p) {
  if (p == null) return { letra: '—', etiqueta: '—',          bg: 'bg-slate-100',   text: 'text-slate-500',   hex: '#94a3b8' }
  if (p >= 90)   return { letra: 'A', etiqueta: 'Excelente',  bg: 'bg-emerald-100', text: 'text-emerald-700', hex: '#10b981' }
  if (p >= 80)   return { letra: 'B', etiqueta: 'Bueno',      bg: 'bg-sky-100',     text: 'text-sky-700',     hex: '#0ea5e9' }
  if (p >= 70)   return { letra: 'C', etiqueta: 'Aceptable',  bg: 'bg-blue-100',    text: 'text-blue-700',    hex: '#3b82f6' }
  if (p >= 60)   return { letra: 'D', etiqueta: 'Pobre',      bg: 'bg-amber-100',   text: 'text-amber-700',   hex: '#f59e0b' }
  return         { letra: 'F', etiqueta: 'Deficiente', bg: 'bg-rose-100',    text: 'text-rose-700',    hex: '#f43f5e' }
}

function rolLabel(rol) {
  return { veterinario: 'Veterinario', veterinaria: 'Veterinaria', asistente: 'Asistente', admin: 'Admin' }[rol] ?? rol
}

function fmt(v) { return v != null ? v.toFixed(2) : '—' }

// ── Componente: pregunta con escala de botones ────────────────────────────

function PreguntaEscala({ numero, texto, valor, onChange, max }) {
  return (
    <div className="flex flex-col gap-3 py-4 border-b border-slate-100 last:border-0">
      <p className="text-sm text-slate-700 leading-relaxed">
        <span className="font-bold text-purple-700 mr-1.5">{numero}.</span>
        {texto}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-400 min-w-[9rem]">Totalmente en desacuerdo</span>
        <div className="flex gap-1.5">
          {Array.from({ length: max }, (_, i) => i + 1).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={[
                'w-9 h-9 rounded-full text-sm font-bold transition-all',
                valor === v
                  ? 'bg-purple-700 text-white shadow-sm ring-2 ring-purple-300'
                  : 'bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-700',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 min-w-[9rem] text-right">Totalmente de acuerdo</span>
      </div>
    </div>
  )
}

// ── Componente: barra de progreso TAM ────────────────────────────────────

function BarraTAM({ label, valor, hex }) {
  const pct = valor != null ? Math.round((valor / 7) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="text-sm font-bold text-slate-800">{fmt(valor)} <span className="text-xs font-normal text-slate-400">/ 7</span></span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: hex }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-300">
        <span>1</span><span>7</span>
      </div>
    </div>
  )
}

// ── Tooltip personalizado para recharts ───────────────────────────────────

function TooltipSUS({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const g = susGrade(d.value)
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-slate-800 mb-1">{d.payload.nombre}</p>
      <p className="text-slate-500">SUS: <span className="font-bold text-slate-800">{d.value}</span></p>
      <p className={`font-semibold ${g.text}`}>{g.letra} — {g.etiqueta}</p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────

export default function Mediciones() {
  const now = new Date()
  const displayDate = now.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const [tabActiva, setTabActiva] = useState('encuestas')

  // ── Estado: flujo de encuestas ───────────────────────────────────────────
  const [paso,        setPaso]        = useState(1)
  const [evaluadorId, setEvaluadorId] = useState(null)
  const [nombre,      setNombre]      = useState('')
  const [rol,         setRol]         = useState('veterinario')
  const [errEv,       setErrEv]       = useState(null)
  const [loadEv,      setLoadEv]      = useState(false)
  const [susR,        setSusR]        = useState(() => initRespuestas(10))
  const [errSus,      setErrSus]      = useState(null)
  const [loadSus,     setLoadSus]     = useState(false)
  const [tamR,        setTamR]        = useState(() => initRespuestas(12))
  const [errTam,      setErrTam]      = useState(null)
  const [loadTam,     setLoadTam]     = useState(false)

  // ── Estado: dashboard de resultados ──────────────────────────────────────
  const [resumen,  setResumen]  = useState(null)
  const [estad,    setEstad]    = useState(null)
  const [susList,  setSusList]  = useState([])
  const [tamList,  setTamList]  = useState([])
  const [evMap,    setEvMap]    = useState({})
  const [loadRes,  setLoadRes]  = useState(false)
  const [errorRes, setErrorRes] = useState(null)

  // ── Carga de resultados ───────────────────────────────────────────────────

  const cargarResultados = async () => {
    setLoadRes(true)
    setErrorRes(null)
    try {
      const [res, est, sus, tam, evs] = await Promise.all([
        api.get('/api/encuestas/resumen'),
        api.get('/api/encuestas/estadisticas'),
        api.get('/api/sus/'),
        api.get('/api/tam/'),
        api.get('/api/evaluadores/'),
      ])
      setResumen(res)
      setEstad(est)
      setSusList(sus)
      setTamList(tam)
      const map = {}
      evs.forEach(e => { map[e.id] = { nombre: e.nombre, rol: e.rol } })
      setEvMap(map)
    } catch (err) {
      setErrorRes(err.message)
    } finally {
      setLoadRes(false)
    }
  }

  useEffect(() => {
    if (tabActiva === 'resultados') cargarResultados()
  }, [tabActiva])

  // ── Datos derivados para el dashboard ────────────────────────────────────

  const tablaEvaluadores = useMemo(() => {
    const map = {}
    susList.forEach(s => {
      map[s.evaluador_id] = { ...map[s.evaluador_id], sus: s.puntaje }
    })
    tamList.forEach(t => {
      map[t.evaluador_id] = {
        ...map[t.evaluador_id],
        util: t.util_percibida,
        facil: t.facilidad_uso,
        int: t.intencion_uso,
      }
    })
    return Object.entries(map)
      .map(([id, d]) => ({
        id: parseInt(id),
        nombre: evMap[id]?.nombre ?? `Evaluador ${id}`,
        rol:    evMap[id]?.rol    ?? '—',
        sus:  d.sus  ?? null,
        util: d.util ?? null,
        facil: d.facil ?? null,
        int:  d.int  ?? null,
      }))
      .sort((a, b) => (b.sus ?? -1) - (a.sus ?? -1))
  }, [susList, tamList, evMap])

  const susChartData = useMemo(() =>
    [...susList]
      .sort((a, b) => b.puntaje - a.puntaje)
      .map(s => ({
        nombre: (evMap[s.evaluador_id]?.nombre ?? `Ev.${s.evaluador_id}`)
          .split(' ').slice(0, 2).join(' '),
        puntaje: s.puntaje,
      })),
  [susList, evMap])

  // ── Handlers: flujo de encuestas ──────────────────────────────────────────

  const handleEvaluador = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setErrEv('El nombre es obligatorio.'); return }
    setLoadEv(true); setErrEv(null)
    try {
      const ev = await api.post('/api/evaluadores/', { nombre: nombre.trim(), rol })
      setEvaluadorId(ev.id)
      setPaso(2)
    } catch (err) { setErrEv(err.message) }
    finally { setLoadEv(false) }
  }

  const handleSus = async (e) => {
    e.preventDefault()
    if (Object.values(susR).some(v => v === 0)) {
      setErrSus('Por favor responde todas las preguntas antes de continuar.')
      return
    }
    setLoadSus(true); setErrSus(null)
    try {
      await api.post('/api/sus/', { evaluador_id: evaluadorId, ...susR })
      setPaso(3)
    } catch (err) { setErrSus(err.message) }
    finally { setLoadSus(false) }
  }

  const handleTam = async (e) => {
    e.preventDefault()
    if (Object.values(tamR).some(v => v === 0)) {
      setErrTam('Por favor responde todas las preguntas antes de enviar.')
      return
    }
    setLoadTam(true); setErrTam(null)
    try {
      await api.post('/api/tam/', { evaluador_id: evaluadorId, ...tamR })
      setPaso(4)
    } catch (err) { setErrTam(err.message) }
    finally { setLoadTam(false) }
  }

  const reiniciar = () => {
    setPaso(1); setEvaluadorId(null)
    setNombre(''); setRol('veterinario')
    setSusR(initRespuestas(10)); setTamR(initRespuestas(12))
    setErrEv(null); setErrSus(null); setErrTam(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const gPromedio = resumen ? susGrade(resumen.puntaje_sus_promedio) : null
  const sinDatos  = resumen?.total_sus === 0

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">Mediciones</h1>
        <p className="text-xs text-slate-400 mt-0.5 capitalize">{displayDate}</p>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 flex gap-1 sticky top-[73px] z-10">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTabActiva(id)}
            className={[
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all',
              tabActiva === id
                ? 'border-purple-700 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            <Icon className="w-4 h-4" strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">

        {/* ── Pestaña: Responder Encuestas ──────────────────────────────── */}
        {tabActiva === 'encuestas' && (
          <div className="max-w-2xl mx-auto">

            {paso < 4 && (
              <div className="flex items-center gap-2 mb-6">
                {PASOS.map(({ n, label }, i) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      paso > n ? 'bg-emerald-500 text-white' : paso === n ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-400',
                    ].join(' ')}>
                      {paso > n ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
                    </div>
                    <span className={`text-xs font-medium ${paso === n ? 'text-purple-700' : 'text-slate-400'}`}>{label}</span>
                    {i < PASOS.length - 1 && (
                      <div className={`h-px w-8 ${paso > n ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {paso === 1 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                  <p className="text-sm font-bold text-slate-800">Datos del evaluador</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ingresa tu nombre y rol antes de comenzar la encuesta</p>
                </div>
                <form onSubmit={handleEvaluador} className="px-6 py-5 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Nombre completo <span className="text-rose-500">*</span></label>
                    <input type="text" className={inputCls} placeholder="Ej. Dr. Juan Pérez"
                      value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>Rol en la clínica</label>
                    <select className={inputCls} value={rol} onChange={e => setRol(e.target.value)}>
                      <option value="veterinario">Veterinario</option>
                      <option value="asistente">Asistente</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  {errEv && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{errEv}</p>}
                  <div className="flex justify-end">
                    <button type="submit" disabled={loadEv}
                      className="px-5 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
                      {loadEv ? 'Registrando...' : 'Continuar →'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {paso === 2 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                  <p className="text-sm font-bold text-slate-800">Encuesta SUS</p>
                  <p className="text-xs text-slate-400 mt-0.5">System Usability Scale — 10 preguntas, escala 1 (desacuerdo) a 5 (acuerdo)</p>
                </div>
                <form onSubmit={handleSus} className="px-6 py-1">
                  {PREGUNTAS_SUS.map((texto, i) => (
                    <PreguntaEscala key={i} numero={i + 1} texto={texto}
                      valor={susR[`p${i + 1}`]} onChange={v => setSusR(r => ({ ...r, [`p${i + 1}`]: v }))} max={5} />
                  ))}
                  {errSus && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg mt-3">{errSus}</p>}
                  <div className="py-5 flex justify-end">
                    <button type="submit" disabled={loadSus}
                      className="px-5 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
                      {loadSus ? 'Guardando...' : 'Continuar →'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {paso === 3 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                  <p className="text-sm font-bold text-slate-800">Encuesta TAM</p>
                  <p className="text-xs text-slate-400 mt-0.5">Technology Acceptance Model — 12 preguntas, escala 1 (desacuerdo) a 7 (acuerdo)</p>
                </div>
                <form onSubmit={handleTam} className="px-6 py-1">
                  {PREGUNTAS_TAM.map((texto, i) => (
                    <PreguntaEscala key={i} numero={i + 1} texto={texto}
                      valor={tamR[`p${i + 1}`]} onChange={v => setTamR(r => ({ ...r, [`p${i + 1}`]: v }))} max={7} />
                  ))}
                  {errTam && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg mt-3">{errTam}</p>}
                  <div className="py-5 flex justify-end">
                    <button type="submit" disabled={loadTam}
                      className="px-5 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
                      {loadTam ? 'Enviando...' : 'Enviar respuestas'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {paso === 4 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-8 py-16 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-9 h-9 text-emerald-500" strokeWidth={1.5} />
                </div>
                <p className="text-lg font-bold text-slate-800">¡Gracias, {nombre}!</p>
                <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                  Tus respuestas fueron registradas correctamente. La información es muy valiosa para esta investigación.
                </p>
                <div className="flex flex-col items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />Encuesta SUS registrada</span>
                  <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />Encuesta TAM registrada</span>
                </div>
                <button onClick={reiniciar}
                  className="mt-3 px-5 py-2 text-sm font-semibold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition">
                  Registrar otro evaluador
                </button>
              </div>
            )}

          </div>
        )}

        {/* ── Pestaña: Resultados ───────────────────────────────────────── */}
        {tabActiva === 'resultados' && (
          <div className="flex flex-col gap-5">

            {/* Barra superior: título + botón actualizar */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">
                Resultados de evaluación — SUS &amp; TAM
              </p>
              <button
                onClick={cargarResultados}
                disabled={loadRes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadRes ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>

            {/* Error global */}
            {errorRes && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
                {errorRes}
              </div>
            )}

            {/* Cargando */}
            {loadRes && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
                Cargando resultados...
              </div>
            )}

            {/* Sin datos */}
            {!loadRes && sinDatos && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-8 py-16 flex flex-col items-center gap-3 text-center">
                <BarChart3 className="w-10 h-10 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-slate-500">Aún no hay encuestas registradas</p>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Ve a la pestaña "Responder Encuestas" para registrar el primer evaluador.
                </p>
              </div>
            )}

            {/* Dashboard (solo cuando hay datos y no está cargando) */}
            {!loadRes && !sinDatos && resumen && (
              <>
                {/* Fila 1: SUS global + TAM dimensiones */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                  {/* Tarjeta SUS */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">SUS Global</p>
                        <p className="text-xs text-slate-400 mt-0.5">N = {resumen.total_sus} evaluadores</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gPromedio.bg} ${gPromedio.text}`}>
                        {gPromedio.etiqueta}
                      </span>
                    </div>

                    <div className="flex items-end gap-3">
                      <span className="text-6xl font-black text-slate-800 leading-none">
                        {resumen.puntaje_sus_promedio?.toFixed(1)}
                      </span>
                      <div className="pb-1">
                        <span className={`text-3xl font-black ${gPromedio.text}`}>{gPromedio.letra}</span>
                        <p className="text-xs text-slate-400">/100</p>
                      </div>
                    </div>

                    {/* Barra visual */}
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${resumen.puntaje_sus_promedio}%`, backgroundColor: gPromedio.hex }}
                      />
                    </div>

                    {/* Escala de letras */}
                    <div className="flex flex-col gap-1 text-xs">
                      {[
                        { rango: '≥ 90', letra: 'A', label: 'Excelente',  cls: 'text-emerald-600' },
                        { rango: '≥ 80', letra: 'B', label: 'Bueno',      cls: 'text-sky-600'     },
                        { rango: '≥ 70', letra: 'C', label: 'Aceptable',  cls: 'text-blue-600'    },
                        { rango: '≥ 60', letra: 'D', label: 'Pobre',      cls: 'text-amber-600'   },
                        { rango: '< 60', letra: 'F', label: 'Deficiente', cls: 'text-rose-600'    },
                      ].map(({ rango, letra, label, cls }) => (
                        <div key={letra} className={`flex gap-1.5 ${resumen.puntaje_sus_promedio != null && susGrade(resumen.puntaje_sus_promedio).letra === letra ? 'font-bold' : 'text-slate-400'} ${resumen.puntaje_sus_promedio != null && susGrade(resumen.puntaje_sus_promedio).letra === letra ? cls : ''}`}>
                          <span className="w-8">{rango}</span>
                          <span className="w-4">{letra}</span>
                          <span>{label}</span>
                        </div>
                      ))}
                      <p className="text-slate-300 mt-1">SUS ≥ 68 = por encima del promedio</p>
                    </div>
                  </div>

                  {/* Tarjeta TAM */}
                  <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">TAM — Dimensiones</p>
                      <p className="text-xs text-slate-400 mt-0.5">N = {resumen.total_tam} evaluadores · Escala 1–7</p>
                    </div>

                    <div className="flex flex-col gap-5">
                      <BarraTAM
                        label="Utilidad Percibida (p1–p5)"
                        valor={resumen.util_percibida_promedio}
                        hex="#7c3aed"
                      />
                      <BarraTAM
                        label="Facilidad de Uso (p6–p9)"
                        valor={resumen.facilidad_uso_promedio}
                        hex="#0ea5e9"
                      />
                      <BarraTAM
                        label="Intención de Uso (p10–p12)"
                        valor={resumen.intencion_uso_promedio}
                        hex="#10b981"
                      />
                    </div>

                    {/* Resumen numérico */}
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                      {[
                        { label: 'Utilidad',   val: resumen.util_percibida_promedio, color: 'text-purple-700' },
                        { label: 'Facilidad',  val: resumen.facilidad_uso_promedio,  color: 'text-sky-700'    },
                        { label: 'Intención',  val: resumen.intencion_uso_promedio,  color: 'text-emerald-700'},
                      ].map(({ label, val, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-2xl font-black ${color}`}>{fmt(val)}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Rigor estadístico: descriptivos, IC 95% y Cronbach's alpha */}
                <PanelEstadistico estad={estad} />

                {/* Fila 2: Gráfico de barras SUS por evaluador */}
                {susChartData.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                      Puntaje SUS por evaluador
                    </p>
                    <p className="text-xs text-slate-400 mb-5">La línea punteada marca el umbral de promedio (68)</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={susChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                          dataKey="nombre"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                          width={28}
                        />
                        <Tooltip content={<TooltipSUS />} cursor={{ fill: '#f8fafc' }} />
                        <ReferenceLine
                          y={68}
                          stroke="#94a3b8"
                          strokeDasharray="4 3"
                          label={{ value: '68', position: 'right', fontSize: 10, fill: '#94a3b8' }}
                        />
                        <Bar dataKey="puntaje" radius={[4, 4, 0, 0]} maxBarSize={56}>
                          {susChartData.map((entry, i) => (
                            <Cell key={i} fill={susGrade(entry.puntaje).hex} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Fila 3: Tabla detallada por evaluador */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      Detalle por evaluador
                    </p>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                        <th className="text-left px-5 py-3 font-semibold">Evaluador</th>
                        <th className="text-left px-5 py-3 font-semibold">Rol</th>
                        <th className="text-center px-4 py-3 font-semibold">SUS</th>
                        <th className="text-center px-4 py-3 font-semibold">Grado</th>
                        <th className="text-center px-4 py-3 font-semibold">Utilidad</th>
                        <th className="text-center px-4 py-3 font-semibold">Facilidad</th>
                        <th className="text-center px-4 py-3 font-semibold">Intención</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablaEvaluadores.map((ev, i) => {
                        const g = susGrade(ev.sus)
                        return (
                          <tr
                            key={ev.id}
                            className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 ? 'bg-slate-50/30' : ''}`}
                          >
                            <td className="px-5 py-3 font-semibold text-slate-800">{ev.nombre}</td>
                            <td className="px-5 py-3 text-slate-500">{rolLabel(ev.rol)}</td>
                            <td className="px-4 py-3 text-center font-bold text-slate-800">
                              {ev.sus ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {ev.sus != null && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${g.bg} ${g.text}`}>
                                  {g.letra}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">{fmt(ev.util)}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{fmt(ev.facil)}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{fmt(ev.int)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table></div>
                </div>

              </>
            )}
          </div>
        )}

        {/* ── Pestaña: Métricas IA ──────────────────────────────────────── */}
        {tabActiva === 'pipeline' && (
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" /> Tiempo de registro — Manual vs. IA
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Eficiencia documental: cuánto se tarda en llenar una historia con cada método (medido automáticamente).
              </p>
            </div>
            <TiemposPanel />
            <ComparativaIA />
            <ExactitudPanel />
          </div>
        )}

      </main>
    </div>
  )
}
