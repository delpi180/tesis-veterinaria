import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { api } from '../services/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Iconos ────────────────────────────────────────────────────────────────
const MicIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
)
const StopIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)
const SparklesIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75L5 3zm10 10l1.5 4.5 4.5 1.5-4.5 1.5L15 24l-1.5-4.5L9 18l4.5-1.5L15 13zm-5-8l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
  </svg>
)
const SaveIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
)
const CheckIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)
const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)
const ClipboardIcon = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)
const ChevronDownIcon = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
const DownloadIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
)

// ── Campos SOAP estructurados ─────────────────────────────────────────────
const FIELDS = [
  {
    key: 'motivoAnamnesis', label: 'Motivo y Anamnesis', badge: 'S — Subjetivo',
    placeholder: 'Síntomas reportados por el propietario, historia clínica, comportamiento observado…',
    border: 'border-l-sky-500', badgeColor: 'bg-sky-100 text-sky-700', ring: 'focus:ring-sky-300', rows: 4,
  },
  {
    key: 'examenFisico', label: 'Examen Físico', badge: 'O — Objetivo',
    placeholder: 'Signos vitales, temperatura, peso, frecuencia cardíaca, hallazgos del examen clínico…',
    border: 'border-l-emerald-500', badgeColor: 'bg-emerald-100 text-emerald-700', ring: 'focus:ring-emerald-300', rows: 4,
  },
  {
    key: 'diagnostico', label: 'Diagnóstico', badge: 'A — Análisis',
    placeholder: 'Diagnóstico presuntivo, diagnósticos diferenciales…',
    border: 'border-l-amber-500', badgeColor: 'bg-amber-100 text-amber-700', ring: 'focus:ring-amber-300', rows: 3,
  },
  {
    key: 'tratamiento', label: 'Tratamiento', badge: 'P — Plan',
    placeholder: 'Medicamentos, dosis, procedimientos, indicaciones al propietario, próximo control…',
    border: 'border-l-violet-500', badgeColor: 'bg-violet-100 text-violet-700', ring: 'focus:ring-violet-300', rows: 4,
  },
]

