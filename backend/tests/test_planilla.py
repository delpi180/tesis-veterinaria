"""Planilla del personal: cálculo, permisos y cierre.

    cd backend
    python -m pytest tests/test_planilla.py -v
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import text

from database import SessionLocal
from services import planilla as svc


# ── Cálculo ──────────────────────────────────────────────────────────────────

def test_descuentos_por_tardanza_y_faltas():
    # 3000 / 30 = 100 por día; /8/60 = 0.2083 por minuto
    r = svc.calcular_linea(3000, minutos_tardanza=48, faltas=1, bonos=100,
                           adelantos=200, otros_descuentos=50)
    assert r["descuento_tardanza"] == Decimal("10.00")
    assert r["descuento_faltas"] == Decimal("100.00")
    assert r["total_ingresos"] == Decimal("3100.00")
    assert r["total_descuentos"] == Decimal("360.00")
    assert r["neto"] == Decimal("2740.00")


def test_sin_novedades_el_neto_es_el_sueldo():
    assert svc.calcular_linea(1500, 0, 0)["neto"] == Decimal("1500.00")


def test_redondeo_a_centimos():
    r = svc.calcular_linea(1025.50, 7, 0)
    assert r["descuento_tardanza"] == Decimal("0.50")   # 7 min × 0.07122


def test_periodo_invalido():
    for malo in ("2026-13", "octubre", "2026"):
        with pytest.raises(ValueError):
            svc.rango_del_mes(malo)
    assert svc.rango_del_mes("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))


# ── Asistencia → planilla ────────────────────────────────────────────────────

@pytest.fixture()
def trabajador(client, admin):
    """qa_doc con sueldo, horario lun-vie 08:00 y marcaciones de un mes pasado."""
    db = SessionLocal()
    try:
        u = db.execute(text("SELECT id FROM usuarios WHERE usuario='qa_doc'")).scalar()
        db.execute(text("UPDATE usuarios SET hora_entrada='08:00', "
                        "dias_laborales='lun,mar,mie,jue,vie' WHERE id=:i"), {"i": u})
        db.execute(text("DELETE FROM asistencias WHERE usuario_id=:i"), {"i": u})
        db.commit()
    finally:
        db.close()
    r = client.put(f"/api/planilla/personal/{u}", headers=admin, json={"sueldo_base": 3000})
    assert r.status_code == 200
    yield u
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM asistencias WHERE usuario_id=:i"), {"i": u})
        db.execute(text("UPDATE usuarios SET sueldo_base=NULL WHERE id=:i"), {"i": u})
        db.commit()
    finally:
        db.close()


def _marcar(usuario_id, dia: date, hh: int, mm: int):
    """Marcación de ingreso a la hora de Lima indicada (UTC-5)."""
    db = SessionLocal()
    try:
        ingreso = datetime(dia.year, dia.month, dia.day, hh + 5, mm, tzinfo=timezone.utc)
        db.execute(text("INSERT INTO asistencias (usuario_id, fecha, hora_ingreso, creado_en) "
                        "VALUES (:u, :f, :h, now())"), {"u": usuario_id, "f": dia, "h": ingreso})
        db.commit()
    finally:
        db.close()


def test_planilla_completa_con_cierre(client, admin, doctor, trabajador):
    periodo = "2025-03"          # marzo 2025: 21 días laborables lun-vie
    # Se marcan 20 de 21 días; uno con 30 min de tardanza
    d, marcados = date(2025, 3, 1), 0
    while d.month == 3:
        if d.weekday() < 5:
            if marcados < 20:
                _marcar(trabajador, d, 8, 30 if marcados == 3 else 0)
                marcados += 1
        d += timedelta(days=1)

    # Solo la administradora
    assert client.get("/api/planilla/", headers=doctor).status_code == 403
    assert client.post("/api/planilla/", headers=doctor, json={"periodo": periodo}).status_code == 403
    assert client.put(f"/api/planilla/personal/{trabajador}", headers=doctor,
                      json={"sueldo_base": 1}).status_code == 403

    assert client.post("/api/planilla/", headers=admin, json={"periodo": "2025-13"}).status_code == 422
    r = client.post("/api/planilla/", headers=admin, json={"periodo": periodo})
    assert r.status_code == 201, r.text
    try:
        linea = next(l for l in r.json()["lineas"] if l["usuario_id"] == trabajador)
        assert linea["minutos_tardanza"] == 30 and linea["faltas"] == 1
        assert linea["descuento_faltas"] == 100.0 and linea["descuento_tardanza"] == 6.25
        assert linea["neto"] == 2893.75
        assert client.post("/api/planilla/", headers=admin, json={"periodo": periodo}).status_code == 409

        # Corrección manual: era feriado, no falta; y un bono
        e = client.put(f"/api/planilla/{periodo}/lineas/{linea['id']}", headers=admin,
                       json={"faltas": 0, "bonos": 150, "nota": "Feriado"})
        assert e.status_code == 200
        l2 = next(l for l in e.json()["lineas"] if l["id"] == linea["id"])
        assert l2["faltas"] == 0 and l2["neto"] == 3143.75   # 3000 + 150 - 6.25

        # Releer la asistencia no pisa lo corregido a mano
        a = client.post(f"/api/planilla/{periodo}/actualizar-asistencia", headers=admin).json()
        l3 = next(l for l in a["lineas"] if l["id"] == linea["id"])
        assert l3["faltas"] == 0 and l3["faltas_auto"] == 1

        # Cierre: ya no se toca
        c = client.post(f"/api/planilla/{periodo}/cerrar", headers=admin)
        assert c.status_code == 200 and c.json()["estado"] == "cerrada"
        assert client.put(f"/api/planilla/{periodo}/lineas/{linea['id']}", headers=admin,
                          json={"bonos": 1}).status_code == 409
        assert client.delete(f"/api/planilla/{periodo}", headers=admin).status_code == 409
        # y el sueldo que cambie después no altera la planilla cerrada
        client.put(f"/api/planilla/personal/{trabajador}", headers=admin, json={"sueldo_base": 9999})
        again = client.get(f"/api/planilla/{periodo}", headers=admin).json()
        assert next(l for l in again["lineas"] if l["id"] == linea["id"])["sueldo_base"] == 3000.0
    finally:
        db = SessionLocal()
        try:
            db.execute(text("DELETE FROM planillas WHERE periodo=:p"), {"p": periodo})
            db.commit()
        finally:
            db.close()


def test_el_borrador_se_puede_descartar(client, admin, trabajador):
    r = client.post("/api/planilla/", headers=admin, json={"periodo": "2025-04"})
    assert r.status_code == 201
    assert client.delete("/api/planilla/2025-04", headers=admin).status_code == 204
    assert client.get("/api/planilla/2025-04", headers=admin).status_code == 404
