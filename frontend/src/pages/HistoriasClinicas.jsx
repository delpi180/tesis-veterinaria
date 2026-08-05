import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Plus, Trash2, Download, Save, Check,
  ArrowLeft, AlertTriangle, FileText, Paperclip, Stethoscope, Mic,
} from "lucide-react";
import { generarPDF } from "../utils/pdfGenerator";
import { api, esVeterinario } from "../services/api";
import { useConfirmar } from "../components/Confirmar";
import VoiceTextProcessor from "../components/VoiceTextProcessor";
import DocumentosPaciente from "../components/DocumentosPaciente";
import { CargandoPantalla } from "../components/Cargando";
import { nombresSimilares } from "../utils/similitud";

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

// El historial va de la consulta más reciente a la más antigua por FECHA DE
// ATENCIÓN, no por orden de tecleo: una consulta vieja que se digitaliza hoy
// tiene que caer en su lugar, no arriba de todo.
export const ordenarHistorias = (lista) =>
  [...lista].sort((a, b) => {
    const fa = new Date(a.fecha || a.creado_en).getTime();
    const fb = new Date(b.fecha || b.creado_en).getTime();
    return fb - fa || (b.id - a.id);
  });

// Campo → sección (para saltar a lo que la IA dejó por revisar)
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

const TX_EMPTY = { medicamento: "", producto_id: null, dosis: "", via: "", frecuencia: "", duracion_dias: "" };
const VX_EMPTY = { vacuna: "", lote: "", proxima_dosis: "" };

const FORM_VACIO = {
  // Vacío = "ahora" (el caso normal). Se llena para digitalizar una consulta
  // vieja de papel o para corregir la fecha de una ya registrada.
  fecha: "",
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

export function buildPayload(form) {
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
    } else if (k === "fecha" || k === "proxima_cita") {
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
    ? tx.map(i => ({
        medicamento: i.medicamento||null, producto_id: i.producto_id ?? null,
        dosis: i.dosis||null,
        via: i.via||null, frecuencia: i.frecuencia||null,
        duracion_dias: Number(i.duracion_dias) > 0 ? Math.round(Number(i.duracion_dias)) : null,
        // Lo escrito antes a mano se conserva tal cual: es lo que dice la
        // historia clínica de ese día y no se reescribe al editarla.
        duracion: i.duracion||null,
      }))
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
      f[k] = (k === "fecha" || k === "proxima_cita") ? toLocalDatetimeString(v) : String(v);
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
        medicamento: i.medicamento||"", producto_id: i.producto_id ?? null,
        dosis: i.dosis||"", via: i.via||"", frecuencia: i.frecuencia||"",
        duracion_dias: i.duracion_dias ?? "", duracion: i.duracion||"" }))
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

// ── Secciones del formulario ─────────────────────────────────────────────────
//
// Antes eran un acordeón: cinco bloques apilados que había que abrir y cerrar,
// con la consulta entera en una sola columna larguísima. Revisar lo escrito en
// anamnesis mientras se llena el plan significaba scrollear de punta a punta.
// En pestañas cada parte de la consulta ocupa la pantalla y se salta directo.
const SECCIONES = [
  { id: "s1", num: "1", titulo: "Anamnesis",  corto: "Anamnesis" },
  { id: "s2", num: "2", titulo: "Examen objetivo general (EOG)",   corto: "E. general" },
  { id: "s3", num: "3", titulo: "Examen objetivo particular (EOP)", corto: "E. particular" },
  { id: "s4", num: "4", titulo: "Diagnóstico", corto: "Diagnóstico" },
  { id: "s5", num: "5", titulo: "Plan, tratamiento y vacunas", corto: "Plan" },
];

