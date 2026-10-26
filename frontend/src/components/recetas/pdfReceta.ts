import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { PDF_MARCA } from '@src/core/color'
import { clinicaActual } from '../../services/clinica'

export interface ItemReceta {
  medicamento: string; dosis: string; via: string; frecuencia: string; duracion: string
  /** Fragmento que se oyó al dictar, para comparar la cifra con lo escrito. */
  dicho?: string
  /** `false` = el nombre no coincide con ningún producto del inventario. */
  en_catalogo?: boolean
}
export interface Receta {
  id: number; fecha: string; diagnostico?: string | null; indicaciones?: string | null; items?: ItemReceta[]
  veterinario_nombre?: string | null; actualizado_por?: string | null; actualizado_en?: string | null
}
export interface PacienteReceta { nombre?: string; especie?: string; raza?: string; sexo?: string; edad?: number | null }
export interface ClienteReceta { nombre?: string; telefono?: string }
interface Avisos { success: (m: string) => void; error: (m: string) => void }

export const fmtFecha = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric',
})

// El PDF de la receta: clínica + paciente + dueño + medicamentos + firma. Se
// construye sin guardarlo: cada botón decide qué hacer (descargarlo o compartirlo).
function nombreArchivoReceta(paciente: PacienteReceta | undefined, receta: Receta) {
  return `Receta_${paciente?.nombre ?? 'paciente'}_${receta.fecha}.pdf`
}

type ConTabla = jsPDF & { lastAutoTable: { finalY: number } }

function construirPDF(paciente: PacienteReceta | undefined, cliente: ClienteReceta | undefined, receta: Receta) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as ConTabla
  const W = 210, M = 14
  const fin = () => doc.lastAutoTable.finalY

  doc.setFillColor(...PDF_MARCA)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text(clinicaActual().nombre, M, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Receta Médica Veterinaria', M, 18)
  doc.text(`Fecha: ${fmtFecha(receta.fecha)}`, W - M, 11, { align: 'right' })
  doc.text(`Receta N° ${receta.id}`, W - M, 18, { align: 'right' })

  const cabecera = { fillColor: PDF_MARCA, fontSize: 9, halign: 'left' as const, textColor: 255 }
  const columnas = { 0: { cellWidth: 42, fontStyle: 'bold' as const, textColor: [90, 90, 90] as [number, number, number] }, 1: { cellWidth: W - 2 * M - 42 } }
  const margen = { left: M, right: M }

  const edad = paciente?.edad != null ? `${paciente.edad} año${paciente.edad !== 1 ? 's' : ''}` : ''
  autoTable(doc, {
    startY: 30,
    head: [[{ content: 'Datos del paciente', colSpan: 2 }]],
    body: [
      ['Nombre', paciente?.nombre ?? ''],
      ['Especie / Raza', [paciente?.especie, paciente?.raza].filter(Boolean).join(' / ')],
      ['Sexo / Edad', [paciente?.sexo, edad].filter(Boolean).join(' · ')],
    ],
    theme: 'grid', headStyles: cabecera, columnStyles: columnas, styles: { fontSize: 9, cellPadding: 2 }, margin: margen,
  })
  autoTable(doc, {
    startY: fin() + 3,
    head: [[{ content: 'Propietario', colSpan: 2 }]],
    body: [['Nombre', cliente?.nombre ?? ''], ['Teléfono', cliente?.telefono ?? '']],
    theme: 'grid', headStyles: cabecera, columnStyles: columnas, styles: { fontSize: 9, cellPadding: 2 }, margin: margen,
  })

  if (receta.diagnostico) {
    autoTable(doc, {
      startY: fin() + 3, head: [['Diagnóstico']], body: [[receta.diagnostico]],
      theme: 'grid', headStyles: cabecera, styles: { fontSize: 9, cellPadding: 2 }, margin: margen,
    })
  }

  autoTable(doc, {
    startY: fin() + 5,
    head: [['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración']],
    body: (receta.items || []).map(i => [i.medicamento ?? '', i.dosis ?? '', i.via ?? '', i.frecuencia ?? '', i.duracion ?? '']),
    theme: 'grid', headStyles: { fillColor: PDF_MARCA, fontSize: 9, textColor: 255 }, styles: { fontSize: 9, cellPadding: 2.5 }, margin: margen,
  })

  if (receta.indicaciones) {
    autoTable(doc, {
      startY: fin() + 5, head: [['Indicaciones para el propietario']], body: [[receta.indicaciones]],
      theme: 'grid', headStyles: cabecera, styles: { fontSize: 9, cellPadding: 2 }, margin: margen,
    })
  }

  const y = Math.min(fin() + 24, 280)
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(W - M - 70, y, W - M, y)
  doc.setTextColor(110); doc.setFontSize(9)
  doc.text(receta.veterinario_nombre || 'Médico Veterinario', W - M - 35, y + 5, { align: 'center' })
  doc.text('Médico Veterinario', W - M - 35, y + 9, { align: 'center' })

  return doc
}

export function descargarPDF(paciente: PacienteReceta | undefined, cliente: ClienteReceta | undefined, receta: Receta) {
  construirPDF(paciente, cliente, receta).save(nombreArchivoReceta(paciente, receta))
}

// Normaliza un teléfono peruano al formato que espera wa.me (mismo criterio
// que ya usan los recordatorios de turnos y vacunas en el resto de la app).
function telefonoWhatsApp(tel: string) {
  const num = (tel || '').replace(/\D/g, '')
  return num.length === 9 ? `51${num}` : num
}

/**
 * Envía la receta al dueño por WhatsApp.
 *
 * WhatsApp no deja adjuntar un archivo con un simple enlace (wa.me solo
 * prellena texto): es una limitación de WhatsApp. Dos caminos:
 *
 *   1. Si el navegador soporta compartir ARCHIVOS (Web Share API: celulares con
 *      Chrome/Safari recientes), se abre el panel nativo de "Compartir" con el
 *      PDF ya adjunto; el usuario elige WhatsApp ahí mismo.
 *   2. Si no (la mayoría de PCs), se descarga el PDF y se abre WhatsApp con un
 *      mensaje que explica que hay que adjuntarlo a mano.
 */
export async function enviarReceta(paciente: PacienteReceta | undefined, cliente: ClienteReceta | undefined, receta: Receta, toast: Avisos) {
  if (!cliente?.telefono) {
    toast.error('Este cliente no tiene un teléfono registrado.')
    return
  }
  const doc = construirPDF(paciente, cliente, receta)
  const archivo = nombreArchivoReceta(paciente, receta)
  const texto = `Receta de ${paciente?.nombre ?? 'su mascota'} — ${clinicaActual().nombre}`
  const file = new File([doc.output('blob')], archivo, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: texto, text: texto })
      return   // el usuario eligió WhatsApp (u otra app) desde el panel nativo
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return   // canceló el panel de compartir, no es un error
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
