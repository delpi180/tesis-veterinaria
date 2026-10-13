"""Revisión de lo que devuelve la IA, sin volver a llamarla.

El extractor (GPT) a veces deja en blanco algo que SÍ se dictó, o escribe una
marca casi igual a la del inventario. Esta capa lo corrige con reglas
deterministas, que son baratas, repetibles y se pueden probar:

  1. rescatar_constantes  — si el texto dice "temperatura 39.2" y el campo vino
                            vacío, lo completa. Solo rellena vacíos: nunca pisa
                            un valor que la IA ya dio.
  2. ajustar_a_catalogo   — "meloxivet" / "melo si vet" → "MELOXIVET 4MG".
  3. resumen_campos       — qué quedó detectado, qué falta y qué conviene que
                            el doctor mire, para mostrarlo en pantalla.
"""
import re
import unicodedata
from difflib import SequenceMatcher

# ── Números dictados ─────────────────────────────────────────────────────────

_UNIDADES = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4,
    "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19,
    "veinte": 20, "veintiuno": 21, "veintidos": 22, "veintitres": 23,
    "veinticuatro": 24, "veinticinco": 25, "veintiseis": 26, "veintisiete": 27,
    "veintiocho": 28, "veintinueve": 29,
}
_DECENAS = {
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90,
}
_CENTENAS = {"cien": 100, "ciento": 100, "doscientos": 200, "trescientos": 300}


def _sin_tildes(s: str) -> str:
    base = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in base if not unicodedata.combining(c))


def _palabras_a_entero(tokens: list[str]) -> int | None:
    """['treinta','y','nueve'] → 39. None si no es un número reconocible."""
    total, hubo = 0, False
    for t in tokens:
        if t == "y":
            continue
        if t in _CENTENAS:
            total += _CENTENAS[t]
        elif t in _DECENAS:
            total += _DECENAS[t]
        elif t in _UNIDADES:
            total += _UNIDADES[t]
        else:
            return None
        hubo = True
    return total if hubo else None


_NUM_PALABRA = "|".join(sorted(
    list(_UNIDADES) + list(_DECENAS) + list(_CENTENAS) + ["y"], key=len, reverse=True))

# 39.2 | 39,2 | 39 | treinta y nueve punto dos | treinta y nueve coma cinco
_NUMERO = (
    r"(?P<num>\d{1,3}(?:[.,]\d{1,2})?"
    r"|(?:(?:" + _NUM_PALABRA + r")\s+)*(?:" + _NUM_PALABRA + r")"
    r"(?:\s+(?:punto|coma)\s+(?:(?:" + _NUM_PALABRA + r")\s*)+)?)"
)


def _a_numero(crudo: str) -> float | None:
    crudo = _sin_tildes(crudo).strip()
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{1,2})?", crudo):
        return float(crudo.replace(",", "."))
    partes = re.split(r"\s+(?:punto|coma)\s+", crudo)
    entera = _palabras_a_entero(partes[0].split())
    if entera is None:
        return None
    if len(partes) == 1:
        return float(entera)
    # Los decimales se dictan dígito a dígito ("treinta y nueve punto dos")
    # o como cifra suelta ("punto cinco").
    dec = _palabras_a_entero(partes[1].split())
    if dec is None:
        return None
    return float(f"{entera}.{dec}")


_PATRONES = {
    "temperatura_c":           r"temperatura(?:\s+(?:de|es|era|corporal))?\s+" + _NUMERO,
    "peso_kg":                 r"pes(?:o|a|ando)(?:\s+(?:de|es|era|unos))?\s+" + _NUMERO,
    "frecuencia_cardiaca":     r"frecuencia\s+card[ií]aca(?:\s+(?:de|es|era))?\s+" + _NUMERO,
    "frecuencia_respiratoria": r"frecuencia\s+respiratoria(?:\s+(?:de|es|era))?\s+" + _NUMERO,
}
# Un "peso" dictado como "cuatro kilos y medio" no lo cubre este patrón a
# propósito: es ambiguo y el prompt ya lo maneja. Aquí solo se rescata lo claro.
_COMPILADOS = {k: re.compile(p, re.IGNORECASE) for k, p in _PATRONES.items()}

