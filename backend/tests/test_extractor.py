"""
Tests del pipeline de extracción de historia clínica.
La llamada a OpenAI se mockea para que sean rápidos y deterministas.
"""
import json
from unittest.mock import patch, MagicMock

from services import historia_extractor as H


def test_schema_estricto_bien_formado():
    s = H.HISTORIA_SCHEMA
    assert s["additionalProperties"] is False
    # todas las propiedades deben estar en required (regla de structured outputs strict)
    assert set(s["required"]) == set(s["properties"].keys())
    # enums cerrados incluyen null
    assert None in s["properties"]["mucosas"]["enum"]
    assert "ictericas" in s["properties"]["mucosas"]["enum"]


def test_validar_rangos():
    assert H._validar_rangos({"temperatura_c": 39.2}) == {}
    assert "temperatura_c" in H._validar_rangos({"temperatura_c": 392})
    assert "frecuencia_cardiaca" in H._validar_rangos({"frecuencia_cardiaca": 999})
    assert H._validar_rangos({"temperatura_c": None}) == {}
    # valores límite válidos
    assert H._validar_rangos({"condicion_corporal": 9}) == {}


def test_resolver_fechas_relativas():
    from datetime import date
    hoy = date(2026, 6, 12)
    assert H._resolve_date("mañana", hoy) == "2026-06-13"
    assert H._resolve_date("en una semana", hoy) == "2026-06-19"
    assert H._resolve_date("en dos meses", hoy) == "2026-08-12"
    # ya ISO → sin cambios
    assert H._resolve_date("2026-12-25", hoy) == "2026-12-25"


def _fake_completion(payload: dict):
    msg = MagicMock()
    msg.content = json.dumps(payload)
    msg.refusal = None
    comp = MagicMock()
    comp.choices = [MagicMock(message=msg)]
    comp.usage = MagicMock(prompt_tokens=10, completion_tokens=20)
    return comp


def test_extraer_historia_estructura(monkeypatch):
    payload = {
        "motivo_consulta": "vómitos",
        "temperatura_c": 392,          # fuera de rango a propósito
        "mucosas": "palidas",
        "proxima_cita": "en una semana",
        "tratamiento_items": [{"medicamento": "metronidazol", "dosis": "12h",
                               "via": None, "frecuencia": None, "duracion": "5 días"}],
        "vacunas_items": [],
        "_inferencias": {"mucosas": "explicito", "hidratacion": "inferido"},
    }
    # rellenar el resto de claves del esquema con null
    for k in H.HISTORIA_SCHEMA["properties"]:
        payload.setdefault(k, None)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_completion(payload)

    monkeypatch.setattr(H.settings, "openai_api_key", "test-key")
    with patch.object(H, "OpenAI", return_value=fake_client):
        r = H.extraer_historia("texto de prueba")

    # datos correctos
    assert r["datos"]["motivo_consulta"] == "vómitos"
    assert r["datos"]["mucosas"] == "palidas"
    # fecha relativa resuelta
    assert r["datos"]["proxima_cita"].startswith("2026-")
    # alerta de rango detectada
    assert "temperatura_c" in r["alertas_rango"]
    # inferencia de hidratacion descartada (campo en null), mucosas conservada
    assert "mucosas" in r["inferencias"]
    assert "hidratacion" not in r["inferencias"]
