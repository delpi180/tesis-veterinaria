"""Varios doctores atendiendo a la misma hora.

Es una clínica, no un consultorio: dos o tres veterinarios comparten horario y
atienden en paralelo. Lo que no puede pasar es que UN doctor quede con dos
turnos encima a la misma hora.

    cd backend
    python -m pytest tests/test_agenda_simultanea.py -v
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from database import SessionLocal


def _tres_doctores(client, admin):
    doctores = client.get("/api/usuarios/doctores", headers=admin).json()
    assert len(doctores) >= 3, "esta prueba necesita al menos 3 veterinarios activos"
    return doctores[:3]


def _pacientes(client, admin, cuantos):
    encontrados = []
    for cli in client.get("/api/clientes/", headers=admin).json():
        for p in cli.get("pacientes", []):
            encontrados.append(p["id"])
            if len(encontrados) == cuantos:
                return encontrados
    raise AssertionError(f"se necesitan {cuantos} mascotas registradas")


def _borrar_citas(ids):
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM citas WHERE id = ANY(:ids)"), {"ids": list(ids)})
        db.commit()
    finally:
        db.close()


def test_tres_doctores_pueden_atender_a_la_misma_hora(client, admin):
    """El caso normal de una clínica con varios consultorios."""
    doctores = _tres_doctores(client, admin)
    pacientes = _pacientes(client, admin, 3)
    # Una hora futura poco probable de chocar con la agenda real
    cuando = (datetime.now(timezone.utc) + timedelta(days=400)).replace(
        hour=14, minute=0, second=0, microsecond=0)

    creadas = []
    try:
        for doc, pac in zip(doctores, pacientes):
            r = client.post("/api/citas/", json={
                "paciente_id": pac,
                "fecha_hora": cuando.isoformat(),
                "motivo": f"QA agenda simultánea {uuid.uuid4().hex[:6]}",
                "veterinario_id": doc["id"],
            }, headers=admin)
            assert r.status_code == 201, (
                f"el doctor {doc['nombre']} no pudo tomar la misma hora: {r.text}")
            creadas.append(r.json()["id"])

        assert len(creadas) == 3
    finally:
        _borrar_citas(creadas)


def test_un_mismo_doctor_no_se_duplica_en_la_misma_hora(client, admin):
    """La otra cara: el choque que sí hay que impedir."""
    doc = _tres_doctores(client, admin)[0]
    pacientes = _pacientes(client, admin, 2)
    cuando = (datetime.now(timezone.utc) + timedelta(days=401)).replace(
        hour=11, minute=30, second=0, microsecond=0)

    creadas = []
    try:
        r1 = client.post("/api/citas/", json={
            "paciente_id": pacientes[0], "fecha_hora": cuando.isoformat(),
            "motivo": "QA choque 1", "veterinario_id": doc["id"],
        }, headers=admin)
        assert r1.status_code == 201, r1.text
        creadas.append(r1.json()["id"])

        r2 = client.post("/api/citas/", json={
            "paciente_id": pacientes[1], "fecha_hora": cuando.isoformat(),
            "motivo": "QA choque 2", "veterinario_id": doc["id"],
        }, headers=admin)
        assert r2.status_code == 409
    finally:
        _borrar_citas(creadas)


def test_la_proxima_cita_de_una_consulta_no_duplica_al_doctor(client, admin):
    """La 'próxima cita' de la historia agenda un turno sola.

    Ese camino no pasaba por el control de choque, así que podía dejar al
    doctor con dos turnos a la misma hora — justo lo que el alta manual
    impide. Ahora el turno se crea igual (la consulta nunca debe fallar por
    un tema de agenda) pero sin doctor asignado, para que recepción lo ubique.
    """
    doc = _tres_doctores(client, admin)[0]
    pacientes = _pacientes(client, admin, 2)
    cuando = (datetime.now(timezone.utc) + timedelta(days=402)).replace(
        hour=16, minute=0, second=0, microsecond=0)

    creadas, historia_id = [], None
    try:
        r1 = client.post("/api/citas/", json={
            "paciente_id": pacientes[0], "fecha_hora": cuando.isoformat(),
            "motivo": "QA ocupa el horario", "veterinario_id": doc["id"],
        }, headers=admin)
        assert r1.status_code == 201, r1.text
        creadas.append(r1.json()["id"])

        # Consulta de OTRA mascota que programa control a esa misma hora
        r2 = client.post(f"/api/pacientes/{pacientes[1]}/historias/", json={
            "motivo_consulta": "QA próxima cita en horario ocupado",
            "proxima_cita": cuando.isoformat(),
            "veterinario_id": doc["id"],
        }, headers=admin)
        assert r2.status_code == 201, "guardar la consulta no puede fallar por la agenda"
        historia_id = r2.json()["id"]

        db = SessionLocal()
        try:
            fila = db.execute(text("""
                SELECT id, veterinario_id FROM citas
                WHERE paciente_id = :p AND fecha_hora = :f
            """), {"p": pacientes[1], "f": cuando}).first()
        finally:
            db.close()
        assert fila is not None, "el turno de control debe agendarse igual"
        creadas.append(fila[0])
        assert fila[1] is None, "el doctor quedó con dos turnos a la misma hora"
    finally:
        _borrar_citas(creadas)
        if historia_id:
            db = SessionLocal()
            try:
                db.execute(text("DELETE FROM historias_clinicas WHERE id = :i"), {"i": historia_id})
                db.commit()
            finally:
                db.close()