_ENTEROS = {"frecuencia_cardiaca", "frecuencia_respiratoria"}


def rescatar_constantes(texto: str, datos: dict) -> list[str]:
    """Completa constantes vacías que sí aparecen en el dictado.

    Devuelve los campos rescatados, para marcarlos como "revisar" en pantalla.
    """
    rescatados = []
    texto = texto or ""
    for campo, rx in _COMPILADOS.items():
        if datos.get(campo) not in (None, ""):
            continue
        m = rx.search(texto)
        if not m:
            continue
        valor = _a_numero(m.group("num"))
        if valor is None:
            continue
        datos[campo] = int(round(valor)) if campo in _ENTEROS else valor
        rescatados.append(campo)
    return rescatados


# ── Medicamentos contra el inventario ────────────────────────────────────────

_RELLENO = {"mg", "ml", "gr", "kg", "cc", "x", "tab", "tabs", "tableta",
            "tabletas", "frasco", "caja", "de", "del"}
_DOSIS = re.compile(r"^\d+([.,]\d+)?(mg|ml|g|gr|kg|mcg|ui|cc|%)?$")


def _marca(nombre: str) -> str:
    """'MELOXIVET 4MG x 10 TAB' → 'meloxivet'; 'melo si vet' → 'melosivet'."""
    palabras = [p.strip(".,;:()") for p in _sin_tildes(nombre).split()]
    palabras = [p for p in palabras if p and not _DOSIS.match(p) and p not in _RELLENO]
    return "".join(palabras)


def ajustar_a_catalogo(items: list, catalogo: list[str], umbral: float = 0.84) -> list[dict]:
    """Reemplaza un nombre mal oído por el del inventario si se parece mucho.

    Devuelve [{antes, despues}] de lo que cambió. Con un umbral alto a
    propósito: confundir una marca con otra es peor que dejarla como se oyó.
    Un nombre ya idéntico o contenido en el catálogo no se toca.
    """
    cambios = []
    if not catalogo:
        return cambios
    marcas = [(c, _marca(c)) for c in catalogo if _marca(c)]
    for item in items or []:
        if not isinstance(item, dict):
            continue
        original = (item.get("medicamento") or "").strip()
        clave = _marca(original)
        if len(clave) < 4:
            continue
        mejor, mejor_r = None, 0.0
        for nombre, m in marcas:
            if clave == m or clave in m or m in clave:
                mejor, mejor_r = None, 1.0   # ya coincide: no tocar
                break
            r = SequenceMatcher(None, clave, m).ratio()
            if r > mejor_r:
                mejor, mejor_r = nombre, r
        if mejor and mejor_r >= umbral:
            item["medicamento"] = mejor
            cambios.append({"antes": original, "despues": mejor})
    return cambios


# ── Dosis por peso ───────────────────────────────────────────────────────────

_DOSIS_KG = re.compile(r"(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|ui)\s*/\s*kg", re.IGNORECASE)

# No es un rango terapéutico —eso depende de cada fármaco y no se inventa aquí—
# sino un tope de plausibilidad: ningún fármaco de uso corriente se da por
# encima de esto por kilo. Superarlo casi siempre es un dictado mal oído
# ("cuatro" convertido en "cuatrocientos") y es el error que más duele.
DOSIS_MG_KG_MAXIMA = 100


def dosis_por_kg(dosis: str | None):
    """'4 mg/kg' → (4.0, 'mg'); None si no es una dosis por peso."""
    m = _DOSIS_KG.search(dosis or "")
    if not m:
        return None
    return float(m.group(1).replace(",", ".")), m.group(2).lower()


