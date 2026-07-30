"""Borrar una cuenta de usuario.

Reventaba con un error de base de datos apenas la persona tenía una marcación
de asistencia o un turno asignado — o sea, en cuanto había trabajado. Lo que
se prueba acá es que ahora se pueda borrar Y que no se lleve por delante nada
que no sea suyo.

    cd backend
    python -m pytest tests/test_borrar_usuario.py -v
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from database import SessionLocal
from models import Asistencia


def _crear_vet(client, admin, rol="veterinario"):
    sufijo = uuid.uuid4().hex[:8]
    r = client.post("/api/usuarios/", json={
        "usuario": f"qa_del_{sufijo}",
        "password": "qa1234",
        "nombre": f"QA Borrable {sufijo}",
        "rol": rol,
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _paciente_id(client, admin):
    for cli in client.get("/api/clientes/", headers=admin).json():
        if cli.get("pacientes"):
            return cli["pacientes"][0]["id"]
    raise AssertionError("se necesita al menos una mascota registrada")


def _limpiar(usuario_id):
    """Red de seguridad: si la prueba falla a medias, no dejar la cuenta."""
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM asistencias WHERE usuario_id = :u"), {"u": usuario_id})
        db.execute(text("UPDATE citas SET veterinario_id = NULL WHERE veterinario_id = :u"), {"u": usuario_id})
        db.execute(text("UPDATE historias_clinicas SET veterinario_id = NULL WHERE veterinario_id = :u"), {"u": usuario_id})
        db.execute(text("UPDATE recetas SET veterinario_id = NULL WHERE veterinario_id = :u"), {"u": usuario_id})
        db.execute(text("DELETE FROM usuarios WHERE id = :u"), {"u": usuario_id})
        db.commit()
    finally:
        db.close()


def test_se_puede_borrar_un_usuario_con_asistencias_y_turnos(client, admin):
    """El caso que fallaba: la cuenta tenía historial de trabajo."""
    vet = _crear_vet(client, admin)
    pid = _paciente_id(client, admin)
    try:
        # Le damos una marcación y un turno, como cualquier doctor que trabajó
        db = SessionLocal()
        db.add(Asistencia(usuario_id=vet["id"]))
        db.commit(); db.close()

        cita = client.post("/api/citas/", json={
            "paciente_id": pid,
            "fecha_hora": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            "motivo": "QA borrado de usuario",
            "veterinario_id": vet["id"],
        }, headers=admin)
        assert cita.status_code == 201, cita.text
        cita = cita.json()

        try:
            r = client.delete(f"/api/usuarios/{vet['id']}", headers=admin)
            assert r.status_code == 204, r.text

            # El turno sobrevive, solo queda sin doctor: la agenda es de la clínica
            quedo = client.get(f"/api/citas/{cita['id']}", headers=admin)
            assert quedo.status_code == 200, "el turno no debe borrarse con el doctor"
            assert quedo.json()["veterinario_id"] is None

            # Las marcaciones sí se van: son de esa persona
            db = SessionLocal()
            try:
                assert db.query(Asistencia).filter(Asistencia.usuario_id == vet["id"]).count() == 0
            finally:
                db.close()
        finally:
            client.delete(f"/api/citas/{cita['id']}", headers=admin)
    finally:
        _limpiar(vet["id"])


def test_la_historia_conserva_el_nombre_del_doctor_borrado(client, admin):
    """Una consulta no puede quedar sin autor porque el doctor ya no trabaje acá."""
    vet = _crear_vet(client, admin)
    pid = _paciente_id(client, admin)
    historia_id = None
    try:
        r = client.post(f"/api/pacientes/{pid}/historias/", json={
            "motivo_consulta": "QA autoría tras borrado",
            "veterinario_id": vet["id"],
        }, headers=admin)
        assert r.status_code == 201, r.text
        historia_id = r.json()["id"]
        assert r.json()["veterinario_nombre"] == vet["nombre"]

        assert client.delete(f"/api/usuarios/{vet['id']}", headers=admin).status_code == 204

        despues = client.get(f"/api/pacientes/{pid}/historias/{historia_id}", headers=admin).json()
        assert despues["veterinario_id"] is None
        assert despues["veterinario_nombre"] == vet["nombre"], "se perdió el autor de la consulta"
    finally:
        if historia_id:
            db = SessionLocal()
            try:
                db.execute(text("DELETE FROM historias_clinicas WHERE id = :i"), {"i": historia_id})
                db.commit()
            finally:
                db.close()
        _limpiar(vet["id"])


def test_no_puedes_borrarte_a_ti_misma(client, admin):
    """Cerraría la sesión en el acto y puede dejar el sistema sin administración."""
    yo = next(u for u in client.get("/api/usuarios/", headers=admin).json()
              if u["usuario"] == "qa_admin")
    r = client.delete(f"/api/usuarios/{yo['id']}", headers=admin)
    assert r.status_code == 409
    assert "propia cuenta" in r.json()["detail"]
    # y sigue existiendo
    assert any(u["id"] == yo["id"] for u in client.get("/api/usuarios/", headers=admin).json())


# No hay prueba del guard "único veterinario activo": ejercitarlo obliga a
# desactivar a los doctores reales de la clínica, y si la prueba se corta a
# mitad se quedan sin acceso. Es una regla preexistente y no vale ese riesgo
# mientras las pruebas corran contra la base de producción.
