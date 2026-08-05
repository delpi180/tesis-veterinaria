import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Loader2, Pencil, Download, Pill, X, Send, Mic, AlertTriangle } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api, esVeterinario } from '../services/api'
import { useToast } from './Toast'
import { useConfirmar } from './Confirmar'
import { clinicaActual } from '../services/clinica'
import { nombresSimilares } from '../utils/similitud'
import VoiceTextProcessor from './VoiceTextProcessor'
import { Cargando } from './Cargando'

const ITEM_VACIO = { medicamento: '', dosis: '', via: '', frecuencia: '', duracion: '' }

const hoyStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtFecha = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})
const fmtFechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—'

const FORM_INICIAL = { fecha: hoyStr(), diagnostico: '', indicaciones: '', items: [{ ...ITEM_VACIO }] }

// ── PDF de la receta (clínica + paciente + dueño + medicamentos + firma) ────
// Construye el documento sin guardarlo: cada botón decide qué hacer con él
// (descargarlo directo, o compartirlo por WhatsApp).
const _MORADO = [88, 28, 135]
function nombreArchivoReceta(paciente, receta) {
  return `Receta_${paciente?.nombre ?? 'paciente'}_${receta.fecha}.pdf`
}
function construirPDF(paciente, cliente, receta) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 14

  doc.setFillColor(..._MORADO)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont(undefined, 'bold')
  doc.text(clinicaActual().nombre, M, 11)
  doc.setFontSize(9); doc.setFont(undefined, 'normal')
  doc.text('Receta Médica Veterinaria', M, 18)
  doc.text(`Fecha: ${fmtFecha(receta.fecha)}`, W - M, 11, { align: 'right' })
  doc.text(`Receta N° ${receta.id}`, W - M, 18, { align: 'right' })

  const edad = paciente?.edad != null ? `${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''
  autoTable(doc, {
    startY: 30,
    head: [[{ content: 'Datos del paciente', colSpan: 2 }]],
    body: [
      ['Nombre', paciente?.nombre ?? ''],
      ['Especie / Raza', [paciente?.especie, paciente?.raza].filter(Boolean).join(' / ')],
      ['Sexo / Edad', [paciente?.sexo, edad].filter(Boolean).join(' · ')],
    ],
    theme: 'grid',
    headStyles: { fillColor: _MORADO, fontSize: 9, halign: 'left', textColor: 255 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: [90, 90, 90] }, 1: { cellWidth: W - 2 * M - 42 } },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: M, right: M },
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    head: [[{ content: 'Propietario', colSpan: 2 }]],
    body: [
      ['Nombre', cliente?.nombre ?? ''],
      ['Teléfono', cliente?.telefono ?? ''],
    ],
    theme: 'grid',
    headStyles: { fillColor: _MORADO, fontSize: 9, halign: 'left', textColor: 255 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: [90, 90, 90] }, 1: { cellWidth: W - 2 * M - 42 } },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: M, right: M },
  })

  if (receta.diagnostico) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 3,
      head: [['Diagnóstico']],
      body: [[receta.diagnostico]],
      theme: 'grid',
      headStyles: { fillColor: _MORADO, fontSize: 9, halign: 'left', textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: M, right: M },
    })
  }

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración']],
    body: (receta.items || []).map(i => [i.medicamento ?? '', i.dosis ?? '', i.via ?? '', i.frecuencia ?? '', i.duracion ?? '']),
    theme: 'grid',
    headStyles: { fillColor: _MORADO, fontSize: 9, textColor: 255 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    margin: { left: M, right: M },
  })

  if (receta.indicaciones) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 5,
      head: [['Indicaciones para el propietario']],
      body: [[receta.indicaciones]],
      theme: 'grid',
      headStyles: { fillColor: _MORADO, fontSize: 9, halign: 'left', textColor: 255 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: M, right: M },
    })
  }

  const y = Math.min(doc.lastAutoTable.finalY + 24, 280)
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(W - M - 70, y, W - M, y)
  doc.setTextColor(110); doc.setFontSize(9)
  doc.text(receta.veterinario_nombre || 'Médico Veterinario', W - M - 35, y + 5, { align: 'center' })
  doc.text('Médico Veterinario', W - M - 35, y + 9, { align: 'center' })

  return doc
}

function descargarPDF(paciente, cliente, receta) {
  construirPDF(paciente, cliente, receta).save(nombreArchivoReceta(paciente, receta))
}

// Normaliza un teléfono peruano al formato que espera wa.me (mismo criterio
// que ya usan los recordatorios de turnos y vacunas en el resto de la app).
function telefonoWhatsApp(tel) {
  const num = (tel || '').replace(/\D/g, '')
  return num.length === 9 ? `51${num}` : num
}

/**
 * Envía la receta al dueño por WhatsApp.
 *
 * WhatsApp no tiene forma de adjuntar un archivo a través de un simple enlace
 * (wa.me solo prellena texto): eso es una limitación de WhatsApp, no algo que
 * se pueda resolver gratis desde el navegador. Dos caminos, según lo que
 * soporte el dispositivo:
 *
 *   1. Si el navegador soporta compartir ARCHIVOS (Web Share API — celulares
 *      con Chrome/Safari recientes, y algunos navegadores de escritorio),
 *      se abre el panel nativo de "Compartir" con el PDF ya adjunto: el
 *      usuario elige WhatsApp ahí mismo y el archivo real viaja con el mensaje.
 *   2. Si no (la mayoría de PCs de escritorio hoy), se descarga el PDF y se
 *      abre WhatsApp con un mensaje explicando que hay que adjuntarlo a mano.
 *      Es una limitación real de la plataforma, no un paso de más inventado.
 */
async function enviarReceta(paciente, cliente, receta, toast) {
  if (!cliente?.telefono) {
    toast.error('Este cliente no tiene un teléfono registrado.')
    return
  }
  const doc = construirPDF(paciente, cliente, receta)
  const archivo = nombreArchivoReceta(paciente, receta)
  const texto = `Receta de ${paciente?.nombre ?? 'su mascota'} — ${clinicaActual().nombre}`

  const blob = doc.output('blob')
  const file = new File([blob], archivo, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: texto, text: texto })
      return   // el usuario eligió WhatsApp (u otra app) desde el panel nativo
    } catch (err) {
      if (err?.name === 'AbortError') return   // canceló el panel de compartir, no es un error
      // si falla por otro motivo, cae al plan B de abajo
    }
  }

  doc.save(archivo)
  const mensaje =
    `Hola ${cliente.nombre}, le enviamos la receta de ${paciente?.nombre ?? 'su mascota'} ` +
    `del ${fmtFecha(receta.fecha)} (${clinicaActual().nombre}). ` +
    `Se descargó el PDF a su computadora: adjúntelo aquí antes de enviar. ¡Gracias!`
  window.open(`https://wa.me/${telefonoWhatsApp(cliente.telefono)}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener')
  toast.success('PDF descargado. Se abrió WhatsApp para que lo adjuntes al mensaje.')
}

