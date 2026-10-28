import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { Alert, Button, Card, Col, Drawer, Empty, Flex, Row, Skeleton as EsqueletoAntd, Statistic, Table, Tabs, Tag, Typography } from 'antd'
import { ArrowRightOutlined, MedicineBoxOutlined } from '@ant-design/icons'
import { BRAND, PDF_MARCA } from '@src/core/color'
import { Download, FileText, Weight, ClipboardList, TrendingUp, Pencil, Trash2, Syringe, LayoutDashboard, Bug, Scissors, Microscope, Pill } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// autoTable deja en el documento dónde terminó la última tabla; el tipo de jsPDF no lo declara.
const _ultimaTabla = (d: jsPDF) => (d as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
import { api, esVeterinario } from '../services/api'
import { useConfirmar } from '../components/Confirmar'
import { useToast } from '../components/Toast'
import RegistrosPaciente from '../components/RegistrosPaciente'
import RecetasPaciente from '../components/RecetasPaciente'
import ResumenPrevio from '../components/ResumenPrevio'
import { clinicaActual } from '../services/clinica'
import Disposicion from '../components/consulta/Disposicion'
import ColumnaPaciente from '../components/consulta/ColumnaPaciente'
import MascotaModal from '../components/cliente/MascotaModal'
import CitaModal from '../components/cliente/CitaModal'
import CambiarResponsable from '../components/cliente/CambiarResponsable'
import { formatoTiempo } from '../components/consulta/Cronometro'
import { hoyISOPeru } from '@src/utils/historiaClinica'

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

/** Variables de la clase .tabla-pildoras (index.css); los colores salen de core/color.ts. */
const estiloPildoras = {
  '--fila-bg': BRAND.panel,
  '--fila-bg-hover': BRAND.border,
} as React.CSSProperties

const fmtFechaHora = (iso) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' })


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
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">{title}</p>
      <div className="space-y-0.5 pl-1">{children}</div>
    </div>
  )
}

