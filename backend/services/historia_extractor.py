"""
historia_extractor.py
─────────────────────────────────────────────────────────────────────────────
Extrae campos estructurados de una historia clínica veterinaria a partir de
una transcripción de voz, usando GPT-4o-mini con response_format=json_object.

Devuelve:
  {
    "datos":        { ...campos clínicos sin _inferencias... },
    "inferencias":  { campo: "explicito"|"inferido", ... },
    "transcripcion": "texto original recibido"
  }
"""

import json
import re
from calendar import monthrange
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from openai import OpenAI
from core.config import settings

_LIMA_TZ = ZoneInfo("America/Lima")

_DIAS_ES = {
    "Monday": "lunes", "Tuesday": "martes", "Wednesday": "miércoles",
    "Thursday": "jueves", "Friday": "viernes", "Saturday": "sábado", "Sunday": "domingo",
}

_NUMS_ES = {
    "un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11,
    "doce": 12, "quince": 15, "veinte": 20, "treinta": 30,
}

# ── Post-procesado de fechas relativas ────────────────────────────────────────

_DATE_PAT = re.compile(
    r'(?:en|dentro\s+de)\s+(\w+)\s+(d[ií]as?|semanas?|meses?|mes|a[ñn]os?)',
    re.IGNORECASE | re.UNICODE,
)


def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year  = d.year + month // 12
    month = month % 12 + 1
    day   = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def _resolve_date(expr: str, today: date) -> str:
    """
    Convierte una expresión de fecha relativa en español a ISO AAAA-MM-DD.
    Si ya es ISO o no se reconoce, devuelve la expresión original.
    """
    if not expr or not isinstance(expr, str):
        return expr
    s = expr.strip()
    # Ya es fecha ISO — no tocar
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s
    lo = s.lower()
    # "mañana"
    if lo in ("mañana", "manana"):
        return (today + timedelta(days=1)).isoformat()
    # "en N días/semanas/meses/años"
    m = _DATE_PAT.search(lo)
    if m:
        num_tok, unit = m.group(1), m.group(2)
        n = int(num_tok) if num_tok.isdigit() else _NUMS_ES.get(num_tok)
        if n:
            if "d" in unit[0]:               return (today + timedelta(days=n)).isoformat()
            if "s" in unit[0]:               return (today + timedelta(weeks=n)).isoformat()
            if unit.startswith("m"):         return _add_months(today, n).isoformat()
            if unit[0] in ("a", "á", "â"):  return _add_months(today, n * 12).isoformat()
    return s  # no reconocido: devolver tal cual


