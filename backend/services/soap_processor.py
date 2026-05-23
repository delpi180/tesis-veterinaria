"""
Procesador clínico NLP/SOAP para Veterinaria Los Pinos.

Estrategia:
  1. Limpia y tokeniza el texto en oraciones.
  2. Clasifica cada oración en una categoría SOAP usando un léxico veterinario.
  3. Extrae entidades clave (síntomas, diagnósticos, fármacos, signos vitales).
  4. Devuelve un dict estructurado bajo el estándar SOAP.

El léxico cubre terminología en español.  Si en el futuro se desea un modelo
neuronal, basta con reemplazar _classify_sentence() por una llamada al pipeline
de transformers que ya está instalado.
"""

import re
from typing import Any
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Léxico veterinario por categoría SOAP
# ---------------------------------------------------------------------------

_SUBJETIVO = {
    "sintomas_reportados": [
        "vomito", "vómito", "vomitando", "diarrea", "letargo", "letárgico",
        "inapetencia", "sin apetito", "no come", "tos", "tosiendo", "estornuda",
        "estornudos", "fiebre", "decaído", "debilidad", "débil", "temblores",
        "convulsiones", "convulsionó", "pérdida de peso", "adelgazó", "llora",
        "llorando", "cojera", "cojea", "rascado", "se rasca", "prurito",
        "secreción", "descarga", "sangrado", "sangra", "hinchazón", "inflamado",
        "jadea", "dificultad para respirar", "no puede caminar", "caída",
        "orina sangre", "hematuria", "poliuria", "polidipsia", "toma mucha agua",
    ],
    "historia": [
        "hace", "días", "horas", "semanas", "mes", "meses", "empezó", "comenzó",
        "desde", "ayer", "antier", "esta mañana", "dueño reporta", "propietario",
        "en casa", "notó", "observó", "vacuna", "vacunado", "desparasitado",
    ],
}

_OBJETIVO = {
    "signos_vitales": [
        "temperatura", "°c", "fiebre", "taquicardia", "bradicardia",
        "frecuencia cardíaca", "frecuencia cardiaca", "fc", "fr",
        "frecuencia respiratoria", "pulso", "spo2", "saturación",
        "presión arterial", "peso", "kg", "gramos", "talla",
    ],
    "examen_fisico": [
        "mucosas", "mucosa", "pálidas", "rosadas", "ictéricas", "cianóticas",
        "linfonodos", "ganglios", "abdomen", "abdominal", "tenso", "blando",
        "dolor", "doloroso", "sensible", "auscultación", "soplo", "crepitantes",
        "tórax", "torácico", "reflejo", "hidratación", "deshidratado",
        "condición corporal", "pelaje", "pelo", "piel", "úlcera", "herida",
        "fractura", "masa", "nódulo", "ojos", "oídos", "cavidad oral",
        "tiempo de llenado capilar", "tlc", "tlcc",
    ],
}

_ANALISIS = {
    "diagnostico_presuntivo": [
        "gastroenteritis", "enteritis", "pancreatitis", "parvovirus",
        "moquillo", "distemper", "leptospirosis", "ehrlichiosis", "anaplasmosis",
        "parasitosis", "parásitos", "helmintos", "giardia", "coccidiosis",
        "otitis", "otitis externa", "otitis media", "dermatitis", "piodermia",
        "ringworm", "tiña", "sarna", "demodicosis", "pulgas", "garrapatas",
        "fractura", "luxación", "esguince", "displasia",
        "insuficiencia renal", "falla renal", "enfermedad renal crónica",
        "diabetes", "hipotiroidismo", "hipertiroidismo", "cushing",
        "epilepsia", "lipoma", "tumor", "neoplasia", "linfoma",
        "neumonia", "bronquitis", "faringitis", "conjuntivitis",
        "uti", "infección urinaria", "cistitis",
    ],
    "diagnostico_diferencial": [
        "compatible con", "sugiere", "probable", "posible", "sospecha",
        "descarta", "diferencial", "no descarta", "a confirmar",
        "pendiente de", "se sugiere",
    ],
}

_PLAN = {
    "farmacos": [
        "amoxicilina", "amoxicilina-clavulánico", "enrofloxacina", "metronidazol",
        "tinidazol", "cefalexina", "doxiciclina", "tetraciclina",
        "ivermectina", "moxidectina", "milbemicina", "fenbendazol",
        "metronidazol", "prazicuantel", "dexametasona", "prednisolona",
        "prednisona", "hidrocortisona", "tramadol", "meloxicam", "carprofeno",
        "omeprazol", "ranitidina", "metoclopramida", "ondansetrón",
        "furosemida", "enalapril", "amlodipino", "atenolol",
        "fenobarbital", "diazepam", "ketamina", "propofol", "isoflurano",
        "vitamina", "suplemento", "probiótico", "solucion ringer",
        "solución ringer", "suero", "lactato de ringer",
    ],
    "procedimientos": [
        "radiografía", "rx", "ecografía", "ultrasonido", "hemograma",
        "biometría hemática", "perfil bioquímico", "química sanguínea",
        "urianálisis", "urinalisis", "coprologico", "coproscópico",
        "citología", "biopsia", "cultivo", "antibiograma",
        "cirugía", "castración", "esterilización", "ovariohisterectomía",
        "limpieza dental", "profilaxis dental", "extracción dental",
        "curación", "vendaje", "férula", "inyección", "iv", "im", "sc",
        "catéter", "sondaje", "fluidoterapia",
    ],
    "seguimiento": [
        "control", "próxima cita", "revisión", "seguimiento", "cita en",
        "volver en", "reprogramar", "reevaluar", "monitorear",
        "próximo", "días", "semana", "mes", "alta", "hospitalización",
        "internar", "observación", "reposo", "dieta",
    ],
}

