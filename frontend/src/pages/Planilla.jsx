import { useState, useEffect, useCallback } from 'react'
import { Banknote, FileText, Download, RefreshCw, Lock, Trash2, Info, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { useConfirmar } from '../components/Confirmar'
import { Cargando } from '../components/Cargando'
import { exportarCSV } from '../utils/exportUtils'
import { boletaPagoPDF, nombreDelMes } from '../utils/boletaPago'

const soles = (n) => `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const mesActual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Número editable que guarda al salir del campo, solo si cambió. */
function Celda({ valor, onGuardar, disabled, decimales = false, ancho = 'w-20', etiqueta }) {
  const [v, setV] = useState(String(valor ?? 0))
  useEffect(() => { setV(String(valor ?? 0)) }, [valor])
  if (disabled) return <span className="text-slate-700">{decimales ? soles(valor) : valor}</span>
  const confirmar = () => {
    const n = decimales ? parseFloat(v) : parseInt(v, 10)
    if (Number.isNaN(n) || n < 0) { setV(String(valor ?? 0)); return }
    if (n !== Number(valor)) onGuardar(n)
  }
  return (
    <input type="number" min="0" step={decimales ? '0.01' : '1'} value={v} aria-label={etiqueta}
      onChange={e => setV(e.target.value)} onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={`${ancho} border border-slate-200 rounded px-2 py-1 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-brand-300`} />
  )
}

function SueldosPersonal({ onCambio }) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [personal, setPersonal] = useState(null)

  const cargar = useCallback(async () => {
    try { setPersonal(await api.get('/api/planilla/personal')) } catch { setPersonal([]) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (u, valor) => {
    try {
      await api.put(`/api/planilla/personal/${u.id}`, { sueldo_base: valor })
      toast.success(`Sueldo de ${u.nombre} guardado`)
      await cargar(); onCambio?.()
    } catch (e) { toast.error(e.message || 'No se pudo guardar el sueldo') }
  }

  const sinSueldo = (personal ?? []).filter(u => u.sueldo_base == null).length
  return (
    <section className="bg-white rounded-xl border border-slate-200">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center gap-2 px-5 py-3 text-left">
        <Banknote className="w-4 h-4 text-brand-500" />
        <span className="flex-1 text-sm font-semibold text-slate-700">
          Sueldos del personal
          {sinSueldo > 0 && <span className="ml-2 text-xs font-medium text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">{sinSueldo} sin sueldo</span>}
        </span>
        {abierto ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {abierto && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-3 overflow-x-auto">
          {personal === null ? <Cargando /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 text-left">
                  <th className="py-1 font-semibold">Trabajador</th>
                  <th className="py-1 font-semibold">Horario</th>
                  <th className="py-1 font-semibold text-right">Sueldo mensual (S/)</th>
                </tr>
              </thead>
              <tbody>
                {personal.map(u => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{u.nombre} <span className="text-xs text-slate-500 capitalize">· {u.rol}</span></td>
                    <td className="py-2 text-xs text-slate-600">
                      {u.hora_entrada && u.dias_laborales ? `${u.hora_entrada} · ${u.dias_laborales}` : (
                        <span className="text-amber-800">Sin horario: no se calculan faltas</span>)}
                    </td>
                    <td className="py-2 text-right">
                      <Celda valor={u.sueldo_base ?? 0} decimales ancho="w-28" etiqueta={`Sueldo de ${u.nombre}`}
                        onGuardar={(n) => guardar(u, n)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-500 mt-2">
            El horario (hora de entrada y días de trabajo) se asigna en Usuarios. Con sueldo vacío, la persona no entra a la planilla.
          </p>
        </div>
      )}
    </section>
  )
}

export default function Planilla() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState([])
  const [periodo, setPeriodo] = useState(mesActual())
  const [tolerancia, setTolerancia] = useState(0)
  const [planilla, setPlanilla] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const cargarLista = useCallback(async () => {
    try { setLista(await api.get('/api/planilla/')) } catch { setLista([]) }
  }, [])

  const abrir = useCallback(async (p) => {
    setCargando(true)
    try { setPlanilla(await api.get(`/api/planilla/${p}`)) }
    catch { setPlanilla(null) }       // 404: aún no se generó
    finally { setCargando(false) }
  }, [])

  useEffect(() => { cargarLista() }, [cargarLista])
  useEffect(() => { if (/^\d{4}-\d{2}$/.test(periodo)) abrir(periodo) }, [periodo, abrir])

  const accion = async (fn, ok) => {
    setOcupado(true)
    try { const r = await fn(); if (r) setPlanilla(r); if (ok) toast.success(ok); await cargarLista() }
    catch (e) { toast.error(e.message || 'No se pudo completar la acción') }
    finally { setOcupado(false) }
  }

  const generar = () => accion(
    () => api.post('/api/planilla/', { periodo, tolerancia_min: Number(tolerancia) || 0 }),
    `Planilla de ${nombreDelMes(periodo)} generada`)

  const editar = (l, campo, valor) => accion(
    () => api.put(`/api/planilla/${periodo}/lineas/${l.id}`, { [campo]: valor }))

  const actualizar = () => accion(
    () => api.post(`/api/planilla/${periodo}/actualizar-asistencia`, {}), 'Asistencia actualizada')

  const cerrar = async () => {
    if (!await confirmar({
      titulo: 'Cerrar la planilla',
      mensaje: `Se cerrará la planilla de ${nombreDelMes(periodo)}: ya no se podrá modificar.`,
      detalle: 'Revisa tardanzas, faltas, bonos y adelantos antes de cerrar.',
      confirmarTexto: 'Cerrar planilla',
    })) return
    accion(() => api.post(`/api/planilla/${periodo}/cerrar`, {}), 'Planilla cerrada')
  }

  const descartar = async () => {
    if (!await confirmar({
      titulo: 'Descartar el borrador',
      mensaje: `Se borrará el borrador de ${nombreDelMes(periodo)}.`,
      detalle: 'Podrás generarlo de nuevo con la asistencia actual.',
      confirmarTexto: 'Descartar', peligroso: true,
    })) return
    setOcupado(true)
    try { await api.del(`/api/planilla/${periodo}`); setPlanilla(null); await cargarLista() }
    catch (e) { toast.error(e.message || 'No se pudo descartar') }
    finally { setOcupado(false) }
  }

  const excel = () => exportarCSV(
    `Planilla ${periodo}`,
    ['Trabajador', 'Sueldo', 'Min. tardanza', 'Faltas', 'Desc. tardanza', 'Desc. faltas', 'Bonos', 'Adelantos', 'Otros desc.', 'Total descuentos', 'Neto'],
    planilla.lineas.map(l => [l.nombre, l.sueldo_base, l.minutos_tardanza, l.faltas, l.descuento_tardanza,
      l.descuento_faltas, l.bonos, l.adelantos, l.otros_descuentos, l.total_descuentos, l.neto]))

  const cerrada = planilla?.estado === 'cerrada'
  const cab = 'px-3 py-2 text-xs font-semibold text-slate-500 text-right whitespace-nowrap'

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center gap-3">
        <Banknote className="w-5 h-5 text-brand-600" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-800">Planilla del personal</h1>
          <p className="text-xs text-slate-500">Sueldos, descuentos por asistencia y boletas de pago.</p>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 max-w-6xl w-full mx-auto flex flex-col gap-4">
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-900 rounded-xl px-4 py-3 text-sm">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Esta planilla calcula sueldo, tardanzas, faltas, bonos y adelantos. <strong>No incluye</strong> aportes
            ni beneficios de ley (AFP/ONP, EsSalud, CTS, gratificaciones): eso lo define el contador de la clínica.
            Descuento: el día vale sueldo ÷ 30; el minuto, el día ÷ 8 horas ÷ 60.
          </p>
        </div>

        <SueldosPersonal onCambio={() => abrir(periodo)} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Mes
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-normal" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {lista.slice(0, 6).map(p => (
              <button key={p.periodo} onClick={() => setPeriodo(p.periodo)}
                className={`text-xs rounded-full px-3 py-1.5 border ${p.periodo === periodo
                  ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                {p.periodo}{p.estado === 'cerrada' ? ' 🔒' : ''}
              </button>
            ))}
          </div>
        </div>

        {cargando ? <Cargando /> : !planilla ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl py-10 px-4 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-slate-700">Todavía no hay planilla de {nombreDelMes(periodo)}.</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Tolerancia de tardanza (min)
              <input type="number" min="0" max="120" value={tolerancia} onChange={e => setTolerancia(e.target.value)}
                className="w-16 border border-slate-200 rounded px-2 py-1 text-sm text-right" />
            </label>
            <button onClick={generar} disabled={ocupado}
              className="flex items-center gap-1.5 text-sm font-medium bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white rounded-lg px-4 py-2">
              <Plus className="w-4 h-4" /> Generar planilla con la asistencia del mes
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-800 flex-1 first-letter:uppercase">
                {nombreDelMes(planilla.periodo)}
                <span className={`ml-2 text-xs font-medium rounded-full px-2 py-0.5 align-middle ${
                  cerrada ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                  {cerrada ? 'Cerrada' : 'Borrador'}
                </span>
              </h2>
              {!cerrada && (
                <>
                  <button onClick={actualizar} disabled={ocupado}
                    className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 bg-white rounded-lg px-3 py-2 hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Actualizar con la asistencia
                  </button>
                  <button onClick={descartar} disabled={ocupado}
                    className="flex items-center gap-1.5 text-xs font-medium text-rose-700 border border-rose-200 bg-white rounded-lg px-3 py-2 hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" /> Descartar
                  </button>
                </>
              )}
              <button onClick={excel}
                className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 bg-white rounded-lg px-3 py-2 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
              {!cerrada && (
                <button onClick={cerrar} disabled={ocupado}
                  className="flex items-center gap-1.5 text-xs font-medium bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white rounded-lg px-3 py-2">
                  <Lock className="w-3.5 h-3.5" /> Cerrar planilla
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[['Sueldos', planilla.totales.sueldos], ['Descuentos', planilla.totales.descuentos], ['Neto a pagar', planilla.totales.neto]].map(([t, v]) => (
                <div key={t} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-slate-500">{t}</p>
                  <p className="text-xl font-bold text-slate-800">{soles(v)}</p>
                </div>
              ))}
            </div>

            {planilla.sin_sueldo.length > 0 && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No están en esta planilla por no tener sueldo: {planilla.sin_sueldo.map(u => u.nombre).join(', ')}.
              </p>
            )}
            {planilla.lineas.some(l => l.sin_horario) && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {planilla.lineas.filter(l => l.sin_horario).map(l => l.nombre).join(', ')}: sin horario asignado, así que
                las faltas no se calcularon. Anótalas a mano.
              </p>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-left">Trabajador</th>
                    <th className={cab}>Sueldo</th>
                    <th className={cab}>Min. tardanza</th>
                    <th className={cab}>Faltas</th>
                    <th className={cab}>Bonos</th>
                    <th className={cab}>Adelantos</th>
                    <th className={cab}>Otros desc.</th>
                    <th className={cab}>Descuentos</th>
                    <th className={cab}>Neto</th>
                    <th className={cab}></th>
                  </tr>
                </thead>
                <tbody>
                  {planilla.lineas.map(l => (
                    <tr key={l.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {l.nombre}
                        {l.nota && <span className="block text-xs font-normal text-slate-500">{l.nota}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{soles(l.sueldo_base)}</td>
                      <td className="px-3 py-2 text-right">
                        <Celda valor={l.minutos_tardanza} disabled={cerrada} ancho="w-16" etiqueta={`Minutos de tardanza de ${l.nombre}`}
                          onGuardar={(n) => editar(l, 'minutos_tardanza', n)} />
                        {l.minutos_tardanza !== l.minutos_auto && <span className="block text-[11px] text-slate-500">asistencia: {l.minutos_auto}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Celda valor={l.faltas} disabled={cerrada} ancho="w-14" etiqueta={`Faltas de ${l.nombre}`}
                          onGuardar={(n) => editar(l, 'faltas', n)} />
                        {l.faltas !== l.faltas_auto && <span className="block text-[11px] text-slate-500">asistencia: {l.faltas_auto}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Celda valor={l.bonos} decimales disabled={cerrada} etiqueta={`Bonos de ${l.nombre}`}
                          onGuardar={(n) => editar(l, 'bonos', n)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Celda valor={l.adelantos} decimales disabled={cerrada} etiqueta={`Adelantos de ${l.nombre}`}
                          onGuardar={(n) => editar(l, 'adelantos', n)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Celda valor={l.otros_descuentos} decimales disabled={cerrada} etiqueta={`Otros descuentos de ${l.nombre}`}
                          onGuardar={(n) => editar(l, 'otros_descuentos', n)} />
                      </td>
                      <td className="px-3 py-2 text-right text-rose-700">{soles(l.total_descuentos)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${l.neto < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{soles(l.neto)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => boletaPagoPDF(planilla, l)} title="Descargar boleta de pago"
                          className="p-1.5 text-brand-700 hover:bg-brand-50 rounded" aria-label={`Boleta de ${l.nombre}`}>
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cerrada && (
              <p className="text-xs text-slate-500">
                Cerrada el {new Date(planilla.cerrada_en).toLocaleString('es-PE')}{planilla.cerrada_por ? ` por ${planilla.cerrada_por}` : ''}.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
