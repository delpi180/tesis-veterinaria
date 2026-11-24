"""Medición de la IA para la tesis: WER, gasto, tope, latencia y banco de casos.

Nada de esto llama a Deepgram ni a OpenAI de verdad: se mockea para no gastar.
"""
import json
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from core.config import settings
from database import SessionLocal
from models import CorridaEvaluacion, EvaluacionVoz, UsoIA
from services import banco_evaluacion, uso_ia
from services import historia_extractor as H
from services.calidad_voz import calcular_wer, normalizar
from services.estadistica import percentil


# ── WER ──────────────────────────────────────────────────────────────────────

def test_wer_identico_es_cero():
    r = calcular_wer("Le doy metimazol cada doce horas", "le doy metimazol cada doce horas")
    assert r["wer"] == 0
    assert r["sustituidas"] == r["borradas"] == r["insertadas"] == 0


def test_wer_una_sustitucion_de_cinco():
    r = calcular_wer("dale amoxicilina cada doce horas", "dale amoxicilina cada doce hora")
    assert r["sustituidas"] == 1
    assert r["wer"] == pytest.approx(0.2)


def test_wer_cuenta_borradas_e_insertadas():
    borrada = calcular_wer("el perro tiene fiebre alta", "el perro fiebre alta")
    assert (borrada["borradas"], borrada["insertadas"], borrada["sustituidas"]) == (1, 0, 0)
    assert borrada["wer"] == pytest.approx(1 / 5)
    insertada = calcular_wer("el perro tiene fiebre", "el perro tiene mucha fiebre")
    assert (insertada["borradas"], insertada["insertadas"], insertada["sustituidas"]) == (0, 1, 0)
    assert insertada["wer"] == pytest.approx(1 / 4)


def test_wer_ignora_tildes_mayusculas_y_signos():
    assert normalizar("¡Pimobendán, 39,2 °C!") == ["pimobendan", "39.2", "c"]
    assert calcular_wer("Pimobendán dos veces.", "pimobendan dos veces")["wer"] == 0


def test_wer_clinico_solo_mide_terminos_clinicos():
    # «metimazol» está en el vocabulario clínico; «dale» y «cada» no.
    r = calcular_wer("dale metimazol cada ocho horas", "dale metimasol cada ocho horas")
    assert r["terminos_clinicos"] == 1
    assert r["wer_clinico"] == 1.0
    assert r["wer"] == pytest.approx(0.2)
    assert r["errores_clinicos"][0]["referencia"] == "metimazol"


def test_wer_sin_terminos_clinicos_da_none():
    r = calcular_wer("buenos dias doctor", "buenos dias doctor")
    assert r["wer_clinico"] is None


def test_wer_referencia_vacia_falla():
    with pytest.raises(ValueError):
        calcular_wer("   ", "algo")


# ── Percentil ────────────────────────────────────────────────────────────────

def test_percentil():
    assert percentil([1, 2, 3, 4, 5], 50) == 3
    assert percentil([1, 2, 3, 4, 5], 95) == 4.8
    assert percentil([7], 95) == 7
    assert percentil([], 95) is None


# ── Costos y estimación ──────────────────────────────────────────────────────

@pytest.fixture
def precios(monkeypatch):
    monkeypatch.setattr(settings, "precio_openai_entrada_millon", 1.0)
    monkeypatch.setattr(settings, "precio_openai_salida_millon", 2.0)
    monkeypatch.setattr(settings, "precio_deepgram_minuto", 0.6)


def test_costos(precios):
    assert uso_ia.costo_openai(1_000_000, 500_000) == pytest.approx(2.0)
    assert uso_ia.costo_deepgram(30) == pytest.approx(0.3)
    assert uso_ia.costo_deepgram(None) == 0


def test_estimar_pruebas(precios):
    e = uso_ia.estimar_pruebas(10, 60, 1_000_000, 0)
    # por historia: 1 min de voz (0.6) + 1 M tokens de entrada (1.0)
    assert e["por_historia_usd"] == pytest.approx(1.6)
    assert e["total_usd"] == pytest.approx(16.0)
    solo_texto = uso_ia.estimar_pruebas(10, 60, 1_000_000, 0, con_voz=False)
    assert solo_texto["total_usd"] == pytest.approx(10.0)


# ── Registro, resumen y tope (contra la base de prueba) ──────────────────────

@pytest.fixture
def db():
    s = SessionLocal()
    ids: list[int] = []
    s._ids_prueba = ids
    yield s
    s.rollback()
    if ids:
        s.execute(text("DELETE FROM uso_ia WHERE id = ANY(:ids)"), {"ids": ids})
        s.commit()
    s.close()


def _insertar_uso(db, **kw) -> UsoIA:
    fila = UsoIA(servicio=kw.pop("servicio", "openai"), operacion=kw.pop("operacion", "historia"), **kw)
    db.add(fila)
    db.commit()
    db._ids_prueba.append(fila.id)
    return fila


