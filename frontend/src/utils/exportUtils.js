import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Exporta datos a PDF con tabla profesional.
 * @param {string} titulo - Título del reporte
 * @param {string[]} columnas - Headers de la tabla
 * @param {any[][]} filas - Filas de datos
 * @param {string} [orientacion='portrait'] - 'portrait' o 'landscape'
 */
export function exportarPDF(titulo, columnas, filas, orientacion = 'portrait') {
  const doc = new jsPDF(orientacion, 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(107, 33, 168); // purple-700
  doc.text('Veterinaria Los Pinos', pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(titulo, pageWidth / 2, 22, { align: 'center' });

  doc.setFontSize(8);
  doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, pageWidth / 2, 27, { align: 'center' });

  // Table
  doc.autoTable({
    head: [columnas],
    body: filas,
    startY: 32,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: {
      fillColor: [107, 33, 168],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { horizontal: 10 },
  });

  doc.save(`${titulo.replace(/\s+/g, '_').toLowerCase()}.pdf`);
}

/**
 * Exporta datos a CSV (abre en Excel).
 * @param {string} titulo - Nombre del archivo
 * @param {string[]} columnas - Headers
 * @param {any[][]} filas - Filas de datos
 */
export function exportarCSV(titulo, columnas, filas) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const header = columnas.join(',');
  const rows = filas.map(fila =>
    fila.map(celda => {
      const str = String(celda ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  const csv = BOM + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo.replace(/\s+/g, '_').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