def _patch_dates(datos: dict, today: date) -> dict:
    """Aplica _resolve_date a proxima_cita y a proxima_dosis en vacunas_items."""
    if datos.get("proxima_cita"):
        datos["proxima_cita"] = _resolve_date(datos["proxima_cita"], today)
    vx = datos.get("vacunas_items") or []
    for item in vx:
        if item.get("proxima_dosis"):
            item["proxima_dosis"] = _resolve_date(item["proxima_dosis"], today)
    return datos


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT_TPL = """
Eres un asistente de documentación clínica veterinaria para perros y gatos.
Recibes la transcripción de lo que un veterinario dictó en consulta. Extrae la
información a JSON siguiendo el esquema y las reglas de mapeo clínico.

REGLAS GENERALES:
- Devuelve SOLO JSON válido, sin markdown ni texto extra.
- Si un dato NO se menciona, pon null. NUNCA inventes datos no dichos.
- Convierte números en palabras a cifras: "treinta y nueve dos"→39.2;
  "cuatro kilos y medio"→4.5; "ciento veinte"→120.
- Para campos de OPCIONES CERRADAS, elige EXACTAMENTE uno de los valores
  permitidos según las reglas de mapeo. Interpreta el lenguaje coloquial del
  veterinario.
- Para cada campo de opción cerrada que completes, indica si fue EXPLÍCITO
  (el vet dio el dato claramente) o INFERIDO (lo dedujiste de una mención
  genérica). Esto va en el objeto "_inferencias".

MAPEO DE ESCALAS CLÍNICAS (opciones cerradas):

hidratacion:
  "normal" → hidratado, sin signos
  "leve_5" → "un poco/ligeramente deshidratado", ~5%
  "moderada_7" → "deshidratado" (genérico, sin grado), pliegue lento, ~7% [DEFAULT si dice solo "deshidratado"]
  "grave_10" → "muy/severamente deshidratado", ojos hundidos, ~10%
  "shock_12" → "en shock", colapsado, >12%

mucosas:
  "rosadas" → normales, rosadas
  "palidas" → pálidas, blanquecinas
  "congestivas" → congestivas, rojas, hiperémicas
  "ictericas" → amarillas, ictéricas
  "cianoticas" → azuladas, cianóticas

tllc (tiempo llenado capilar):
  "normal" → normal, rápido, menos de 2 segundos
  "aumentado" → lento, prolongado, más de 2 segundos

estado_sensorio:
  "alerta" → alerta, normal, activo, reactivo
  "deprimido" → decaído, deprimido, letárgico, apático
  "estuporoso" → estuporoso, muy obnubilado
  "comatoso" → comatoso, inconsciente

pulso:
  "fuerte" → fuerte, normal, lleno
  "debil" → débil, disminuido
  "filiforme" → filiforme, muy débil
  "ausente" → ausente, no palpable

pronostico:
  "favorable" → bueno, favorable
  "reservado" → reservado, a evaluar
  "desfavorable" → malo, desfavorable
  "grave" → grave, crítico

tipo_consulta:
  "primera_vez" | "control" | "urgencia" | "vacunacion"

REGLA DE INFERENCIA: cuando el vet menciona una condición sin precisar grado
(ej. "deshidratado" sin %), elige el valor clínicamente más probable (el default
indicado) y márcalo como INFERIDO. Cuando da pistas ("un poco", "muy", "severo"),
úsalas y marca EXPLÍCITO.

MANEJO DE FECHAS — OBLIGATORIO:
HOY ES: {fecha_hoy}

DEBES calcular y escribir la fecha exacta en formato AAAA-MM-DD.
NO repitas la expresión original; siempre devuelve la fecha calculada.

Reglas de cálculo (sobre la fecha de hoy indicada arriba):
  "mañana"                       → hoy + 1 día
  "en N días" / "dentro de N días" → hoy + N días
  "en una semana" / "en 7 días"  → hoy + 7 días
  "en dos semanas" / "en 15 días"→ hoy + 14/15 días
  "en un mes"                    → hoy + 1 mes (mismo día del mes siguiente)
  "en dos meses"                 → hoy + 2 meses
  "en un año"                    → hoy + 12 meses
  "el próximo lunes" (o martes…) → el siguiente {dia_semana} desde hoy
  "el 20 de junio"               → fecha exacta mencionada en el año en curso

Aplica estas reglas a: proxima_cita y proxima_dosis (dentro de vacunas_items).
Si no se menciona fecha o plazo → null.

ESQUEMA JSON (todas las claves; null si no se menciona):
{{
  "motivo_consulta": str, "tiempo_evolucion": str, "derivado_por": str,
  "detalle": str, "alimentacion_tipo": str, "alimentacion_cantidad_gr": int,
  "antecedentes": str, "tipo_consulta": str,
  "temperatura_c": num, "peso_kg": num, "frecuencia_cardiaca": int,
  "frecuencia_respiratoria": int, "condicion_corporal": int,
  "mucosas": str, "tllc": str, "estado_sensorio": str, "hidratacion": str,
  "pulso": str, "linfonodulos": str,
  "examen_particular": {{
    "tegumentario": str, "cardiovascular": str, "respiratorio": str,
    "digestivo": str, "urinario": str, "reproductor": str, "nervioso": str,
    "musculoesqueletico": str, "linfatico": str, "sentidos": str, "endocrino": str
  }},
  "diagnostico_presuntivo": str, "diagnosticos_diferenciales": str,
  "diagnostico_definitivo": str, "examenes_solicitados": str,
  "tratamiento_items": [{{"medicamento": str, "dosis": str, "via": str, "frecuencia": str, "duracion": str}}],
  "vacunas_items": [{{"vacuna": str, "lote": str, "proxima_dosis": str}}],
  "indicaciones": str, "pronostico": str, "proxima_cita": str,
  "_inferencias": {{"campo": "explicito"|"inferido", ...}}
}}
"""