const AI_BADGE = {
  recording:    { text: 'Grabando',       cls: 'bg-red-100 text-red-700 border-red-200'            },
  transcribing: { text: 'Transcribiendo', cls: 'bg-violet-100 text-violet-700 border-violet-200'   },
  organizing:   { text: 'Organizando',    cls: 'bg-violet-100 text-violet-700 border-violet-200'   },
  done:         { text: 'IA aplicada',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const SOAP_DISPLAY = [
  { key: 'anamnesis',     label: 'Anamnesis',    badge: 'S', dotCls: 'bg-sky-500',     pillCls: 'bg-sky-50 text-sky-700 border-sky-200'         },
  { key: 'examen_fisico', label: 'Examen Físico', badge: 'O', dotCls: 'bg-emerald-500', pillCls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'diagnostico',   label: 'Diagnóstico',  badge: 'A', dotCls: 'bg-amber-500',   pillCls: 'bg-amber-50 text-amber-700 border-amber-200'     },
  { key: 'tratamiento',   label: 'Tratamiento',  badge: 'P', dotCls: 'bg-violet-500',  pillCls: 'bg-violet-50 text-violet-700 border-violet-200'   },
]

// ── Tarjeta de historia clínica ──────────────────────────────────────────
function HistoriaCard({ historia, index }) {
  const [open, setOpen] = useState(index === 1)

  const fecha = new Date(historia.fecha)
  const fechaStr = fecha.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const horaStr = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  const hasContent = SOAP_DISPLAY.some(s => historia[s.key])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Cabecera de la tarjeta */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-100 transition text-left"
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold shrink-0">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 capitalize truncate">{fechaStr}</p>
          <p className="text-xs text-slate-400">{horaStr}</p>
        </div>
        <ChevronDownIcon open={open} />
      </button>

      {/* Contenido SOAP */}
      {open && (
        <div className="px-5 py-4">
          {!hasContent ? (
            <p className="text-xs text-slate-400 text-center py-2">Sin contenido registrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SOAP_DISPLAY.map(({ key, label, badge, dotCls, pillCls }) =>
                historia[key] ? (
                  <div key={key} className={`border rounded-xl px-3.5 py-3 ${pillCls}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                      <span className="text-xs font-bold">{badge}</span>
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{historia[key]}</p>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export default function HistoriasClinicas() {
  const { pacienteId }    = useParams()
  const location          = useLocation()
  const navigate          = useNavigate()
  const recorder          = useAudioRecorder()

  const [paciente, setPaciente] = useState(location.state?.paciente ?? null)
  const [cliente,  setCliente]  = useState(location.state?.cliente  ?? null)

  // Zona híbrida
  const [freeText,  setFreeText]  = useState('')
  const [aiStatus,  setAiStatus]  = useState('idle')
  const [aiError,   setAiError]   = useState(null)
  const [aiApplied, setAiApplied] = useState(false)

  // Campos estructurados
  const [fields, setFields] = useState({
    motivoAnamnesis: '', examenFisico: '', diagnostico: '', tratamiento: '',
  })

  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState(null)

  // Historial
  const [historias,        setHistorias]        = useState([])
  const [loadingHistorias, setLoadingHistorias] = useState(false)

  const isProcessing = ['transcribing', 'organizing'].includes(aiStatus)

  // Carga del paciente si llegamos sin state
  useEffect(() => {
    if (pacienteId && !paciente) {
      api.get(`/api/pacientes/${pacienteId}`)
        .then(p => setPaciente(p))
        .catch(() => {})
    }
  }, [pacienteId])

  // Carga del historial al entrar
  useEffect(() => {
    if (!pacienteId) return
    setLoadingHistorias(true)
    api.get(`/api/pacientes/${pacienteId}/historias/`)
      .then(data => setHistorias(Array.isArray(data) ? data : []))
      .catch(() => setHistorias([]))
      .finally(() => setLoadingHistorias(false))
  }, [pacienteId])

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Voz → transcripción → SOAP (flujo automático) ───────────────────────
  const handleVoiceToggle = async () => {
    if (recorder.isRecording) {
      setAiError(null)
      setAiStatus('transcribing')
      const blob = await recorder.stop()
      if (!blob) { setAiStatus('error'); setAiError('No se obtuvo audio.'); return }
      try {
        // Paso 1: Whisper transcribe el audio
        const formData = new FormData()
        formData.append('audio', blob, 'consulta.webm')
        const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
        if (!res.ok) throw new Error(`Error en transcripción: HTTP ${res.status}`)
        const { transcripcion } = await res.json()
        setFreeText(transcripcion)

        // Paso 2: el texto va directo al procesador SOAP sin intervención del usuario
        setAiStatus('organizing')
        const soap = await api.post('/api/process-soap', { texto: transcripcion })
        const soapAnamnesis  = soap.subjetivo?.oraciones?.join('\n') ?? ''
        const soapExamen     = soap.objetivo?.oraciones?.join('\n')  ?? ''
        const soapDiag       = soap.analisis?.oraciones?.join('\n')  ?? ''
        const soapTrat       = soap.plan?.oraciones?.join('\n')      ?? ''
        const allEmpty = !soapAnamnesis && !soapExamen && !soapDiag && !soapTrat
        setFields({
          motivoAnamnesis: allEmpty ? transcripcion : soapAnamnesis,
          examenFisico:    soapExamen,
          diagnostico:     soapDiag,
          tratamiento:     soapTrat,
        })
        setAiApplied(true)
        setAiStatus('done')
        setTimeout(() => setAiStatus('idle'), 2500)
      } catch (e) {
        setAiError(`Error al procesar: ${e.message}`)
        setAiStatus('error')
      }
    } else {
      setAiError(null)
      await recorder.start()
      setAiStatus('recording')
    }
  }

  // ── Estructurar con IA ───────────────────────────────────────────────────
  const handleOrganize = async () => {
    if (!freeText.trim()) return
    setAiStatus('organizing'); setAiError(null)
    try {
      const soap = await api.post('/api/process-soap', { texto: freeText })
      const sAnamnesis = soap.subjetivo?.oraciones?.join('\n') ?? ''
      const sExamen    = soap.objetivo?.oraciones?.join('\n')  ?? ''
      const sDiag      = soap.analisis?.oraciones?.join('\n')  ?? ''
      const sTrat      = soap.plan?.oraciones?.join('\n')      ?? ''
      const allEmpty2  = !sAnamnesis && !sExamen && !sDiag && !sTrat
      setFields({
        motivoAnamnesis: allEmpty2 ? freeText : sAnamnesis,
        examenFisico:    sExamen,
        diagnostico:     sDiag,
        tratamiento:     sTrat,
      })
      setAiApplied(true)
      setAiStatus('done')
      setTimeout(() => setAiStatus('idle'), 2500)
    } catch (e) {
      setAiError(`Error al organizar: ${e.message}`); setAiStatus('error')
    }
  }

  // ── Guardar en BD ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!pacienteId) {
      setSaveErr('Sin paciente vinculado. Abre esta pantalla desde el perfil de una mascota.')
      return
    }
    setSaving(true); setSaveErr(null); setSaved(false)
    const payload = {
      anamnesis:     fields.motivoAnamnesis || null,
      examen_fisico: fields.examenFisico    || null,
      diagnostico:   fields.diagnostico     || null,
      tratamiento:   fields.tratamiento     || null,
    }
    try {
      const nueva = await api.post(`/api/pacientes/${pacienteId}/historias/`, payload)
      setHistorias(prev => [nueva, ...prev])
      setFields({ motivoAnamnesis: '', examenFisico: '', diagnostico: '', tratamiento: '' })
      setFreeText('')
      setAiApplied(false)
      setSaved(true)
      setTimeout(() => {
        if (cliente?.id) navigate(`/clientes/${cliente.id}`)
        else if (window.history.length > 1) navigate(-1)
        else navigate('/clientes')
      }, 1400)
    } catch (e) {
      setSaveErr(`No se pudo guardar: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Generar PDF ───────────────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const margen = 14
    const ancho  = 182  // 210 - 2*14

    // ── Encabezado ─────────────────────────────────────────────────────────
    doc.setFillColor(88, 28, 135)          // purple-900
    doc.rect(0, 0, 210, 28, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text('CENTRO MÉDICO VETERINARIO LOS PINOS', 105, 11, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Tel: (555) 123-4567  |  Av. Principal #123, Col. Centro  |  contacto@veterinarialospinos.com', 105, 18, { align: 'center' })
    doc.text('Lun–Vie 8:00–18:00  |  Sáb 9:00–14:00', 105, 23, { align: 'center' })

    // Línea decorativa bajo encabezado
    doc.setDrawColor(167, 139, 250)        // violet-400
    doc.setLineWidth(0.8)
    doc.line(margen, 29, 210 - margen, 29)

    // ── Título del documento ────────────────────────────────────────────────
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('HISTORIA CLÍNICA DEL PACIENTE', margen, 37)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 210 - margen, 37, { align: 'right' })

    // ── Tabla de datos del paciente ─────────────────────────────────────────
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Datos del Paciente', margen, 45)

    autoTable(doc, {
      startY: 48,
      margin: { left: margen, right: margen },
      body: [
        ['Paciente',   paciente?.nombre   ?? '—',
         'Propietario', cliente?.nombre   ?? '—'],
        ['Especie',    paciente?.especie  ?? '—',
         'Raza',       paciente?.raza     ?? '—'],
        ['Edad',       paciente?.edad != null ? `${paciente.edad} años` : '—',
         'Fecha reporte', new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })],
      ],
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
      columnStyles: {
        0: { fillColor: [237, 233, 254], fontStyle: 'bold', cellWidth: 38 },  // violet-100
        1: { cellWidth: 52 },
        2: { fillColor: [237, 233, 254], fontStyle: 'bold', cellWidth: 38 },
        3: { cellWidth: 52 },
      },
      tableLineColor: [200, 190, 220],
      tableLineWidth: 0.3,
    })

    // ── Sección de consultas ────────────────────────────────────────────────
    const y1 = doc.lastAutoTable.finalY + 9

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 30, 30)
    doc.text('Consultas', margen, y1)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Total: ${historias.length} ${historias.length === 1 ? 'consulta registrada' : 'consultas registradas'}`, 210 - margen, y1, { align: 'right' })

    if (historias.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(150, 150, 150)
      doc.setFont('helvetica', 'italic')
      doc.text('No hay consultas registradas para este paciente.', margen, y1 + 8)
    } else {
      autoTable(doc, {
        startY: y1 + 3,
        margin: { left: margen, right: margen },
        head: [['#', 'Fecha', 'S — Anamnesis', 'O — Examen Físico', 'A — Diagnóstico', 'P — Tratamiento']],
        body: historias.map((h, i) => [
          String(historias.length - i),
          new Date(h.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            '\n' + new Date(h.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          h.anamnesis     || '—',
          h.examen_fisico || '—',
          h.diagnostico   || '—',
          h.tratamiento   || '—',
        ]),
        styles: {
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
          overflow: 'linebreak',
          valign: 'top',
        },
        headStyles: {
          fillColor: [88, 28, 135],   // purple-900
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [250, 248, 255] },
        columnStyles: {
          0: { cellWidth: 8,  halign: 'center', valign: 'middle' },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 36 },
          3: { cellWidth: 36 },
          4: { cellWidth: 36 },
          5: { cellWidth: 36 },
        },
        tableLineColor: [210, 200, 230],
        tableLineWidth: 0.2,
      })
    }

    // ── Pie de página en cada hoja ──────────────────────────────────────────
    const totalPages = doc.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setDrawColor(200, 190, 220)
      doc.setLineWidth(0.3)
      doc.line(margen, 287, 210 - margen, 287)
      doc.setFontSize(7)
      doc.setTextColor(160, 160, 160)
      doc.setFont('helvetica', 'normal')
      doc.text('Veterinaria Los Pinos — Documento generado automáticamente. Solo para uso interno.', margen, 291)
      doc.text(`Página ${p} / ${totalPages}`, 210 - margen, 291, { align: 'right' })
    }

    doc.save(`Historia_Clinica_${(paciente?.nombre ?? 'Paciente').replace(/\s+/g, '_')}.pdf`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const aiBadge = AI_BADGE[aiStatus]

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4 sticky top-0 z-10">
        {pacienteId && (
          <>
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-purple-700 transition font-medium">
              <BackIcon /> Volver
            </button>
            <span className="text-slate-300">/</span>
          </>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">
            {paciente ? `Consulta — ${paciente.nombre}` : 'Nueva Consulta'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{today}</p>
        </div>
        {aiBadge && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${aiBadge.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />{aiBadge.text}
          </span>
        )}
      </header>

      <main className="flex-1 px-6 py-6 flex flex-col gap-6 max-w-5xl w-full mx-auto">

        {/* Tarjeta del paciente */}
        {paciente && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Paciente',    value: paciente.nombre },
                { label: 'Especie',     value: paciente.especie },
                { label: 'Raza / Edad', value: [paciente.raza, paciente.edad != null ? `${paciente.edad} años` : null].filter(Boolean).join(' · ') || '—' },
                { label: 'Propietario', value: cliente?.nombre ?? '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                  <p className="text-sm text-slate-700 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Zona de Asistencia Híbrida */}
        <section className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-purple-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <SparklesIcon className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-purple-900">Asistente de IA — Zona Híbrida</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {['Voz', 'Texto libre', 'Manual'].map(t => (
                <span key={t} className="text-xs bg-white text-purple-600 border border-purple-200 rounded-full px-2.5 py-0.5 font-medium">{t}</span>
              ))}
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            <div>
              <textarea
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                disabled={isProcessing}
                placeholder="Dicta o escribe las notas libres de la consulta aquí…"
                rows={6}
                className={[
                  'w-full resize-y text-sm text-slate-700 placeholder-slate-400',
                  'border border-purple-200 rounded-xl px-4 py-3 bg-white shadow-inner',
                  'focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition',
                  isProcessing ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              />
              <p className="text-xs text-purple-400 mt-1 text-right">{freeText.length} caracteres</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Grabar / Detener */}
              <button onClick={handleVoiceToggle}
                disabled={isProcessing && aiStatus !== 'recording'}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border shadow-sm focus:outline-none focus:ring-2',
                  recorder.isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white border-red-500 focus:ring-red-300'
                    : aiStatus === 'transcribing'
                      ? 'bg-violet-100 text-violet-400 border-violet-200 cursor-not-allowed'
                      : 'bg-white hover:bg-purple-50 text-purple-700 border-purple-300 focus:ring-purple-300',
                ].join(' ')}>
                {aiStatus === 'transcribing'
                  ? <><Spinner className="w-4 h-4" /> Transcribiendo…</>
                  : recorder.isRecording
                    ? <><StopIcon /><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Detener — {fmt(recorder.seconds)}</>
                    : <><MicIcon /> Grabar Consulta</>}
              </button>

              <span className="text-slate-300 text-lg select-none">|</span>

              {/* Estructurar con IA */}
              <button onClick={handleOrganize}
                disabled={!freeText.trim() || isProcessing}
                className={[
                  'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300',
                  !freeText.trim() || isProcessing
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-purple-700 hover:bg-purple-600 active:scale-95 text-white border border-purple-700',
                ].join(' ')}>
                {aiStatus === 'organizing'
                  ? <><Spinner className="w-4 h-4" /> Organizando…</>
                  : <><SparklesIcon /> Estructurar con IA</>}
              </button>

              {aiStatus === 'done' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                  <CheckIcon className="w-3.5 h-3.5" /> Campos completados
                </span>
              )}
              {(recorder.micError || aiError) && (
                <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  {recorder.micError ?? aiError}
                </span>
              )}
            </div>

            {recorder.isRecording && (
              <div className="flex items-center gap-2 text-red-600 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Grabando en tiempo real… habla con claridad cerca del micrófono.
              </div>
            )}
          </div>
        </section>

        {/* Campos estructurados SOAP */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Nota Clínica Estructurada
            </h2>
            {aiApplied && (
              <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full px-3 py-0.5 font-medium">
                Completado por IA — puedes editar libremente
              </span>
            )}
          </div>

          <div className="relative">
            {/* Overlay de carga mientras la IA procesa */}
            {isProcessing && (
              <div className="absolute inset-0 z-10 rounded-xl bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Spinner className="w-8 h-8 text-purple-500" />
                <p className="text-sm font-semibold text-purple-800">
                  {aiStatus === 'transcribing'
                    ? 'Transcribiendo audio con Whisper…'
                    : 'Estructurando nota clínica con IA…'}
                </p>
                <p className="text-xs text-slate-500">La IA está procesando la consulta, espera un momento</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELDS.map(({ key, label, badge, placeholder, border, badgeColor, ring, rows }) => (
                <div key={key} className={`bg-white rounded-xl border-l-4 border border-slate-200 ${border} shadow-sm overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <label className="text-sm font-semibold text-slate-700" htmlFor={key}>{label}</label>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                  </div>
                  <div className="px-4 py-3">
                    <textarea
                      id={key}
                      value={fields[key]}
                      onChange={e => {
                        setFields(prev => ({ ...prev, [key]: e.target.value }))
                        setSaved(false)
                        if (aiApplied) setAiApplied(false)
                      }}
                      placeholder={placeholder}
                      rows={rows}
                      className={`w-full resize-y text-sm text-slate-700 placeholder-slate-300 border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition ${ring}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Guardar */}
        <div className="flex flex-col items-end gap-2">
          {saveErr && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{saveErr}</p>
          )}
          {!pacienteId && (
            <p className="text-xs text-slate-400">
              Sin paciente vinculado — abre esta consulta desde el perfil de una mascota para guardar en la BD.
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={isProcessing || saving}
            className={[
              'flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
              saved
                ? 'bg-emerald-500 text-white focus:ring-emerald-400'
                : 'bg-purple-700 hover:bg-purple-600 active:scale-95 text-white focus:ring-purple-400 disabled:opacity-60',
            ].join(' ')}>
            {saving ? <Spinner /> : saved ? <CheckIcon /> : <SaveIcon />}
            {saving ? 'Guardando…' : saved ? 'Historia guardada ✓' : 'Guardar Historia Clínica'}
          </button>
        </div>

        {/* ── Historial de Consultas ─────────────────────────────────────── */}
        {pacienteId && (
          <section className="flex flex-col gap-3 pb-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Historial de Consultas
                </h2>
                <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2.5 py-0.5 rounded-full">
                  {historias.length} {historias.length === 1 ? 'consulta' : 'consultas'}
                </span>
              </div>
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <DownloadIcon className="w-4 h-4" />
                Descargar Historia (PDF)
              </button>
            </div>

            {loadingHistorias && (
              <div className="flex items-center gap-2.5 text-slate-400 text-sm py-8 justify-center">
                <Spinner className="w-5 h-5" /> Cargando historial…
              </div>
            )}

            {!loadingHistorias && historias.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-12 text-slate-400">
                <ClipboardIcon className="w-9 h-9 mb-3 opacity-40" />
                <p className="text-sm font-medium">No hay consultas registradas para este paciente</p>
                <p className="text-xs mt-1">Completa el formulario de arriba y guarda para comenzar</p>
              </div>
            )}

            {!loadingHistorias && historias.length > 0 && (
              <div className="flex flex-col gap-3">
                {historias.map((h, i) => (
                  <HistoriaCard key={h.id} historia={h} index={historias.length - i} />
                ))}
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  )
}
