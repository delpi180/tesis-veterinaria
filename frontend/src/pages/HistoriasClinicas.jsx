import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronDown, Plus, Trash2, Download, Save, Check,
  ArrowLeft, Mic, StopCircle, AlertTriangle, Loader2, FileText,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api, authHeaders } from "../services/api";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

// ── Catálogos ────────────────────────────────────────────────────────────────

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

const getLabel = (field, value) => {
  if (!value) return value;
  return OPT[field]?.find(o => o.v === value)?.l ?? value;
};

// Campo → sección del acordeón (para auto-abrir con inferidos)
const FIELD_TO_SECTION = {
  motivo_consulta: "s1", tiempo_evolucion: "s1", derivado_por: "s1",
  detalle: "s1", alimentacion_tipo: "s1", alimentacion_cantidad_gr: "s1",
  antecedentes: "s1", tipo_consulta: "s1",
  temperatura_c: "s2", peso_kg: "s2", frecuencia_cardiaca: "s2",
  frecuencia_respiratoria: "s2", condicion_corporal: "s2",
  mucosas: "s2", tllc: "s2", estado_sensorio: "s2", hidratacion: "s2",
  pulso: "s2", linfonodulos: "s2",
  diagnostico_presuntivo: "s4", diagnosticos_diferenciales: "s4",
  diagnostico_definitivo: "s4",
  examenes_solicitados: "s5", indicaciones: "s5", pronostico: "s5",
};

// ── Estado inicial ────────────────────────────────────────────────────────────

const eopVacio = () =>
  Object.fromEntries(SISTEMAS_EOP.map(s => [s, { estado: "", detalle: "" }]));

const TX_EMPTY = { medicamento: "", dosis: "", via: "", frecuencia: "", duracion: "" };
const VX_EMPTY = { vacuna: "", lote: "", proxima_dosis: "" };

const FORM_VACIO = {
  motivo_consulta: "", tiempo_evolucion: "", derivado_por: "",
  detalle: "", alimentacion_tipo: "", alimentacion_cantidad_gr: "",
  antecedentes: "", tipo_consulta: "",
  temperatura_c: "", peso_kg: "", frecuencia_cardiaca: "",
  frecuencia_respiratoria: "", condicion_corporal: "",
  mucosas: "", tllc: "", estado_sensorio: "", hidratacion: "",
  pulso: "", linfonodulos: "",
  examen_particular: eopVacio(),
  diagnostico_presuntivo: "", diagnosticos_diferenciales: "",
  diagnostico_definitivo: "",
  examenes_solicitados: "",
  tratamiento_items: [],
  vacunas_items: [],
  indicaciones: "", pronostico: "", proxima_cita: "",
};

const NUM_FIELDS = [
  "temperatura_c", "peso_kg", "frecuencia_cardiaca",
  "frecuencia_respiratoria", "condicion_corporal", "alimentacion_cantidad_gr",
];

// ── Payload / hidratación de formulario ──────────────────────────────────────

function buildPayload(form) {
  const out = {};
  for (const [k, v] of Object.entries(form)) {
    if (["examen_particular", "tratamiento_items", "vacunas_items"].includes(k)) continue;
    if (v === "" || v === null || v === undefined) {
      out[k] = null;
    } else if (NUM_FIELDS.includes(k)) {
      const n = Number(v);
      out[k] = isNaN(n) ? null : n;
    } else if (k === "proxima_cita") {
      out[k] = v ? v + ":00" : null;
    } else {
      out[k] = v;
    }
  }
  const ep = {};
  for (const [s, val] of Object.entries(form.examen_particular)) {
    if (val.estado || val.detalle?.trim())
      ep[s] = { estado: val.estado || null, detalle: val.detalle?.trim() || null };
  }
  out.examen_particular = Object.keys(ep).length > 0 ? ep : null;
  const tx = (form.tratamiento_items || []).filter(i => i.medicamento?.trim());
  out.tratamiento_items = tx.length > 0
    ? tx.map(i => ({ medicamento: i.medicamento||null, dosis: i.dosis||null,
        via: i.via||null, frecuencia: i.frecuencia||null, duracion: i.duracion||null }))
    : null;
  const vx = (form.vacunas_items || []).filter(i => i.vacuna?.trim());
  out.vacunas_items = vx.length > 0
    ? vx.map(i => ({ vacuna: i.vacuna||null, lote: i.lote||null, proxima_dosis: i.proxima_dosis||null }))
    : null;
  return out;
}

