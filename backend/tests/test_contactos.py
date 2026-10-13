"""A quién llamar hoy: pendientes, mensajes y registro de contactos.

    cd backend
    python -m pytest tests/test_contactos.py -v
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from services import contactos as svc


# ── Reglas puras ─────────────────────────────────────────────────────────────

def test_telefono_whatsapp_solo_celulares_peruanos():
    assert svc.telefono_whatsapp("987 654 321") == "51987654321"
    assert svc.telefono_whatsapp("+51 987654321") == "51987654321"
    assert svc.telefono_whatsapp("044-123456") is None       # fijo
    assert svc.telefono_whatsapp("98765") is None             # incompleto
    assert svc.telefono_whatsapp(None) is None


def test_mensaje_no_revienta_con_marcadores_desconocidos():
    t = svc.armar_mensaje("Hola {dueno}, {mascota} {inventado}", dueno="Ana", mascota="Luna")
    assert t == "Hola Ana, Luna {inventado}"


# ── Flujo completo ───────────────────────────────────────────────────────────

@pytest.fixture()
def escenario(client, admin, doctor):
    dni = f"9{uuid.uuid4().int % 10_000_000:07d}"
    cli = client.post("/api/clientes/", headers=admin, json={
        "nombre": "Ana Contacto", "dni": dni, "telefono": "987654321"}).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=admin,
                      json={"nombre": "Luna", "especie": "Canino"}).json()
    vet = next(d for d in client.get("/api/usuarios/doctores", headers=admin).json()
               if d["nombre"] == "QA Doctor")
    hace5 = (datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat()
    h = client.post(f"/api/pacientes/{pac['id']}/historias/", headers=doctor, json={
        "motivo_consulta": "Vacunación", "veterinario_id": vet["id"],
        "vacunas_items": [{"vacuna": "Antirrábica", "proxima_dosis": hace5}],
    })
    assert h.status_code == 201, h.text
    yield cli, pac, hace5
    client.delete(f"/api/clientes/{cli['id']}", headers=admin)


def _mi_pendiente(client, admin, cli_id):
    d = client.get("/api/contactos/pendientes", headers=admin).json()
    return d, [p for p in d["items"] if p["cliente_id"] == cli_id]


def test_vacuna_vencida_aparece_con_mensaje_y_se_cierra_al_contactar(client, admin, escenario):
    cli, pac, prox = escenario
    d, mios = _mi_pendiente(client, admin, cli["id"])
    assert len(mios) == 1
    p = mios[0]
    assert p["motivo"] == "vacuna" and p["urgente"] is True
    assert p["wa"] == "51987654321" and p["contactado"] is False
    assert "Ana Contacto" in p["mensaje"] and "Luna" in p["mensaje"] and "Antirrábica" in p["mensaje"]
    assert d["resumen"]["vacuna"] >= 1

    base = {"cliente_id": cli["id"], "paciente_id": pac["id"], "motivo": "vacuna",
            "clave": p["clave"], "canal": "llamada", "vacuna": "Antirrábica", "proxima_dosis": prox}
    # no contestó → sigue pendiente, con un intento
    r = client.post("/api/contactos/", headers=admin, json=base | {"resultado": "no_contesto"})
    assert r.status_code == 201 and r.json()["contactado"] is False and r.json()["intentos"] == 1
    _, mios = _mi_pendiente(client, admin, cli["id"])
    assert mios[0]["contactado"] is False and mios[0]["intentos"] == 1

    # contestó → se cierra, y queda avisada también para Vacunación
    r = client.post("/api/contactos/", headers=admin, json=base | {"resultado": "contesto"})
    assert r.json()["contactado"] is True and r.json()["intentos"] == 2
    d, mios = _mi_pendiente(client, admin, cli["id"])
    assert mios == [] or mios[0]["contactado"] is True
    vac = [v for v in client.get("/api/dashboard/vacunas", headers=admin).json()
           if v["paciente_id"] == pac["id"]]
    assert vac and vac[0]["avisado"] is True

    hist = client.get(f"/api/contactos/cliente/{cli['id']}", headers=admin).json()
    assert [h["resultado"] for h in hist] == ["contesto", "no_contesto"]


def test_no_se_registra_contacto_con_mascota_ajena(client, admin, escenario):
    cli, _, _ = escenario
    r = client.post("/api/contactos/", headers=admin, json={
        "cliente_id": cli["id"], "paciente_id": 999999999, "motivo": "otro",
        "canal": "llamada", "resultado": "contesto"})
    assert r.status_code == 422


def test_valores_invalidos_se_rechazan(client, admin, escenario):
    cli, _, _ = escenario
    r = client.post("/api/contactos/", headers=admin, json={
        "cliente_id": cli["id"], "motivo": "otro", "canal": "paloma", "resultado": "contesto"})
    assert r.status_code == 422


def test_plantilla_personalizada_y_restaurar(client, admin, doctor, escenario):
    cli, _, _ = escenario
    assert client.put("/api/contactos/plantillas/vacuna", headers=doctor,
                      json={"texto": "Texto largo de prueba"}).status_code == 403
    r = client.put("/api/contactos/plantillas/vacuna", headers=admin,
                   json={"texto": "Buen día {dueno}: {mascota} debe {detalle}."})
    assert r.status_code == 200 and r.json()["personalizada"] is True
    try:
        _, mios = _mi_pendiente(client, admin, cli["id"])
        assert mios[0]["mensaje"] == "Buen día Ana Contacto: Luna debe Antirrábica."
    finally:
        assert client.delete("/api/contactos/plantillas/vacuna", headers=admin).status_code == 204
    _, mios = _mi_pendiente(client, admin, cli["id"])
    assert mios[0]["mensaje"].startswith("Hola Ana Contacto")


def test_turno_de_manana_pide_confirmacion(client, admin, escenario):
    cli, pac, _ = escenario
    from zoneinfo import ZoneInfo
    lima = ZoneInfo("America/Lima")
    d = datetime.now(lima).date() + timedelta(days=1)
    manana = datetime(d.year, d.month, d.day, 10, 0, tzinfo=lima)
    r = client.post("/api/citas/", headers=admin, json={
        "paciente_id": pac["id"], "fecha_hora": manana.isoformat(), "motivo": "Control"})
    assert r.status_code == 201, r.text
    _, mios = _mi_pendiente(client, admin, cli["id"])
    citas = [p for p in mios if p["motivo"] == "cita"]
    assert len(citas) == 1 and "10:00" in citas[0]["mensaje"] and "mañana" in citas[0]["mensaje"]


def test_tratamiento_terminado_sin_control_se_llama(client, admin, doctor, escenario):
    cli, _, _ = escenario
    # Mascota aparte: la del escenario ya tiene una consulta reciente, y una
    # consulta posterior al fin del tratamiento significa que sí volvió.
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=admin,
                      json={"nombre": "Rocky", "especie": "Canino"}).json()
    vet = next(d for d in client.get("/api/usuarios/doctores", headers=admin).json()
               if d["nombre"] == "QA Doctor")
    hace10 = datetime.now(timezone.utc) - timedelta(days=10)
    r = client.post(f"/api/pacientes/{pac['id']}/historias/", headers=doctor, json={
        "motivo_consulta": "Gastroenteritis", "veterinario_id": vet["id"],
        "fecha": hace10.isoformat(),
        "tratamiento_items": [{"medicamento": "Metronidazol", "dosis": "15 mg/kg",
                               "duracion_dias": 3}],
    })
    assert r.status_code == 201, r.text
    _, mios = _mi_pendiente(client, admin, cli["id"])
    ctl = [p for p in mios if p["motivo"] == "control"]
    assert len(ctl) == 1 and "Metronidazol" in ctl[0]["mensaje"]
    assert ctl[0]["urgente"] is True
