import { useState, useEffect } from 'react'
import { Wallet, Banknote, CreditCard, Smartphone, FileText, CheckCircle2, AlertTriangle } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { clinicaActual } from '../services/clinica'

const fmtMoneda = (n) => `S/ ${Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtHora = (iso) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })

// Fecha local (YYYY-MM-DD) — evita el desfase de toISOString() que usa UTC
const fechaLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const METODO_INFO = {
  efectivo: { label: 'Efectivo', Icon: Banknote,   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  tarjeta:  { label: 'Tarjeta',  Icon: CreditCard,  color: 'text-sky-600',     bg: 'bg-sky-50',     border: 'border-sky-200' },
  yape:     { label: 'Yape',     Icon: Smartphone,  color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  plin:     { label: 'Plin',     Icon: Smartphone,  color: 'text-cyan-600',    bg: 'bg-cyan-50',    border: 'border-cyan-200' },
}

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

/**
 * Arqueo del día: cuánto efectivo hay realmente en el cajón.
 *
 * Antes esta pantalla solo listaba ventas. Lo que le da sentido a un cierre es
 * comparar el conteo físico con lo que dice el sistema y dejar constancia de
 * quién cerró: con varias personas manejando efectivo, eso protege tanto a la
 * dueña como a quien contó la caja.
 */
function ArqueoCaja({ fecha, esperado, cierre, onCerrado }) {
  const toast = useToast()
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Diferencia en vivo, para que se vea antes de confirmar
  const contadoNum = parseFloat(contado)
  const hayNumero = contado !== '' && !Number.isNaN(contadoNum)
  const diferencia = hayNumero ? Math.round((contadoNum - esperado) * 100) / 100 : null

  const registrar = async () => {
    if (!hayNumero || contadoNum < 0) {
      toast.error('Escribe cuánto efectivo contaste en el cajón.')
      return
    }
    if (diferencia !== 0 && !notas.trim()) {
      toast.error('La caja no cuadra: explica brevemente la diferencia antes de cerrar.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/api/dashboard/cierre-caja', {
        fecha, efectivo_contado: contadoNum, notas: notas.trim() || null,
      })
      toast.success('Caja cerrada.')
      setContado(''); setNotas('')
      onCerrado?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }

  // Ya cerrada: se muestra el resultado, no el formulario
  if (cierre) {
    const dif = cierre.diferencia
    const cuadro = dif === 0
    return (
      <section className={`rounded-xl border shadow-sm overflow-hidden ${cuadro ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            {cuadro
              ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />}
            <span className={`text-sm font-bold ${cuadro ? 'text-emerald-900' : 'text-amber-900'}`}>
              {cuadro ? 'Caja cerrada y cuadrada' : 'Caja cerrada con diferencia'}
            </span>
          </div>
          <div className="text-sm text-slate-700">
            Esperado <strong>{fmtMoneda(cierre.efectivo_esperado)}</strong>
            {' · '}Contado <strong>{fmtMoneda(cierre.efectivo_contado)}</strong>
            {!cuadro && (
              <> {' · '}<strong className={dif < 0 ? 'text-rose-700' : 'text-sky-700'}>
                {dif < 0 ? 'Faltó' : 'Sobró'} {fmtMoneda(Math.abs(dif))}
              </strong></>
            )}
          </div>
          <span className="text-xs text-slate-600 ml-auto">
            {cierre.cerrado_por} · {cierre.cerrado_en ? fmtHora(cierre.cerrado_en) : ''}
          </span>
        </div>
        {cierre.notas && (
          <p className="px-5 pb-4 text-xs text-slate-700">
            <span className="font-semibold">Nota:</span> {cierre.notas}
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Banknote className="w-4 h-4 text-emerald-600" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Arqueo de caja</h2>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <p className="text-xs text-slate-600">
          Cuenta el efectivo del cajón y anótalo acá. Solo se cuenta efectivo:
          lo cobrado por tarjeta, Yape o Plin no pasa por caja.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">Según el sistema</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{fmtMoneda(esperado)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Contado en el cajón</label>
            <input
              type="number" step="0.01" min="0" value={contado}
              onChange={e => setContado(e.target.value)}
              placeholder="0.00"
              className="w-36 text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          {diferencia !== null && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Diferencia</p>
              <p className={`text-xl font-bold tabular-nums ${
                diferencia === 0 ? 'text-emerald-700' : diferencia < 0 ? 'text-rose-700' : 'text-sky-700'
              }`}>
                {diferencia === 0 ? 'Cuadra' : `${diferencia > 0 ? '+' : ''}${fmtMoneda(diferencia)}`}
              </p>
            </div>
          )}
        </div>

        {diferencia !== null && diferencia !== 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">
              ¿Por qué la diferencia? <span className="text-rose-500">*</span>
            </label>
            <input
              type="text" value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Ej. se dio un vuelto de más en la mañana"
              className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-slate-500">
            Una vez cerrada, la caja de este día no se puede volver a cerrar ni
            se pueden anular sus ventas.
          </p>
          <button onClick={registrar} disabled={guardando || !hayNumero}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition disabled:opacity-50">
            {guardando ? 'Cerrando…' : 'Cerrar caja del día'}
          </button>
        </div>
      </div>
    </section>
  )
}