function ItemsEditor({ items, onChange }) {
  const add    = () => onChange([...items, { ...ITEM_VACIO }])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i, campo, valor) => { const n = [...items]; n[i] = { ...n[i], [campo]: valor }; onChange(n) }
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className={`grid grid-cols-1 sm:grid-cols-6 gap-2 p-2.5 border rounded-lg ${
          it.en_catalogo === false
            ? 'bg-amber-50 border-amber-300'
            : 'bg-slate-50 border-slate-200'}`}>
          <input value={it.medicamento} onChange={e => update(i, 'medicamento', e.target.value)}
            placeholder="Medicamento" className="sm:col-span-2 text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <input value={it.dosis} onChange={e => update(i, 'dosis', e.target.value)}
            placeholder="Dosis (15 mg/kg)" className="text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <input value={it.via} onChange={e => update(i, 'via', e.target.value)}
            placeholder="Vía (Oral)" className="text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <input value={it.frecuencia} onChange={e => update(i, 'frecuencia', e.target.value)}
            placeholder="Frecuencia (c/12h)" className="text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          <div className="flex items-center gap-1.5">
            <input value={it.duracion} onChange={e => update(i, 'duracion', e.target.value)}
              placeholder="Duración (5 días)" className="flex-1 text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
            <button type="button" onClick={() => remove(i)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {/* El dictado por voz puede cambiar un número con el ruido de la
              consulta. Con el fragmento original a la vista, el doctor compara
              la cifra en vez de confiar a ciegas en el campo. */}
          {it.dicho && (
            <p className="sm:col-span-6 text-[11px] text-slate-500 italic flex items-start gap-1">
              <Mic className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
              <span>se oyó: “{it.dicho}”</span>
            </p>
          )}
          {/* La IA puede reconocer mal una marca dictada. Si el nombre no
              coincide con ningún producto del inventario se avisa, sin
              bloquear: recetar algo que la clínica no vende es legítimo. */}
          {it.en_catalogo === false && (
            <p className="sm:col-span-6 text-[11px] text-amber-800 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" />
              <span>No está en tu inventario — revisa que el nombre sea correcto.</span>
            </p>
          )}
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 border border-dashed border-purple-300 rounded-lg px-3 py-1.5 hover:bg-purple-50 transition w-fit">
        <Plus className="w-3.5 h-3.5" /> Agregar medicamento
      </button>
    </div>
  )
}