function formFromHistoria(h) {
  const f = { ...FORM_VACIO };
  for (const k of Object.keys(FORM_VACIO)) {
    if (["examen_particular", "tratamiento_items", "vacunas_items"].includes(k)) continue;
    const v = h[k];
    if (v !== null && v !== undefined)
      f[k] = k === "proxima_cita" ? (v ? v.slice(0, 16) : "") : String(v);
  }
  const ep = eopVacio();
  if (h.examen_particular && typeof h.examen_particular === "object") {
    for (const s of SISTEMAS_EOP) {
      const val = h.examen_particular[s];
      if (!val) continue;
      ep[s] = typeof val === "string"
        ? { estado: "", detalle: val }
        : { estado: val.estado || "", detalle: val.detalle || "" };
    }
  }
  f.examen_particular = ep;
  f.tratamiento_items = Array.isArray(h.tratamiento_items)
    ? h.tratamiento_items.map(i => ({
        medicamento: i.medicamento||"", dosis: i.dosis||"",
        via: i.via||"", frecuencia: i.frecuencia||"", duracion: i.duracion||"" }))
    : [];
  f.vacunas_items = Array.isArray(h.vacunas_items)
    ? h.vacunas_items.map(i => ({ vacuna: i.vacuna||"", lote: i.lote||"", proxima_dosis: i.proxima_dosis||"" }))
    : [];
  return f;
}

// ── Estilos con resaltado ─────────────────────────────────────────────────────

const lCls = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1";

const hlInput = (hl) => {
  const base = "w-full rounded-md px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1";
  if (hl === "alerta")   return `${base} border-2 border-rose-400 bg-rose-50 focus:ring-rose-200 focus:border-rose-500`;
  if (hl === "ok")       return `${base} border border-emerald-300 bg-emerald-50 focus:ring-emerald-200 focus:border-emerald-400`;
  if (hl === "inferido") return `${base} border border-amber-400 bg-amber-50 focus:ring-amber-200 focus:border-amber-500`;
  return `${base} border border-slate-200 bg-white focus:ring-purple-300 focus:border-purple-300`;
};

function HlLabel({ hl }) {
  if (hl === "alerta")
    return (
      <span className="flex items-center gap-0.5 text-rose-600 shrink-0">
        <AlertTriangle size={10} />
        <span style={{ fontSize: "9px" }} className="font-bold">Fuera de rango — revisa</span>
      </span>
    );
  if (hl === "ok")
    return <Check size={10} className="text-emerald-500 shrink-0" />;
  if (hl === "inferido")
    return (
      <span className="flex items-center gap-0.5 text-amber-600 shrink-0">
        <AlertTriangle size={10} />
        <span style={{ fontSize: "9px" }} className="font-medium">Inferido — confirma</span>
      </span>
    );
  return null;
}

function Field({ label, children, cls = "", hl }) {
  return (
    <div className={cls}>
      <div className="flex items-center gap-1 mb-1">
        <label className={lCls}>{label}</label>
        <HlLabel hl={hl} />
      </div>
      {children}
    </div>
  );
}

const TIn = ({ value, onChange, placeholder = "", hl }) =>
  <input type="text" value={value} onChange={onChange} placeholder={placeholder} className={hlInput(hl)} />;
const NIn = ({ value, onChange, placeholder = "", hl }) =>
  <input type="number" step="any" value={value} onChange={onChange} placeholder={placeholder} className={hlInput(hl)} />;
const TAr = ({ value, onChange, rows = 3, placeholder = "", hl }) =>
  <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} className={`${hlInput(hl)} resize-y`} />;