# ── JSON Schema estricto (structured outputs) ────────────────────────────────
# Garantiza el esquema y los valores de enum válidos: GPT nunca puede devolver
# una mucosa o un estado fuera de la lista permitida, ni omitir/añadir claves.

def _s():        return {"type": ["string", "null"]}
def _num():      return {"type": ["number", "null"]}
def _int():      return {"type": ["integer", "null"]}
def _enum(vals): return {"type": ["string", "null"], "enum": vals + [None]}


_SISTEMAS = [
    "tegumentario", "cardiovascular", "respiratorio", "digestivo", "urinario",
    "reproductor", "nervioso", "musculoesqueletico", "linfatico", "sentidos", "endocrino",
]
_CERRADOS = {
    "tipo_consulta":   ["primera_vez", "control", "urgencia", "vacunacion"],
    "mucosas":         ["rosadas", "palidas", "congestivas", "ictericas", "cianoticas"],
    "tllc":            ["normal", "aumentado"],
    "estado_sensorio": ["alerta", "deprimido", "estuporoso", "comatoso"],
    "hidratacion":     ["normal", "leve_5", "moderada_7", "grave_10", "shock_12"],
    "pulso":           ["fuerte", "debil", "filiforme", "ausente"],
    "pronostico":      ["favorable", "reservado", "desfavorable", "grave"],
}


def _obj(props: dict) -> dict:
    return {
        "type": "object",
        "properties": props,
        "required": list(props.keys()),
        "additionalProperties": False,
    }


def _build_schema() -> dict:
    props = {
        "motivo_consulta": _s(), "tiempo_evolucion": _s(), "derivado_por": _s(),
        "detalle": _s(), "alimentacion_tipo": _s(), "alimentacion_cantidad_gr": _int(),
        "antecedentes": _s(), "tipo_consulta": _enum(_CERRADOS["tipo_consulta"]),
        "temperatura_c": _num(), "peso_kg": _num(), "frecuencia_cardiaca": _int(),
        "frecuencia_respiratoria": _int(), "condicion_corporal": _int(),
        "mucosas": _enum(_CERRADOS["mucosas"]), "tllc": _enum(_CERRADOS["tllc"]),
        "estado_sensorio": _enum(_CERRADOS["estado_sensorio"]),
        "hidratacion": _enum(_CERRADOS["hidratacion"]), "pulso": _enum(_CERRADOS["pulso"]),
        "linfonodulos": _s(),
        "examen_particular": _obj({s: _s() for s in _SISTEMAS}),
        "diagnostico_presuntivo": _s(), "diagnosticos_diferenciales": _s(),
        "diagnostico_definitivo": _s(), "examenes_solicitados": _s(),
        "tratamiento_items": {
            "type": "array",
            "items": _obj({"medicamento": _s(), "dosis": _s(), "via": _s(),
                           "frecuencia": _s(), "duracion": _s()}),
        },
        "vacunas_items": {
            "type": "array",
            "items": _obj({"vacuna": _s(), "lote": _s(), "proxima_dosis": _s()}),
        },
        "indicaciones": _s(), "pronostico": _enum(_CERRADOS["pronostico"]),
        "proxima_cita": _s(),
        # Marca explícito/inferido solo para los campos de opción cerrada
        "_inferencias": _obj({c: _enum(["explicito", "inferido"]) for c in _CERRADOS}),
    }
    return _obj(props)