export default function RecetasPaciente({ pacienteId, paciente, cliente }) {
  const confirmar = useConfirmar()
  const toast = useToast()
  const puedeEscribir = esVeterinario()
  const [recetas, setRecetas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [formAbierto, setFormAbierto] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [enviandoId, setEnviandoId] = useState(null)   // id de la receta que se está compartiendo
  const guardandoRef = useRef(false)   // guard extra contra doble envío (doble clic, Enter repetido)

  const handleEnviar = async (r) => {
    setEnviandoId(r.id)
    try {
      await enviarReceta(paciente, cliente, r, toast)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEnviandoId(null)
    }
  }

  const cargar = async () => {
    setCargando(true)
    try {
      setRecetas(await api.get(`/api/pacientes/${pacienteId}/recetas/`))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { if (pacienteId) cargar() }, [pacienteId])

  const abrirNueva = () => {
    setEditId(null); setForm(FORM_INICIAL); setError(null); setFormAbierto(true)
  }
  const abrirEditar = (r) => {
    setEditId(r.id)
    setForm({
      fecha: r.fecha,
      diagnostico: r.diagnostico ?? '',
      indicaciones: r.indicaciones ?? '',
      items: r.items?.length ? r.items.map(i => ({ ...ITEM_VACIO, ...i })) : [{ ...ITEM_VACIO }],
    })
    setError(null); setFormAbierto(true)
  }
  const cerrarForm = () => { setFormAbierto(false); setEditId(null); setForm(FORM_INICIAL); setError(null) }

  // ── Volcar lo dictado por voz (o pegado como texto) al formulario ───────────
  // Si el veterinario ya tenía datos cargados (por ejemplo, está editando una
  // receta existente y dicta un ajuste), esto FUSIONA en vez de reemplazar:
  // un medicamento ya en la lista se actualiza por nombre similar (no se
  // duplica); el texto de diagnóstico/indicaciones se completa o se amplía,
  // sin repetir literalmente lo que ya estaba escrito.
  const fusionarTexto = (actual, nuevo) => {
    const previo = (actual || '').trim()
    const entrante = (nuevo || '').trim()
    if (!entrante) return previo
    if (!previo) return entrante
    if (previo.toLowerCase().includes(entrante.toLowerCase())) return previo
    return `${previo}. ${entrante}`
  }

  const applyDictado = ({ diagnostico, indicaciones, items }) => {
    setForm(prev => {
      const itemsPrevios = prev.items.filter(i => i.medicamento.trim())
      const itemsFusionados = [...itemsPrevios]
      // Solo se fusiona contra lo que YA estaba escrito, no contra lo que este
      // mismo dictado acaba de agregar: una receta puede llevar dos pautas del
      // mismo fármaco ("inyectable hoy y tabletas por 7 días") y buscar en
      // toda la lista las colapsaba en una, borrando una indicación.
      const nPrevias = itemsPrevios.length
      ;(items || []).forEach(nuevo => {
        if (!nuevo.medicamento?.trim()) return
        const idx = itemsFusionados.findIndex((i, k) =>
          k < nPrevias && nombresSimilares(i.medicamento, nuevo.medicamento))
        if (idx > -1) {
          itemsFusionados[idx] = {
            medicamento: nuevo.medicamento || itemsFusionados[idx].medicamento,
            dosis:       nuevo.dosis      || itemsFusionados[idx].dosis,
            via:         nuevo.via        || itemsFusionados[idx].via,
            frecuencia:  nuevo.frecuencia || itemsFusionados[idx].frecuencia,
            duracion:    nuevo.duracion   || itemsFusionados[idx].duracion,
            dicho:       nuevo.dicho      || itemsFusionados[idx].dicho,
            // El aviso de "no está en tu inventario" viene del backend y se
            // arma campo por campo: sin esto se perdería justo al fusionar,
            // que es cuando el dictado corrige una línea ya escrita.
            en_catalogo: nuevo.en_catalogo,
          }
        } else {
          itemsFusionados.push({ ...ITEM_VACIO, ...nuevo })
        }
      })
      return {
        ...prev,
        diagnostico: fusionarTexto(prev.diagnostico, diagnostico),
        indicaciones: fusionarTexto(prev.indicaciones, indicaciones),
        items: itemsFusionados.length ? itemsFusionados : [{ ...ITEM_VACIO }],
      }
    })
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (guardandoRef.current) return
    const items = form.items.filter(i => i.medicamento.trim())
    if (items.length === 0) { setError('Agrega al menos un medicamento.'); return }
    guardandoRef.current = true
    setGuardando(true); setError(null)
    try {
      const payload = {
        fecha: form.fecha,
        diagnostico: form.diagnostico.trim() || null,
        indicaciones: form.indicaciones.trim() || null,
        items,
      }
      if (editId) {
        const actualizada = await api.put(`/api/pacientes/${pacienteId}/recetas/${editId}`, payload)
        setRecetas(prev => prev.map(r => r.id === editId ? actualizada : r))
        toast.success('Receta actualizada.')
      } else {
        const nueva = await api.post(`/api/pacientes/${pacienteId}/recetas/`, payload)
        setRecetas(prev => [nueva, ...prev])
        toast.success('Receta guardada.')
      }
      cerrarForm()
    } catch (err) {
      setError(err.message)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const eliminar = async (r) => {
    if (!await confirmar({
      titulo: 'Eliminar receta',
      mensaje: `Se borrará la receta del ${fmtFecha(r.fecha)}.`,
      detalle: 'No se puede deshacer. Si ya se le entregó al cliente, conviene conservarla como constancia de lo que se indicó.',
      confirmarTexto: 'Eliminar receta',
    })) return
    try {
      await api.del(`/api/pacientes/${pacienteId}/recetas/${r.id}`)
      setRecetas(prev => prev.filter(x => x.id !== r.id))
      toast.success('Receta eliminada.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Pill className="w-4 h-4 text-purple-500" />
        <h2 className="text-sm font-semibold text-slate-700">Recetas</h2>
        <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">{recetas.length}</span>
        {puedeEscribir && (
          <button onClick={abrirNueva}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition">
            <Plus className="w-3.5 h-3.5" /> Nueva receta
          </button>
        )}
      </div>

      {!puedeEscribir && (
        <p className="text-xs text-slate-400 px-4 pt-3">Solo el veterinario puede emitir o editar recetas; aquí puedes consultarlas.</p>
      )}

      {/* Formulario (crear/editar) — solo veterinario */}
      {formAbierto && puedeEscribir && (
        <form onSubmit={guardar} className="px-4 py-3 border-b border-slate-100 flex flex-col gap-3 bg-purple-50/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">{editId ? 'Editar receta' : 'Nueva receta'}</p>
            <button type="button" onClick={cerrarForm} className="p-1 rounded-lg hover:bg-slate-200 transition text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <VoiceTextProcessor
            endpoint="/api/procesar-receta"
            labelGrabar="Dictar receta"
            placeholderTexto="Escriba o pegue lo que va a recetar (medicamento, dosis, vía, frecuencia, duración)…"
            onResult={({ diagnostico, indicaciones, items }) => applyDictado({ diagnostico, indicaciones, items })}
            resumirResultado={({ items }) => {
              const n = (items || []).filter(i => i.medicamento?.trim()).length
              return n ? `${n} medicamento${n > 1 ? 's' : ''} detectado${n > 1 ? 's' : ''}` : 'No se detectaron medicamentos'
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Diagnóstico / motivo</label>
              <input value={form.diagnostico} onChange={e => setForm(f => ({ ...f, diagnostico: e.target.value }))}
                placeholder="Ej. Gastroenteritis leve"
                className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Medicamentos <span className="text-rose-500">*</span></label>
            <ItemsEditor items={form.items} onChange={(items) => setForm(f => ({ ...f, items }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Indicaciones para el propietario</label>
            <textarea rows={2} value={form.indicaciones} onChange={e => setForm(f => ({ ...f, indicaciones: e.target.value }))}
              placeholder="Ej. Dieta blanda por 3 días, control si no mejora…"
              className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cerrarForm}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
            <button type="submit" disabled={guardando}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-700 rounded-lg hover:bg-purple-800 transition disabled:opacity-50">
              {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Guardar receta'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {cargando ? (
        <Cargando texto="Cargando recetas…" alto={160} />
      ) : recetas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
          <Pill className="w-7 h-7 mb-2 opacity-40" />
          <p className="text-sm">Sin recetas registradas</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {recetas.map(r => (
            <div key={r.id} className="px-4 py-3.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-slate-800">{fmtFecha(r.fecha)}</p>
                  {r.diagnostico && <p className="text-xs text-slate-500">{r.diagnostico}</p>}
                  {r.veterinario_nombre && (
                    <p className="text-xs text-purple-700 font-medium mt-0.5">Dr(a). {r.veterinario_nombre}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => descargarPDF(paciente, cliente, r)} title="Descargar PDF"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-700 hover:border-purple-300 transition">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEnviar(r)}
                    disabled={enviandoId === r.id} title="Enviar al cliente por WhatsApp"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-300 transition disabled:opacity-50">
                    {enviandoId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                  {puedeEscribir && (
                    <>
                      <button onClick={() => abrirEditar(r)} title="Editar receta"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-purple-700 hover:border-purple-300 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => eliminar(r)} title="Eliminar receta"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left py-1.5 pr-3 font-semibold">Medicamento</th>
                    <th className="text-left py-1.5 pr-3 font-semibold">Dosis</th>
                    <th className="text-left py-1.5 pr-3 font-semibold">Vía</th>
                    <th className="text-left py-1.5 pr-3 font-semibold">Frecuencia</th>
                    <th className="text-left py-1.5 font-semibold">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{it.medicamento || '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{it.dosis || '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{it.via || '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{it.frecuencia || '—'}</td>
                      <td className="py-1.5 text-slate-500">{it.duracion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {r.indicaciones && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-600">Indicaciones: </span>{r.indicaciones}
                </p>
              )}
              {(r.actualizado_por) && (
                <p className="text-[10px] text-slate-300">
                  Última edición: {r.actualizado_por} · {fmtFechaHora(r.actualizado_en)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