_SOAP_LEXICONS = {
    "subjetivo": _SUBJETIVO,
    "objetivo": _OBJETIVO,
    "analisis": _ANALISIS,
    "plan": _PLAN,
}


# ---------------------------------------------------------------------------
# Modelos Pydantic para la respuesta SOAP
# ---------------------------------------------------------------------------

class SubjetivoSOAP(BaseModel):
    sintomas_reportados: list[str] = []
    historia: list[str] = []
    oraciones: list[str] = []


class ObjetivoSOAP(BaseModel):
    signos_vitales: list[str] = []
    hallazgos_examen_fisico: list[str] = []
    oraciones: list[str] = []


class AnalisisSOAP(BaseModel):
    diagnostico_presuntivo: list[str] = []
    diagnostico_diferencial: list[str] = []
    oraciones: list[str] = []


class PlanSOAP(BaseModel):
    farmacos: list[str] = []
    procedimientos: list[str] = []
    seguimiento: list[str] = []
    oraciones: list[str] = []


class SOAPResponse(BaseModel):
    subjetivo: SubjetivoSOAP
    objetivo: ObjetivoSOAP
    analisis: AnalisisSOAP
    plan: PlanSOAP
    texto_original: str
    advertencia: str | None = None


# ---------------------------------------------------------------------------
# Lógica de clasificación
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    return text.lower().strip()


def _score_sentence(sentence: str, category_lexicon: dict[str, list[str]]) -> int:
    norm = _normalize(sentence)
    return sum(1 for keywords in category_lexicon.values() for kw in keywords if kw in norm)


def _classify_sentence(sentence: str) -> str | None:
    """Devuelve la categoría SOAP con mayor puntaje, o None si no hay coincidencias."""
    scores = {
        cat: _score_sentence(sentence, lexicon)
        for cat, lexicon in _SOAP_LEXICONS.items()
    }
    best = max(scores, key=scores.__getitem__)
    return best if scores[best] > 0 else None


def _extract_entities(sentence: str, keyword_list: list[str]) -> list[str]:
    norm = _normalize(sentence)
    return [kw for kw in keyword_list if kw in norm]


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+|(?<=\n)", text)
    return [p.strip() for p in parts if p.strip()]


# ---------------------------------------------------------------------------
# Función principal
# ---------------------------------------------------------------------------

def process_soap(text: str) -> SOAPResponse:
    """
    Toma el texto transcrito y devuelve un SOAPResponse estructurado.
    """
    sentences = _split_sentences(text)

    soap: dict[str, Any] = {
        "subjetivo": {"oraciones": [], "sintomas_reportados": [], "historia": []},
        "objetivo": {"oraciones": [], "signos_vitales": [], "hallazgos_examen_fisico": []},
        "analisis": {"oraciones": [], "diagnostico_presuntivo": [], "diagnostico_diferencial": []},
        "plan": {"oraciones": [], "farmacos": [], "procedimientos": [], "seguimiento": []},
    }

    for sentence in sentences:
        category = _classify_sentence(sentence)
        if category is None:
            continue

        soap[category]["oraciones"].append(sentence)

        if category == "subjetivo":
            soap["subjetivo"]["sintomas_reportados"] += _extract_entities(
                sentence, _SUBJETIVO["sintomas_reportados"]
            )
            soap["subjetivo"]["historia"] += _extract_entities(
                sentence, _SUBJETIVO["historia"]
            )

        elif category == "objetivo":
            soap["objetivo"]["signos_vitales"] += _extract_entities(
                sentence, _OBJETIVO["signos_vitales"]
            )
            soap["objetivo"]["hallazgos_examen_fisico"] += _extract_entities(
                sentence, _OBJETIVO["examen_fisico"]
            )

        elif category == "analisis":
            soap["analisis"]["diagnostico_presuntivo"] += _extract_entities(
                sentence, _ANALISIS["diagnostico_presuntivo"]
            )
            soap["analisis"]["diagnostico_diferencial"] += _extract_entities(
                sentence, _ANALISIS["diagnostico_diferencial"]
            )

        elif category == "plan":
            soap["plan"]["farmacos"] += _extract_entities(
                sentence, _PLAN["farmacos"]
            )
            soap["plan"]["procedimientos"] += _extract_entities(
                sentence, _PLAN["procedimientos"]
            )
            soap["plan"]["seguimiento"] += _extract_entities(
                sentence, _PLAN["seguimiento"]
            )

    # Deduplicar entidades extraídas
    for cat in soap:
        for key, val in soap[cat].items():
            if isinstance(val, list) and key != "oraciones":
                soap[cat][key] = list(dict.fromkeys(val))

    advertencia = None
    empty_cats = [c for c in ["subjetivo", "objetivo", "analisis", "plan"]
                  if not soap[c]["oraciones"]]
    if empty_cats:
        advertencia = (
            f"Sin suficiente información para clasificar: {', '.join(empty_cats)}. "
            "Enriquece la nota clínica con más detalles."
        )

    return SOAPResponse(
        subjetivo=SubjetivoSOAP(**soap["subjetivo"]),
        objetivo=ObjetivoSOAP(**soap["objetivo"]),
        analisis=AnalisisSOAP(**soap["analisis"]),
        plan=PlanSOAP(**soap["plan"]),
        texto_original=text,
        advertencia=advertencia,
    )
