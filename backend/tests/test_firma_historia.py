"""Firmar y bloquear la consulta; las correcciones van como notas.

    cd backend
    python -m pytest tests/test_firma_historia.py -v
"""
import uuid

import pytest


@pytest.fixture()
def consulta(client, admin, doctor):
    """Una consulta recién creada, atendida por qa_doc."""
    dni = f"9{uuid.uuid4().int % 10_000_000:07d}"
    cli = client.post("/api/clientes/", json={"nombre": "Dueño Firma", "dni": dni},
                      headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": "Firma", "especie": "Canino"}, headers=admin).json()
    vet = next(d for d in client.get("/api/usuarios/doctores", headers=admin).json()
               if d["nombre"] == "QA Doctor")
    h = client.post(f"/api/pacientes/{pac['id']}/historias/", headers=doctor, json={
        "motivo_consulta": "Prueba de firma", "veterinario_id": vet["id"]}).json()
    yield pac["id"], h["id"]
    client.delete(f"/api/clientes/{cli['id']}", headers=admin)


def _url(pid, hid, sufijo=""):
    return f"/api/pacientes/{pid}/historias/{hid}{sufijo}"


def test_firmar_bloquea_edicion_y_borrado(client, doctor, consulta):
    pid, hid = consulta
    r = client.post(_url(pid, hid, "/firmar"), headers=doctor)
    assert r.status_code == 200, r.text
    h = r.json()
    assert h["firmada"] is True and h["cerrada_por"] == "QA Doctor" and h["cerrada_en"]

    edit = client.put(_url(pid, hid), json={"motivo_consulta": "cambiado"}, headers=doctor)
    assert edit.status_code == 409 and "nota de corrección" in edit.json()["detail"]
    assert client.delete(_url(pid, hid), headers=doctor).status_code == 409
    # y no se vuelve a firmar
    assert client.post(_url(pid, hid, "/firmar"), headers=doctor).status_code == 409
    assert client.get(_url(pid, hid), headers=doctor).json()["motivo_consulta"] == "Prueba de firma"


def test_la_recepcion_no_firma(client, admin, consulta):
    pid, hid = consulta
    assert client.post(_url(pid, hid, "/firmar"), headers=admin).status_code == 403


def test_la_recepcion_no_firmada_si_puede_editar(client, admin, consulta):
    pid, hid = consulta
    r = client.put(_url(pid, hid), json={"motivo_consulta": "ajustado"}, headers=admin)
    assert r.status_code == 200 and r.json()["firmada"] is False


def test_nota_de_correccion_solo_tras_firmar_y_solo_veterinario(client, admin, doctor, consulta):
    pid, hid = consulta
    nota = {"texto": "El peso correcto era 12.5 kg."}
    # antes de firmar no corresponde
    assert client.post(_url(pid, hid, "/addendum"), json=nota, headers=doctor).status_code == 409
    client.post(_url(pid, hid, "/firmar"), headers=doctor)
    assert client.post(_url(pid, hid, "/addendum"), json=nota, headers=admin).status_code == 403
    assert client.post(_url(pid, hid, "/addendum"), json={"texto": "x"}, headers=doctor).status_code == 422

    r = client.post(_url(pid, hid, "/addendum"), json=nota, headers=doctor)
    assert r.status_code == 201, r.text
    notas = r.json()["addendums"]
    assert len(notas) == 1 and notas[0]["autor_nombre"] == "QA Doctor"
    # el original sigue intacto
    assert r.json()["motivo_consulta"] == "Prueba de firma"
