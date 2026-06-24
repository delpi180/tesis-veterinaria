import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Colores e info de tamaño
const _PDF_W = 210, _PDF_M = 14, _PDF_MORADO = [88, 28, 135];

const SISTEMAS_EOP = [
  "tegumentario", "cardiovascular", "respiratorio", "digestivo",
  "urinario", "reproductor", "nervioso", "musculoesqueletico",
  "linfatico", "sentidos", "endocrino",
];
const SISTEMA_LABELS = {
  tegumentario: "Tegumentario",      cardiovascular: "Cardiovascular",
  respiratorio: "Respiratorio",      digestivo: "Digestivo",
  urinario: "Urinario",              reproductor: "Reproductor",
  nervioso: "Nervioso",              musculoesqueletico: "Músculo-esquelético",
  linfatico: "Linfático",            sentidos: "Sentidos especiales",
  endocrino: "Endocrino",
};

const OPT = {
  tipo_consulta: [
    { v: "primera_vez", l: "Primera vez" }, { v: "control", l: "Control" },
    { v: "urgencia",    l: "Urgencia" },    { v: "vacunacion", l: "Vacunación" },
  ],
  mucosas: [
    { v: "rosadas",    l: "Rosadas" },    { v: "palidas",    l: "Pálidas" },
    { v: "congestivas",l: "Congestivas" },{ v: "ictericas",  l: "Ictéricas" },
    { v: "cianoticas", l: "Cianóticas" },
  ],
  tllc: [
    { v: "normal",    l: "Normal (<2 seg)" },
    { v: "aumentado", l: "Aumentado (>2 seg)" },
  ],
  estado_sensorio: [
    { v: "alerta",     l: "Alerta" },    { v: "deprimido",  l: "Deprimido" },
    { v: "estuporoso", l: "Estuporoso" },{ v: "comatoso",   l: "Comatoso" },
  ],
  hidratacion: [
    { v: "normal",     l: "Normal" },
    { v: "leve_5",     l: "Deshidratación leve (5%)" },
    { v: "moderada_7", l: "Deshidratación moderada (7%)" },
    { v: "grave_10",   l: "Deshidratación grave (10%)" },
    { v: "shock_12",   l: "Shock hipovolémico (>12%)" },
  ],
  pulso: [
    { v: "fuerte",    l: "Fuerte" },   { v: "debil",     l: "Débil" },
    { v: "filiforme", l: "Filiforme" },{ v: "ausente",   l: "Ausente" },
  ],
  pronostico: [
    { v: "favorable",   l: "Favorable" },  { v: "reservado",    l: "Reservado" },
    { v: "desfavorable",l: "Desfavorable" },{ v: "grave",       l: "Grave" },
  ],
  sistema_estado: [
    { v: "normal",     l: "Normal" },
    { v: "alterado",   l: "Alterado" },
    { v: "no_evaluado",l: "No evaluado" },
  ],
};

function getLabel(field, value) {
  if (!value) return value;
  return OPT[field]?.find(o => o.v === value)?.l ?? value;
}

function _seccionPDF(doc, title, rows) {
  const body = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!body.length) return;
  autoTable(doc, {
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 3 : 30,
    head: [[{ content: title, colSpan: 2 }]],
    body,
    theme: "grid",
    headStyles: { fillColor: _PDF_MORADO, fontSize: 9, halign: "left", textColor: 255 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: "bold", textColor: [90, 90, 90] },
      1: { cellWidth: _PDF_W - 2 * _PDF_M - 42 },
    },
    styles: { fontSize: 9, cellPadding: 2, valign: "top", overflow: "linebreak" },
    margin: { left: _PDF_M, right: _PDF_M },
  });
}

