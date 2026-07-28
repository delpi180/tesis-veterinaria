"""
receta_extractor.py
─────────────────────────────────────────────────────────────────────────────
Extrae los campos de una receta médica veterinaria (diagnóstico, indicaciones
y la lista de medicamentos con dosis/vía/frecuencia/duración) a partir de una
transcripción de voz, usando GPT con salida JSON estructurada.

Mismo patrón que historia_extractor.py, pero acotado a lo que entra en una
receta: no calcula fechas relativas ni valida rangos fisiológicos.
"""

import json
import re
import unicodedata
from openai import OpenAI
from core.config import settings

_SYSTEM_PROMPT = """
Eres un asistente de documentación clínica veterinaria. Recibes lo que un
veterinario dictó al recetar tratamiento para un perro o gato. Extrae la
información a JSON siguiendo el esquema.

REGLAS:
- Devuelve SOLO JSON válido, sin markdown ni texto extra.
- Si un dato NO se menciona, pon null. NUNCA inventes datos no dichos.
- Convierte números en palabras a cifras: "quince miligramos por kilo" → "15 mg/kg".
- Un mismo medicamento se menciona UNA sola vez en la lista, con su dosis,
  vía, frecuencia y duración más completas mencionadas en el dictado. Si el
  veterinario repite o corrige un medicamento ya dicho (p. ej. "mejor cada 8
  horas, no cada 12"), actualiza esa entrada en vez de crear una nueva.
- "vía" es la vía de administración: oral, subcutánea (SC), intramuscular (IM),
  intravenosa (IV), tópica, etc. Usa el término tal como se dictó, normalizado.
- "diagnostico" es el motivo clínico de la receta si se menciona (p. ej.
  "gastroenteritis leve"). "indicaciones" son instrucciones para el dueño
  (dieta, reposo, cuándo volver a control), no las dosis de los medicamentos.

ESQUEMA JSON:
{
  "diagnostico": str o null,
  "indicaciones": str o null,
  "items": [
    {"medicamento": str, "dosis": str o null, "via": str o null,
     "frecuencia": str o null, "duracion": str o null}
  ]
}
"""

_SCHEMA = {
    "type": "object",
    "properties": {
        "diagnostico": {"type": ["string", "null"]},
        "indicaciones": {"type": ["string", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "medicamento": {"type": "string"},
                    "dosis":       {"type": ["string", "null"]},
                    "via":         {"type": ["string", "null"]},
                    "frecuencia":  {"type": ["string", "null"]},
                    "duracion":    {"type": ["string", "null"]},
                },
                "required": ["medicamento", "dosis", "via", "frecuencia", "duracion"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["diagnostico", "indicaciones", "items"],
    "additionalProperties": False,
}


def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9\s]", "", s.lower().strip())


def _mismo_medicamento(a: str, b: str) -> bool:
    na, nb = _normalizar(a), _normalizar(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return len(na) > 4 and len(nb) > 4 and (na in nb or nb in na)


def _deduplicar_items(items: list[dict]) -> list[dict]:
    """Combina entradas del mismo medicamento en una sola (se queda con la
    última mención, que suele ser la corrección del veterinario)."""
    resultado: list[dict] = []
    for item in items:
        if not (item.get("medicamento") or "").strip():
            continue
        idx = next(
            (i for i, existente in enumerate(resultado)
             if _mismo_medicamento(existente["medicamento"], item["medicamento"])),
            None,
        )
        if idx is not None:
            resultado[idx] = item
        else:
            resultado.append(item)
    return resultado


def extraer_receta(texto: str) -> dict:
    """
    Llama al LLM para extraer diagnóstico, indicaciones y medicamentos de la
    receta dictada.

    Retorna: {"diagnostico": str|None, "indicaciones": str|None,
              "items": [...], "transcripcion": texto}
    """
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurada. Agrégala al archivo .env del backend."
        )

    client = OpenAI(api_key=settings.openai_api_key)

    print(f"[GPT] Extrayendo receta — modelo={settings.llm_model} ({len(texto)} chars)")

    try:
        completion = client.chat.completions.create(
            model=settings.llm_model,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "receta_medica", "strict": True, "schema": _SCHEMA},
            },
            temperature=0.15,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": texto},
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Error al conectar con OpenAI: {exc}") from exc

    msg = completion.choices[0].message
    if getattr(msg, "refusal", None):
        raise RuntimeError(f"El modelo rechazó la solicitud: {msg.refusal}")

    try:
        parsed = json.loads(msg.content or "")
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"El modelo devolvió JSON inválido: {exc}\nRespuesta: {(msg.content or '')[:300]}"
        ) from exc

    tokens = completion.usage
    print(f"[GPT] OK — tokens: {tokens.prompt_tokens} prompt / {tokens.completion_tokens} completion")

    return {
        "diagnostico": parsed.get("diagnostico"),
        "indicaciones": parsed.get("indicaciones"),
        "items": _deduplicar_items(parsed.get("items") or []),
        "transcripcion": texto,
    }
