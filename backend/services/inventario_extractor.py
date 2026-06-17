"""
inventario_extractor.py
─────────────────────────────────────────────────────────────────────────────
Interpreta lenguaje natural (lo que dicta el encargado de la veterinaria sobre
mercadería que llegó o productos a registrar) y devuelve una lista estructurada
de productos, usando GPT con salida estructurada (JSON Schema estricto).
"""
import json
from openai import OpenAI
from core.config import settings


_SYSTEM_PROMPT = """
Eres un asistente para la gestión de inventario de una veterinaria. Recibes lo
que el encargado dicta sobre productos que llegaron (compra/reposición) o que
quiere registrar. Extrae CADA producto mencionado a JSON.

El usuario puede dictar varios productos en serie, por ejemplo:
"primer producto pipeta marca X, medicamento, precio 80, stock 10; siguiente
producto alimento Y, comida, 65 soles, 5 bolsas". Extrae CADA UNO como un item.

REGLAS:
- Devuelve SOLO JSON válido con la lista de productos.
- Convierte números en palabras a cifras: "veinte"→20, "tres soles"→3,
  "ochenta y cinco"→85, "dos cincuenta"→2.5.
- 'cantidad' = unidades/stock que llegaron o se registran (entero, mínimo 1).
  Las palabras "stock", "cantidad", "unidades", "llegaron N" indican este campo.
- 'precio' = precio UNITARIO en soles. Si no se menciona, null.
- Ignora palabras de relleno como "primer producto", "siguiente producto",
  "el siguiente", "otro producto" — son separadores, no parte del nombre.
- 'categoria': clasifica en "comida", "accesorio" o "medicamento".
  Medicamentos/vacunas/antiparasitarios → "medicamento".
  Alimentos/snacks → "comida". Collares/juguetes/correas/higiene → "accesorio".
  Si no es claro, null.
- 'unidad': presentación si se menciona (caja, frasco, pipeta, bolsa, unidad…),
  si no, null.
- NUNCA inventes productos no mencionados. Si no hay productos, devuelve lista vacía.
""".strip()


def _build_schema() -> dict:
    item = {
        "type": "object",
        "properties": {
            "nombre":    {"type": "string"},
            "categoria": {"type": ["string", "null"],
                          "enum": ["comida", "accesorio", "medicamento", None]},
            "cantidad":  {"type": "integer"},
            "precio":    {"type": ["number", "null"]},
            "unidad":    {"type": ["string", "null"]},
        },
        "required": ["nombre", "categoria", "cantidad", "precio", "unidad"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {"items": {"type": "array", "items": item}},
        "required": ["items"],
        "additionalProperties": False,
    }


INVENTARIO_SCHEMA = _build_schema()


def interpretar_inventario(texto: str) -> list[dict]:
    """Devuelve [{nombre, categoria, cantidad, precio, unidad}, ...]."""
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY no está configurada.")

    client = OpenAI(api_key=settings.openai_api_key)
    print(f"[INV-GPT] Interpretando inventario ({len(texto)} chars)")

    try:
        completion = client.chat.completions.create(
            model=settings.llm_model,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "inventario", "strict": True, "schema": INVENTARIO_SCHEMA},
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

    items = parsed.get("items", [])
    # Normaliza/limita
    limpios = []
    for it in items:
        nombre = (it.get("nombre") or "").strip()
        if not nombre:
            continue
        cant = it.get("cantidad")
        limpios.append({
            "nombre":    nombre,
            "categoria": it.get("categoria"),
            "cantidad":  max(1, int(cant)) if cant else 1,
            "precio":    float(it["precio"]) if it.get("precio") else None,
            "unidad":    (it.get("unidad") or None),
        })
    print(f"[INV-GPT] OK — {len(limpios)} producto(s)")
    return limpios