function _seccionesClinicasPDF(doc, h) {
  _seccionPDF(doc, "Anamnesis", [
    ["Motivo", h.motivo_consulta],
    ["Tiempo de evolución", h.tiempo_evolucion],
    ["Tipo de consulta", getLabel("tipo_consulta", h.tipo_consulta)],
    ["Derivado por", h.derivado_por],
    ["Alimentación", [h.alimentacion_tipo, h.alimentacion_cantidad_gr ? `${h.alimentacion_cantidad_gr} g` : null].filter(Boolean).join(" · ")],
    ["Detalle", h.detalle],
    ["Antecedentes", h.antecedentes],
  ]);
  _seccionPDF(doc, "Examen objetivo general (EOG)", [
    ["Peso", h.peso_kg ? `${h.peso_kg} kg` : null],
    ["Temperatura", h.temperatura_c ? `${h.temperatura_c} °C` : null],
    ["Frec. cardiaca", h.frecuencia_cardiaca ? `${h.frecuencia_cardiaca} lpm` : null],
    ["Frec. respiratoria", h.frecuencia_respiratoria ? `${h.frecuencia_respiratoria} rpm` : null],
    ["Condición corporal", h.condicion_corporal ? `${h.condicion_corporal}/9` : null],
    ["Mucosas", getLabel("mucosas", h.mucosas)],
    ["TLLC", getLabel("tllc", h.tllc)],
    ["Sensorio", getLabel("estado_sensorio", h.estado_sensorio)],
    ["Hidratación", getLabel("hidratacion", h.hidratacion)],
    ["Pulso", getLabel("pulso", h.pulso)],
    ["Linfonódulos", h.linfonodulos],
  ]);
  const eop = SISTEMAS_EOP.map(s => {
    const val = (h.examen_particular || {})[s];
    if (!val) return null;
    const texto = typeof val === "string"
      ? val
      : [val.estado ? getLabel("sistema_estado", val.estado) : null, val.detalle].filter(Boolean).join(" — ");
    return texto ? [SISTEMA_LABELS[s], texto] : null;
  }).filter(Boolean);
  _seccionPDF(doc, "Examen objetivo particular (EOP)", eop);
  _seccionPDF(doc, "Diagnóstico", [
    ["Presuntivo", h.diagnostico_presuntivo],
    ["Diferenciales", h.diagnosticos_diferenciales],
    ["Definitivo", h.diagnostico_definitivo],
  ]);
  const tto = (h.tratamiento_items || []).filter(t => t.medicamento)
    .map(t => `• ${[t.medicamento, t.dosis, t.via, t.frecuencia, t.duracion].filter(Boolean).join(" · ")}`).join("\n");
  const vac = (h.vacunas_items || []).filter(v => v.vacuna)
    .map(v => `• ${[v.vacuna, v.lote, v.proxima_dosis ? `próx. ${v.proxima_dosis}` : null].filter(Boolean).join(" · ")}`).join("\n");
  _seccionPDF(doc, "Plan / Tratamiento", [
    ["Exámenes solicitados", h.examenes_solicitados],
    ["Tratamiento", tto],
    ["Vacunas", vac],
    ["Indicaciones", h.indicaciones],
    ["Pronóstico", getLabel("pronostico", h.pronostico)],
    ["Próxima cita", h.proxima_cita ? new Date(h.proxima_cita).toLocaleDateString("es-PE") : null],
  ]);
}

// PDF de la historia clínica COMPLETA (todas las consultas, todos los campos)
export function generarPDF(paciente, historias) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(..._PDF_MORADO);
  doc.rect(0, 0, _PDF_W, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont(undefined, "bold");
  doc.text("Veterinaria Los Pinos", _PDF_M, 11);
  doc.setFontSize(9); doc.setFont(undefined, "normal");
  doc.text("Historia Clínica Completa", _PDF_M, 18);
  doc.text(`${(historias || []).length} consulta(s)`, _PDF_W - _PDF_M, 18, { align: "right" });

  const cliente = paciente?.cliente;
  const edad = paciente?.edad != null ? `${paciente.edad} año${paciente.edad !== 1 ? "s" : ""}` : "";
  _seccionPDF(doc, "Datos del paciente", [
    ["Nombre", paciente?.nombre],
    ["Especie / Raza", [paciente?.especie, paciente?.raza].filter(Boolean).join(" / ")],
    ["Sexo / Edad", [paciente?.sexo, edad].filter(Boolean).join(" · ")],
  ]);
  _seccionPDF(doc, "Datos del propietario", [
    ["Nombre", cliente?.nombre],
    ["DNI", cliente?.dni],
    ["Teléfono", cliente?.telefono],
    ["Dirección", cliente?.direccion],
  ]);

  const orden = [...(historias || [])].sort(
    (a, b) => new Date(a.fecha || a.creado_en) - new Date(b.fecha || b.creado_en));

  orden.forEach((h, i) => {
    const fecha = new Date(h.fecha || h.creado_en).toLocaleString("es-PE", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    autoTable(doc, {
      startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 26) + 6,
      body: [[`Consulta ${i + 1} — ${fecha}` + (h.tipo_consulta ? ` · ${getLabel("tipo_consulta", h.tipo_consulta)}` : "")]],
      theme: "plain",
      styles: { fontSize: 11, fontStyle: "bold", textColor: _PDF_MORADO, cellPadding: { top: 2, bottom: 1, left: 0 } },
      margin: { left: _PDF_M, right: _PDF_M },
    });
    _seccionesClinicasPDF(doc, h);
  });

  doc.save(`HC_${paciente?.nombre ?? "paciente"}.pdf`);
}