function HistoriaCard({ h, paciente, cliente, defaultOpen, onEdit, onDelete }) {
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
      <div className="flex items-stretch bg-brand-700 text-white">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center justify-between px-4 py-2.5 hover:bg-brand-800 text-left transition min-w-0"
        >
          <div className="min-w-0">
            <span className="text-sm font-semibold">{fmtFechaHora(h.fecha || h.creado_en)}</span>
            <span className="block text-xs text-brand-200 truncate">
              {h.motivo_consulta || '(sin motivo)'}
              {h.diagnostico_presuntivo ? ` · Dx: ${h.diagnostico_presuntivo}` : ''}
            </span>
            {h.veterinario_nombre && (
              <span className="block text-xs text-brand-200/90 truncate">
                Atendido por: {h.veterinario_nombre}
              </span>
            )}
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
          className="px-3 flex items-center justify-center border-l border-white/20 hover:bg-brand-800 transition shrink-0"
        >
          <Download className="w-4 h-4" />
        </button>
        {onEdit && (
          <button
            onClick={() => onEdit(h)}
            title="Editar esta consulta"
            className="px-3 flex items-center justify-center border-l border-white/20 hover:bg-brand-800 transition shrink-0"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(h)}
            title="Eliminar esta consulta"
            className="px-3 flex items-center justify-center border-l border-white/20 hover:bg-rose-600 transition shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
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
  { key: 'peso_kg',                 label: 'Peso',        unidad: 'kg',  color: '#2e6d5a' },
  { key: 'temperatura_c',           label: 'Temperatura', unidad: '°C',  color: '#f59e0b' },
  { key: 'frecuencia_cardiaca',     label: 'Frec. cardiaca', unidad: 'lpm', color: '#ef4444' },
  { key: 'frecuencia_respiratoria', label: 'Frec. respiratoria', unidad: 'rpm', color: '#0ea5e9' },
]

function GraficoEvolucion({ historias }) {
  const [metrica, setMetrica] = useState('peso_kg')
  const m = METRICAS.find(x => x.key === metrica)

  // Cronológico ascendente, solo consultas con valor para la métrica elegida
  const puntos = [...historias]
    .sort((a, b) => new Date(a.fecha || a.creado_en).getTime() - new Date(b.fecha || b.creado_en).getTime())
    .filter(h => h[metrica] != null)
    .map(h => ({
      fecha: new Date(h.fecha || h.creado_en).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
      valor: Number(h[metrica]),
    }))

  // Métricas que tienen al menos un dato (para no mostrar chips vacíos)
  const disponibles = METRICAS.filter(x => historias.some(h => h[x.key] != null))
  if (disponibles.length === 0) return null

  return (
    <section className="panel overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
        <TrendingUp className="w-4 h-4 text-brand-500" />
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

// ── Helpers PDF compartidos ──────────────────────────────────────────────────
const _MARCA = PDF_MARCA
const _W = 210, _M = 14

function _seccion(doc, title, rows) {
  const body = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (!body.length) return
  autoTable(doc, {
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 3 : 30,
    head: [[{ content: title, colSpan: 2 }]],
    body,
    theme: 'grid',
    headStyles: { fillColor: _MARCA, fontSize: 9, halign: 'left', textColor: 255 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', textColor: [90, 90, 90] },
      1: { cellWidth: _W - 2 * _M - 42 },
    },
    styles: { fontSize: 9, cellPadding: 2, valign: 'top', overflow: 'linebreak' },
    margin: { left: _M, right: _M },
  })
}

// Renderiza TODAS las secciones clínicas de una consulta (datos completos)
function _seccionesClinicas(doc, h) {
  _seccion(doc, 'Anamnesis', [
    ['Motivo', h.motivo_consulta],
    ['Tiempo de evolución', h.tiempo_evolucion],
    ['Tipo de consulta', getLabel('tipo_consulta', h.tipo_consulta)],
    ['Derivado por', h.derivado_por],
    ['Alimentación', [h.alimentacion_tipo, h.alimentacion_cantidad_gr ? `${h.alimentacion_cantidad_gr} g` : null].filter(Boolean).join(' · ')],
    ['Detalle', h.detalle],
    ['Antecedentes', h.antecedentes],
  ])
  _seccion(doc, 'Examen objetivo general (EOG)', [
    ['Peso', h.peso_kg ? `${h.peso_kg} kg` : null],
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
  _seccion(doc, 'Examen objetivo particular (EOP)', eop)
  _seccion(doc, 'Diagnóstico', [
    ['Presuntivo', h.diagnostico_presuntivo],
    ['Diferenciales', h.diagnosticos_diferenciales],
    ['Definitivo', h.diagnostico_definitivo],
  ])
  const tto = (h.tratamiento_items || []).filter(t => t.medicamento)
    .map(t => `• ${[t.medicamento, t.dosis, t.via, t.frecuencia, t.duracion].filter(Boolean).join(' · ')}`).join('\n')
  const vac = (h.vacunas_items || []).filter(v => v.vacuna)
    .map(v => `• ${[v.vacuna, v.lote, v.proxima_dosis ? `próx. ${v.proxima_dosis}` : null].filter(Boolean).join(' · ')}`).join('\n')
  _seccion(doc, 'Plan / Tratamiento', [
    ['Exámenes solicitados', h.examenes_solicitados],
    ['Tratamiento', tto],
    ['Vacunas', vac],
    ['Indicaciones', h.indicaciones],
    ['Pronóstico', getLabel('pronostico', h.pronostico)],
    ['Próxima cita', h.proxima_cita ? fmtFecha(h.proxima_cita) : null],
  ])
}

function _cabecera(doc, subtitulo, derechaArriba, derechaAbajo) {
  doc.setFillColor(..._MARCA)
  doc.rect(0, 0, _W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text(clinicaActual().nombre, _M, 11)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text(subtitulo, _M, 18)
  if (derechaArriba) doc.text(derechaArriba, _W - _M, 11, { align: 'right' })
  if (derechaAbajo)  doc.text(derechaAbajo, _W - _M, 18, { align: 'right' })
}

function _datosCabecera(doc, paciente, cliente) {
  const edad = paciente?.edad != null ? `${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''
  _seccion(doc, 'Datos del paciente', [
    ['Nombre', paciente?.nombre],
    ['Especie / Raza', [paciente?.especie, paciente?.raza].filter(Boolean).join(' / ')],
    ['Sexo / Edad', [paciente?.sexo, edad].filter(Boolean).join(' · ')],
  ])
  _seccion(doc, 'Datos del propietario', [
    ['Nombre', cliente?.nombre],
    ['DNI', cliente?.dni],
    ['Teléfono', cliente?.telefono],
    ['Dirección', cliente?.direccion],
  ])
}

// ── PDF de TODO el historial (completo: todas las consultas, todos los campos) ─
function generarPDF(paciente, cliente, historias) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  _cabecera(doc, 'Historia Clínica Completa', `${(historias || []).length} consulta(s)`, '')
  _datosCabecera(doc, paciente, cliente)

  // Cronológico ascendente (de la más antigua a la más reciente)
  const orden = [...(historias || [])].sort(
    (a, b) => new Date(a.fecha || a.creado_en).getTime() - new Date(b.fecha || b.creado_en).getTime())

  orden.forEach((h, i) => {
    autoTable(doc, {
      startY: (_ultimaTabla(doc)?.finalY ?? 26) + 6,
      body: [[`Consulta ${i + 1} — ${fmtFechaHora(h.fecha || h.creado_en)}` +
        (h.tipo_consulta ? ` · ${getLabel('tipo_consulta', h.tipo_consulta)}` : '') +
        (h.veterinario_nombre ? ` · Atendido por: ${h.veterinario_nombre}` : '')]],
      theme: 'plain',
      styles: { fontSize: 11, fontStyle: 'bold', textColor: _MARCA, cellPadding: { top: 2, bottom: 1, left: 0 } },
      margin: { left: _M, right: _M },
    })
    _seccionesClinicas(doc, h)
  })

  doc.save(`Historial_${paciente?.nombre ?? 'paciente'}.pdf`)
}

// ── Ficha detallada de UNA consulta (mascota + dueño + datos clínicos) ───────
function fichaConsultaPDF(paciente, cliente, h) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  _cabecera(doc, 'Ficha de Consulta Clínica',
    `Fecha: ${fmtFechaHora(h.fecha || h.creado_en)}`, `Consulta N° ${h.id}`)
  _datosCabecera(doc, paciente, cliente)
  _seccionesClinicas(doc, h)

  // Firma
  const y = Math.min((_ultimaTabla(doc)?.finalY ?? 26) + 22, 280)
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(_W - _M - 70, y, _W - _M, y)
  doc.setTextColor(110); doc.setFontSize(9)
  if (h.veterinario_nombre) {
    doc.text(h.veterinario_nombre, _W - _M - 35, y + 5, { align: 'center' })
    doc.text('Médico Veterinario', _W - _M - 35, y + 9, { align: 'center' })
  } else {
    doc.text('Médico Veterinario', _W - _M - 35, y + 5, { align: 'center' })
  }

  doc.save(`Consulta_${paciente?.nombre ?? 'paciente'}_${fmtFecha(h.fecha || h.creado_en).replace(/\s/g, '')}.pdf`)
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function HistorialPaciente() {
  const confirmar = useConfirmar()
  const { pacienteId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const toast = useToast()

  const [paciente, setPaciente]   = useState(state?.paciente ?? null)
  const [cliente, setCliente]     = useState(state?.cliente ?? null)
  const [historias, setHistorias] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [tab, setTab]             = useState('historia')
  const [turnos, setTurnos]       = useState([])
  // Línea de tiempo: la consulta abierta a la derecha, la ficha en edición y el turno nuevo
  const [detalle, setDetalle]     = useState(null)
  const [editandoFicha, setEditandoFicha] = useState(false)
  const [agendando, setAgendando] = useState(false)
  const [cambiandoResponsable, setCambiandoResponsable] = useState(false)
  const [refrescoTurnos, setRefrescoTurnos] = useState(0)
  // Avisos que trae la navegación: viene de guardar una consulta o de «Atender» un turno
  const [avisoCerrado, setAvisoCerrado] = useState(false)
  const citaId = state?.citaId ?? null

  const handleEdit = (h) => {
    navigate(`/consultas/${pacienteId}`, {
      state: { paciente, cliente, editarHistoriaId: h.id }
    })
  }

  const handleDelete = async (h) => {
    const fecha = new Date(h.fecha || h.creado_en).toLocaleDateString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima',
    })
    if (!await confirmar({
      titulo: 'Eliminar consulta',
      mensaje: `Se borrará la consulta del ${fecha} del historial de este paciente.`,
      detalle: 'No se puede deshacer. Es parte del registro clínico del animal.',
      confirmarTexto: 'Eliminar consulta',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/historias/${h.id}`)
      setHistorias(p => p.filter(x => x.id !== h.id))
      toast.success('Consulta eliminada correctamente')
    } catch (e) {
      toast.error(e.message ?? 'No se pudo eliminar la consulta.')
    }
  }

  // Próximos turnos del paciente, para el módulo de recordatorios de la derecha
  useEffect(() => {
    api.get(`/api/citas/?paciente_id=${pacienteId}&desde=${hoyISOPeru()}`)
      .then(c => setTurnos((Array.isArray(c) ? c : []).filter(t => t.estado === 'pendiente' || t.estado === 'confirmada')))
      .catch(() => setTurnos([]))
  }, [pacienteId, historias.length, refrescoTurnos])

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
    (a, b) => new Date(b.fecha || b.creado_en).getTime() - new Date(a.fecha || a.creado_en).getTime())
  const ultima = ordenadas[0] ?? null
  const pesoActual = ordenadas.find(h => h.peso_kg != null)?.peso_kg ?? null
  const proximaCita = ordenadas.map(h => h.proxima_cita).find(Boolean) ?? null

  // Vacunas: aplanamos las vacunas registradas en cada consulta (más reciente primero)
  const vacunas = ordenadas.flatMap(h =>
    (Array.isArray(h.vacunas_items) ? h.vacunas_items : [])
      .filter(v => v?.vacuna?.trim())
      .map(v => ({ fecha: h.fecha || h.creado_en, ...v }))
  )
  // Peso: registros con peso (más reciente primero)
  const pesos = ordenadas.filter(h => h.peso_kg != null)
    .map(h => ({ fecha: h.fecha || h.creado_en, peso: Number(h.peso_kg) }))

  // Línea de tiempo (pestaña «Historia»): consultas y vacunas aplicadas, lo más reciente primero
  const eventos = [
    ...ordenadas.map(h => ({
      clave: `c${h.id}`, tipo: 'Consulta', fecha: h.fecha || h.creado_en,
      detalle: `Motivo: ${h.motivo_consulta || '(sin motivo)'}`, consulta: h,
    })),
    ...vacunas.map((v, i) => ({
      clave: `v${i}`, tipo: 'Vacuna', fecha: v.fecha,
      detalle: `Vacuna: ${v.vacuna}${v.lote ? ` · lote ${v.lote}` : ''}`, consulta: null,
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const TABS = [
    // El mismo orden que Volki; «Resumen» y «Recetas» son nuestras y van al final
    { id: 'historia',   label: 'Historia',   Icon: FileText,        count: null },
    { id: 'consultas',  label: 'Consultas',  Icon: ClipboardList,   count: historias.length },
    { id: 'complementarios', label: 'M. Complementarios', Icon: Microscope, count: null },
    { id: 'vacunas',    label: 'Vacunas',    Icon: Syringe,         count: vacunas.length },
    { id: 'antiparasitarios', label: 'Antiparasitarios', Icon: Bug, count: null },
    { id: 'estetica',   label: 'Estética',   Icon: Scissors,        count: null },
    { id: 'peso',       label: 'Peso',       Icon: Weight,          count: pesos.length },
    { id: 'resumen',    label: 'Resumen',    Icon: LayoutDashboard, count: null },
    { id: 'recetas',    label: 'Recetas',    Icon: Pill,            count: null },
  ]

  const responsable = cliente ? { id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono } : null

  const migas = [
    { title: <Link to="/clientes">Clientes</Link> },
    { title: responsable ? <Link to={`/clientes/${responsable.id}`}>{responsable.nombre}</Link> : '…' },
    { title: paciente?.nombre ?? `Paciente #${pacienteId}` },
  ]

  // Como en Volki, la fila de pestañas lleva la acción principal a la derecha; el nombre y el PDF
  // están en la columna derecha y las migas arriba, así que no hay una fila de título aparte.
  const atender = (
    <Button type="primary" icon={<MedicineBoxOutlined />}
      onClick={() => navigate(`/consultas/${pacienteId}`, { state: { paciente, cliente, citaId } })}>
      Atender / Nueva consulta
    </Button>
  )

  return (
    <Disposicion
      migas={migas}
      lateral={!paciente ? <EsqueletoAntd active paragraph={{ rows: 8 }} /> : (
        <ColumnaPaciente
          paciente={paciente} responsable={responsable}
          historias={historias} turnos={turnos}
          onDescargar={ordenadas.length > 0 ? () => generarPDF(paciente, cliente, ordenadas) : undefined}
          onEditar={() => setEditandoFicha(true)}
          onNuevoRecordatorio={() => setAgendando(true)}
          onCambiarResponsable={() => setCambiandoResponsable(true)}
        />
      )}
    >
      <Flex vertical gap={16} className="animar">

        {!avisoCerrado && state?.guardada && (
          <Alert
            type="success" showIcon closable onClose={() => setAvisoCerrado(true)}
            title={state.guardada === 'actualizada'
              ? 'Consulta actualizada.'
              : `Consulta guardada.${typeof state.segundos === 'number' ? ` Tiempo de registro: ${formatoTiempo(state.segundos)}.` : ''}`}
          />
        )}
        {!avisoCerrado && !state?.guardada && citaId && (
          <Alert
            type="info" showIcon closable onClose={() => setAvisoCerrado(true)}
            title="Turno por atender. Pulsa «Atender / Nueva consulta» para empezar; al guardar, el turno queda atendido."
          />
        )}

        {error && (
          <Alert type="error" showIcon title={error} />
        )}

        {/* Pestañas (estilo ficha del paciente). Ahora son el Tabs de Ant Design:
            en móvil se desplazan solas dentro de su caja, sin estirar la página
            (el `min-w-0` y el `overflow-x-auto` que hacían falta a mano). */}
        <Tabs
          activeKey={tab}
          onChange={setTab}
          tabBarExtraContent={atender}
          style={{ minWidth: 0 }}
          items={TABS.map(({ id, label, Icon, count }) => ({
            key: id,
            icon: <Icon size={15} />,
            label: (
              <span>
                {label}
                {count != null && count > 0 && <Tag style={{ marginInlineStart: 8, marginInlineEnd: 0 }}>{count}</Tag>}
              </span>
            ),
          }))}
        />

        {loading ? (
          <EsqueletoAntd active paragraph={{ rows: 6 }} />
        ) : (
          <>
            {/* ── HISTORIA: línea de tiempo, como en Volki ────────────────── */}
            {tab === 'historia' && (
              eventos.length === 0 ? (
                <Empty
                  description="Aún no se han registrado atenciones para el paciente."
                  styles={{ root: { padding: '32px 0' } }}
                >
                  <Typography.Text type="secondary">Registra una nueva atención y comienza a construir su historial clínico.</Typography.Text>
                </Empty>
              ) : (
                <Flex vertical gap={14}>
                  {eventos.map(ev => (
                    <Flex key={ev.clave} vertical gap={6}>
                      <Tag
                        color={ev.tipo === 'Consulta' ? 'green' : 'blue'}
                        icon={ev.tipo === 'Consulta' ? <MedicineBoxOutlined /> : <Syringe size={12} style={{ marginRight: 4 }} />}
                        style={{ alignSelf: 'flex-start', margin: 0 }}
                      >
                        {ev.tipo}
                      </Tag>
                      <Flex
                        justify="space-between" align="center" gap={12}
                        style={{ background: BRAND.panel, borderRadius: 8, padding: '10px 14px', marginLeft: 12 }}
                      >
                        <Flex vertical style={{ minWidth: 0 }}>
                          <Typography.Text><strong>Fecha:</strong> {fmtFecha(ev.fecha)}</Typography.Text>
                          <Typography.Text ellipsis>{ev.detalle}</Typography.Text>
                        </Flex>
                        {ev.consulta && (
                          <Button
                            type="text" aria-label="Abrir la consulta" icon={<ArrowRightOutlined />}
                            onClick={() => setDetalle(ev.consulta)}
                          />
                        )}
                      </Flex>
                    </Flex>
                  ))}
                </Flex>
              )
            )}

            {/* ── RESUMEN ─────────────────────────────────────────────────── */}
            {tab === 'resumen' && (
              <Flex vertical gap={20}>
                {esVeterinario() && <ResumenPrevio pacienteId={pacienteId} />}
                <Row gutter={[12, 12]}>
                  {[
                    { titulo: 'Consultas', valor: historias.length },
                    { titulo: 'Última visita', valor: ultima ? fmtFecha(ultima.fecha || ultima.creado_en) : '—' },
                    { titulo: 'Peso reciente', valor: pesoActual != null ? `${pesoActual} kg` : '—' },
                    { titulo: 'Próxima cita', valor: proximaCita ? fmtFecha(proximaCita) : 'Sin programar' },
                  ].map(({ titulo, valor }) => (
                    <Col key={titulo} xs={12} md={6}>
                      <Card size="small">
                        <Statistic title={titulo} value={valor} styles={{ content: { fontSize: 20, fontWeight: 700 } }} />
                      </Card>
                    </Col>
                  ))}
                </Row>
                {historias.length > 0 && <GraficoEvolucion historias={historias} />}
              </Flex>
            )}

            {/* ── CONSULTAS ───────────────────────────────────────────────── */}
            {tab === 'consultas' && (
              <Flex vertical gap={12}>
                {ordenadas.length === 0 ? (
                  <Empty
                    description="Aún no hay consultas registradas"
                    styles={{ root: { padding: '32px 0' } }}
                  >
                    <Typography.Text type="secondary">Usa «Atender / Nueva consulta» para registrar la primera.</Typography.Text>
                  </Empty>
                ) : (
                  ordenadas.map((h, i) => (
                    <HistoriaCard
                      key={h.id}
                      h={h}
                      paciente={paciente}
                      cliente={cliente}
                      defaultOpen={i === 0}
                      onEdit={handleEdit}
                      onDelete={esVeterinario() ? handleDelete : undefined}
                    />
                  ))
                )}
              </Flex>
            )}

            {/* ── VACUNAS ─────────────────────────────────────────────────── */}
            {tab === 'vacunas' && (
              <div style={estiloPildoras}>
                <Table
                  className="tabla-pildoras" rowKey={(_, i) => String(i)} size="middle" pagination={false}
                  scroll={{ x: 'max-content' }} dataSource={vacunas}
                  locale={{ emptyText: 'Sin vacunas registradas en las consultas' }}
                  columns={[
                    { title: 'Fecha', key: 'fecha', render: (_: unknown, v: { fecha: string }) => fmtFecha(v.fecha) },
                    { title: 'Vacuna', dataIndex: 'vacuna', key: 'vacuna', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
                    { title: 'Lote', dataIndex: 'lote', key: 'lote', render: (v: string) => v || '—' },
                    { title: 'Próxima dosis', dataIndex: 'proxima_dosis', key: 'proxima', render: (v: string) => v || '—' },
                  ]}
                />
              </div>
            )}

            {/* ── PESO ────────────────────────────────────────────────────── */}
            {tab === 'peso' && (
              <Flex vertical gap={16}>
                {historias.length > 0 && <GraficoEvolucion historias={historias} />}
                <div style={estiloPildoras}>
                  <Table<{ fecha: string; peso: number }>
                    className="tabla-pildoras" rowKey={(_, i) => String(i)} size="middle" pagination={false}
                    dataSource={pesos} locale={{ emptyText: 'Sin registros de peso' }}
                    columns={[
                      { title: 'Fecha', key: 'fecha', render: (_: unknown, p) => fmtFecha(p.fecha) },
                      { title: 'Peso', key: 'peso', align: 'right' as const, render: (_: unknown, p) => <Typography.Text strong>{p.peso} kg</Typography.Text> },
                    ]}
                  />
                </div>
              </Flex>
            )}

            {/* ── RECETAS ─────────────────────────────────────────────────── */}
            {tab === 'recetas' && (
              <RecetasPaciente pacienteId={pacienteId} paciente={paciente} cliente={cliente} />
            )}

            {/* ── M. COMPLEMENTARIOS ──────────────────────────────────────── */}
            {tab === 'complementarios' && (
              <RegistrosPaciente pacienteId={pacienteId} tipo="complementario" labelProducto="Método" />
            )}

            {/* ── ANTIPARASITARIOS ────────────────────────────────────────── */}
            {tab === 'antiparasitarios' && (
              <RegistrosPaciente pacienteId={pacienteId} tipo="antiparasitario" labelProducto="Producto" />
            )}

            {/* ── ESTÉTICA ────────────────────────────────────────────────── */}
            {tab === 'estetica' && (
              <RegistrosPaciente pacienteId={pacienteId} tipo="estetica" labelProducto="Servicio" />
            )}

          </>
        )}

      </Flex>

      {/* Consulta abierta desde la línea de tiempo: la misma tarjeta con PDF, editar y eliminar */}
      <Drawer
        open={!!detalle} onClose={() => setDetalle(null)} size="large" destroyOnHidden
        title={detalle ? `Consulta del ${fmtFecha(detalle.fecha || detalle.creado_en)}` : ''}
      >
        {detalle && (
          <HistoriaCard
            h={detalle} paciente={paciente} cliente={cliente} defaultOpen
            onEdit={handleEdit}
            onDelete={h => { setDetalle(null); handleDelete(h) }}
          />
        )}
      </Drawer>

      <MascotaModal
        abierto={editandoFicha} mascota={paciente}
        onCerrar={() => setEditandoFicha(false)}
        onGuardado={act => { setPaciente(prev => ({ ...prev, ...act })); setEditandoFicha(false) }}
      />
      {paciente && (
        <CambiarResponsable
          abierto={cambiandoResponsable} pacienteId={Number(pacienteId)} pacienteNombre={paciente.nombre}
          clienteActualId={cliente?.id} onCerrar={() => setCambiandoResponsable(false)}
          onCambiado={nuevo => {
            setCliente(nuevo)
            setPaciente(prev => ({ ...prev, cliente_id: nuevo.id }))
            setCambiandoResponsable(false)
            toast.success('Responsable cambiado.')
          }}
        />
      )}
      <CitaModal
        abierto={agendando}
        paciente={paciente ? { id: Number(pacienteId), nombre: paciente.nombre } : null}
        onCerrar={() => setAgendando(false)}
        onCreada={() => { setAgendando(false); setRefrescoTurnos(n => n + 1); toast.success('Turno agendado.') }}
      />
    </Disposicion>
  )
}
