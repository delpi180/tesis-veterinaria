import jsPDF from 'jspdf'
import { rgbMarca } from './paleta'
import autoTable from 'jspdf-autotable'
import { clinicaActual } from '../services/clinica'

const soles = (n) => `S/ ${(Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'setiembre', 'octubre', 'noviembre', 'diciembre']

export const nombreDelMes = (periodo) => {
  const [anio, mes] = periodo.split('-')
  return `${MESES[Number(mes) - 1]} de ${anio}`
}

/**
 * Boleta de pago de un trabajador en una planilla.
 * Solo muestra lo que la clínica calcula: no incluye aportes de ley.
 */
export function boletaPagoPDF(planilla, l) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const clinica = clinicaActual()

  doc.setFontSize(16); doc.setTextColor(...rgbMarca(800))
  doc.text(clinica.nombre, W / 2, 16, { align: 'center' })
  doc.setFontSize(9); doc.setTextColor(100, 116, 139)
  const datos = [clinica.ruc ? `RUC ${clinica.ruc}` : null, clinica.direccion].filter(Boolean).join(' · ')
  if (datos) doc.text(datos, W / 2, 21, { align: 'center' })
  doc.setFontSize(12); doc.setTextColor(30, 41, 59)
  doc.text(`Boleta de pago · ${nombreDelMes(planilla.periodo)}`, W / 2, 30, { align: 'center' })

  autoTable(doc, {
    startY: 36, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.5 },
    body: [
      ['Trabajador', l.nombre],
      ['Cargo', l.rol === 'veterinario' ? 'Médico veterinario' : 'Recepción / administración'],
      ['Minutos de tardanza', String(l.minutos_tardanza)],
      ['Días de falta', String(l.faltas)],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    margin: { left: 14, right: 14 },
  })

  const filas = [
    ['Sueldo mensual', soles(l.sueldo_base), ''],
    ...(l.bonos ? [['Bonos', soles(l.bonos), '']] : []),
    ...(l.descuento_tardanza ? [[`Descuento por tardanza (${l.minutos_tardanza} min)`, '', soles(l.descuento_tardanza)]] : []),
    ...(l.descuento_faltas ? [[`Descuento por faltas (${l.faltas} día${l.faltas === 1 ? '' : 's'})`, '', soles(l.descuento_faltas)]] : []),
    ...(l.adelantos ? [['Adelantos', '', soles(l.adelantos)]] : []),
    ...(l.otros_descuentos ? [[l.nota || 'Otros descuentos', '', soles(l.otros_descuentos)]] : []),
  ]
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Concepto', 'Ingresos', 'Descuentos']],
    body: filas,
    foot: [['Totales', soles(l.total_ingresos), soles(l.total_descuentos)],
           ['NETO A PAGAR', '', soles(l.neto)]],
    headStyles: { fillColor: rgbMarca(800) },
    footStyles: { fillColor: [241, 245, 249], textColor: 30 },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  })

  const y = Math.min(doc.lastAutoTable.finalY + 30, 260)
  doc.setDrawColor(150); doc.setLineWidth(0.3)
  doc.line(24, y, 84, y); doc.line(W - 84, y, W - 24, y)
  doc.setFontSize(9); doc.setTextColor(110)
  doc.text('Empleador', 54, y + 5, { align: 'center' })
  doc.text('Trabajador', W - 54, y + 5, { align: 'center' })
  doc.setFontSize(8)
  doc.text('Esta boleta no incluye aportes ni beneficios de ley (AFP/ONP, CTS, gratificaciones).',
    W / 2, y + 16, { align: 'center' })

  doc.save(`Boleta_${l.nombre.replace(/\s+/g, '_')}_${planilla.periodo}.pdf`)
}
