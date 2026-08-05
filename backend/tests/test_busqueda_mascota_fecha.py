"""Buscar por nombre de mascota y fechar consultas hacia atrás.

Dos cosas que se piden en el mostrador todos los días:

1. En recepción se pregunta por el animal ("vengo con Pepita"), no por el DNI
   del dueño. Como hay varias Pepitas, la búsqueda tiene que devolverlas todas
   con su propietario al lado para poder distinguirlas.
2. Una consulta se digitaliza días después, o se registra con la fecha mal
   puesta. La historia debe poder fecharse hacia atrás y corregirse, sin que
   por eso se pueda inventar una consulta futura.

    cd backend
    python -m pytest tests/test_busqueda_mascota_fecha.py -v
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from database import SessionLocal


@pytest.fixture(scope="module")
def duenos_con_pepita(client, admin):
    """Dos dueños distintos, cada uno con una mascota del mismo nombre."""
    creados = []
    for i, dni in enumerate(("90000001", "90000002")):
        r = client.post("/api/clientes/", json={
            "dni": dni, "nombre": f"QA Dueño Pepita {i}", "telefono": "555000{}".format(i),
        }, headers=admin)
        assert r.status_code == 201, r.text
        cliente_id = r.json()["id"]
        p = client.post(f"/api/clientes/{cliente_id}/pacientes/", json={
            "nombre": "QAPepita", "especie": "Canino", "raza": "Criollo",
        }, headers=admin)
        assert p.status_code == 201, p.text
        creados.append((cliente_id, p.json()["id"]))

    yield creados

    db = SessionLocal()
    try:
        for cliente_id, paciente_id in creados:
            db.execute(text("DELETE FROM historias_clinicas WHERE paciente_id = :p"), {"p": paciente_id})
            db.execute(text("DELETE FROM citas WHERE paciente_id = :p"), {"p": paciente_id})
            db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": paciente_id})
            db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.commit()
    finally:
        db.close()


# ── Búsqueda por nombre de mascota ───────────────────────────────────────────

def test_buscar_por_mascota_devuelve_todas_con_su_dueno(client, admin, duenos_con_pepita):
    r = client.get("/api/pacientes/buscar?q=QAPepita", headers=admin)
    assert r.status_code == 200, r.text
    encontradas = {m["id"]: m for m in r.json()}

    for cliente_id, paciente_id in duenos_con_pepita:
        assert paciente_id in encontradas, "falta una de las mascotas homónimas"
        m = encontradas[paciente_id]
        # El dueño viaja con la mascota: sin él no se puede elegir cuál es
        assert m["cliente_id"] == cliente_id
        assert m["propietario"], "la mascota debe traer el nombre de su dueño"
        assert m["propietario_dni"]


def test_buscar_clientes_por_nombre_de_mascota_cuadra_con_el_contador(client, admin, duenos_con_pepita):
    """La tabla de dueños y el contador de la paginación filtran igual."""
    lista = client.get("/api/clientes/?q=QAPepita", headers=admin).json()
    total = client.get("/api/clientes/contar?q=QAPepita", headers=admin).json()["total"]
    assert len(lista) == 2
    assert total == 2


# ── Fecha de la consulta ─────────────────────────────────────────────────────

def test_historia_puede_registrarse_con_fecha_pasada(client, admin, duenos_con_pepita):
    """Digitalizar una consulta de papel de hace un mes."""
    _, paciente_id = duenos_con_pepita[0]
    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    hace_un_mes = datetime.now(timezone.utc) - timedelta(days=30)

    r = client.post(f"/api/pacientes/{paciente_id}/historias/", json={
        "fecha": hace_un_mes.isoformat(),
        "motivo_consulta": "Consulta digitalizada desde papel",
        "veterinario_id": vet,
    }, headers=admin)
    assert r.status_code == 201, r.text
    h = r.json()
    assert datetime.fromisoformat(h["fecha"]).date() == hace_un_mes.date()
    # La fecha de tecleo queda aparte: son dos datos distintos del registro
    assert datetime.fromisoformat(h["creado_en"]).date() != hace_un_mes.date()

    # Y se puede corregir después
    nueva = hace_un_mes - timedelta(days=5)
    r2 = client.put(f"/api/pacientes/{paciente_id}/historias/{h['id']}", json={
        "fecha": nueva.isoformat(),
    }, headers=admin)
    assert r2.status_code == 200, r2.text
    assert datetime.fromisoformat(r2.json()["fecha"]).date() == nueva.date()


def test_una_historia_sin_fecha_queda_con_la_de_hoy(client, admin, duenos_con_pepita):
    _, paciente_id = duenos_con_pepita[0]
    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    r = client.post(f"/api/pacientes/{paciente_id}/historias/", json={
        "motivo_consulta": "Consulta del momento",
        "veterinario_id": vet,
    }, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["fecha"] is not None


def test_no_se_puede_fechar_una_consulta_en_el_futuro(client, admin, duenos_con_pepita):
    """Una consulta que todavía no ocurrió es un turno, no una historia."""
    _, paciente_id = duenos_con_pepita[0]
    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    futuro = datetime.now(timezone.utc) + timedelta(days=15)
    r = client.post(f"/api/pacientes/{paciente_id}/historias/", json={
        "fecha": futuro.isoformat(),
        "motivo_consulta": "Consulta imposible",
        "veterinario_id": vet,
    }, headers=admin)
    assert r.status_code == 422, r.text


def test_el_historial_se_ordena_por_fecha_de_atencion(client, admin, duenos_con_pepita):
    """Una consulta vieja digitalizada hoy cae en su lugar, no arriba de todo."""
    _, paciente_id = duenos_con_pepita[0]
    historias = client.get(f"/api/pacientes/{paciente_id}/historias/", headers=admin).json()
    fechas = [datetime.fromisoformat(h["fecha"]) for h in historias]
    assert fechas == sorted(fechas, reverse=True)