export default function Caja() {
  const toast = useToast()
  const hoy = fechaLocal()
  const [fecha,   setFecha]   = useState(hoy)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Se extrae para poder recargar tras registrar el arqueo, sin duplicar la
  // llamada ni depender de que el efecto se vuelva a disparar.
  const cargar = (silencioso = false) => {
    if (!silencioso) setLoading(true)
    return api.get(`/api/dashboard/cierre-caja?fecha=${fecha}`)
      .then(setData)
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [fecha])

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const exportarPDF = () => {
    if (!data) return
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const morado = [88, 28, 135]
    doc.setFillColor(...morado); doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(15); doc.setFont(undefined, 'bold')
    doc.text(clinicaActual().nombre, 14, 11)
    doc.setFontSize(9); doc.setFont(undefined, 'normal')
    doc.text(`Cierre de Caja — ${data.fecha}`, 14, 18)

    autoTable(doc, {
      startY: 30,
      head: [['Método de pago', 'N° ventas', 'Total']],
      body: data.por_metodo.map(m => [METODO_INFO[m.metodo]?.label ?? m.metodo, m.cantidad, fmtMoneda(m.total)]),
      foot: [['TOTAL', data.num_ventas, fmtMoneda(data.total)]],
      headStyles: { fillColor: morado, fontSize: 9 },
      footStyles: { fillColor: [243, 240, 250], textColor: morado, fontStyle: 'bold' },
      styles: { fontSize: 9 }, margin: { left: 14, right: 14 },
    })
    if (data.ventas.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 5,
        head: [['Boleta', 'Hora', 'Cliente', 'Método', 'Total']],
        body: data.ventas.map(v => [
          `B-${String(v.id).padStart(6, '0')}`, fmtHora(v.hora), v.cliente,
          METODO_INFO[v.metodo_pago]?.label ?? v.metodo_pago, fmtMoneda(v.total),
        ]),
        headStyles: { fillColor: morado, fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 },
      })
    }
    doc.save(`CierreCaja_${data.fecha}.pdf`)
    toast.success('Reporte de caja descargado')
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between static md:sticky md:top-0 md:z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cierre de Caja</h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)}
            className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <button onClick={exportarPDF} disabled={!data || data.num_ventas === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg shadow transition disabled:opacity-50">
            <FileText className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 flex flex-col gap-5 max-w-4xl w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <Spinner /> <span className="text-sm">Cargando caja…</span>
          </div>
        ) : (
          <>
            {/* Total del día */}
            <div className="bg-gradient-to-r from-purple-700 to-violet-600 rounded-2xl px-7 py-6 text-white shadow-md flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-purple-200 text-sm font-medium">Total recaudado</p>
                  <p className="text-3xl font-bold">{fmtMoneda(data.total)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-purple-200 text-sm">Ventas del día</p>
                <p className="text-2xl font-bold">{data.num_ventas}</p>
              </div>
            </div>

            {/* Desglose por método */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data.por_metodo.map(m => {
                const info = METODO_INFO[m.metodo] ?? { label: m.metodo, Icon: Wallet, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' }
                const { Icon } = info
                return (
                  <div key={m.metodo} className={`${info.bg} border ${info.border} rounded-xl px-5 py-4 flex flex-col gap-2 shadow-sm`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500">{info.label}</p>
                      <Icon className={`w-4 h-4 ${info.color}`} />
                    </div>
                    <p className="text-xl font-bold text-slate-800">{fmtMoneda(m.total)}</p>
                    <p className="text-xs text-slate-400">{m.cantidad} venta{m.cantidad !== 1 ? 's' : ''}</p>
                  </div>
                )
              })}
            </div>

            {/* ── Arqueo: contar el efectivo del cajón ──────────────────────
                Es lo que convierte este reporte en un cierre de verdad. Solo
                se cuenta el efectivo: lo cobrado por tarjeta/Yape/Plin no pasa
                por el cajón. */}
            <ArqueoCaja
              fecha={fecha}
              esperado={data.efectivo_esperado ?? 0}
              cierre={data.cierre}
              onCerrado={() => cargar()}
            />

            {/* Detalle de ventas */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Ventas del día</h2>
              </div>
              {data.ventas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">Sin ventas registradas el {data.fecha}</p>
              ) : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                      <th className="text-left px-5 py-3 font-semibold">Boleta</th>
                      <th className="text-left px-5 py-3 font-semibold">Hora</th>
                      <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                      <th className="text-left px-5 py-3 font-semibold">Método</th>
                      <th className="text-right px-5 py-3 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ventas.map((v, i) => {
                      const info = METODO_INFO[v.metodo_pago] ?? { label: v.metodo_pago }
                      return (
                        <tr key={v.id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-5 py-3 font-mono text-xs text-slate-500">B-{String(v.id).padStart(6, '0')}</td>
                          <td className="px-5 py-3 text-slate-600">{fmtHora(v.hora)}</td>
                          <td className="px-5 py-3 font-medium text-slate-800">{v.cliente}</td>
                          <td className="px-5 py-3 text-slate-600">{info.label}</td>
                          <td className="px-5 py-3 text-right font-bold text-slate-800">{fmtMoneda(v.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
