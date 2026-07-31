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

NÚMEROS — lo más importante de una receta:
- Copia el número EXACTAMENTE como se dictó. No redondees, no ajustes a la
  dosis "habitual" del fármaco, no corrijas lo que te parezca raro. Si el
  dictado dice 4, escribe 4 aunque lo normal fuera otra cifra.
- Convierte palabras a cifras sin cambiar el valor: "quince miligramos por
  kilo" → "15 mg/kg"; "cero punto uno" → "0.1"; "dos y medio" → "2.5".
- Si un número no se entiende o quedó cortado, pon null en ese campo. Un hueco
  es recuperable; un número inventado se administra al animal.

UNA LÍNEA POR PAUTA:
- Un mismo fármaco puede aparecer VARIAS veces si tiene pautas distintas, y
  todas van como líneas separadas. Ejemplos que son DOS líneas:
  "enrofloxacina inyectable hoy y tabletas por 7 días";
  "fenobarbital 5 mg/kg de carga y después 2.5 mg/kg cada 12 horas".
- Solo se unifica cuando el veterinario se CORRIGE sobre lo que acaba de
  decir ("no, mejor cada 8 horas", "ah no, 30 no 20"): en ese caso deja una
  sola línea con la versión corregida.

CAMPOS:
- "via" es la vía de administración: oral, subcutánea (SC), intramuscular (IM),
  intravenosa (IV), tópica, oftálmica, ótica. NO es la presentación: "tabletas",
  "jarabe", "inyectable" o "gotas" van en el nombre del medicamento, no en via.
- "diagnostico" es el motivo clínico de la receta si se menciona (p. ej.
  "gastroenteritis leve"). "indicaciones" son instrucciones para el dueño
  (dieta, reposo, cuándo volver a control), no las dosis de los medicamentos.
- Las vacunas NO son medicamentos de receta: si se menciona que se aplicó una
  vacuna, no la incluyas en "items".
- "dicho" es el fragmento LITERAL del dictado del que sacaste esa línea,
  copiado tal cual (sin corregir ni completar). Sirve para que el veterinario
  compare de un vistazo lo que el sistema oyó contra lo que él dijo.

ESQUEMA JSON:
{
  "diagnostico": str o null,
  "indicaciones": str o null,
  "items": [
    {"medicamento": str, "dosis": str o null, "via": str o null,
     "frecuencia": str o null, "duracion": str o null, "dicho": str o null}
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
                    # Fragmento literal del dictado: deja ver qué se oyó
                    "dicho":       {"type": ["string", "null"]},
                },
                "required": ["medicamento", "dosis", "via", "frecuencia", "duracion", "dicho"],
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


# El modelo a veces escribe la palabra "null" dentro de un campo de texto en
# vez de dejarlo vacío. Sin esto, la receta impresa dice literalmente
# "Vía: null" delante del cliente.
_VACIOS = {"null", "none", "n/a", "na", "-", "--", "no aplica", "no especificado"}


def _limpiar_vacios(item: dict) -> dict:
    return {
        k: (None if isinstance(v, str) and v.strip().lower() in _VACIOS else v)
        for k, v in item.items()
    }


def _huella(item: dict) -> tuple:
    """Identidad de una línea de receta: el fármaco Y su pauta completa."""
    return tuple(
        _normalizar(item.get(c))
        for c in ("medicamento", "dosis", "via", "frecuencia", "duracion")
    )


def _quitar_repetidos(items: list[dict]) -> list[dict]:
    """Descarta líneas idénticas, nada más.

    Antes esto fusionaba por NOMBRE: dos entradas del mismo fármaco se
    colapsaban en una y se conservaba la última. La intención era absorber las
    correcciones del veterinario ("no, mejor cada 8 horas"), pero el modelo ya
    resuelve eso solo — devuelve una sola línea cuando detecta una corrección.

    Lo que sí hacía era borrar pautas legítimas: "fenobarbital 5 mg/kg de
    carga hoy, después 2.5 mg/kg cada 12 horas" perdía la dosis de carga, y
    "enrofloxacina inyectable hoy y tabletas por 7 días" perdía la inyectable.
    Un medicamento recetado que desaparece sin aviso es peor que uno repetido:
    lo repetido se ve, lo que falta no.

    Un mismo fármaco puede aparecer varias veces con pautas distintas y todas
    son válidas. Solo se descarta lo que es idéntico campo por campo.
    """
    resultado: list[dict] = []
    vistos: set[tuple] = set()
    for item in items:
        item = _limpiar_vacios(item)
        if not (item.get("medicamento") or "").strip():
            continue
        h = _huella(item)
        if h in vistos:
            continue
        vistos.add(h)
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
        "items": _quitar_repetidos(parsed.get("items") or []),
        "transcripcion": texto,
    }