def calcular_dosis_total(dosis: str | None, peso_kg) -> dict | None:
    """Dosis total para el peso del paciente, o None si no se puede calcular."""
    d = dosis_por_kg(dosis)
    try:
        peso = float(peso_kg)
    except (TypeError, ValueError):
        return None
    if not d or peso <= 0:
        return None
    por_kg, unidad = d
    return {"por_kg": por_kg, "unidad": unidad, "peso_kg": peso,
            "total": round(por_kg * peso, 2)}


# ── Resumen de completitud ───────────────────────────────────────────────────

# Lo que una historia clínica no debería quedar sin. Etiquetas en español para
# mostrarlas tal cual al doctor.
_ESENCIALES = {
    "motivo_consulta": "Motivo de consulta",
    "temperatura_c": "Temperatura",
    "peso_kg": "Peso",
    "frecuencia_cardiaca": "Frecuencia cardíaca",
    "frecuencia_respiratoria": "Frecuencia respiratoria",
    "diagnostico_presuntivo": "Diagnóstico presuntivo",
    "indicaciones": "Indicaciones",
}
_OPCIONALES = {
    "mucosas": "Mucosas", "tllc": "TLLC", "estado_sensorio": "Sensorio",
    "hidratacion": "Hidratación", "pulso": "Pulso", "pronostico": "Pronóstico",
    "proxima_cita": "Próxima cita",
}


def _lleno(v) -> bool:
    return v not in (None, "", [], {})


def resumen_campos(datos: dict, inferencias: dict, alertas_rango: dict,
                   rescatados: list[str] | None = None) -> dict:
    """Qué se detectó, qué falta y qué debe mirar el doctor.

    - faltantes: esenciales sin dato (el doctor debe completarlos o confirmar
      que no aplican).
    - dudosos: el dato está pero conviene verificarlo — valor fuera de rango,
      inferido por la IA, rescatado por regla, medicamento fuera del inventario
      o tratamiento sin dosis.
    """
    rescatados = rescatados or []
    etiquetas = {**_ESENCIALES, **_OPCIONALES}

    detectados = [etiquetas[c] for c in etiquetas if _lleno(datos.get(c))]
    faltantes = [{"campo": c, "etiqueta": e}
                 for c, e in _ESENCIALES.items() if not _lleno(datos.get(c))]

    dudosos = []
    for campo, msg in (alertas_rango or {}).items():
        dudosos.append({"campo": campo, "motivo": "fuera_de_rango", "detalle": msg})
    for campo, tipo in (inferencias or {}).items():
        if tipo == "inferido":
            dudosos.append({"campo": campo, "motivo": "inferido",
                            "detalle": "La IA lo dedujo; no se dictó con esas palabras."})
    for campo in rescatados:
        dudosos.append({"campo": campo, "motivo": "rescatado",
                        "detalle": "Se tomó directamente del dictado; confirmar."})
    for i, t in enumerate(datos.get("tratamiento_items") or []):
        if not isinstance(t, dict):
            continue
        nombre = t.get("medicamento") or f"tratamiento {i + 1}"
        if t.get("en_catalogo") is False:
            dudosos.append({"campo": f"tratamiento_items.{i}", "motivo": "fuera_de_inventario",
                            "detalle": f"«{nombre}» no está en el inventario; verificar el nombre."})
        if t.get("medicamento") and not t.get("dosis"):
            dudosos.append({"campo": f"tratamiento_items.{i}", "motivo": "sin_dosis",
                            "detalle": f"«{nombre}» no tiene dosis."})

    for i, t in enumerate(datos.get("tratamiento_items") or []):
        if not isinstance(t, dict):
            continue
        d = dosis_por_kg(t.get("dosis"))
        if d and d[1] == "mg" and d[0] > DOSIS_MG_KG_MAXIMA:
            dudosos.append({"campo": f"tratamiento_items.{i}", "motivo": "dosis_alta",
                            "detalle": f"{t.get('dosis')} es una dosis excepcionalmente alta; "
                                       "verificar contra el audio."})

    total = len(_ESENCIALES)
    completos = total - len(faltantes)
    return {
        "detectados": detectados,
        "faltantes": faltantes,
        "dudosos": dudosos,
        "completitud": round(100 * completos / total),
    }
