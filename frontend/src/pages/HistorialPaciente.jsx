import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, Stethoscope, Download, FileText, Weight, CalendarClock, ClipboardList, TrendingUp, Syringe } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../services/api'

// ── Catálogos de etiquetas (solo lectura) ───────────────────────────────────
const SISTEMAS_EOP = [
  'tegumentario', 'cardiovascular', 'respiratorio', 'digestivo',
  'urinario', 'reproductor', 'nervioso', 'musculoesqueletico',
  'linfatico', 'sentidos', 'endocrino',
]
const SISTEMA_LABELS = {
  tegumentario: 'Tegumentario', cardiovascular: 'Cardiovascular',
  respiratorio: 'Respiratorio', digestivo: 'Digestivo',
  urinario: 'Urinario', reproductor: 'Reproductor',
  nervioso: 'Nervioso', musculoesqueletico: 'Músculo-esquelético',
  linfatico: 'Linfático', sentidos: 'Sentidos especiales', endocrino: 'Endocrino',
}
const OPT = {
  tipo_consulta: { primera_vez: 'Primera vez', control: 'Control', urgencia: 'Urgencia', vacunacion: 'Vacunación' },
  mucosas: { rosadas: 'Rosadas', palidas: 'Pálidas', congestivas: 'Congestivas', ictericas: 'Ictéricas', cianoticas: 'Cianóticas' },
  tllc: { normal: 'Normal (<2 seg)', aumentado: 'Aumentado (>2 seg)' },
  estado_sensorio: { alerta: 'Alerta', deprimido: 'Deprimido', estuporoso: 'Estuporoso', comatoso: 'Comatoso' },
  hidratacion: { normal: 'Normal', leve_5: 'Deshidratación leve (5%)', moderada_7: 'Deshidratación moderada (7%)', grave_10: 'Deshidratación grave (10%)', shock_12: 'Shock hipovolémico (>12%)' },
  pulso: { fuerte: 'Fuerte', debil: 'Débil', filiforme: 'Filiforme', ausente: 'Ausente' },
  pronostico: { favorable: 'Favorable', reservado: 'Reservado', desfavorable: 'Desfavorable', grave: 'Grave' },
  sistema_estado: { normal: 'Normal', alterado: 'Alterado', no_evaluado: 'No evaluado' },
}
const getLabel = (field, value) => (value ? (OPT[field]?.[value] ?? value) : value)

const fmtFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

const Spinner = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 animate-spin text-purple-400">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)

// ── Tarjeta de consulta (solo lectura) ──────────────────────────────────────
function DRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-1.5 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-400 whitespace-nowrap pt-px">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}
function DSec({ title, show, children }) {
  if (!show) return null
  return (
    <div className="pt-2 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-1">{title}</p>
      <div className="space-y-0.5 pl-1">{children}</div>
    </div>
  )
}

