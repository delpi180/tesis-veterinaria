import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";

const MOTIVOS = {
  fuera_de_rango: "Fuera de rango",
  inferido: "Deducido por la IA",
  rescatado: "Tomado del dictado",
  fuera_de_inventario: "No está en el inventario",
  sin_dosis: "Sin dosis",
  dosis_alta: "Dosis muy alta",
};

const NOMBRES = {
  temperatura_c: "Temperatura", peso_kg: "Peso",
  frecuencia_cardiaca: "Frecuencia cardíaca",
  frecuencia_respiratoria: "Frecuencia respiratoria",
  mucosas: "Mucosas", tllc: "TLLC", estado_sensorio: "Sensorio",
  hidratacion: "Hidratación", pulso: "Pulso", pronostico: "Pronóstico",
};

function nombreCampo(campo) {
  if (campo.startsWith("tratamiento_items.")) {
    return `Tratamiento ${Number(campo.split(".")[1]) + 1}`;
  }
  return NOMBRES[campo] || campo;
}

/** Qué entendió la IA: lo que falta y lo que conviene verificar, en una vista. */
export default function ResumenIA({ resumen, ajustes = [] }) {
  if (!resumen) return null;
  const { faltantes = [], dudosos = [], completitud = 0 } = resumen;
  if (!faltantes.length && !dudosos.length && !ajustes.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md">
        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        <span className="text-xs font-semibold text-emerald-800">
          La consulta quedó completa. Revísala antes de guardar.
        </span>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-md px-3 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">Lo que entendió la IA</h3>
        <span className="text-xs text-slate-500">{completitud}% de los datos clave</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-600" style={{ width: `${completitud}%` }} />
      </div>

      {dudosos.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
            <AlertTriangle size={13} /> Conviene verificar
          </p>
          <ul className="text-xs text-slate-700 space-y-0.5">
            {dudosos.map((d, i) => (
              <li key={i}>
                <span className="font-medium">{nombreCampo(d.campo)}</span>
                {" — "}{MOTIVOS[d.motivo] || d.motivo}
                {d.detalle ? `. ${d.detalle}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {faltantes.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
            <CircleDashed size={13} /> No se mencionó en el dictado
          </p>
          <p className="text-xs text-slate-700">
            {faltantes.map((f) => f.etiqueta).join(" · ")}
          </p>
        </div>
      )}

      {ajustes.length > 0 && (
        <p className="text-xs text-slate-600">
          Nombres corregidos con tu inventario:{" "}
          {ajustes.map((a) => `«${a.antes}» → ${a.despues}`).join("; ")}
        </p>
      )}
    </div>
  );
}