function Sel({ value, onChange, options, hl }) {
  return (
    <select value={value} onChange={onChange} className={hlInput(hl)}>
      <option value="">—</option>
      {options.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// ── AccordionSection ─────────────────────────────────────────────────────────

function AccordionSection({ num, title, isOpen, onToggle, children }) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-left transition-colors">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-700 text-white text-xs font-bold flex items-center justify-center">
          {num}
        </span>
        <span className="text-sm font-semibold text-slate-700 flex-1">{title}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="px-4 py-4 space-y-3 bg-white border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ── Listas editables ─────────────────────────────────────────────────────────

function TratamientoList({ items, onChange }) {
  const add    = () => onChange([...items, { ...TX_EMPTY }]);
  const remove = i  => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, f, v) => { const n = [...items]; n[i] = { ...n[i], [f]: v }; onChange(n); };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
          <div className="grid grid-cols-5 gap-2">
            <Field label="Medicamento" cls="col-span-2">
              <TIn value={item.medicamento} onChange={e => update(i,"medicamento",e.target.value)} placeholder="Metronidazol" />
            </Field>
            <Field label="Dosis">
              <TIn value={item.dosis} onChange={e => update(i,"dosis",e.target.value)} placeholder="15 mg/kg" />
            </Field>
            <Field label="Vía">
              <TIn value={item.via} onChange={e => update(i,"via",e.target.value)} placeholder="Oral" />
            </Field>
            <div className="flex items-end gap-1.5">
              <Field label="Frecuencia" cls="flex-1">
                <TIn value={item.frecuencia} onChange={e => update(i,"frecuencia",e.target.value)} placeholder="c/12h" />
              </Field>
              <button type="button" onClick={() => remove(i)}
                className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div className="mt-2 w-1/5">
            <Field label="Duración">
              <TIn value={item.duracion} onChange={e => update(i,"duracion",e.target.value)} placeholder="5 días" />
            </Field>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 border border-dashed border-purple-300 rounded-md px-3 py-1.5 hover:bg-purple-50 transition-colors">
        <Plus size={13} /> Agregar medicamento
      </button>
    </div>
  );
}

function VacunaList({ items, onChange }) {
  const add    = () => onChange([...items, { ...VX_EMPTY }]);
  const remove = i  => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, f, v) => { const n = [...items]; n[i] = { ...n[i], [f]: v }; onChange(n); };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 items-end p-2.5 bg-slate-50 border border-slate-200 rounded-md">
          <Field label="Vacuna">
            <TIn value={item.vacuna} onChange={e => update(i,"vacuna",e.target.value)} placeholder="Antirrábica" />
          </Field>
          <Field label="Lote">
            <TIn value={item.lote} onChange={e => update(i,"lote",e.target.value)} placeholder="AB12345" />
          </Field>
          <div className="flex items-end gap-1.5">
            <Field label="Próxima dosis" cls="flex-1">
              <TIn value={item.proxima_dosis} onChange={e => update(i,"proxima_dosis",e.target.value)} placeholder="En 1 año" />
            </Field>
            <button type="button" onClick={() => remove(i)}
              className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 border border-dashed border-purple-300 rounded-md px-3 py-1.5 hover:bg-purple-50 transition-colors">
        <Plus size={13} /> Agregar vacuna
      </button>
    </div>
  );
}

// ── HistoriaCard ─────────────────────────────────────────────────────────────

function DRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-1.5 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-400 whitespace-nowrap pt-px">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
function DSec({ title, show, children }) {
  if (!show) return null;
  return (
    <div className="pt-2 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-1">{title}</p>
      <div className="space-y-0.5 pl-1">{children}</div>
    </div>
  );
}