def test_registrar_guarda_costo(db, precios):
    antes = db.query(UsoIA).count()
    uso_ia.registrar(db, servicio="openai", operacion="historia", modelo="m",
                     tokens_entrada=1_000_000, tokens_salida=500_000, latencia_ms=1234)
    fila = db.query(UsoIA).order_by(UsoIA.id.desc()).first()
    db._ids_prueba.append(fila.id)
    assert db.query(UsoIA).count() == antes + 1
    assert fila.costo_usd == pytest.approx(2.0)
    assert fila.latencia_ms == 1234 and fila.exito is True


def test_registrar_fallo_no_cobra(db, precios):
    uso_ia.registrar(db, servicio="deepgram", operacion="transcripcion", segundos_audio=600, exito=False)
    fila = db.query(UsoIA).order_by(UsoIA.id.desc()).first()
    db._ids_prueba.append(fila.id)
    assert fila.costo_usd == 0 and fila.exito is False


def test_registrar_sin_sesion_no_hace_nada():
    uso_ia.registrar(None, servicio="openai", operacion="historia")   # no debe lanzar


def test_tope_diario(db, monkeypatch):
    base = uso_ia.gasto_hoy(db)
    monkeypatch.setattr(settings, "tope_gasto_ia_diario_usd", 0)
    uso_ia.exigir_cupo(db)                                    # sin tope: pasa
    monkeypatch.setattr(settings, "tope_gasto_ia_diario_usd", base + 5)
    uso_ia.exigir_cupo(db)                                    # debajo del tope: pasa
    _insertar_uso(db, costo_usd=6)
    with pytest.raises(uso_ia.TopeGastoExcedido):
        uso_ia.exigir_cupo(db)


def test_resumen_gasto(db):
    _insertar_uso(db, costo_usd=0.5)
    r = uso_ia.resumen_gasto(db)
    assert r["hoy_usd"] >= 0.5 and r["mes_usd"] >= r["hoy_usd"]
    assert r["semana_usd"] >= r["hoy_usd"]
    assert "precios" in r and r["proyeccion_mes_usd"] >= r["mes_usd"] * 0.99


# ── El extractor deja su gasto y su latencia ─────────────────────────────────

def _completion(payload):
    msg = MagicMock(content=json.dumps(payload), refusal=None)
    return MagicMock(choices=[MagicMock(message=msg)],
                     usage=MagicMock(prompt_tokens=1000, completion_tokens=200))


def test_extraer_historia_registra_uso(db, monkeypatch, precios):
    payload = {k: None for k in H.HISTORIA_SCHEMA["properties"]}
    payload["motivo_consulta"] = "vómitos"
    cliente = MagicMock()
    cliente.chat.completions.create.return_value = _completion(payload)
    monkeypatch.setattr(H.settings, "openai_api_key", "test-key")
    antes = db.query(UsoIA).count()
    with patch.object(H, "OpenAI", return_value=cliente):
        r = H.extraer_historia("texto", db=db)
    fila = db.query(UsoIA).order_by(UsoIA.id.desc()).first()
    db._ids_prueba.append(fila.id)
    assert db.query(UsoIA).count() == antes + 1
    assert (fila.servicio, fila.operacion) == ("openai", "historia")
    assert (fila.tokens_entrada, fila.tokens_salida) == (1000, 200)
    assert fila.costo_usd == pytest.approx(1000 * 1 / 1e6 + 200 * 2 / 1e6)
    assert isinstance(r["latencia_ms"], int) and r["latencia_ms"] >= 0


def test_extraer_historia_fallida_se_registra_sin_costo(db, monkeypatch):
    cliente = MagicMock()
    cliente.chat.completions.create.side_effect = RuntimeError("sin red")
    monkeypatch.setattr(H.settings, "openai_api_key", "test-key")
    with patch.object(H, "OpenAI", return_value=cliente):
        with pytest.raises(RuntimeError):
            H.extraer_historia("texto", db=db)
    fila = db.query(UsoIA).order_by(UsoIA.id.desc()).first()
    db._ids_prueba.append(fila.id)
    assert fila.exito is False and fila.costo_usd == 0


# ── Endpoints ────────────────────────────────────────────────────────────────

def test_gasto_solo_admin(client, admin, doctor):
    assert client.get("/api/ia/gasto", headers=admin).status_code == 200
    assert client.get("/api/ia/gasto", headers=doctor).status_code == 403
    assert client.get("/api/ia/gasto/estimar?historias=30", headers=doctor).status_code == 403


def test_estimar_endpoint(client, admin):
    r = client.get("/api/ia/gasto/estimar?historias=30&con_voz=false", headers=admin)
    assert r.status_code == 200
    d = r.json()
    assert d["n_historias"] == 30 and d["voz_usd"] == 0
    assert d["total_usd"] == pytest.approx(d["por_historia_usd"] * 30, abs=1e-3)
    assert "origen" in d


