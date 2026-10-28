"""
Recordatorio de cita: anotar que ya se le avisó al dueño, para no escribirle dos veces.

    cd backend
    DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo python -m pytest tests/test_recordatorio_cita.py -v
"""
from datetime import timedelta

from sqlalchemy import text

from core.tiempo import hoy_peru
from database import SessionLocal


def _limpiar(cli, pac):
    db = SessionLocal()
    db.execute(text("DELETE FROM citas WHERE paciente_id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": pac["id"]})
    db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cli["id"]})
    db.commit(); db.close()


def _cita(client, admin, dni, dia):
    cli = client.post("/api/clientes/", json={"nombre": "QA Recordatorio", "dni": dni}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", json={"nombre": "QA Recordada", "especie": "Canino"}, headers=admin).json()
    cita = client.post("/api/citas/", json={
        "paciente_id": pac["id"], "fecha_hora": f"{dia.isoformat()}T10:00:00-05:00", "motivo": "Control",
    }, headers=admin).json()
    return cli, pac, cita


def test_marcar_y_deshacer_el_recordatorio(client, admin):
    cli, pac, cita = _cita(client, admin, "60033001", hoy_peru() + timedelta(days=1))
    try:
        assert cita["recordado_en"] is None

        r = client.post(f"/api/citas/{cita['id']}/recordado", headers=admin)
        assert r.status_code == 200 and r.json()["recordado_en"] is not None
        primera = r.json()["recordado_en"]

        # Doble clic o dos pestañas: no es error y no cambia la hora del primer aviso
        r2 = client.post(f"/api/citas/{cita['id']}/recordado", headers=admin)
        assert r2.status_code == 200 and r2.json()["recordado_en"] == primera

        d = client.delete(f"/api/citas/{cita['id']}/recordado", headers=admin)
        assert d.status_code == 200 and d.json()["recordado_en"] is None
    finally:
        _limpiar(cli, pac)


def test_reprogramar_la_cita_borra_el_aviso(client, admin):
    cli, pac, cita = _cita(client, admin, "60033002", hoy_peru() + timedelta(days=1))
    try:
        client.post(f"/api/citas/{cita['id']}/recordado", headers=admin)

        # Cambiar solo el motivo no es otro recordatorio
        r = client.put(f"/api/citas/{cita['id']}", json={"motivo": "Control y vacuna"}, headers=admin)
        assert r.json()["recordado_en"] is not None

        # Cambiar el día sí: el dueño tiene que enterarse de la nueva fecha
        nueva = (hoy_peru() + timedelta(days=3)).isoformat() + "T10:00:00-05:00"
        r = client.put(f"/api/citas/{cita['id']}", json={"fecha_hora": nueva}, headers=admin)
        assert r.status_code == 200 and r.json()["recordado_en"] is None
    finally:
        _limpiar(cli, pac)


def test_recordar_cita_inexistente_es_404(client, admin):
    assert client.post("/api/citas/999999999/recordado", headers=admin).status_code == 404
    assert client.delete("/api/citas/999999999/recordado", headers=admin).status_code == 404
