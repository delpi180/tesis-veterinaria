"""Tests de las métricas de tesis: tiempo de registro y exactitud."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import main
from database import SessionLocal


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def admin(client):
    r = client.post("/api/auth/login", json={"usuario": "admin", "password": "vetlospinos"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ── Lógica de coincidencia para exactitud ────────────────────────────────────

def test_coincide_numerico():
    assert main._coincide("temperatura_c", "39.2", 39.2) is True
    assert main._coincide("temperatura_c", "39.2", 38.0) is False


def test_coincide_cerrado():
    assert main._coincide("mucosas", "palidas", "palidas") is True
    assert main._coincide("mucosas", "pálidas", "palidas") is True   # normaliza acentos
    assert main._coincide("mucosas", "rosadas", "palidas") is False


def test_coincide_texto_solapamiento():
    assert main._coincide("motivo_consulta", "vómitos y diarrea", "vomitos y diarrea aguda") is True
    assert main._coincide("motivo_consulta", "cojera", "vómitos") is False


def test_vacio():
    assert main._vacio(None) and main._vacio("") and main._vacio([])
    assert not main._vacio("algo")


# ── Endpoint de tiempos ──────────────────────────────────────────────────────

def test_metricas_tiempo(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli or not cli[0]["pacientes"]:
        pytest.skip("Sin pacientes para probar")
    pid = cli[0]["pacientes"][0]["id"]

    ids = []
    try:
        # una historia manual (lenta) y una con IA (rápida)
        h1 = client.post(f"/api/pacientes/{pid}/historias/", json={
            "motivo_consulta": "test manual", "segundos_registro": 300, "metodo_registro": "manual",
        }, headers=admin).json()
        h2 = client.post(f"/api/pacientes/{pid}/historias/", json={
            "motivo_consulta": "test ia", "segundos_registro": 90, "metodo_registro": "ia",
        }, headers=admin).json()
        ids = [h1["id"], h2["id"]]

        r = client.get("/api/encuestas/tiempos", headers=admin)
        assert r.status_code == 200
        d = r.json()
        assert d["manual"]["n"] >= 1 and d["ia"]["n"] >= 1
        # con 300 manual y 90 IA, el ahorro debe ser positivo
        assert d["ahorro_pct"] is not None and d["ahorro_pct"] > 0
    finally:
        db = SessionLocal()
        for hid in ids:
            db.execute(text("DELETE FROM historias_clinicas WHERE id=:h"), {"h": hid})
        db.commit(); db.close()


# ── Próxima cita → genera turno en la agenda ─────────────────────────────────

def test_proxima_cita_genera_turno(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli or not cli[0]["pacientes"]:
        pytest.skip("Sin pacientes para probar")
    pid = cli[0]["pacientes"][0]["id"]

    hid = None
    try:
        antes = len(client.get(f"/api/citas/?paciente_id={pid}", headers=admin).json())
        h = client.post(f"/api/pacientes/{pid}/historias/", json={
            "motivo_consulta": "test cita", "proxima_cita": "2026-12-20T10:30:00",
        }, headers=admin).json()
        hid = h["id"]
        citas = client.get(f"/api/citas/?paciente_id={pid}", headers=admin).json()
        assert len(citas) == antes + 1
        nueva = [c for c in citas if c["fecha_hora"].startswith("2026-12-20")]
        assert nueva and nueva[0]["estado"] == "pendiente"
    finally:
        db = SessionLocal()
        if hid:
            db.execute(text("DELETE FROM citas WHERE notas LIKE :n"), {"n": f"%historia clínica #{hid}%"})
            db.execute(text("DELETE FROM historias_clinicas WHERE id=:h"), {"h": hid})
        db.commit(); db.close()