function HistoriaCard({ h, onEdit }) {
  const fecha = new Date(h.fecha || h.creado_en).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const txItems = Array.isArray(h.tratamiento_items) ? h.tratamiento_items : [];
  const vxItems = Array.isArray(h.vacunas_items)     ? h.vacunas_items     : [];
  const epEntries = SISTEMAS_EOP.map(s => {
    const val = (h.examen_particular || {})[s];
    if (!val) return null;
    const texto = typeof val === "string"
      ? val
      : [val.estado ? getLabel("sistema_estado", val.estado) : null, val.detalle].filter(Boolean).join(" — ");
    return texto ? { label: SISTEMA_LABELS[s], texto } : null;
  }).filter(Boolean);

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2 bg-purple-700 text-white">
        <span className="text-sm font-semibold">{fecha}</span>
        <div className="flex items-center gap-2">
          {h.tipo_consulta && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {getLabel("tipo_consulta", h.tipo_consulta)}
            </span>
          )}
          <button onClick={() => onEdit(h)}
            className="text-xs bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 transition-colors">
            Editar
          </button>
        </div>
      </div>
      <div className="px-4 py-3 divide-y divide-slate-100 space-y-2">
        <DSec title="Anamnesis" show={h.motivo_consulta || h.tiempo_evolucion || h.detalle || h.antecedentes}>
          <DRow label="Motivo"       value={h.motivo_consulta} />
          <DRow label="Evolución"    value={h.tiempo_evolucion} />
          <DRow label="Detalle"      value={h.detalle} />
          <DRow label="Antecedentes" value={h.antecedentes} />
        </DSec>
        <DSec title="EOG — Constantes" show={h.peso_kg || h.temperatura_c || h.frecuencia_cardiaca || h.mucosas || h.hidratacion}>
          <div className="flex flex-wrap gap-x-5 gap-y-0.5">
            {h.peso_kg             && <DRow label="Peso"  value={`${h.peso_kg} kg`} />}
            {h.temperatura_c       && <DRow label="T°"    value={`${h.temperatura_c} °C`} />}
            {h.frecuencia_cardiaca && <DRow label="FC"    value={`${h.frecuencia_cardiaca} lpm`} />}
            {h.frecuencia_respiratoria && <DRow label="FR" value={`${h.frecuencia_respiratoria} rpm`} />}
            {h.condicion_corporal  && <DRow label="CC"    value={`${h.condicion_corporal}/9`} />}
          </div>
          <DRow label="Mucosas"  value={getLabel("mucosas",         h.mucosas)} />
          <DRow label="TLLC"     value={getLabel("tllc",            h.tllc)} />
          <DRow label="Sensorio" value={getLabel("estado_sensorio", h.estado_sensorio)} />
          <DRow label="Hidrat."  value={getLabel("hidratacion",     h.hidratacion)} />
          <DRow label="Pulso"    value={getLabel("pulso",           h.pulso)} />
          <DRow label="Linfon."  value={h.linfonodulos} />
        </DSec>
        <DSec title="EOP — Sistemas" show={epEntries.length > 0}>
          {epEntries.map(({ label, texto }) => <DRow key={label} label={label} value={texto} />)}
        </DSec>
        <DSec title="Diagnóstico" show={h.diagnostico_presuntivo || h.diagnosticos_diferenciales || h.diagnostico_definitivo}>
          <DRow label="Presuntivo"    value={h.diagnostico_presuntivo} />
          <DRow label="Diferenciales" value={h.diagnosticos_diferenciales} />
          <DRow label="Definitivo"    value={h.diagnostico_definitivo} />
        </DSec>
        <DSec title="Plan" show={txItems.length > 0 || vxItems.length > 0 || h.examenes_solicitados || h.indicaciones}>
          <DRow label="Exámenes" value={h.examenes_solicitados} />
          {txItems.map((t, i) => (
            <DRow key={i} label={`Tto ${i+1}`}
              value={[t.medicamento,t.dosis,t.via,t.frecuencia,t.duracion].filter(Boolean).join(" · ")} />
          ))}
          {vxItems.map((v, i) => (
            <DRow key={i} label={`Vac ${i+1}`}
              value={[v.vacuna,v.lote,v.proxima_dosis?`próx. ${v.proxima_dosis}`:null].filter(Boolean).join(" · ")} />
          ))}
          <DRow label="Indicaciones" value={h.indicaciones} />
          <DRow label="Pronóstico"   value={getLabel("pronostico", h.pronostico)} />
          <DRow label="Próx. cita"   value={h.proxima_cita ? new Date(h.proxima_cita).toLocaleDateString("es-PE") : null} />
        </DSec>
      </div>
    </div>
  );
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const _PDF_W = 210, _PDF_M = 14, _PDF_MORADO = [88, 28, 135];

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
function generarPDF(paciente, historias) {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtSec = s =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// ── Componente principal ──────────────────────────────────────────────────────

export default function HistoriasClinicas() {
  const { pacienteId: id } = useParams();
  const navigate = useNavigate();

  // ── Datos
  const [paciente,  setPaciente]  = useState(null);
  const [historias, setHistorias] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // ── Formulario
  const [form,       setForm]       = useState(FORM_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errForm,    setErrForm]    = useState(null);
  const [open, setOpen] = useState({ s1: true, s2: true, s3: false, s4: false, s5: false });

  // ── IA / voz
  const [aiState,       setAiState]       = useState(null); // null|"recording"|"transcribing"|"processing"|"done"|"error"
  const [transcripcionIA, setTranscripcionIA] = useState("");
  const [datosIA,       setDatosIA]       = useState(null);
  const [inferenciasBrut, setInferenciasBrut] = useState({});
  const [highlights,    setHighlights]    = useState({});
  const [aiError,       setAiError]       = useState(null);
  const [modoTexto,     setModoTexto]     = useState(false);
  const [textoManual,   setTextoManual]   = useState("");

  const { isRecording, seconds, micError, start, stop } = useAudioRecorder();

  // ── Métrica de tiempo: cuándo empezó el registro y si se usó IA
  const inicioRegistro = useRef(Date.now());
  const usoIA = useRef(false);

  // Propaga errores de micrófono al estado de IA
  useEffect(() => {
    if (micError) { setAiError(micError); setAiState("error"); }
  }, [micError]);

  // ── Carga inicial
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/pacientes/${id}`),
      api.get(`/api/pacientes/${id}/historias/`),
    ])
      .then(([pac, hists]) => { setPaciente(pac); setHistorias(Array.isArray(hists) ? hists : []); })
      .catch(() => setError("No se pudo cargar el paciente."))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Setters que limpian su resaltado al editar
  const setF = f => e => {
    setForm(p => ({ ...p, [f]: e.target.value }));
    if (highlights[f]) setHighlights(p => { const n = { ...p }; delete n[f]; return n; });
  };
  const setEop = (s, c) => e =>
    setForm(p => ({
      ...p,
      examen_particular: { ...p.examen_particular, [s]: { ...p.examen_particular[s], [c]: e.target.value } },
    }));

  const toggle = k => setOpen(p => ({ ...p, [k]: !p[k] }));

  // ── Resetear formulario + estado IA
  const resetForm = () => {
    setForm(FORM_VACIO);
    setEditandoId(null);
    setErrForm(null);
    setHighlights({});
    setTranscripcionIA("");
    setDatosIA(null);
    setInferenciasBrut({});
    setAiState(null);
    setAiError(null);
    setOpen({ s1: true, s2: true, s3: false, s4: false, s5: false });
    // Reinicia la medición de tiempo para el siguiente registro
    inicioRegistro.current = Date.now();
    usoIA.current = false;
  };

  const handleEdit = h => {
    setForm(formFromHistoria(h));
    setEditandoId(h.id);
    setHighlights({});
    setAiState(null);
    setOpen({ s1: true, s2: true, s3: true, s4: true, s5: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Volcar datos de IA al formulario
  const applyIA = (datos, inferencias, alertasRango = {}) => {
    usoIA.current = true;   // este registro se asistió con IA (voz o texto)
    setForm(prev => {
      const next = { ...prev };
      const SKIP = ["examen_particular", "tratamiento_items", "vacunas_items"];
      for (const k of Object.keys(FORM_VACIO)) {
        if (SKIP.includes(k)) continue;
        const val = datos[k];
        if (val === null || val === undefined) continue;
        if (k === "proxima_cita") {
          // datetime-local necesita YYYY-MM-DDTHH:MM; GPT devuelve YYYY-MM-DD (sin hora)
          const v = String(val);
          next[k] = v.length === 10 ? v + "T00:00" : v.slice(0, 16);
        } else {
          next[k] = String(val);
        }
      }
      // EOP
      const ep = eopVacio();
      if (datos.examen_particular && typeof datos.examen_particular === "object") {
        for (const s of SISTEMAS_EOP) {
          const val = datos.examen_particular[s];
          if (!val) continue;
          ep[s] = typeof val === "string"
            ? { estado: "", detalle: val }
            : { estado: val.estado || "", detalle: val.detalle || "" };
        }
      }
      next.examen_particular = ep;
      // Listas — reemplaza (no acumula)
      if (Array.isArray(datos.tratamiento_items) && datos.tratamiento_items.length > 0)
        next.tratamiento_items = datos.tratamiento_items.map(i => ({
          medicamento: i.medicamento||"", dosis: i.dosis||"",
          via: i.via||"", frecuencia: i.frecuencia||"", duracion: i.duracion||"",
        }));
      if (Array.isArray(datos.vacunas_items) && datos.vacunas_items.length > 0)
        next.vacunas_items = datos.vacunas_items.map(i => ({
          vacuna: i.vacuna||"", lote: i.lote||"", proxima_dosis: i.proxima_dosis||"",
        }));
      return next;
    });

    // Resaltados: "explicito" → "ok", "inferido" → "inferido"
    const hl = {};
    for (const [campo, tipo] of Object.entries(inferencias))
      hl[campo] = tipo === "inferido" ? "inferido" : "ok";
    // Las alertas de rango fisiológico tienen prioridad (rojo)
    for (const campo of Object.keys(alertasRango || {}))
      hl[campo] = "alerta";
    setHighlights(hl);

    // Auto-abrir secciones con inferidos o con alertas de rango
    const sectionsToOpen = new Set();
    for (const [campo, tipo] of Object.entries(hl))
      if ((tipo === "inferido" || tipo === "alerta") && FIELD_TO_SECTION[campo])
        sectionsToOpen.add(FIELD_TO_SECTION[campo]);
    if (sectionsToOpen.size > 0)
      setOpen(prev => {
        const next = { ...prev };
        sectionsToOpen.forEach(s => { next[s] = true; });
        return next;
      });
  };

  // ── Flujo de grabación
  const handleGrabar = async () => {
    if (isRecording) {
      // Detener y procesar
      setAiState("transcribing");
      setAiError(null);
      try {
        const blob = await stop();
        if (!blob) throw new Error("No se capturó audio.");

        // 1. Transcribir con Deepgram
        const fd = new FormData();
        fd.append("audio", blob, "consulta.webm");
        const r1 = await fetch(`${BASE_URL}/api/transcribe`, { method: "POST", body: fd, headers: authHeaders() });
        if (!r1.ok) {
          const b = await r1.json().catch(() => ({}));
          throw new Error(b?.detail ?? `Error al transcribir (HTTP ${r1.status})`);
        }
        const { transcripcion } = await r1.json();
        setTranscripcionIA(transcripcion);

        // 2. Extraer con GPT
        setAiState("processing");
        const { datos, inferencias, alertas_rango } = await api.post("/api/procesar-historia", { texto: transcripcion });
        setDatosIA(datos);
        setInferenciasBrut(inferencias);
        applyIA(datos, inferencias, alertas_rango);
        setAiState("done");
      } catch (e) {
        setAiError(e.message);
        setAiState("error");
      }
    } else {
      // Iniciar grabación
      setAiState("recording");
      setAiError(null);
      setTranscripcionIA("");
      setDatosIA(null);
      await start();
    }
  };

  // ── Procesado desde texto libre
  const handleProcesarTexto = async () => {
    if (!textoManual.trim()) return;
    setAiState("processing");
    setAiError(null);
    try {
      const { datos, inferencias, transcripcion, alertas_rango } = await api.post("/api/procesar-historia", { texto: textoManual });
      setTranscripcionIA(transcripcion);
      setDatosIA(datos);
      setInferenciasBrut(inferencias);
      applyIA(datos, inferencias, alertas_rango);
      setAiState("done");
    } catch (e) {
      setAiError(e.message);
      setAiState("error");
    }
  };

  // ── Guardar
  const handleSave = async () => {
    setGuardando(true); setErrForm(null);
    try {
      const payload = buildPayload(form);
      // Auditoría IA
      if (transcripcionIA) payload.transcripcion = transcripcionIA;
      if (datosIA)         payload.datos_ia = { ...datosIA, inferencias: inferenciasBrut };

      if (editandoId) {
        const r = await api.put(`/api/pacientes/${id}/historias/${editandoId}`, payload);
        setHistorias(p => p.map(h => h.id === editandoId ? r : h));
      } else {
        // Métrica de tiempo: solo en registros nuevos
        payload.segundos_registro = Math.max(1, Math.round((Date.now() - inicioRegistro.current) / 1000));
        payload.metodo_registro = usoIA.current ? "ia" : "manual";
        const r = await api.post(`/api/pacientes/${id}/historias/`, payload);
        setHistorias(p => [r, ...p]);
      }
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
      resetForm();
    } catch (e) {
      setErrForm(e?.message ?? "Error al guardar.");
    } finally {
      setGuardando(false);
    }
  };

  // ── Contador de inferidos pendientes
  const numInferidos = Object.values(highlights).filter(v => v === "inferido").length;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Cargando…</div>;
  if (error)   return <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-purple-700 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="hover:bg-white/20 p-1 rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-bold leading-tight">{paciente?.nombre}</h1>
            <p className="text-xs text-purple-200">
              {paciente?.especie}{paciente?.raza ? ` · ${paciente.raza}` : ""}
              {paciente?.cliente ? ` · ${paciente.cliente.nombre}` : ""}
            </p>
          </div>
        </div>
        <button onClick={() => generarPDF(paciente, historias)} disabled={historias.length === 0}
          className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 disabled:opacity-40 rounded px-3 py-1.5 font-medium transition-colors">
          <Download size={13} /> PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Panel IA / Voz ──────────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-md bg-white overflow-hidden">

          {/* Tabs: Voz | Texto */}
          <div className="flex border-b border-slate-100">
            <button onClick={() => setModoTexto(false)}
              className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                !modoTexto ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              <Mic size={13} /> Dictado por voz
            </button>
            <button onClick={() => setModoTexto(true)}
              className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                modoTexto ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              <FileText size={13} /> Texto libre
            </button>
          </div>

          <div className="px-4 py-3 space-y-2">
            {!modoTexto ? (
              /* MODO VOZ */
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={handleGrabar}
                    disabled={aiState === "transcribing" || aiState === "processing"}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isRecording
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-purple-700 hover:bg-purple-800 text-white"
                    }`}>
                    {isRecording
                      ? <><StopCircle size={15} className="animate-pulse" /> Detener ({fmtSec(seconds)})</>
                      : <><Mic size={15} /> Grabar consulta</>}
                  </button>

                  {aiState === "transcribing" && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 size={13} className="animate-spin" /> Transcribiendo…
                    </span>
                  )}
                  {aiState === "processing" && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 size={13} className="animate-spin" /> Procesando con IA…
                    </span>
                  )}
                  {aiState === "done" && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Check size={13} /> Formulario autocompletado
                    </span>
                  )}
                </div>

                {transcripcionIA && (
                  <div>
                    <p className={lCls}>Transcripción recibida</p>
                    <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 max-h-20 overflow-y-auto">
                      {transcripcionIA}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* MODO TEXTO */
              <div className="space-y-2">
                <Field label="Texto de la consulta (pegar o escribir)">
                  <TAr value={textoManual} onChange={e => setTextoManual(e.target.value)} rows={4}
                    placeholder="Pegue la transcripción o escriba el resumen de la consulta para que la IA extraiga los campos…" />
                </Field>
                <div className="flex items-center gap-3">
                  <button onClick={handleProcesarTexto}
                    disabled={!textoManual.trim() || aiState === "processing"}
                    className="flex items-center gap-2 px-4 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold transition-colors">
                    {aiState === "processing"
                      ? <><Loader2 size={13} className="animate-spin" /> Procesando…</>
                      : <><FileText size={13} /> Procesar con IA</>}
                  </button>
                  {aiState === "done" && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <Check size={13} /> Formulario autocompletado
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Error IA */}
            {aiError && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-px" />
                <span>{aiError}. Podés continuar completando el formulario en modo manual.</span>
              </div>
            )}
          </div>
        </div>

        {/* Badge de inferidos pendientes */}
        {numInferidos > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-md">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <span className="text-xs font-semibold text-amber-700">
              {numInferidos} campo{numInferidos > 1 ? "s" : ""} inferido{numInferidos > 1 ? "s" : ""} por revisar — resaltado{numInferidos > 1 ? "s" : ""} en naranja abajo
            </span>
          </div>
        )}

        {/* ── Formulario ──────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              {editandoId ? "Editando consulta" : "Nueva consulta"}
            </h2>
            {editandoId && (
              <button onClick={resetForm} className="text-xs text-slate-400 hover:text-slate-600 underline">
                Cancelar edición
              </button>
            )}
          </div>

          {/* S1 — Anamnesis */}
          <AccordionSection num="1" title="Anamnesis" isOpen={open.s1} onToggle={() => toggle("s1")}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo de consulta" hl={highlights.tipo_consulta}>
                <Sel value={form.tipo_consulta} onChange={setF("tipo_consulta")} options={OPT.tipo_consulta} hl={highlights.tipo_consulta} />
              </Field>
              <Field label="Tiempo de evolución" hl={highlights.tiempo_evolucion}>
                <TIn value={form.tiempo_evolucion} onChange={setF("tiempo_evolucion")} placeholder="Ej: 3 días" hl={highlights.tiempo_evolucion} />
              </Field>
              <Field label="Derivado por" hl={highlights.derivado_por}>
                <TIn value={form.derivado_por} onChange={setF("derivado_por")} placeholder="Colega / clínica" hl={highlights.derivado_por} />
              </Field>
            </div>
            <Field label="Motivo de consulta" hl={highlights.motivo_consulta}>
              <TAr value={form.motivo_consulta} onChange={setF("motivo_consulta")} rows={2}
                placeholder="Descripción del motivo principal de la consulta" hl={highlights.motivo_consulta} />
            </Field>
            <Field label="Detalle de la enfermedad actual" hl={highlights.detalle}>
              <TAr value={form.detalle} onChange={setF("detalle")} rows={3} hl={highlights.detalle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de alimentación" hl={highlights.alimentacion_tipo}>
                <TIn value={form.alimentacion_tipo} onChange={setF("alimentacion_tipo")} placeholder="Balanceado / BARF / mixto" hl={highlights.alimentacion_tipo} />
              </Field>
              <Field label="Cantidad diaria (g)" hl={highlights.alimentacion_cantidad_gr}>
                <NIn value={form.alimentacion_cantidad_gr} onChange={setF("alimentacion_cantidad_gr")} placeholder="200" hl={highlights.alimentacion_cantidad_gr} />
              </Field>
            </div>
            <Field label="Antecedentes" hl={highlights.antecedentes}>
              <TAr value={form.antecedentes} onChange={setF("antecedentes")} rows={3}
                placeholder="Vacunas previas: polivalente (ene-2026), antirrábica (mar-2026). Desparasitaciones, cirugías, enfermedades anteriores…"
                hl={highlights.antecedentes} />
            </Field>
          </AccordionSection>

          {/* S2 — EOG */}
          <AccordionSection num="2" title="Examen objetivo general (EOG)" isOpen={open.s2} onToggle={() => toggle("s2")}>
            <div className="grid grid-cols-5 gap-3">
              {[
                ["temperatura_c",           "Temperatura (°C)", "38.5"],
                ["peso_kg",                 "Peso (kg)",        "5.0" ],
                ["frecuencia_cardiaca",     "FC (lpm)",         "100" ],
                ["frecuencia_respiratoria", "FR (rpm)",         "22"  ],
                ["condicion_corporal",      "CC (1–9)",         "5"   ],
              ].map(([f, label, ph]) => (
                <Field key={f} label={label} hl={highlights[f]}>
                  <NIn value={form[f]} onChange={setF(f)} placeholder={ph} hl={highlights[f]} />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["mucosas",         "Mucosas",         OPT.mucosas        ],
                ["tllc",            "TLLC",            OPT.tllc           ],
                ["estado_sensorio", "Estado sensorio", OPT.estado_sensorio],
                ["hidratacion",     "Hidratación",     OPT.hidratacion    ],
                ["pulso",           "Pulso",           OPT.pulso          ],
              ].map(([f, label, opts]) => (
                <Field key={f} label={label} hl={highlights[f]}>
                  <Sel value={form[f]} onChange={setF(f)} options={opts} hl={highlights[f]} />
                </Field>
              ))}
              <Field label="Linfonódulos" hl={highlights.linfonodulos}>
                <TIn value={form.linfonodulos} onChange={setF("linfonodulos")} placeholder="No reactivos" hl={highlights.linfonodulos} />
              </Field>
            </div>
          </AccordionSection>

          {/* S3 — EOP */}
          <AccordionSection num="3" title="Examen objetivo particular (EOP)" isOpen={open.s3} onToggle={() => toggle("s3")}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {SISTEMAS_EOP.map(s => (
                <div key={s} className="grid grid-cols-5 gap-2 items-end">
                  <Field label={SISTEMA_LABELS[s]} cls="col-span-2">
                    <Sel value={form.examen_particular[s].estado} onChange={setEop(s,"estado")} options={OPT.sistema_estado} />
                  </Field>
                  <Field label="Detalle" cls="col-span-3">
                    <TIn value={form.examen_particular[s].detalle} onChange={setEop(s,"detalle")} placeholder="Observaciones" />
                  </Field>
                </div>
              ))}
            </div>
          </AccordionSection>

          {/* S4 — Diagnóstico */}
          <AccordionSection num="4" title="Diagnóstico" isOpen={open.s4} onToggle={() => toggle("s4")}>
            <Field label="Diagnóstico presuntivo" hl={highlights.diagnostico_presuntivo}>
              <TAr value={form.diagnostico_presuntivo} onChange={setF("diagnostico_presuntivo")} rows={2} hl={highlights.diagnostico_presuntivo} />
            </Field>
            <Field label="Diagnósticos diferenciales" hl={highlights.diagnosticos_diferenciales}>
              <TAr value={form.diagnosticos_diferenciales} onChange={setF("diagnosticos_diferenciales")}
                rows={2} placeholder="Separados por coma" hl={highlights.diagnosticos_diferenciales} />
            </Field>
            <Field label="Diagnóstico definitivo" hl={highlights.diagnostico_definitivo}>
              <TAr value={form.diagnostico_definitivo} onChange={setF("diagnostico_definitivo")} rows={2} hl={highlights.diagnostico_definitivo} />
            </Field>
          </AccordionSection>

          {/* S5 — Plan */}
          <AccordionSection num="5" title="Plan, tratamiento y vacunas" isOpen={open.s5} onToggle={() => toggle("s5")}>
            <Field label="Exámenes solicitados" hl={highlights.examenes_solicitados}>
              <TAr value={form.examenes_solicitados} onChange={setF("examenes_solicitados")} rows={2} hl={highlights.examenes_solicitados} />
            </Field>
            <div>
              <p className={lCls}>Medicamentos</p>
              <TratamientoList items={form.tratamiento_items}
                onChange={v => { setForm(p => ({ ...p, tratamiento_items: v })); }} />
            </div>
            <div>
              <p className={lCls}>Vacunas aplicadas</p>
              <VacunaList items={form.vacunas_items}
                onChange={v => { setForm(p => ({ ...p, vacunas_items: v })); }} />
            </div>
            <Field label="Indicaciones al propietario" hl={highlights.indicaciones}>
              <TAr value={form.indicaciones} onChange={setF("indicaciones")} rows={2}
                placeholder="Vacuna aplicada hoy: antirrábica 1 ml SC. Dieta blanda 3 días…"
                hl={highlights.indicaciones} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pronóstico" hl={highlights.pronostico}>
                <Sel value={form.pronostico} onChange={setF("pronostico")} options={OPT.pronostico} hl={highlights.pronostico} />
              </Field>
              <Field label="Próxima cita">
                <input type="datetime-local" value={form.proxima_cita}
                  onChange={setF("proxima_cita")}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300" />
              </Field>
            </div>
          </AccordionSection>

          {errForm && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{errForm}</div>
          )}

          <button onClick={handleSave} disabled={guardando}
            className="w-full flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-semibold transition-colors">
            {guardadoOk
              ? <><Check size={15} /> Guardado</>
              : guardando ? "Guardando…"
              : <><Save size={15} /> {editandoId ? "Actualizar consulta" : "Guardar consulta"}</>}
          </button>
        </div>

        {/* ── Historial ────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Historial ({historias.length})</h2>
          {historias.length === 0
            ? <p className="text-sm text-slate-400 italic">Sin consultas registradas.</p>
            : historias.map(h => <HistoriaCard key={h.id} h={h} onEdit={handleEdit} />)
          }
        </div>

      </div>
    </div>
  );
}
