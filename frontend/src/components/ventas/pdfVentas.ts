/** PDFs de Ventas: la boleta de una venta y el reporte por rango de fechas. */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { clinicaActual } from '../../services/clinica'
import { PDF_MARCA } from '@src/core/color'
import { fmtFecha, fmtHora, fmtMoneda, metodoLabel, nroBoleta, type ClienteInfo, type Venta } from './tipos'

const ultimaY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

export function reporteVentasPDF(ventas: Venta[], rango: { desde: string; hasta: string }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const marca = PDF_MARCA

  doc.setFillColor(...marca)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text(clinicaActual().nombre, 14, 11)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  const periodo = rango.desde || rango.hasta
    ? `Período: ${rango.desde || 'inicio'} al ${rango.hasta || 'hoy'}`
    : 'Todas las ventas registradas'
  doc.text(`Reporte de Ventas — ${periodo}`, 14, 18)

  const totalGeneral = ventas.reduce((s, v) => s + Number(v.total), 0)
  const totalItems = ventas.reduce((s, v) => s + v.items.reduce((si, it) => si + it.cantidad, 0), 0)

  autoTable(doc, {
    startY: 30,
    head: [['Ventas', 'Ítems vendidos', 'Ingreso total', 'Ticket promedio']],
    body: [[
      ventas.length,
      totalItems,
      fmtMoneda(totalGeneral),
      ventas.length ? fmtMoneda(totalGeneral / ventas.length) : fmtMoneda(0),
    ]],
    headStyles: { fillColor: marca, fontSize: 9, halign: 'center' },
    styles: { fontSize: 10, halign: 'center' },
    margin: { left: 14, right: 14 },
  })

  autoTable(doc, {
    startY: ultimaY(doc) + 5,
    head: [['Boleta', 'Fecha', 'Cliente', 'Detalle', 'Total']],
    body: ventas.map(v => [
      nroBoleta(v.id),
      `${fmtFecha(v.fecha)} ${fmtHora(v.fecha)}`,
      v.cliente_nombre ?? `Cliente #${v.cliente_id}`,
      v.items.map(it => `${it.descripcion} ×${it.cantidad}`).join(', '),
      fmtMoneda(v.total),
    ]),
    headStyles: { fillColor: marca, fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 22 }, 1: { cellWidth: 30 }, 2: { cellWidth: 35 },
      4: { cellWidth: 24, halign: 'right' },
    },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
  })

  const sufijo = rango.desde || rango.hasta ? `_${rango.desde || 'inicio'}_${rango.hasta || 'hoy'}` : ''
  doc.save(`ReporteVentas${sufijo}.pdf`)
}

export function generarBoleta(venta: Venta, cliente: ClienteInfo | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const marca = PDF_MARCA
  const clinica = clinicaActual()

  doc.setFillColor(...marca)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text(clinica.nombre, 14, 13)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  // Datos fiscales y de contacto de la clínica: es lo que el cliente espera ver
  // en su comprobante. Se omiten los que no estén cargados.
  const datosClinica = [
    clinica.ruc ? `RUC ${clinica.ruc}` : null,
    clinica.direccion,
    clinica.telefono,
  ].filter(Boolean).join('  ·  ')
  doc.text(datosClinica ? `Boleta de Venta   |   ${datosClinica}` : 'Boleta de Venta', 14, 20)

  doc.setDrawColor(...marca); doc.setLineWidth(0.4)
  doc.roundedRect(W - 70, 6, 56, 16, 2, 2)
  doc.setTextColor(...marca)
  doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.text('BOLETA N°', W - 66, 12)
  doc.setFontSize(13)
  doc.text(nroBoleta(venta.id), W - 66, 19)

  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  const fecha = new Date(venta.fecha)
  let y = 40
  doc.setFont('helvetica', 'bold'); doc.text('Cliente:', 14, y)
  doc.setFont('helvetica', 'normal'); doc.text(cliente?.nombre ?? `Cliente #${venta.cliente_id}`, 36, y)
  doc.setFont('helvetica', 'bold'); doc.text('Fecha:', W - 70, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${fecha.toLocaleDateString('es-MX')} ${fmtHora(venta.fecha)}`, W - 56, y)
  y += 6
  if (venta.metodo_pago) {
    doc.setFont('helvetica', 'bold'); doc.text('Pago:', W - 70, y)
    doc.setFont('helvetica', 'normal'); doc.text(metodoLabel(venta.metodo_pago), W - 56, y)
  }
  if (cliente?.dni) {
    doc.setFont('helvetica', 'bold'); doc.text('DNI:', 14, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(cliente.dni), 36, y)
  }
  if (cliente?.telefono) {
    doc.setFont('helvetica', 'bold'); doc.text('Teléfono:', W - 70, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(cliente.telefono), W - 50, y)
  }

  autoTable(doc, {
    startY: y + 6,
    head: [['#', 'Descripción', 'Tipo', 'Cant.', 'P. Unit.', 'Subtotal']],
    body: venta.items.map((it, i) => [
      i + 1,
      it.descripcion,
      it.tipo === 'servicio' ? 'Servicio' : 'Producto',
      it.cantidad,
      fmtMoneda(it.precio_unitario),
      fmtMoneda(it.subtotal),
    ]),
    headStyles: { fillColor: marca, fontSize: 9, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  })

  let finY = ultimaY(doc) + 4
  if (Number(venta.descuento_pct) > 0) {
    doc.setTextColor(90, 90, 90); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', W - 80, finY + 4)
    doc.text(fmtMoneda(venta.subtotal ?? venta.total), W - 18, finY + 4, { align: 'right' })
    doc.text(`Descuento (${venta.descuento_pct}%):`, W - 80, finY + 9)
    doc.text('- ' + fmtMoneda(venta.descuento_monto ?? 0), W - 18, finY + 9, { align: 'right' })
    finY += 11
  }
  doc.setFillColor(243, 240, 250)
  doc.roundedRect(W - 84, finY, 70, 12, 2, 2, 'F')
  doc.setTextColor(...marca)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('TOTAL:', W - 80, finY + 8)
  doc.text(fmtMoneda(venta.total), W - 18, finY + 8, { align: 'right' })

  doc.setTextColor(150, 150, 150)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(
    [clinica.pie_comprobante, clinica.nombre].filter(Boolean).join(' — '),
    W / 2, 285, { align: 'center' },
  )

  doc.save(`Boleta_${nroBoleta(venta.id)}.pdf`)
}
