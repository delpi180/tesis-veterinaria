"""Control de tratamientos.

Lo indicado en una consulta se escribía y se olvidaba: no había forma de saber
qué mascotas están medicadas hoy, cuáles terminan esta semana ni cuáles
terminaron sin que el dueño volviera. Esto último es lo que se cae entre las
sillas en una clínica.

    cd backend
    python -m pytest tests/test_tratamientos.py -v
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from database import SessionLocal


@pytest.fixture(scope="module")
def paciente(client, admin):
    r = client.post("/api/clientes/", json={
        "dni": "90000010", "nombre": "QA Dueño Tratamientos", "telefono": "555111",
    }, headers=admin)
    assert r.status_code == 201, r.text
    cliente_id = r.json()["id"]
    p = client.post(f"/api/clientes/{cliente_id}/pacientes/", json={
        "nombre": "QATratamiento", "especie": "Canino",
    }, headers=admin)
    assert p.status_code == 201, p.text
    paciente_id = p.json()["id"]

    yield paciente_id

    db = SessionLocal()
    try:
        for tabla in ("tratamientos", "documentos_paciente", "registros_clinicos",
                      "historias_clinicas", "citas"):
            db.execute(text(f"DELETE FROM {tabla} WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.commit()
    finally:
        db.close()


def _vet(client, admin):
    return client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]


def _mios(client, admin, paciente):
    return client.get(f"/api/tratamientos/?paciente_id={paciente}", headers=admin).json()


def test_guardar_la_consulta_crea_los_tratamientos(client, admin, paciente):
    """El medicamento escrito en la historia pasa a ser algo seguible."""
    r = client.post(f"/api/pacientes/{paciente}/historias/", json={
        "veterinario_id": _vet(client, admin),
        "motivo_consulta": "QA tratamiento",
        "tratamiento_items": [
            {"medicamento": "Metronidazol", "dosis": "15 mg/kg", "via": "Oral",
             "frecuencia": "c/12h", "duracion_dias": 5},
            {"medicamento": "Omeprazol"},          # sin duración: caso real
        ],
    }, headers=admin)
    assert r.status_code == 201, r.text

    items = {t["medicamento"]: t for t in _mios(client, admin, paciente)}
    assert set(items) == {"Metronidazol", "Omeprazol"}

    metro = items["Metronidazol"]
    assert metro["estado"] == "en_curso"
    assert metro["dias"] == 5
    # El último día cuenta: 5 días desde hoy terminan dentro de 4.
    assert metro["fin"] == (date.today() + timedelta(days=4)).isoformat()
    assert metro["dias_restantes"] == 4
    assert metro["telefono"], "recepción necesita a quién llamar"

    # Sin duración no se puede fingir que sigue en curso para siempre: se
    # marca aparte para que alguien lo complete.
    assert items["Omeprazol"]["estado"] == "sin_duracion"
    assert items["Omeprazol"]["fin"] is None


def test_la_fecha_de_fin_se_cuenta_desde_la_atencion_no_desde_hoy(client, admin, paciente):
    """Digitalizar una consulta vieja no reinicia el tratamiento."""
    hace_diez = date.today() - timedelta(days=10)
    r = client.post(f"/api/pacientes/{paciente}/historias/", json={
        "fecha": hace_diez.isoformat(),
        "veterinario_id": _vet(client, admin),
        "tratamiento_items": [{"medicamento": "Amoxicilina QA", "duracion_dias": 3}],
    }, headers=admin)
    assert r.status_code == 201, r.text

    t = next(x for x in _mios(client, admin, paciente) if x["medicamento"] == "Amoxicilina QA")
    assert t["inicio"] == hace_diez.isoformat()
    assert t["fin"] == (hace_diez + timedelta(days=2)).isoformat()
    assert t["estado"] == "terminado", "ya pasó su fecha de fin"
    # Esta mascota SÍ volvió (tiene una consulta de hoy), así que no está sin
    # control aunque el tratamiento haya terminado. Es la mitad interesante:
    # la alerta no puede saltar por el simple paso del tiempo.
    assert t["sin_control"] is False


def test_el_que_termino_y_no_volvio_queda_marcado(client, admin, paciente):
    """La alerta que justifica la pantalla: terminó el tratamiento, nadie volvió."""
    cliente_id = client.get(f"/api/pacientes/{paciente}", headers=admin).json()["cliente_id"]
    p = client.post(f"/api/clientes/{cliente_id}/pacientes/", json={
        "nombre": "QASinControl", "especie": "Canino",
    }, headers=admin)
    assert p.status_code == 201, p.text
    otro = p.json()["id"]
    try:
        hace_veinte = date.today() - timedelta(days=20)
        r = client.post(f"/api/pacientes/{otro}/historias/", json={
            "fecha": hace_veinte.isoformat(),
            "veterinario_id": _vet(client, admin),
            "tratamiento_items": [{"medicamento": "Enrofloxacina QA", "duracion_dias": 7}],
        }, headers=admin)
        assert r.status_code == 201, r.text

        t = client.get(f"/api/tratamientos/?paciente_id={otro}", headers=admin).json()[0]
        assert t["estado"] == "terminado"
        assert t["sin_control"] is True

        # En cuanto se le agenda un control, deja de estar en la lista de llamadas
        cita = client.post("/api/citas/", json={
            "paciente_id": otro,
            "fecha_hora": f"{(date.today() + timedelta(days=1)).isoformat()}T10:00:00",
            "motivo": "Control QA",
        }, headers=admin)
        assert cita.status_code == 201, cita.text
        t2 = client.get(f"/api/tratamientos/?paciente_id={otro}", headers=admin).json()[0]
        assert t2["sin_control"] is False
    finally:
        client.delete(f"/api/pacientes/{otro}", headers=admin)


def test_suspender_exige_motivo_y_corta_hoy(client, admin, paciente):
    t = next(x for x in _mios(client, admin, paciente) if x["medicamento"] == "Metronidazol")

    sin_motivo = client.put(f"/api/tratamientos/{t['id']}", json={"estado": "suspendido"}, headers=admin)
    assert sin_motivo.status_code == 422, "suspender sin decir por qué no sirve de registro"

    r = client.put(f"/api/tratamientos/{t['id']}", json={
        "estado": "suspendido", "motivo": "Vómitos tras la primera dosis",
    }, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "suspendido"
    assert r.json()["fin"] == date.today().isoformat(), "un tratamiento cortado termina hoy"
    assert r.json()["motivo_corte"] == "Vómitos tras la primera dosis"


def test_corregir_la_consulta_no_reabre_lo_que_se_suspendio(client, admin, paciente):
    """Editar una falta de ortografía no puede revivir lo que el doctor cortó."""
    historias = client.get(f"/api/pacientes/{paciente}/historias/", headers=admin).json()
    h = next(x for x in historias if any(
        (i.get("medicamento") or "") == "Metronidazol" for i in (x.get("tratamiento_items") or [])))

    r = client.put(f"/api/pacientes/{paciente}/historias/{h['id']}", json={
        "motivo_consulta": "QA tratamiento (corregido)",
        "tratamiento_items": h["tratamiento_items"],
    }, headers=admin)
    assert r.status_code == 200, r.text

    metro = next(x for x in _mios(client, admin, paciente) if x["medicamento"] == "Metronidazol")
    assert metro["estado"] == "suspendido"
    assert metro["motivo_corte"] == "Vómitos tras la primera dosis"


def test_reabrir_deshace_un_cierre_por_error(client, admin, paciente):
    metro = next(x for x in _mios(client, admin, paciente) if x["medicamento"] == "Metronidazol")
    r = client.post(f"/api/tratamientos/{metro['id']}/reabrir", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] in ("en_curso", "terminado")
    assert r.json()["motivo_corte"] is None


def test_borrar_la_consulta_se_lleva_sus_tratamientos(client, admin, paciente):
    """No pueden quedar tratamientos huérfanos de una consulta que ya no existe."""
    historias = client.get(f"/api/pacientes/{paciente}/historias/", headers=admin).json()
    h = next(x for x in historias if any(
        (i.get("medicamento") or "") == "Amoxicilina QA" for i in (x.get("tratamiento_items") or [])))
    assert client.delete(f"/api/pacientes/{paciente}/historias/{h['id']}", headers=admin).status_code == 204

    assert not any(x["medicamento"] == "Amoxicilina QA" for x in _mios(client, admin, paciente))


def test_el_resumen_cuenta_lo_de_la_clinica(client, admin, paciente):
    r = client.get("/api/tratamientos/resumen", headers=admin)
    assert r.status_code == 200, r.text
    datos = r.json()
    assert set(datos) == {"en_curso", "terminan_semana", "sin_control", "sin_duracion"}
    assert all(isinstance(v, int) and v >= 0 for v in datos.values())