function BarraSecciones({ activa, onCambiar, llenas, avisos }) {
  return (
    // La barra desplaza en móvil en vez de apretar cinco pestañas ilegibles
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1" role="tablist">
      {SECCIONES.map(sec => {
        const esActiva = sec.id === activa;
        const aviso = avisos.has(sec.id);
        return (
          <button
            key={sec.id}
            type="button"
            role="tab"
            aria-selected={esActiva}
            onClick={() => onCambiar(sec.id)}
            className={[
              "flex items-center gap-1.5 px-3 py-2 text-sm font-semibold whitespace-nowrap",
              "border-b-2 -mb-px transition-colors",
              esActiva
                ? "border-purple-700 text-purple-800"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200",
            ].join(" ")}
          >
            <span className={[
              "w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
              esActiva ? "bg-purple-700 text-white"
                : llenas.has(sec.id) ? "bg-purple-100 text-purple-700"
                : "bg-slate-100 text-slate-400",
            ].join(" ")}>
              {sec.num}
            </span>
            {sec.corto}
            {/* Punto naranja: la IA dejó algo por revisar en esa sección */}
            {aviso && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function PanelSeccion({ activa, id, titulo, children }) {
  if (activa !== id) return null;
  return (
    <div role="tabpanel" className="border border-slate-200 border-t-0 rounded-b-md bg-white px-4 py-4 space-y-3">
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      {children}
    </div>
  );
}

// ── Listas editables ─────────────────────────────────────────────────────────

/** Lo que el sistema oyó para esta línea.
 *
 *  El reconocimiento de voz falla con ruido de consulta y a veces cambia un
 *  número ("cuatro" → "dos"). Eso no se puede eliminar del todo, pero sí se
 *  puede dejar a la vista: con el fragmento original al lado, el doctor
 *  compara la cifra de un vistazo en vez de confiar a ciegas en el campo.
 *  Solo aparece en lo que acaba de dictar; al reabrir la consulta ya no.
 */
function LoQueSeOyo({ texto }) {
  if (!texto) return null;
  return (
    <p className="col-span-full text-[11px] text-slate-500 italic flex items-start gap-1 -mt-0.5">
      <Mic size={11} className="shrink-0 mt-0.5 text-slate-400" />
      <span>se oyó: “{texto}”</span>
    </p>
  );
}

function TratamientoList({ items, onChange, desde, medicamentos = [] }) {
  const add    = () => onChange([...items, { ...TX_EMPTY }]);
  const remove = i  => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, f, v) => { const n = [...items]; n[i] = { ...n[i], [f]: v }; onChange(n); };

  // Al escribir el medicamento se busca en el inventario de la clínica. Si
  // coincide, queda enlazado al producto: así se puede avisar del vencimiento
  // aquí mismo y saber después si el dueño llegó a llevárselo. Si no coincide,
  // no pasa nada: se receta lo que el animal necesita, no solo lo que hay en
  // el estante.
  const escribirMedicamento = (i, texto) => {
    const encontrado = medicamentos.find(
      p => p.nombre.toLowerCase() === texto.trim().toLowerCase());
    const n = [...items];
    n[i] = { ...n[i], medicamento: texto, producto_id: encontrado ? encontrado.id : null };
    onChange(n);
  };
  const producto = (item) => medicamentos.find(p => p.id === item.producto_id);
  const hoyISO = new Date().toISOString().slice(0, 10);
  // Fecha de fin: se calcula desde la fecha de la consulta, no desde hoy —
  // una consulta que se digitaliza días después no reinicia el tratamiento.
  const fin = (item) => {
    const dias = Number(item.duracion_dias);
    if (!dias || dias < 1) return null;
    const inicio = desde ? new Date(desde) : new Date();
    if (isNaN(inicio.getTime())) return null;
    inicio.setDate(inicio.getDate() + dias - 1);
    return inicio.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
            <Field label="Medicamento" cls="col-span-1 sm:col-span-2">
              <input
                list="inventario-medicamentos"
                value={item.medicamento}
                onChange={e => escribirMedicamento(i, e.target.value)}
                placeholder="Metronidazol"
                className={hlInput()}
              />
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
              {/* Duración en DÍAS, no en texto libre.
                  Con "5 días", "cinco días" o "unos días" no hay forma de
                  calcular cuándo termina el tratamiento, y sin eso no existe
                  control: no se puede saber qué termina hoy ni quién lo dejó a
                  medias. En la base real, 37 de 39 ítems no tenían duración y
                  los otros dos estaban escritos a mano. */}
              <Field label="Duración (días)" cls="flex-1">
                <input
                  type="number" min="1" max="365" inputMode="numeric"
                  value={item.duracion_dias ?? ""}
                  onChange={e => update(i, "duracion_dias", e.target.value)}
                  placeholder="5"
                  className={hlInput()}
                />
              </Field>
              <button type="button" onClick={() => remove(i)}
                className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
            {(() => {
              const p = producto(item);
              if (!p) return null;
              const vencido = p.fecha_vencimiento && p.fecha_vencimiento <= hoyISO;
              const sinStock = (p.stock ?? 0) <= 0;
              if (!vencido && !sinStock) {
                return (
                  <p className="col-span-1 sm:col-span-6 text-[11px] text-emerald-700">
                    En inventario · {p.stock} {p.unidad || 'u'} disponible{p.stock === 1 ? '' : 's'}
                  </p>
                );
              }
              // Avisa, no bloquea: el doctor puede indicarlo igual y que el
              // dueño lo compre afuera. Lo que no puede pasar es que nadie se
              // entere hasta que el cliente está en el mostrador.
              return (
                <p className="col-span-1 sm:col-span-6 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  {vencido
                    ? `Ojo: el lote de ${p.nombre} venció el ${p.fecha_vencimiento.split('-').reverse().join('/')}. No se podrá entregar.`
                    : `Ojo: no queda stock de ${p.nombre} en la clínica.`}
                </p>
              );
            })()}
            {fin(item) && (
              <p className="col-span-1 sm:col-span-6 text-[11px] text-slate-500">
                Termina el <strong className="text-slate-700">{fin(item)}</strong>
                {item.duracion ? <span className="text-slate-400"> · antes decía “{item.duracion}”</span> : null}
              </p>
            )}
            <LoQueSeOyo texto={item.dicho} />
          </div>
        </div>
      ))}
      <datalist id="inventario-medicamentos">
        {medicamentos.map(p => <option key={p.id} value={p.nombre} />)}
      </datalist>
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 border border-dashed border-purple-300 rounded-md px-3 py-1.5 hover:bg-purple-50 transition-colors">
        <Plus size={13} /> Agregar medicamento
      </button>
    </div>
  );
}

/**
 * Vacunas de la consulta.
 *
 * La vacuna se elige del catálogo (lo escrito a mano era la identidad de la
 * vacuna: siete dosis registradas tenían siete nombres distintos, y el
 * consolidado "última dosis de cada vacuna" no agrupaba nada) y la próxima
 * dosis es una FECHA, no texto. El campo aceptaba texto libre y el motor de
 * avisos solo entiende fechas: "En 1 año" —el propio ejemplo que sugería el
 * formulario— nunca generó un recordatorio.
 */
function VacunaList({ items, onChange, catalogo, especie, desde }) {
  const add    = () => onChange([...items, { ...VX_EMPTY }]);
  const remove = i  => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, f, v) => { const n = [...items]; n[i] = { ...n[i], [f]: v }; onChange(n); };

  const esp = (especie || "").toLowerCase();
  const sugeridas = catalogo.filter(v => !v.especie || !esp || esp.startsWith(v.especie));
  const otras     = catalogo.filter(v => !sugeridas.includes(v));

  // Al elegir la vacuna se propone la próxima dosis con el intervalo del
  // catálogo. Se puede corregir: es una propuesta, no una imposición.
  const elegir = (i, nombre) => {
    const entrada = catalogo.find(v => v.nombre === nombre);
    const n = [...items];
    n[i] = { ...n[i], vacuna: nombre };
    if (entrada?.intervalo_dias && !n[i].proxima_dosis) {
      const base = desde ? new Date(desde) : new Date();
      if (!isNaN(base.getTime())) {
        base.setDate(base.getDate() + entrada.intervalo_dias);
        n[i].proxima_dosis = base.toISOString().slice(0, 10);
      }
    }
    onChange(n);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const enCatalogo = catalogo.some(v => v.nombre === item.vacuna);
        const nota = catalogo.find(v => v.nombre === item.vacuna)?.nota;
        return (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end p-2.5 bg-slate-50 border border-slate-200 rounded-md">
          <Field label="Vacuna">
            <select
              value={enCatalogo ? item.vacuna : (item.vacuna ? "__otra__" : "")}
              onChange={e => e.target.value === "__otra__"
                ? update(i, "vacuna", item.vacuna && !enCatalogo ? item.vacuna : " ")
                : elegir(i, e.target.value)}
              className={hlInput()}
            >
              <option value="">Elegir…</option>
              {sugeridas.map(v => <option key={v.nombre} value={v.nombre}>{v.nombre}</option>)}
              {otras.length > 0 && (
                <optgroup label="Otras especies">
                  {otras.map(v => <option key={v.nombre} value={v.nombre}>{v.nombre}</option>)}
                </optgroup>
              )}
              <option value="__otra__">Otra (escribir)…</option>
            </select>
            {/* Lo dictado o lo ya guardado que no está en el catálogo se
                conserva y se puede corregir a mano; nunca se descarta. */}
            {item.vacuna && !enCatalogo && (
              <TIn value={item.vacuna.trim() === "" ? "" : item.vacuna}
                onChange={e => update(i, "vacuna", e.target.value)}
                placeholder="Nombre de la vacuna" className="mt-1" />
            )}
          </Field>
          <Field label="Lote">
            <TIn value={item.lote} onChange={e => update(i,"lote",e.target.value)} placeholder="AB12345" />
          </Field>
          <div className="flex items-end gap-1.5">
            <Field label="Próxima dosis" cls="flex-1">
              <input
                type="date"
                value={/^\d{4}-\d{2}-\d{2}$/.test(item.proxima_dosis || "") ? item.proxima_dosis : ""}
                onChange={e => update(i, "proxima_dosis", e.target.value)}
                className={hlInput()}
              />
            </Field>
            <button type="button" onClick={() => remove(i)}
              className="mb-0.5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
          {/* Lo guardado antes como texto ("En 1 año") no se borra: se muestra
              para que quien edite la consulta pueda convertirlo en fecha. */}
          {item.proxima_dosis && !/^\d{4}-\d{2}-\d{2}$/.test(item.proxima_dosis) && (
            <p className="sm:col-span-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Estaba anotado como “{item.proxima_dosis}”: sin una fecha no se puede avisar al dueño.
            </p>
          )}
          {nota && <p className="sm:col-span-3 text-[11px] text-slate-500">{nota}</p>}
          <LoQueSeOyo texto={item.dicho} />
        </div>
        );
      })}
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