HISTORIA_SCHEMA = _build_schema()


# ── Validación de rangos fisiológicos (seguridad clínica) ────────────────────
# Detecta valores numéricos imposibles (p.ej. "treinta y nueve dos" mal
# interpretado como 392 °C) para que el veterinario los revise.

_RANGOS = {
    "temperatura_c":           (34.0, 43.0, "°C"),
    "peso_kg":                 (0.1, 120.0, "kg"),
    "frecuencia_cardiaca":     (40, 300, "lpm"),
    "frecuencia_respiratoria": (5, 120, "rpm"),
    "condicion_corporal":      (1, 9, "/9"),
    "alimentacion_cantidad_gr": (1, 5000, "g"),
}


def _validar_rangos(datos: dict) -> dict:
    """Devuelve {campo: mensaje} para los valores fuera del rango fisiológico."""
    alertas = {}
    for campo, (lo, hi, unidad) in _RANGOS.items():
        v = datos.get(campo)
        if v is None:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if n < lo or n > hi:
            alertas[campo] = f"Valor fuera de rango ({n} {unidad}). Esperado {lo}–{hi} {unidad}. Verificar."
    return alertas


def extraer_historia(texto: str) -> dict:
    """
    Llama al LLM para extraer los campos de la historia clínica usando
    salida estructurada (JSON Schema estricto).

    Retorna:
        {
            "datos":         dict con los campos clínicos (sin _inferencias),
            "inferencias":   dict campo → "explicito" | "inferido",
            "alertas_rango": dict campo → mensaje (valores fuera de rango),
            "transcripcion": el texto recibido (para guardarlo en BD)
        }
    """
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurada. "
            "Agrégala al archivo .env del backend."
        )

    client = OpenAI(api_key=settings.openai_api_key)

    today       = datetime.now(_LIMA_TZ).date()
    dia_semana  = _DIAS_ES[today.strftime("%A")]
    fecha_hoy   = f"{today.isoformat()} ({dia_semana})"
    system_prompt = _SYSTEM_PROMPT_TPL.format(
        fecha_hoy=fecha_hoy,
        dia_semana=dia_semana,
    )

    print(
        f"[GPT] Extrayendo historia — modelo={settings.llm_model} "
        f"({len(texto)} chars) — hoy={fecha_hoy} — structured outputs"
    )

    try:
        completion = client.chat.completions.create(
            model=settings.llm_model,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "historia_clinica",
                    "strict": True,
                    "schema": HISTORIA_SCHEMA,
                },
            },
            temperature=0.15,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": texto},
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Error al conectar con OpenAI: {exc}") from exc

    msg = completion.choices[0].message
    if getattr(msg, "refusal", None):
        raise RuntimeError(f"El modelo rechazó la solicitud: {msg.refusal}")

    raw = msg.content or ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"El modelo devolvió JSON inválido: {exc}\nRespuesta: {raw[:300]}"
        ) from exc

    tokens = completion.usage
    print(
        f"[GPT] OK — tokens: {tokens.prompt_tokens} prompt / "
        f"{tokens.completion_tokens} completion"
    )

    # _inferencias: conservar solo las de campos realmente completados
    raw_inf = parsed.pop("_inferencias", {}) or {}
    inferencias = {
        k: v for k, v in raw_inf.items()
        if v and parsed.get(k) not in (None, "", [], {})
    }

    # Post-procesado: resolver expresiones de fecha relativas que el LLM no calculó.
    parsed = _patch_dates(parsed, today)

    # Validación de rangos fisiológicos.
    alertas_rango = _validar_rangos(parsed)
    if alertas_rango:
        print(f"[GPT] ⚠ Valores fuera de rango: {list(alertas_rango.keys())}")

    return {
        "datos":         parsed,
        "inferencias":   inferencias,
        "alertas_rango": alertas_rango,
        "transcripcion": texto,
    }
