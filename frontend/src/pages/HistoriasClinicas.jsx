import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown, Plus, Trash2, Download, Save, Check,
  ArrowLeft, Mic, StopCircle, AlertTriangle, Loader2, FileText,
} from "lucide-react";
import { generarPDF } from "../utils/pdfGenerator";
import { api, authHeaders } from "../services/api";
import VoiceTextProcessor from "../components/VoiceTextProcessor";
import DocumentosPaciente from "../components/DocumentosPaciente";

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

const toLocalDatetimeString = (v) => {
  if (!v) return "";
  const sVal = String(v);
  if (sVal.length === 10) return sVal + "T00:00";
  const d = new Date(sVal);
  if (isNaN(d.getTime())) return sVal;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// Plantillas de consulta: pre-rellenan los campos típicos de cada tipo de visita
// para acelerar el registro. No tocan peso ni constantes (se miden por animal):
// solo motivo, tipo, plan, vacunas/tratamiento sugerido e indicaciones.
const PLANTILLAS = [
  {
    id: "vacunacion", label: "Vacunación",
    campos: {
      tipo_consulta: "vacunacion",
      motivo_consulta: "Vacunación",
      pronostico: "favorable",
      indicaciones: "Reposo relativo por 24 h. Vigilar reacción local o decaimiento; ante cualquier signo, contactar a la clínica.",
    },
    vacunas_items: [{ ...VX_EMPTY }],
  },
  {
    id: "control", label: "Control sano",
    campos: {
      tipo_consulta: "control",
      motivo_consulta: "Control de salud / chequeo general",
      pronostico: "favorable",
      indicaciones: "Mantener alimentación balanceada y el plan de vacunación/desparasitación al día.",
    },
  },
  {
    id: "desparasitacion", label: "Desparasitación",
    campos: {
      tipo_consulta: "control",
      motivo_consulta: "Desparasitación",
      pronostico: "favorable",
      indicaciones: "Repetir la desparasitación según peso y calendario indicado.",
    },
    tratamiento_items: [{ medicamento: "Antiparasitario", dosis: "", via: "Oral", frecuencia: "Dosis única", duracion: "" }],
  },
  {
    id: "urgencia", label: "Emergencia",
    campos: {
      tipo_consulta: "urgencia",
      motivo_consulta: "Atención de urgencia",
      pronostico: "reservado",
    },
  },
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
      if (isNaN(n)) {
        out[k] = null;
      } else {
        // Redondear campos que deben ser enteros estrictos
        const isFloat = ["temperatura_c", "peso_kg"].includes(k);
        out[k] = isFloat ? n : Math.round(n);
      }
    } else if (k === "proxima_cita") {
      // Interpreta como hora LOCAL y la envía como instante UTC correcto (evita el corrimiento de 5h)
      out[k] = v ? new Date(v + ":00").toISOString() : null;
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
      f[k] = k === "proxima_cita" ? toLocalDatetimeString(v) : String(v);
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
const NIn = ({ value, onChange, placeholder = "", hl, step = "any" }) =>
  <input type="number" step={step} value={value} onChange={onChange} placeholder={placeholder} className={hlInput(hl)} />;
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
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
            <Field label="Medicamento" cls="col-span-1 sm:col-span-2">
              <TIn value={item.medicamento} onChange={e => update(i,"medicamento",e.target.value)} placeholder="Metronidazol" />
            </Field>
            <Field label="Dosis" cls="col-span-1 sm:col-span-1">
              <TIn value={item.dosis} onChange={e => update(i,"dosis",e.target.value)} placeholder="15 mg/kg" />
            </Field>
            <Field label="Vía" cls="col-span-1 sm:col-span-1">
              <TIn value={item.via} onChange={e => update(i,"via",e.target.value)} placeholder="Oral" />
            </Field>
            <Field label="Frecuencia" cls="col-span-1 sm:col-span-1">
              <TIn value={item.frecuencia} onChange={e => update(i,"frecuencia",e.target.value)} placeholder="c/12h" />
            </Field>
            <div className="flex items-end gap-1.5 col-span-1 sm:col-span-1">
              <Field label="Duración" cls="flex-1">
                <TIn value={item.duracion} onChange={e => update(i,"duracion",e.target.value)} placeholder="5 días" />
              </Field>
              <button type="button" onClick={() => remove(i)}
                className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
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
        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end p-2.5 bg-slate-50 border border-slate-200 rounded-md">
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

function HistoriaCard({ h, onEdit, onDelete }) {
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
          <button onClick={() => onDelete(h)}
            className="text-xs bg-rose-500/80 hover:bg-rose-500 rounded px-2 py-0.5 transition-colors">
            Eliminar
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

// PDF generation logic has been externalized to pdfGenerator.js

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtSec = s =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// ── Componente principal ──────────────────────────────────────────────────────

export default function HistoriasClinicas() {
  const { pacienteId: id } = useParams();
  const navigate = useNavigate();
  const { state: navState } = useLocation();   // { citaId } cuando se viene de "Atender"

  // ── Datos
  const [paciente,  setPaciente]  = useState(null);
  const [historias, setHistorias] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // ── Formulario
  const [form,       setForm]       = useState(() => {
    const savedDraft = localStorage.getItem(`draft_historia_${id}`);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (e) {
        console.error("No se pudo cargar el borrador:", e);
      }
    }
    return FORM_VACIO;
  });
  const [editandoId, setEditandoId] = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errForm,    setErrForm]    = useState(null);
  const [open, setOpen] = useState({ s1: true, s2: true, s3: false, s4: false, s5: false });

  // ── IA / voz
  const [transcripcionIA, setTranscripcionIA] = useState("");
  const [datosIA,       setDatosIA]       = useState(null);
  const [inferenciasBrut, setInferenciasBrut] = useState({});
  const [highlights,    setHighlights]    = useState({});

  // ── Métrica de tiempo: cuándo empezó el registro y si se usó IA
  const inicioRegistro = useRef(Date.now());
  const usoIA = useRef(false);



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

  // ── Autoguardado del borrador en localStorage
  useEffect(() => {
    const isFormEmpty = (f) => {
      return Object.keys(f).every(key => {
        if (key === "examen_particular") {
          if (!f[key]) return true;
          return Object.values(f[key]).every(sys => !sys.estado && !sys.detalle);
        }
        if (Array.isArray(f[key])) {
          return f[key].length === 0;
        }
        return !f[key];
      });
    };

    if (isFormEmpty(form)) {
      localStorage.removeItem(`draft_historia_${id}`);
    } else {
      localStorage.setItem(`draft_historia_${id}`, JSON.stringify(form));
    }
  }, [form, id]);

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
    setOpen({ s1: true, s2: true, s3: false, s4: false, s5: false });
    // Reinicia la medición de tiempo para el siguiente registro
    inicioRegistro.current = Date.now();
    usoIA.current = false;
  };

  const handleEdit = h => {
    setForm(formFromHistoria(h));
    setEditandoId(h.id);
    setHighlights({});
    setOpen({ s1: true, s2: true, s3: true, s4: true, s5: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Auto-editar si viene de otra pantalla con un editarHistoriaId específico
  useEffect(() => {
    if (navState?.editarHistoriaId && historias.length > 0) {
      const h = historias.find(x => x.id === navState.editarHistoriaId);
      if (h) {
        handleEdit(h);
      }
    }
  }, [historias, navState]);

  // Aplica una plantilla: rellena solo los campos vacíos (no pisa lo ya escrito)
  // y agrega filas sugeridas de tratamiento/vacunas si aún no hay ninguna.
  const aplicarPlantilla = (tpl) => {
    setForm(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(tpl.campos || {})) {
        const actual = next[k];
        if (!actual || (typeof actual === "string" && !actual.trim())) next[k] = v;
      }
      if (tpl.tratamiento_items && !(prev.tratamiento_items || []).some(i => i.medicamento?.trim()))
        next.tratamiento_items = tpl.tratamiento_items.map(i => ({ ...i }));
      if (tpl.vacunas_items && !(prev.vacunas_items || []).some(i => i.vacuna?.trim()))
        next.vacunas_items = tpl.vacunas_items.map(i => ({ ...i }));
      return next;
    });
    setOpen(o => ({ ...o, s1: true, s5: true }));
  };

  const handleDelete = async h => {
    const fecha = new Date(h.fecha || h.creado_en).toLocaleDateString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
    });
    if (!window.confirm(`¿Eliminar la consulta del ${fecha}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/api/pacientes/${id}/historias/${h.id}`);
      setHistorias(p => p.filter(x => x.id !== h.id));
      if (editandoId === h.id) resetForm();   // si estábamos editándola, limpia el formulario
    } catch (e) {
      setErrForm(e?.message ?? "No se pudo eliminar la consulta.");
    }
  };

  // ── Volcar datos de IA al formulario
  const applyIA = (datos, inferencias, alertasRango = {}) => {
    usoIA.current = true;   // este registro se asistió con IA (voz o texto)
    const nombresSimilares = (a, b) => {
      if (!a || !b) return false;
      const normalize = (s) => String(s).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
      const na = normalize(a);
      const nb = normalize(b);
      if (na === nb) return true;
      if (na.length > 4 && nb.length > 4) {
        if (na.includes(nb) || nb.includes(na)) return true;
      }
      return false;
    };

    setForm(prev => {
      const next = { ...prev };
      const SKIP = ["examen_particular", "tratamiento_items", "vacunas_items"];
      for (const k of Object.keys(FORM_VACIO)) {
        if (SKIP.includes(k)) continue;
        const val = datos[k];
        if (val === null || val === undefined) continue;
        if (k === "proxima_cita") {
          next[k] = toLocalDatetimeString(val);
        } else {
          next[k] = String(val);
        }
      }
      // EOP (Examen objetivo particular por sistemas) - Mezcla inteligente en lugar de sobreescribir todo
      const ep = next.examen_particular
        ? Object.fromEntries(
            Object.entries(next.examen_particular).map(([s, val]) => [s, { ...val }])
          )
        : eopVacio();
      if (datos.examen_particular && typeof datos.examen_particular === "object") {
        for (const s of SISTEMAS_EOP) {
          const val = datos.examen_particular[s];
          if (!val) continue;
          ep[s] = typeof val === "string"
            ? { estado: ep[s]?.estado || "", detalle: val }
            : { estado: val.estado || ep[s]?.estado || "", detalle: val.detalle || ep[s]?.detalle || "" };
        }
      }
      next.examen_particular = ep;

      // Listas — Mezcla inteligente en lugar de sobreescribir todo
      if (Array.isArray(datos.tratamiento_items) && datos.tratamiento_items.length > 0) {
        const existingTx = (prev.tratamiento_items || []).filter(i => i.medicamento?.trim());
        const mergedTx = [...existingTx];

        datos.tratamiento_items.forEach(incoming => {
          const matchedIdx = mergedTx.findIndex(item => nombresSimilares(item.medicamento, incoming.medicamento));
          if (matchedIdx > -1) {
            const matchedItem = { ...mergedTx[matchedIdx] };
            if (incoming.medicamento) matchedItem.medicamento = incoming.medicamento;
            if (incoming.dosis) matchedItem.dosis = incoming.dosis;
            if (incoming.via) matchedItem.via = incoming.via;
            if (incoming.frecuencia) matchedItem.frecuencia = incoming.frecuencia;
            if (incoming.duracion) matchedItem.duracion = incoming.duracion;
            mergedTx[matchedIdx] = matchedItem;
          } else {
            mergedTx.push({
              medicamento: incoming.medicamento || "",
              dosis: incoming.dosis || "",
              via: incoming.via || "",
              frecuencia: incoming.frecuencia || "",
              duracion: incoming.duracion || "",
            });
          }
        });
        next.tratamiento_items = mergedTx;
      }

      if (Array.isArray(datos.vacunas_items) && datos.vacunas_items.length > 0) {
        const existingVx = (prev.vacunas_items || []).filter(i => i.vacuna?.trim());
        const mergedVx = [...existingVx];

        datos.vacunas_items.forEach(incoming => {
          const matchedIdx = mergedVx.findIndex(item => nombresSimilares(item.vacuna, incoming.vacuna));
          if (matchedIdx > -1) {
            const matchedItem = { ...mergedVx[matchedIdx] };
            if (incoming.vacuna) matchedItem.vacuna = incoming.vacuna;
            if (incoming.lote) matchedItem.lote = incoming.lote;
            if (incoming.proxima_dosis) matchedItem.proxima_dosis = incoming.proxima_dosis;
            mergedVx[matchedIdx] = matchedItem;
          } else {
            mergedVx.push({
              vacuna: incoming.vacuna || "",
              lote: incoming.lote || "",
              proxima_dosis: incoming.proxima_dosis || "",
            });
          }
        });
        next.vacunas_items = mergedVx;
      }

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

  // Lógica de IA delegada a VoiceTextProcessor

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
        // Si se vino de "Atender" un turno, márcalo como atendido
        if (navState?.citaId) {
          try { await api.put(`/api/citas/${navState.citaId}`, { estado: "atendida" }); } catch { /* no crítico */ }
        }
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
        <VoiceTextProcessor
          onResult={({ datos, inferencias, alertas_rango, transcripcion }) => {
            usoIA.current = true;
            setTranscripcionIA(transcripcion);
            setDatosIA(datos);
            setInferenciasBrut(inferencias);
            applyIA(datos, inferencias, alertas_rango);
          }}
        />

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

          {/* Plantillas rápidas (solo en consulta nueva) */}
          {!editandoId && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-slate-500">Plantillas:</span>
              {PLANTILLAS.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => aplicarPlantilla(tpl)}
                  className="text-xs font-semibold px-3 py-1 rounded-full border border-purple-200 text-purple-700 bg-white hover:bg-purple-50 transition"
                >
                  {tpl.label}
                </button>
              ))}
              <span className="text-[11px] text-slate-400">Rellenan los campos vacíos; no borran lo que ya escribiste.</span>
            </div>
          )}

          {/* S1 — Anamnesis */}
          <AccordionSection num="1" title="Anamnesis" isOpen={open.s1} onToggle={() => toggle("s1")}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tipo de alimentación" hl={highlights.alimentacion_tipo}>
                <TIn value={form.alimentacion_tipo} onChange={setF("alimentacion_tipo")} placeholder="Balanceado / BARF / mixto" hl={highlights.alimentacion_tipo} />
              </Field>
              <Field label="Cantidad diaria (g)" hl={highlights.alimentacion_cantidad_gr}>
                <NIn value={form.alimentacion_cantidad_gr} onChange={setF("alimentacion_cantidad_gr")} placeholder="200" hl={highlights.alimentacion_cantidad_gr} step="1" />
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ["temperatura_c",           "Temperatura (°C)", "38.5", "any"],
                ["peso_kg",                 "Peso (kg)",        "5.0" , "any"],
                ["frecuencia_cardiaca",     "FC (lpm)",         "100" , "1"  ],
                ["frecuencia_respiratoria", "FR (rpm)",         "22"  , "1"  ],
                ["condicion_corporal",      "CC (1–9)",         "5"   , "1"  ],
              ].map(([f, label, ph, step]) => (
                <Field key={f} label={label} hl={highlights[f]}>
                  <NIn value={form[f]} onChange={setF(f)} placeholder={ph} hl={highlights[f]} step={step} />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              {SISTEMAS_EOP.map(s => (
                <div key={s} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end border-b border-slate-100 sm:border-0 pb-2 sm:pb-0">
                  <Field label={SISTEMA_LABELS[s]} cls="col-span-1 sm:col-span-2">
                    <Sel value={form.examen_particular[s].estado} onChange={setEop(s,"estado")} options={OPT.sistema_estado} />
                  </Field>
                  <Field label="Detalle" cls="col-span-1 sm:col-span-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {/* ── Documentos complementarios (radiografías, análisis, etc.) ──────── */}
        {id && <DocumentosPaciente pacienteId={id} />}

        {/* ── Historial ────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Historial ({historias.length})</h2>
          {historias.length === 0
            ? <p className="text-sm text-slate-400 italic">Sin consultas registradas.</p>
            : historias.map(h => <HistoriaCard key={h.id} h={h} onEdit={handleEdit} onDelete={handleDelete} />)
          }
        </div>

      </div>
    </div>
  );
}