def test_tope_bloquea_la_ia_pero_no_lo_manual(client, admin, doctor, db, monkeypatch):
    monkeypatch.setattr(settings, "tope_gasto_ia_diario_usd", 0.01)
    _insertar_uso(db, costo_usd=1)

    r = client.post("/api/procesar-historia", json={"texto": "perro con vómitos"}, headers=doctor)
    assert r.status_code == 429 and "tope" in r.json()["detail"].lower()
    r = client.post("/api/procesar-receta", json={"texto": "amoxicilina"}, headers=doctor)
    assert r.status_code == 429
    r = client.post("/api/transcribe", files={"audio": ("a.webm", b"datos", "audio/webm")}, headers=doctor)
    assert r.status_code == 429

    # El llenado manual sigue funcionando: no pasa por la IA.
    assert client.get("/api/clientes/", headers=admin).status_code == 200


def test_historia_guarda_etapas(client, admin, doctor):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli or not cli[0]["pacientes"]:
        pytest.skip("Sin pacientes para probar")
    pid = cli[0]["pacientes"][0]["id"]
    etapas = {"grabacion_s": 40, "transcripcion_s": 6.2, "extraccion_s": 3.1, "revision_s": 25}
    h = client.post(f"/api/pacientes/{pid}/historias/", json={
        "motivo_consulta": "prueba etapas", "segundos_registro": 75, "metodo_registro": "ia",
        "etapas_registro": etapas,
    }, headers=doctor)
    assert h.status_code == 201, h.text
    hid = h.json()["id"]
    try:
        got = client.get(f"/api/pacientes/{pid}/historias/{hid}", headers=doctor).json()
        assert got["etapas_registro"] == etapas
    finally:
        s = SessionLocal()
        s.execute(text("DELETE FROM historias_clinicas WHERE id=:h"), {"h": hid})
        s.commit(); s.close()


# ── Router de evaluación (se llama directo: solo se monta con MODULOS_TESIS) ─

def test_evaluar_wer_guarda_y_resume(db):
    from routers import evaluacion_ia as E
    antes = db.query(EvaluacionVoz).count()
    r = E.evaluar_wer(E.WerRequest(referencia="dale metimazol cada ocho horas",
                                   hipotesis="dale metimasol cada ocho horas",
                                   etiqueta="prueba"), db)
    fila = db.query(EvaluacionVoz).order_by(EvaluacionVoz.id.desc()).first()
    try:
        assert r["wer"] == pytest.approx(0.2)
        assert db.query(EvaluacionVoz).count() == antes + 1
        lista = E.listar_wer(db)
        assert lista["n"] == antes + 1 and lista["wer_global"] is not None
    finally:
        db.delete(fila)
        db.commit()


def test_exportar_csv_tiene_cabecera(db):
    from routers import evaluacion_ia as E
    for tabla in ("tiempos", "uso_ia", "wer", "banco"):
        r = E.exportar(tabla, db)
        assert r.media_type.startswith("text/csv")
        assert r.body.decode("utf-8").startswith("﻿")


# ── Banco de casos ───────────────────────────────────────────────────────────

def test_banco_tiene_casos_y_ic():
    assert len(banco_evaluacion.casos_de("historia")) >= 8
    assert len(banco_evaluacion.casos_de("receta")) >= 7
    assert len(banco_evaluacion.casos_de("todos")) == (
        len(banco_evaluacion.CASOS_HISTORIA) + len(banco_evaluacion.CASOS_RECETA))
    inf, sup = banco_evaluacion.ic95_wilson(15, 15)
    assert sup == pytest.approx(1.0) and 0.7 < inf < 1.0
    assert banco_evaluacion.ic95_wilson(0, 0) == (None, None)


def test_correr_banco_con_ia_simulada(db, monkeypatch):
    """Cada caso 'sale' vacío: todos fallan salvo los que esperan vacío. Comprueba la mecánica."""
    from services import receta_extractor
    monkeypatch.setattr(H, "extraer_historia",
                        lambda texto, db=None, operacion="historia": {"datos": {}})
    monkeypatch.setattr(receta_extractor, "extraer_receta",
                        lambda texto, db=None, operacion="receta": {"items": []})
    r = banco_evaluacion.correr_banco(db, "todos", hay_catalogo=False)
    assert r["casos"] + r["saltados"] == len(banco_evaluacion.casos_de("todos"))
    assert r["saltados"] >= 1                       # el caso que necesita catálogo
    assert r["correctos"] <= r["casos"]
    assert all(d["estado"] in ("ok", "falla", "error", "saltado") for d in r["detalle"])
    assert r["exactitud"] is None or 0 <= r["exactitud"] <= 1


def test_corrida_se_guarda(db, monkeypatch):
    from routers import evaluacion_ia as E
    from services import receta_extractor
    monkeypatch.setattr(H, "extraer_historia", lambda texto, db=None, operacion="historia": {"datos": {}})
    monkeypatch.setattr(receta_extractor, "extraer_receta", lambda texto, db=None, operacion="receta": {"items": []})
    antes = db.query(CorridaEvaluacion).count()
    r = E.correr_banco("receta", db)
    try:
        assert db.query(CorridaEvaluacion).count() == antes + 1
        assert E.listar_corridas(db)[0]["id"] == r["id"]
    finally:
        db.query(CorridaEvaluacion).filter(CorridaEvaluacion.id == r["id"]).delete()
        db.commit()
