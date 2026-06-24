"""
servicio_extractor.py
─────────────────────────────────────────────────────────────────────────────
Interpreta lenguaje natural (lo que dicta el encargado sobre los servicios que
ofrece la veterinaria) y devuelve una lista estructurada de servicios, usando
GPT con salida estructurada (JSON Schema estricto).
"""
import json
from openai import OpenAI
from core.config import settings


_SYSTEM_PROMPT = """
Eres un asistente para el catálogo de servicios de una veterinaria. Recibes lo
que el encargado dicta sobre los servicios que ofrece y su precio. Extrae CADA
servicio mencionado a JSON.

El usuario puede dictar varios servicios en serie, por ejemplo:
"consulta general 50 soles; baño y corte de pelo 40; vacunación 35; cirugía
precio variable según el caso". Extrae CADA UNO como un item.

REGLAS:
- Devuelve SOLO JSON válido con la lista de servicios.
- Convierte números en palabras a cifras: "cincuenta"->50, "treinta y cinco"->35.
- 'nombre': nombre del servicio (consulta, baño, vacunación, cirugía, etc.).
- 'descripcion': detalle si se menciona; si no, null.
- 'precio': precio en soles. Si no se menciona o es variable, null.
- 'precio_variable': true si el precio NO es fijo (se dice "precio variable",
  "según el caso", "varía", "monto al momento", "depende", o son operaciones/
  cirugías sin precio fijo). En ese caso 'precio' debe ser null.
- Ignora palabras de relleno como "primer servicio", "siguiente", "otro" — son
  separadores, no parte del nombre.
- NUNCA inventes servicios no mencionados. Si no hay servicios, lista vacía.
""".strip()


def _build_schema() -> dict:
    item = {
        "type": "object",
        "properties": {
            "nombre":          {"type": "string"},
            "descripcion":     {"type": ["string", "null"]},
            "precio":          {"type": ["number", "null"]},
            "precio_variable": {"type": "boolean"},
        },
        "required": ["nombre", "descripcion", "precio", "precio_variable"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {"items": {"type": "array", "items": item}},
        "required": ["items"],
        "additionalProperties": False,
    }


SERVICIOS_SCHEMA = _build_schema()


def interpretar_servicios(texto: str) -> list[dict]:
    """Devuelve [{nombre, descripcion, precio, precio_variable}, ...]."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY no está configurada.")

    client = OpenAI(api_key=settings.openai_api_key)
    print(f"[SERV-GPT] Interpretando servicios ({len(texto)} chars)")

    try:
        completion = client.chat.completions.create(
            model=settings.llm_model,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "servicios", "strict": True, "schema": SERVICIOS_SCHEMA},
            },
            temperature=0.1,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": texto},
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Error al conectar con OpenAI: {exc}") from exc

    msg = completion.choices[0].message
    if getattr(msg, "refusal", None):
        raise RuntimeError(f"El modelo rechazó la solicitud: {msg.refusal}")

    try:
        parsed = json.loads(msg.content or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"JSON inválido del modelo: {exc}") from exc

    limpios = []
    for it in parsed.get("items", []):
        nombre = (it.get("nombre") or "").strip()
        if not nombre:
            continue
        variable = bool(it.get("precio_variable"))
        precio = it.get("precio")
        limpios.append({
            "nombre":          nombre,
            "descripcion":     (it.get("descripcion") or None),
            "precio":          (float(precio) if (precio and not variable) else None),
            "precio_variable": variable,
        })
    print(f"[SERV-GPT] OK — {len(limpios)} servicio(s)")
    return limpios