/** Cuenta los campos que la IA logró completar (incluye los sistemas del EOP). */
function contarCamposLlenos(datos) {
  if (!datos) return 0;
  const lleno = (v) => v !== null && v !== undefined && v !== "" &&
    !(Array.isArray(v) && v.length === 0);
  let n = 0;
  for (const [k, v] of Object.entries(datos)) {
    if (k === "examen_particular") {
      n += Object.values(v || {}).filter(lleno).length;
    } else if (lleno(v)) {
      n += 1;
    }
  }
  return n;
}

function HistoriaCard({ h, onEdit, onDelete }) {
  const fecha = new Date(h.fecha || h.creado_en).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  // Una consulta digitalizada después (o con la fecha corregida) deja ver
  // cuándo se atendió y cuándo se cargó: son dos datos distintos del registro.
  const cargada = h.creado_en ? new Date(h.creado_en) : null;
  const atendida = new Date(h.fecha || h.creado_en);
  const registradaDespues =
    cargada && Math.abs(cargada - atendida) > 24 * 60 * 60 * 1000
      ? cargada.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
      : null;
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
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold">{fecha}</span>
          {registradaDespues && (
            <span className="text-[11px] text-purple-200">registrada el {registradaDespues}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {h.tipo_consulta && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {getLabel("tipo_consulta", h.tipo_consulta)}
            </span>
          )}
          {h.documentos_count > 0 && (
            <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded" title="Archivos adjuntos a esta consulta">
              <Paperclip className="w-3 h-3" /> {h.documentos_count}
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
              value={[
                t.medicamento, t.dosis, t.via, t.frecuencia,
                t.duracion_dias ? `${t.duracion_dias} día${t.duracion_dias > 1 ? "s" : ""}` : t.duracion,
              ].filter(Boolean).join(" · ")} />
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

// ── Borrador en el navegador ─────────────────────────────────────────────────
//
// Se guarda para que un cierre accidental o un corte de luz no borre media
// consulta. Lo que se guarda ahora incluye CUÁNDO: antes el borrador volvía
// solo, sin decir nada, y un texto empezado el lunes reaparecía el jueves
// dentro de "Nueva consulta" listo para guardarse como el examen de ese día.
const claveBorrador = (id) => `draft_historia_${id}`;

/** ¿El formulario está intacto? Se usa para no guardar borradores vacíos y
 *  para saber si hay algo que perder al salir. */
export function formularioVacio(f) {
  return Object.keys(f).every(key => {
    if (key === "examen_particular") {
      if (!f[key]) return true;
      return Object.values(f[key]).every(sys => !sys.estado && !sys.detalle);
    }
    if (Array.isArray(f[key])) return f[key].length === 0;
    return !f[key];
  });
}

// Un borrador reciente es casi siempre "se me cerró la pestaña": se recupera
// solo. Uno viejo es otra consulta, otro día: no se toca sin permiso.
const HORAS_RECUPERACION_AUTOMATICA = 12;

/** Completa un borrador guardado con los campos que le falten.
 *
 *  Un borrador escrito por una versión anterior de la aplicación no tiene los
 *  campos que se agregaron después. Cargarlo tal cual dejaba, por ejemplo,
 *  `examen_particular` sin definir y la pantalla de consulta entera reventaba
 *  al intentar dibujar los sistemas — con el texto del doctor atrapado dentro
 *  de un borrador que ya no se podía abrir.
 */
export function normalizarBorrador(guardado) {
  return {
    ...FORM_VACIO,
    ...guardado,
    examen_particular: { ...eopVacio(), ...(guardado?.examen_particular ?? {}) },
    tratamiento_items: Array.isArray(guardado?.tratamiento_items) ? guardado.tratamiento_items : [],
    vacunas_items:     Array.isArray(guardado?.vacunas_items)     ? guardado.vacunas_items     : [],
  };
}

function leerBorrador(id) {
  const crudo = localStorage.getItem(claveBorrador(id));
  if (!crudo) return null;
  try {
    const dato = JSON.parse(crudo);
    if (!dato || typeof dato !== "object") return null;
    // Formato viejo: el objeto ERA el formulario, sin fecha. Se trata como
    // antiguo (no se recupera solo) porque no hay forma de saber de cuándo es.
    if (!dato.form) return { form: normalizarBorrador(dato), guardadoEn: null };
    return { form: normalizarBorrador(dato.form), guardadoEn: dato.guardadoEn ?? null };
  } catch (e) {
    console.error("No se pudo leer el borrador:", e);
    return null;
  }
}

export function esReciente(guardadoEn) {
  if (!guardadoEn) return false;
  const horas = (Date.now() - new Date(guardadoEn).getTime()) / 3600000;
  return horas >= 0 && horas < HORAS_RECUPERACION_AUTOMATICA;
}

function describirCuando(guardadoEn) {
  if (!guardadoEn) return "de una sesión anterior";
  const d = new Date(guardadoEn);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1)  return "de hace un momento";
  if (min < 60) return `de hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `de hace ${hrs} h`;
  // 24 h a propósito: "11:32 a. m." termina en punto y deja "a. m.." al cerrar
  // la frase, y en registro clínico la hora sin am/pm es menos ambigua.
  const hora = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `del ${d.toLocaleDateString("es-PE", { day: "numeric", month: "long" })} a las ${hora}`;
}


// ── Componente principal ──────────────────────────────────────────────────────

export default function HistoriasClinicas() {
  const confirmar = useConfirmar()
  const { pacienteId: id } = useParams();
  const navigate = useNavigate();
  const { state: navState } = useLocation();   // { citaId } cuando se viene de "Atender"

  // ── Datos
  const [paciente,  setPaciente]  = useState(null);
  const [historias, setHistorias] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // ── Formulario
  // El borrador se lee UNA vez al montar (initializer perezoso) y de ahí sale
  // tanto el formulario inicial como el aviso que se le muestra al usuario.
  const [borrador] = useState(() => leerBorrador(id));
  const [form, setForm] = useState(
    () => (esReciente(borrador?.guardadoEn) ? borrador.form : FORM_VACIO)
  );
  // Aviso visible: recuperado (reciente) o disponible (viejo, sin tocar)
  const [avisoBorrador, setAvisoBorrador] = useState(
    () => (borrador
      ? { cuando: describirCuando(borrador.guardadoEn), recuperado: esReciente(borrador.guardadoEn) }
      : null)
  );
  const [editandoId, setEditandoId] = useState(null);
  const [guardando,  setGuardando]  = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errForm,    setErrForm]    = useState(null);
  const [seccionActiva, setSeccionActiva] = useState("s1");
  // Secciones donde la IA dejó algo por revisar (punto naranja en la pestaña)
  const [seccionesConAviso, setSeccionesConAviso] = useState(() => new Set());

  // ── IA / voz
  const [transcripcionIA, setTranscripcionIA] = useState("");
  const [datosIA,       setDatosIA]       = useState(null);
  const [inferenciasBrut, setInferenciasBrut] = useState({});
  const [highlights,    setHighlights]    = useState({});

  // ── Quién atendió. El doctor firma su propia consulta; la recepcionista
  //    la llena por él en consulta cargada y tiene que decir de quién es.
  const llenaRecepcion = !esVeterinario();
  const [doctores, setDoctores] = useState([]);
  const [vetId, setVetId] = useState("");
  const [catalogoVacunas, setCatalogoVacunas] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);

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

  // Catálogo de vacunas. Vive en el backend porque es el mismo que usa la
  // consolidación para agrupar; si falla, el desplegable queda vacío y la
  // vacuna se sigue pudiendo escribir a mano ("Otra").
  useEffect(() => {
    api.get("/api/catalogos/vacunas")
      .then(v => setCatalogoVacunas(Array.isArray(v) ? v : []))
      .catch(() => setCatalogoVacunas([]));
    // Medicamentos del inventario, para enlazar lo recetado con lo que la
    // clínica tiene. Si falla, el campo sigue siendo texto libre.
    api.get("/api/productos/?categoria=medicamento&limit=500")
      .then(p => setMedicamentos(Array.isArray(p) ? p : []))
      .catch(() => setMedicamentos([]));
  }, []);

  // ── Salir con la consulta a medio llenar ───────────────────────────────────
  // El borrador la salva, pero nadie lo sabe en el momento: sin aviso, cerrar
  // la pestaña se siente como perder el trabajo.
  const hayCambios = !formularioVacio(form);

  useEffect(() => {
    if (!hayCambios) return;
    const alSalir = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [hayCambios]);

  /** Navegación interna: el aviso del navegador no cubre moverse dentro de la
   *  aplicación, así que el botón de volver pregunta por su cuenta. */
  const salir = async () => {
    if (hayCambios && !await confirmar({
      titulo: 'Salir sin guardar',
      mensaje: 'Tienes una consulta a medio llenar. Se guarda como borrador y podrás retomarla al volver a esta mascota, pero todavía no queda registrada en la historia clínica.',
      confirmarTexto: 'Salir igual',
      peligroso: false,
    })) return;
    navigate(-1);
  };

  // La lista de doctores solo hace falta si la escribe la recepcionista
  useEffect(() => {
    if (!llenaRecepcion) return;
    api.get("/api/usuarios/doctores")
      .then(d => setDoctores(Array.isArray(d) ? d : []))
      .catch(() => setDoctores([]));
  }, [llenaRecepcion]);

  // ── Autoguardado del borrador en localStorage
  useEffect(() => {
    if (formularioVacio(form)) {
      localStorage.removeItem(claveBorrador(id));
    } else {
      localStorage.setItem(claveBorrador(id), JSON.stringify({
        form, guardadoEn: new Date().toISOString(),
      }));
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


  // ── Resetear formulario + estado IA
  const resetForm = () => {
    setForm(FORM_VACIO);
    setEditandoId(null);
    setErrForm(null);
    setHighlights({});
    setTranscripcionIA("");
    setDatosIA(null);
    setInferenciasBrut({});
    setSeccionActiva("s1");
    setSeccionesConAviso(new Set());
    setVetId("");
    setAvisoBorrador(null);
    // Reinicia la medición de tiempo para el siguiente registro
    inicioRegistro.current = Date.now();
    usoIA.current = false;
  };

  // Traer un borrador viejo que se dejó sin tocar
  const recuperarBorrador = () => {
    setForm(borrador.form);
    setAvisoBorrador(a => ({ ...a, recuperado: true }));
  };

  const descartarBorrador = () => {
    localStorage.removeItem(claveBorrador(id));
    setAvisoBorrador(null);
    if (avisoBorrador?.recuperado) setForm(FORM_VACIO);
  };

  const handleEdit = h => {
    setForm(formFromHistoria(h));
    setEditandoId(h.id);
    // Al corregir, se mantiene el doctor que ya figuraba
    setVetId(h.veterinario_id ? String(h.veterinario_id) : "");
    setHighlights({});
    setSeccionActiva("s1");
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
    // La plantilla llena anamnesis y plan; se deja al usuario en la primera
    setSeccionActiva("s1");
  };

  const handleDelete = async h => {
    const fecha = new Date(h.fecha || h.creado_en).toLocaleDateString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
    });
    if (!await confirmar({
      titulo: 'Eliminar consulta',
      mensaje: `Se borrará la consulta del ${fecha} del historial de este paciente.`,
      detalle: 'No se puede deshacer. Es parte del registro clínico del animal.',
      confirmarTexto: 'Eliminar consulta',
    })) return;
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

    setForm(prev => {
      const next = { ...prev };
      // La fecha de la consulta la fija el usuario, no el dictado: si el doctor
      // menciona una fecha al hablar, no debe reescribir cuándo fue la consulta.
      const SKIP = ["fecha", "examen_particular", "tratamiento_items", "vacunas_items"];
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
        // Solo se fusiona contra lo que YA estaba en el formulario, no contra
        // lo que este mismo dictado acaba de agregar: un dictado puede traer
        // dos pautas legítimas del mismo fármaco ("inyectable hoy y tabletas
        // por 7 días") y buscar en toda la lista las colapsaba en una,
        // borrando una indicación sin avisar.
        const nPrevias = existingTx.length;

        datos.tratamiento_items.forEach(incoming => {
          const matchedIdx = mergedTx.findIndex((item, i) =>
            i < nPrevias && nombresSimilares(item.medicamento, incoming.medicamento));
          if (matchedIdx > -1) {
            const matchedItem = { ...mergedTx[matchedIdx] };
            if (incoming.medicamento) matchedItem.medicamento = incoming.medicamento;
            if (incoming.dosis) matchedItem.dosis = incoming.dosis;
            if (incoming.via) matchedItem.via = incoming.via;
            if (incoming.frecuencia) matchedItem.frecuencia = incoming.frecuencia;
            if (incoming.duracion) matchedItem.duracion = incoming.duracion;
            if (incoming.dicho) matchedItem.dicho = incoming.dicho;
            mergedTx[matchedIdx] = matchedItem;
          } else {
            mergedTx.push({
              medicamento: incoming.medicamento || "",
              dosis: incoming.dosis || "",
              via: incoming.via || "",
              frecuencia: incoming.frecuencia || "",
              duracion: incoming.duracion || "",
              dicho: incoming.dicho || "",
            });
          }
        });
        next.tratamiento_items = mergedTx;
      }

      if (Array.isArray(datos.vacunas_items) && datos.vacunas_items.length > 0) {
        const existingVx = (prev.vacunas_items || []).filter(i => i.vacuna?.trim());
        const mergedVx = [...existingVx];
        const nPreviasVx = existingVx.length;   // ver comentario en tratamientos

        datos.vacunas_items.forEach(incoming => {
          const matchedIdx = mergedVx.findIndex((item, i) =>
            i < nPreviasVx && nombresSimilares(item.vacuna, incoming.vacuna));
          if (matchedIdx > -1) {
            const matchedItem = { ...mergedVx[matchedIdx] };
            if (incoming.vacuna) matchedItem.vacuna = incoming.vacuna;
            if (incoming.lote) matchedItem.lote = incoming.lote;
            if (incoming.proxima_dosis) matchedItem.proxima_dosis = incoming.proxima_dosis;
            if (incoming.dicho) matchedItem.dicho = incoming.dicho;
            mergedVx[matchedIdx] = matchedItem;
          } else {
            mergedVx.push({
              vacuna: incoming.vacuna || "",
              lote: incoming.lote || "",
              proxima_dosis: incoming.proxima_dosis || "",
              dicho: incoming.dicho || "",
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

    // Marcar las secciones con inferidos o alertas de rango y llevar al doctor
    // a la primera: con pestañas no basta con "abrirlas", hay que ir.
    const porRevisar = new Set();
    for (const [campo, tipo] of Object.entries(hl))
      if ((tipo === "inferido" || tipo === "alerta") && FIELD_TO_SECTION[campo])
        porRevisar.add(FIELD_TO_SECTION[campo]);
    setSeccionesConAviso(porRevisar);
    if (porRevisar.size > 0) {
      const primera = SECCIONES.find(sec => porRevisar.has(sec.id));
      if (primera) setSeccionActiva(primera.id);
    }
  };

  // Lógica de IA delegada a VoiceTextProcessor

  // ── Guardar
  const handleSave = async () => {
    if (llenaRecepcion && !vetId) {
      setErrForm("Indica qué veterinario atendió la consulta.");
      return;
    }
    setGuardando(true); setErrForm(null);
    try {
      const payload = buildPayload(form);
      if (llenaRecepcion) payload.veterinario_id = Number(vetId);
      // Auditoría IA
      if (transcripcionIA) payload.transcripcion = transcripcionIA;
      if (datosIA)         payload.datos_ia = { ...datosIA, inferencias: inferenciasBrut };

      if (editandoId) {
        const r = await api.put(`/api/pacientes/${id}/historias/${editandoId}`, payload);
        setHistorias(p => ordenarHistorias(p.map(h => h.id === editandoId ? r : h)));
      } else {
        // Métrica de tiempo: solo en registros nuevos
        payload.segundos_registro = Math.max(1, Math.round((Date.now() - inicioRegistro.current) / 1000));
        payload.metodo_registro = usoIA.current ? "ia" : "manual";
        const r = await api.post(`/api/pacientes/${id}/historias/`, payload);
        setHistorias(p => ordenarHistorias([r, ...p]));
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

  // Secciones con algo escrito: la pestaña lo muestra para saber de un vistazo
  // qué falta, sin tener que entrar a cada una.
  const seccionesLlenas = (() => {
    const llenas = new Set();
    for (const [campo, valor] of Object.entries(form)) {
      if (!valor || (Array.isArray(valor) && valor.length === 0)) continue;
      const sec = FIELD_TO_SECTION[campo];
      if (sec) llenas.add(sec);
    }
    // Los que no están en el mapa campo→sección
    if ((form.tratamiento_items?.length || form.vacunas_items?.length ||
         form.proxima_cita)) llenas.add("s5");
    if (form.examen_particular &&
        Object.values(form.examen_particular).some(x => x.estado || x.detalle)) llenas.add("s3");
    return llenas;
  })();

  // ── Contador de inferidos pendientes
  const numInferidos = Object.values(highlights).filter(v => v === "inferido").length;

  if (loading) return <CargandoPantalla />;
  if (error)   return <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-purple-700 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={salir} className="hover:bg-white/20 p-1 rounded transition-colors">
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
          resumirResultado={({ datos }) => {
            // Confirmar cuántos campos se completaron: sin esto el veterinario
            // tiene que recorrer el formulario entero para saber qué entendió la IA.
            const n = contarCamposLlenos(datos);
            return n ? `${n} campo${n > 1 ? "s" : ""} completado${n > 1 ? "s" : ""}` : "No se detectaron datos";
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

          {avisoBorrador && (
            <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              <FileText size={14} className="text-amber-600 shrink-0" />
              <span className="text-xs text-amber-900">
                {avisoBorrador.recuperado
                  ? <>Se recuperó un borrador <strong>{avisoBorrador.cuando}</strong>. Revísalo antes de guardar.</>
                  : <>Hay un borrador sin guardar <strong>{avisoBorrador.cuando}</strong>.</>}
              </span>
              <div className="flex gap-2 ml-auto">
                {!avisoBorrador.recuperado && (
                  <button type="button" onClick={recuperarBorrador}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-500 transition">
                    Recuperarlo
                  </button>
                )}
                <button type="button" onClick={descartarBorrador}
                  className="text-xs font-semibold px-2.5 py-1 rounded-md border border-amber-300 text-amber-800 hover:bg-amber-100 transition">
                  Descartar
                </button>
              </div>
            </div>
          )}

          {llenaRecepcion && (
            <div className="flex flex-wrap items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
              <Stethoscope size={14} className="text-purple-600 shrink-0" />
              <label htmlFor="vet-atendio" className="text-xs font-semibold text-purple-800">
                Atendió el doctor:
              </label>
              <select
                id="vet-atendio"
                value={vetId}
                onChange={e => setVetId(e.target.value)}
                className="text-xs border border-purple-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="">Selecciona…</option>
                {doctores.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">
                La consulta queda a su nombre; tu usuario queda registrado como quien la escribió.
              </span>
            </div>
          )}

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

          <BarraSecciones
            activa={seccionActiva}
            onCambiar={setSeccionActiva}
            llenas={seccionesLlenas}
            avisos={seccionesConAviso}
          />

          {/* S1 — Anamnesis */}
          <PanelSeccion activa={seccionActiva} id="s1" titulo="Anamnesis">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Fecha de la consulta">
                <input
                  type="datetime-local"
                  value={form.fecha}
                  max={toLocalDatetimeString(new Date())}
                  onChange={setF("fecha")}
                  className={hlInput()}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {editandoId
                    ? "Corrígela si la consulta se registró con otra fecha."
                    : "Déjala vacía si la consulta es de ahora. Ponla para digitalizar una consulta anterior."}
                </p>
              </Field>
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
          </PanelSeccion>

          {/* S2 — EOG */}
          <PanelSeccion activa={seccionActiva} id="s2" titulo="Examen objetivo general (EOG)">
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
          </PanelSeccion>

          {/* S3 — EOP */}
          <PanelSeccion activa={seccionActiva} id="s3" titulo="Examen objetivo particular (EOP)">
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
          </PanelSeccion>

          {/* S4 — Diagnóstico */}
          <PanelSeccion activa={seccionActiva} id="s4" titulo="Diagnóstico">
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
          </PanelSeccion>

          {/* S5 — Plan */}
          <PanelSeccion activa={seccionActiva} id="s5" titulo="Plan, tratamiento y vacunas">
            <Field label="Exámenes solicitados" hl={highlights.examenes_solicitados}>
              <TAr value={form.examenes_solicitados} onChange={setF("examenes_solicitados")} rows={2} hl={highlights.examenes_solicitados} />
            </Field>
            <div>
              <p className={lCls}>Medicamentos</p>
              <TratamientoList items={form.tratamiento_items} desde={form.fecha || undefined}
                medicamentos={medicamentos}
                onChange={v => { setForm(p => ({ ...p, tratamiento_items: v })); }} />
            </div>
            <div>
              <p className={lCls}>Vacunas aplicadas</p>
              <VacunaList items={form.vacunas_items} catalogo={catalogoVacunas}
                especie={paciente?.especie} desde={form.fecha || undefined}
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
          </PanelSeccion>

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

        {/* ── Documentos: si se está editando una consulta puntual, se acotan a
            ella (radiografía/análisis de ESA visita); si no, quedan a nivel
            de la mascota (p. ej. la libreta de vacunación escaneada). ────── */}
        {id && (
          editandoId
            ? <DocumentosPaciente pacienteId={id} historiaId={editandoId} titulo="Documentos de esta consulta" />
            : <DocumentosPaciente pacienteId={id} />
        )}

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