function HistoriaCard({ h, paciente, cliente, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const txItems = Array.isArray(h.tratamiento_items) ? h.tratamiento_items : []
  const vxItems = Array.isArray(h.vacunas_items) ? h.vacunas_items : []
  const epEntries = SISTEMAS_EOP.map(s => {
    const val = (h.examen_particular || {})[s]
    if (!val) return null
    const texto = typeof val === 'string'
      ? val
      : [val.estado ? getLabel('sistema_estado', val.estado) : null, val.detalle].filter(Boolean).join(' — ')
    return texto ? { label: SISTEMA_LABELS[s], texto } : null
  }).filter(Boolean)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-stretch bg-purple-700 text-white">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center justify-between px-4 py-2.5 hover:bg-purple-800 text-left transition min-w-0"
        >
          <div className="min-w-0">
            <span className="text-sm font-semibold">{fmtFechaHora(h.fecha || h.creado_en)}</span>
            <span className="block text-xs text-purple-200 truncate">
              {h.motivo_consulta || '(sin motivo)'}
              {h.diagnostico_presuntivo ? ` · Dx: ${h.diagnostico_presuntivo}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {h.peso_kg && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{h.peso_kg} kg</span>}
            {h.tipo_consulta && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded">{getLabel('tipo_consulta', h.tipo_consulta)}</span>
            )}
          </div>
        </button>
        <button
          onClick={() => fichaConsultaPDF(paciente, cliente, h)}
          title="Descargar esta consulta en PDF"
          className="px-3 flex items-center justify-center border-l border-white/20 hover:bg-purple-800 transition shrink-0"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="px-4 py-3 divide-y divide-slate-100 space-y-2">
          <DSec title="Anamnesis" show={h.motivo_consulta || h.tiempo_evolucion || h.detalle || h.antecedentes}>
            <DRow label="Motivo" value={h.motivo_consulta} />
            <DRow label="Evolución" value={h.tiempo_evolucion} />
            <DRow label="Detalle" value={h.detalle} />
            <DRow label="Antecedentes" value={h.antecedentes} />
          </DSec>
          <DSec title="EOG — Constantes" show={h.peso_kg || h.temperatura_c || h.frecuencia_cardiaca || h.mucosas || h.hidratacion}>
            <div className="flex flex-wrap gap-x-5 gap-y-0.5">
              {h.peso_kg && <DRow label="Peso" value={`${h.peso_kg} kg`} />}
              {h.temperatura_c && <DRow label="T°" value={`${h.temperatura_c} °C`} />}
              {h.frecuencia_cardiaca && <DRow label="FC" value={`${h.frecuencia_cardiaca} lpm`} />}
              {h.frecuencia_respiratoria && <DRow label="FR" value={`${h.frecuencia_respiratoria} rpm`} />}
              {h.condicion_corporal && <DRow label="CC" value={`${h.condicion_corporal}/9`} />}
            </div>
            <DRow label="Mucosas" value={getLabel('mucosas', h.mucosas)} />
            <DRow label="TLLC" value={getLabel('tllc', h.tllc)} />
            <DRow label="Sensorio" value={getLabel('estado_sensorio', h.estado_sensorio)} />
            <DRow label="Hidrat." value={getLabel('hidratacion', h.hidratacion)} />
            <DRow label="Pulso" value={getLabel('pulso', h.pulso)} />
            <DRow label="Linfon." value={h.linfonodulos} />
          </DSec>
          <DSec title="EOP — Sistemas" show={epEntries.length > 0}>
            {epEntries.map(({ label, texto }) => <DRow key={label} label={label} value={texto} />)}
          </DSec>
          <DSec title="Diagnóstico" show={h.diagnostico_presuntivo || h.diagnosticos_diferenciales || h.diagnostico_definitivo}>
            <DRow label="Presuntivo" value={h.diagnostico_presuntivo} />
            <DRow label="Diferenciales" value={h.diagnosticos_diferenciales} />
            <DRow label="Definitivo" value={h.diagnostico_definitivo} />
          </DSec>
          <DSec title="Plan" show={txItems.length > 0 || vxItems.length > 0 || h.examenes_solicitados || h.indicaciones}>
            <DRow label="Exámenes" value={h.examenes_solicitados} />
            {txItems.map((t, i) => (
              <DRow key={i} label={`Tto ${i + 1}`} value={[t.medicamento, t.dosis, t.via, t.frecuencia, t.duracion].filter(Boolean).join(' · ')} />
            ))}
            {vxItems.map((v, i) => (
              <DRow key={i} label={`Vac ${i + 1}`} value={[v.vacuna, v.lote, v.proxima_dosis ? `próx. ${v.proxima_dosis}` : null].filter(Boolean).join(' · ')} />
            ))}
            <DRow label="Indicaciones" value={h.indicaciones} />
            <DRow label="Pronóstico" value={getLabel('pronostico', h.pronostico)} />
            <DRow label="Próx. cita" value={h.proxima_cita ? fmtFecha(h.proxima_cita) : null} />
          </DSec>
        </div>
      )}
    </div>
  )
}

// ── Gráfico de evolución clínica (peso / T° / FC / FR) ───────────────────────
const METRICAS = [
  { key: 'peso_kg',                 label: 'Peso',        unidad: 'kg',  color: '#7c3aed' },
  { key: 'temperatura_c',           label: 'Temperatura', unidad: '°C',  color: '#f59e0b' },
  { key: 'frecuencia_cardiaca',     label: 'Frec. cardiaca', unidad: 'lpm', color: '#ef4444' },
  { key: 'frecuencia_respiratoria', label: 'Frec. respiratoria', unidad: 'rpm', color: '#0ea5e9' },
]

function GraficoEvolucion({ historias }) {
  const [metrica, setMetrica] = useState('peso_kg')
  const m = METRICAS.find(x => x.key === metrica)

  // Cronológico ascendente, solo consultas con valor para la métrica elegida
  const puntos = [...historias]
    .sort((a, b) => new Date(a.fecha || a.creado_en) - new Date(b.fecha || b.creado_en))
    .filter(h => h[metrica] != null)
    .map(h => ({
      fecha: new Date(h.fecha || h.creado_en).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
      valor: Number(h[metrica]),
    }))

  // Métricas que tienen al menos un dato (para no mostrar chips vacíos)
  const disponibles = METRICAS.filter(x => historias.some(h => h[x.key] != null))
  if (disponibles.length === 0) return null

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
        <TrendingUp className="w-4 h-4 text-purple-500" />
        <h2 className="text-sm font-semibold text-slate-700">Evolución clínica</h2>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {disponibles.map(x => (
            <button
              key={x.key}
              onClick={() => setMetrica(x.key)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${
                metrica === x.key
                  ? 'text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
              style={metrica === x.key ? { backgroundColor: x.color } : undefined}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-4">
        {puntos.length < 2 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            {puntos.length === 1
              ? `Solo hay un registro de ${m.label.toLowerCase()} (${puntos[0].valor} ${m.unidad}). Se necesitan al menos 2 consultas para graficar la evolución.`
              : `Sin registros de ${m.label.toLowerCase()} en las consultas.`}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={puntos} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(v) => [`${v} ${m.unidad}`, m.label]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
              <Line
                type="monotone" dataKey="valor" stroke={m.color} strokeWidth={2.5}
                dot={{ r: 4, fill: m.color }} activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

// ── PDF de todo el historial ────────────────────────────────────────────────
function generarPDF(paciente, cliente, historias) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFillColor(88, 28, 135)
  doc.rect(0, 0, 297, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12); doc.setFont(undefined, 'bold')
  doc.text('Veterinaria Los Pinos — Historia Clínica', 12, 12)
  autoTable(doc, {
    startY: 22,
    head: [['Paciente', 'Especie / Raza', 'Propietario']],
    body: [[
      paciente?.nombre ?? '',
      `${paciente?.especie ?? ''} / ${paciente?.raza ?? ''}`,
      cliente?.nombre ?? '',
    ]],
    headStyles: { fillColor: [88, 28, 135], fontSize: 8 },
    styles: { fontSize: 8 }, margin: { left: 12, right: 12 },
  })
  const filas = historias.map((h, i) => {
    const constantes = [
      h.peso_kg ? `Peso: ${h.peso_kg} kg` : null,
      h.temperatura_c ? `T°: ${h.temperatura_c} °C` : null,
      h.frecuencia_cardiaca ? `FC: ${h.frecuencia_cardiaca} lpm` : null,
      h.mucosas ? `Muc: ${getLabel('mucosas', h.mucosas)}` : null,
      h.hidratacion ? `Hid: ${getLabel('hidratacion', h.hidratacion)}` : null,
    ].filter(Boolean).join('\n')
    const tto = (h.tratamiento_items || []).filter(t => t.medicamento)
      .map(t => `• ${[t.medicamento, t.dosis, t.via, t.frecuencia].filter(Boolean).join(' ')}`)
      .join('\n')
    return [
      i + 1,
      new Date(h.fecha || h.creado_en).toLocaleDateString('es-PE'),
      [h.motivo_consulta, getLabel('tipo_consulta', h.tipo_consulta)].filter(Boolean).join('\n'),
      constantes,
      h.diagnostico_presuntivo ?? '',
      tto || (h.indicaciones ?? ''),
    ]
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [['#', 'Fecha', 'Motivo / Tipo', 'Constantes EOG', 'Dx Presuntivo', 'Tratamiento']],
    body: filas,
    headStyles: { fillColor: [88, 28, 135], fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 8 }, 1: { cellWidth: 20 }, 2: { cellWidth: 45 },
      3: { cellWidth: 45 }, 4: { cellWidth: 55 }, 5: { cellWidth: 85 },
    },
    margin: { left: 12, right: 12 },
    styles: { fontSize: 7.5, cellPadding: 2 },
  })
  doc.save(`Historial_${paciente?.nombre ?? 'paciente'}.pdf`)
}

// ── Ficha detallada de UNA consulta (mascota + dueño + datos clínicos) ───────
function fichaConsultaPDF(paciente, cliente, h) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 14
  const morado = [88, 28, 135]

  // Encabezado
  doc.setFillColor(...morado)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text('Veterinaria Los Pinos', M, 11)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text('Ficha de Consulta Clínica', M, 18)
  doc.setFontSize(9)
  doc.text(`Fecha: ${fmtFechaHora(h.fecha || h.creado_en)}`, W - M, 11, { align: 'right' })
  doc.text(`Consulta N° ${h.id}`, W - M, 18, { align: 'right' })

  const section = (title, rows) => {
    const body = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
    if (!body.length) return
    autoTable(doc, {
      startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 3 : 30,
      head: [[{ content: title, colSpan: 2 }]],
      body,
      theme: 'grid',
      headStyles: { fillColor: morado, fontSize: 9, halign: 'left', textColor: 255 },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold', textColor: [90, 90, 90] },
        1: { cellWidth: W - 2 * M - 42 },
      },
      styles: { fontSize: 9, cellPadding: 2, valign: 'top', overflow: 'linebreak' },
      margin: { left: M, right: M },
    })
  }

  const edad = paciente?.edad != null ? `${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''
  section('Datos del paciente', [
    ['Nombre', paciente?.nombre],
    ['Especie / Raza', [paciente?.especie, paciente?.raza].filter(Boolean).join(' / ')],
    ['Edad', edad],
    ['Peso en consulta', h.peso_kg ? `${h.peso_kg} kg` : null],
  ])
  section('Datos del propietario', [
    ['Nombre', cliente?.nombre],
    ['DNI', cliente?.dni],
    ['Teléfono', cliente?.telefono],
    ['Dirección', cliente?.direccion],
  ])
  section('Anamnesis', [
    ['Motivo', h.motivo_consulta],
    ['Tiempo de evolución', h.tiempo_evolucion],
    ['Tipo de consulta', getLabel('tipo_consulta', h.tipo_consulta)],
    ['Derivado por', h.derivado_por],
    ['Alimentación', [h.alimentacion_tipo, h.alimentacion_cantidad_gr ? `${h.alimentacion_cantidad_gr} g` : null].filter(Boolean).join(' · ')],
    ['Detalle', h.detalle],
    ['Antecedentes', h.antecedentes],
  ])
  section('Examen objetivo general (EOG)', [
    ['Temperatura', h.temperatura_c ? `${h.temperatura_c} °C` : null],
    ['Frec. cardiaca', h.frecuencia_cardiaca ? `${h.frecuencia_cardiaca} lpm` : null],
    ['Frec. respiratoria', h.frecuencia_respiratoria ? `${h.frecuencia_respiratoria} rpm` : null],
    ['Condición corporal', h.condicion_corporal ? `${h.condicion_corporal}/9` : null],
    ['Mucosas', getLabel('mucosas', h.mucosas)],
    ['TLLC', getLabel('tllc', h.tllc)],
    ['Sensorio', getLabel('estado_sensorio', h.estado_sensorio)],
    ['Hidratación', getLabel('hidratacion', h.hidratacion)],
    ['Pulso', getLabel('pulso', h.pulso)],
    ['Linfonódulos', h.linfonodulos],
  ])
  const eop = SISTEMAS_EOP.map(s => {
    const val = (h.examen_particular || {})[s]
    if (!val) return null
    const texto = typeof val === 'string'
      ? val
      : [val.estado ? getLabel('sistema_estado', val.estado) : null, val.detalle].filter(Boolean).join(' — ')
    return texto ? [SISTEMA_LABELS[s], texto] : null
  }).filter(Boolean)
  section('Examen objetivo particular (EOP)', eop)
  section('Diagnóstico', [
    ['Presuntivo', h.diagnostico_presuntivo],
    ['Diferenciales', h.diagnosticos_diferenciales],
    ['Definitivo', h.diagnostico_definitivo],
  ])
  const tto = (h.tratamiento_items || []).filter(t => t.medicamento)
    .map(t => `• ${[t.medicamento, t.dosis, t.via, t.frecuencia, t.duracion].filter(Boolean).join(' · ')}`).join('\n')
  const vac = (h.vacunas_items || []).filter(v => v.vacuna)
    .map(v => `• ${[v.vacuna, v.lote, v.proxima_dosis ? `próx. ${v.proxima_dosis}` : null].filter(Boolean).join(' · ')}`).join('\n')
  section('Plan / Tratamiento', [
    ['Exámenes solicitados', h.examenes_solicitados],
    ['Tratamiento', tto],
    ['Vacunas', vac],
    ['Indicaciones', h.indicaciones],
    ['Pronóstico', getLabel('pronostico', h.pronostico)],
    ['Próxima cita', h.proxima_cita ? fmtFecha(h.proxima_cita) : null],
  ])

  // Firma
  const y = Math.min(doc.lastAutoTable.finalY + 22, 280)
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(W - M - 70, y, W - M, y)
  doc.setTextColor(110); doc.setFontSize(9)
  doc.text('Médico Veterinario', W - M - 35, y + 5, { align: 'center' })

  doc.save(`Consulta_${paciente?.nombre ?? 'paciente'}_${fmtFecha(h.fecha || h.creado_en).replace(/\s/g, '')}.pdf`)
}

// ── Carnet de vacunación (PDF) ────────────────────────────────────────────────
function carnetVacunacionPDF(paciente, cliente, historias) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 14
  const morado = [88, 28, 135]

  doc.setFillColor(...morado); doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text('Veterinaria Los Pinos', M, 11)
  doc.setFontSize(10); doc.setFont(undefined, 'normal')
  doc.text('Carnet de Vacunación', M, 18)

  autoTable(doc, {
    startY: 30,
    body: [[
      `Paciente: ${paciente?.nombre ?? ''}`,
      `Especie/Raza: ${[paciente?.especie, paciente?.raza].filter(Boolean).join(' / ')}`,
      `Propietario: ${cliente?.nombre ?? ''}`,
    ]],
    theme: 'plain', styles: { fontSize: 9 }, margin: { left: M, right: M },
  })

  // Reunir todas las vacunas de todas las consultas (cronológico ascendente)
  const filas = []
  ;[...historias]
    .sort((a, b) => new Date(a.fecha || a.creado_en) - new Date(b.fecha || b.creado_en))
    .forEach(h => {
      (h.vacunas_items || []).forEach(v => {
        if (v && v.vacuna) {
          filas.push([
            v.vacuna,
            v.lote || '—',
            fmtFecha(h.fecha || h.creado_en),
            v.proxima_dosis || '—',
          ])
        }
      })
    })

  if (filas.length === 0) {
    doc.setTextColor(120); doc.setFontSize(10)
    doc.text('No hay vacunas registradas para este paciente.', M, doc.lastAutoTable.finalY + 12)
  } else {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [['Vacuna', 'Lote', 'Fecha aplicada', 'Próxima dosis']],
      body: filas,
      headStyles: { fillColor: morado, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2.5 },
      margin: { left: M, right: M },
    })
  }

  doc.setTextColor(150); doc.setFontSize(8)
  doc.text('Documento generado por el sistema de Veterinaria Los Pinos', W / 2, 285, { align: 'center' })
  doc.save(`Carnet_${paciente?.nombre ?? 'paciente'}.pdf`)
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function HistorialPaciente() {
  const { pacienteId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()

  const [paciente, setPaciente]   = useState(state?.paciente ?? null)
  const [cliente, setCliente]     = useState(state?.cliente ?? null)
  const [historias, setHistorias] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true); setError(null)
      try {
        const [hists, pac] = await Promise.all([
          api.get(`/api/pacientes/${pacienteId}/historias/`),
          state?.paciente ? Promise.resolve(state.paciente) : api.get(`/api/pacientes/${pacienteId}`),
        ])
        setHistorias(Array.isArray(hists) ? hists : [])
        if (pac) setPaciente(pac)

        // Datos del dueño (para la ficha PDF) — desde el state o por su cliente_id
        if (state?.cliente) {
          setCliente(state.cliente)
        } else if (pac?.cliente_id) {
          const cli = await api.get(`/api/clientes/${pac.cliente_id}`).catch(() => null)
          if (cli) setCliente(cli)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [pacienteId])

  // Más reciente primero
  const ordenadas = [...historias].sort(
    (a, b) => new Date(b.fecha || b.creado_en) - new Date(a.fecha || a.creado_en))
  const ultima = ordenadas[0] ?? null
  const pesoActual = ordenadas.find(h => h.peso_kg != null)?.peso_kg ?? null
  const proximaCita = ordenadas.map(h => h.proxima_cita).find(Boolean) ?? null

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-purple-700 transition font-medium">
          <ChevronLeft className="w-4 h-4" /> Volver
        </button>
        <span className="text-slate-300">/</span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-800 truncate">
            Historial — {paciente?.nombre ?? `Paciente #${pacienteId}`}
          </h1>
          {paciente && (
            <p className="text-xs text-slate-400">
              {paciente.especie}{paciente.raza ? ` · ${paciente.raza}` : ''}
              {paciente.edad != null ? ` · ${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''}
              {cliente?.nombre ? ` · ${cliente.nombre}` : ''}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => carnetVacunacionPDF(paciente, cliente, ordenadas)}
            disabled={ordenadas.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-50 transition disabled:opacity-40"
          >
            <Syringe className="w-4 h-4" /> Carnet
          </button>
          <button
            onClick={() => generarPDF(paciente, cliente, ordenadas)}
            disabled={ordenadas.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={() => navigate(`/consultas/${pacienteId}`, { state: { paciente, cliente } })}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-sm transition"
          >
            <Stethoscope className="w-4 h-4" /> Atender / Nueva consulta
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-5 max-w-4xl w-full mx-auto">

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">⚠ {error}</div>
        )}

        {/* Resumen de evolución */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Consultas</p>
              <p className="text-xl font-bold text-slate-800">{loading ? '—' : historias.length}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Última visita</p>
              <p className="text-sm font-bold text-slate-800">{ultima ? fmtFecha(ultima.fecha || ultima.creado_en) : '—'}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <Weight className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Peso reciente</p>
              <p className="text-sm font-bold text-slate-800">{pesoActual != null ? `${pesoActual} kg` : '—'}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CalendarClock className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Próxima cita</p>
              <p className="text-sm font-bold text-slate-800">{proximaCita ? fmtFecha(proximaCita) : 'Sin programar'}</p>
            </div>
          </div>
        </div>

        {/* Gráfico de evolución clínica */}
        {!loading && historias.length > 0 && <GraficoEvolucion historias={historias} />}

        {/* Timeline de consultas */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Consultas registradas</h2>
            <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{ordenadas.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Spinner /> <span className="text-sm">Cargando historial…</span>
            </div>
          ) : ordenadas.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-16 text-slate-400">
              <FileText className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-500">Aún no hay consultas registradas</p>
              <p className="text-xs mt-1">Usa "Atender / Nueva consulta" para registrar la primera.</p>
            </div>
          ) : (
            ordenadas.map((h, i) => (
              <HistoriaCard key={h.id} h={h} paciente={paciente} cliente={cliente} defaultOpen={i === 0} />
            ))
          )}
        </section>

      </main>
    </div>
  )
}
