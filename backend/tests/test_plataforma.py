"""Panel de operación de la plataforma.

Lo más importante aquí no es lo que el operador puede hacer, sino lo que NO: no
ve datos clínicos de ninguna clínica, no entra a sus pantallas y no puede ser
creado desde la aplicación.

    cd backend
    python -m pytest tests/test_plataforma.py -v
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from database import SessionLocal
from services.plataforma import crear_operador
from tests.test_multiclinica import _borrar_clinica, _dni

CLAVE_OP = "clave-de-operador-1234"


@pytest.fixture(autouse=True)
def _sin_tope_de_altas(monkeypatch):
    from routers import registro
    monkeypatch.setattr(registro, "ALTAS_MAX_POR_HORA", 10_000)


@pytest.fixture()
def operador(client):
    usuario = f"op_{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        crear_operador(db, usuario, CLAVE_OP, "Operador QA")
    finally:
        db.close()
    r = client.post("/api/auth/login", json={"usuario": usuario, "password": CLAVE_OP})
    assert r.status_code == 200 and r.json()["rol"] == "plataforma", r.text
    yield {"h": {"Authorization": f"Bearer {r.json()['token']}"}, "usuario": usuario}
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM acciones_plataforma WHERE operador = :u"), {"u": usuario})
        db.execute(text("DELETE FROM usuarios WHERE usuario = :u"), {"u": usuario})
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def clinica_b(client):
    usuario = f"b{uuid.uuid4().hex[:10]}"
    r = client.post("/api/registro/", json={"clinica": "Clínica Operada QA", "nombre": "Admin Operada",
                                            "usuario": usuario, "password": "contraseña-segura"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    db = SessionLocal()
    try:
        cid = db.execute(text("SELECT clinica_id FROM usuarios WHERE usuario = :u"), {"u": usuario}).scalar()
    finally:
        db.close()
    yield {"h": h, "id": cid, "usuario": usuario}
    _borrar_clinica(cid)


# ── Lo que el operador NO puede ──────────────────────────────────────────────

def test_el_operador_no_entra_a_los_datos_de_ninguna_clinica(client, operador, clinica_b):
    """No ve clientes, pacientes, ventas, usuarios ni la configuración de una clínica."""
    h = operador["h"]
    for metodo, ruta in [
        ("GET", "/api/clientes/"), ("GET", "/api/pacientes/1"), ("GET", "/api/pacientes/1/historias/"),
        ("GET", "/api/ventas/"), ("GET", "/api/usuarios/"), ("GET", "/api/citas/"),
        ("GET", "/api/productos/"), ("GET", "/api/dashboard/resumen"), ("GET", "/api/respaldo/"),
        ("GET", "/api/mi-panel/"), ("PUT", "/api/configuracion/"), ("POST", "/api/clientes/"),
        ("DELETE", "/api/clientes/1"), ("GET", "/api/planilla/"), ("GET", "/api/contactos/pendientes"),
    ]:
        assert client.request(metodo, ruta, headers=h).status_code == 403, f"{metodo} {ruta}"


def test_las_clinicas_no_entran_al_panel_de_plataforma(client, admin, doctor, clinica_b):
    for h in (admin, doctor, clinica_b["h"]):
        for metodo, ruta in [("GET", "/api/plataforma/resumen"), ("GET", "/api/plataforma/clinicas"),
                             ("GET", "/api/plataforma/clinicas/1"), ("PUT", "/api/plataforma/clinicas/1"),
                             ("POST", "/api/plataforma/clinicas/1/restablecer-clave"),
                             ("GET", "/api/plataforma/acciones")]:
            assert client.request(metodo, ruta, headers=h).status_code == 403, f"{metodo} {ruta}"
    assert client.get("/api/plataforma/clinicas").status_code == 401        # sin sesión


def test_el_rol_de_operador_no_se_puede_otorgar_desde_la_aplicacion(client, admin, clinica_b):
    """Ni creando un usuario, ni editándolo, ni registrándose."""
    r = client.post("/api/usuarios/", headers=admin, json={
        "usuario": f"qa_pirata_{uuid.uuid4().hex[:6]}", "nombre": "Pirata",
        "password": "clave-pirata-12", "rol": "plataforma"})
    assert r.status_code == 422
    uid = next(u["id"] for u in client.get("/api/usuarios/", headers=admin).json() if u["usuario"] == "qa_doc")
    assert client.put(f"/api/usuarios/{uid}", headers=admin, json={"rol": "plataforma"}).status_code == 422
    # el registro público solo crea administradoras de clínica
    me = client.get("/api/usuarios/", headers=clinica_b["h"]).json()
    assert [u["rol"] for u in me] == ["recepcionista"]


def test_la_contrasena_de_un_operador_exige_12_caracteres():
    db = SessionLocal()
    try:
        with pytest.raises(ValueError):
            crear_operador(db, f"op_{uuid.uuid4().hex[:6]}", "corta-123")
    finally:
        db.close()


# ── La lista de clínicas ─────────────────────────────────────────────────────

def test_lista_con_conteos_y_sin_datos_clinicos(client, operador, clinica_b):
    for i in range(2):
        assert client.post("/api/clientes/", headers=clinica_b["h"],
                           json={"nombre": f"Cliente secreto {i}", "dni": _dni()}).status_code == 201

    r = client.get("/api/plataforma/clinicas", headers=operador["h"])
    assert r.status_code == 200
    filas = r.json()
    nombres = [c["nombre"] for c in filas]
    assert "Plataforma" not in nombres                      # la clínica interna no es un cliente
    b = next(c for c in filas if c["id"] == clinica_b["id"])
    assert b["clientes"] == 2 and b["usuarios"] == 1 and b["estado"] == "activa"
    assert b["administradora"]["usuario"] == clinica_b["usuario"]
    # Nada clínico en la respuesta
    assert "Cliente secreto" not in r.text

    d = client.get(f"/api/plataforma/clinicas/{clinica_b['id']}", headers=operador["h"])
    assert d.status_code == 200 and "Cliente secreto" not in d.text
    assert [u["usuario"] for u in d.json()["equipo"]] == [clinica_b["usuario"]]
    assert "password" not in d.text.lower()


def test_buscar_y_filtrar(client, operador, clinica_b):
    h = operador["h"]
    hallada = client.get("/api/plataforma/clinicas?q=Operada QA", headers=h).json()
    assert [c["id"] for c in hallada] == [clinica_b["id"]]
    por_admin = client.get(f"/api/plataforma/clinicas?q={clinica_b['usuario']}", headers=h).json()
    assert [c["id"] for c in por_admin] == [clinica_b["id"]]
    assert client.get("/api/plataforma/clinicas?q=zzzninguna", headers=h).json() == []
    suspendidas = client.get("/api/plataforma/clinicas?estado=suspendida", headers=h).json()
    assert all(c["id"] != clinica_b["id"] for c in suspendidas)
    assert client.get("/api/plataforma/clinicas?estado=rara", headers=h).status_code == 422


def test_la_clinica_interna_no_se_puede_abrir(client, operador):
    db = SessionLocal()
    try:
        interna = db.execute(text("SELECT id FROM clinicas WHERE plan = 'plataforma'")).scalar()
    finally:
        db.close()
    assert interna
    assert client.get(f"/api/plataforma/clinicas/{interna}", headers=operador["h"]).status_code == 404
    assert client.put(f"/api/plataforma/clinicas/{interna}", headers=operador["h"],
                      json={"estado": "suspendida", "motivo": "no debería poder"}).status_code == 404


def test_resumen(client, operador, clinica_b):
    r = client.get("/api/plataforma/resumen", headers=operador["h"]).json()
    assert r["clinicas"] >= 2 and r["activas"] >= 2
    for k in ("suspendidas", "vencidas", "en_prueba", "nuevas_30d", "usuarios_activos", "consultas_30d"):
        assert k in r


# ── Suspender y reactivar ────────────────────────────────────────────────────

def test_suspender_corta_a_la_clinica_en_el_acto_y_reactivar_la_devuelve(client, operador, clinica_b):
    h, b = operador["h"], clinica_b
    url = f"/api/plataforma/clinicas/{b['id']}"
    assert client.get("/api/clientes/", headers=b["h"]).status_code == 200

    # exige un motivo
    assert client.put(url, headers=h, json={"estado": "suspendida"}).status_code == 422

    r = client.put(url, headers=h, json={"estado": "suspendida", "motivo": "Falta de pago de octubre"})
    assert r.status_code == 200 and r.json()["estado"] == "suspendida"
    assert r.json()["suspendida_motivo"] == "Falta de pago de octubre"

    # la sesión que ya tenía abierta se corta de inmediato, y no puede abrir otra
    blocked = client.get("/api/clientes/", headers=b["h"])
    assert blocked.status_code == 403 and "suspendida" in blocked.json()["detail"]
    assert client.post("/api/auth/login", json={"usuario": b["usuario"], "password": "contraseña-segura"}).status_code == 403

    r = client.put(url, headers=h, json={"estado": "activa", "motivo": "Pagó"})
    assert r.status_code == 200 and r.json()["estado"] == "activa" and r.json()["suspendida_motivo"] is None
    assert client.get("/api/clientes/", headers=b["h"]).status_code == 200

    acciones = [a["accion"] for a in client.get(url, headers=h).json()["acciones"]]
    assert acciones[:2] == ["reactivar", "suspender"]


def test_el_vencimiento_bloquea_y_extenderlo_desbloquea(client, operador, clinica_b):
    h, b = operador["h"], clinica_b
    url = f"/api/plataforma/clinicas/{b['id']}"
    ayer = (date.today() - timedelta(days=2)).isoformat()

    r = client.put(url, headers=h, json={"vence_en": ayer})
    assert r.status_code == 200 and r.json()["estado"] == "vencida"
    bloqueo = client.get("/api/clientes/", headers=b["h"])
    assert bloqueo.status_code == 403 and "periodo" in bloqueo.json()["detail"]
    assert client.post("/api/auth/login", json={"usuario": b["usuario"], "password": "contraseña-segura"}).status_code == 403
    assert any(c["id"] == b["id"] for c in client.get("/api/plataforma/clinicas?estado=vencida", headers=h).json())

    manana = (date.today() + timedelta(days=30)).isoformat()
    assert client.put(url, headers=h, json={"vence_en": manana}).json()["estado"] == "activa"
    assert client.get("/api/clientes/", headers=b["h"]).status_code == 200

    # quitar el vencimiento (null explícito)
    assert client.put(url, headers=h, json={"vence_en": None}).json()["vence_en"] is None


def test_plan_y_nota_interna(client, operador, clinica_b):
    h, b = operador["h"], clinica_b
    url = f"/api/plataforma/clinicas/{b['id']}"
    assert client.put(url, headers=h, json={"plan": "inventado"}).status_code == 422
    assert client.put(url, headers=h, json={"plan": "plataforma"}).status_code == 422   # reservado
    r = client.put(url, headers=h, json={"plan": "profesional", "nota_interna": "Pidió factura electrónica"})
    assert r.status_code == 200 and r.json()["plan"] == "profesional"
    assert r.json()["nota_interna"] == "Pidió factura electrónica"
    # la nota es de la plataforma: la clínica no la ve en ningún dato suyo
    assert "factura electrónica" not in client.get("/api/configuracion/", headers=b["h"]).text
    assert "profesional" not in client.get("/api/configuracion/", headers=b["h"]).text


def test_lo_que_hace_el_operador_queda_en_su_bitacora_y_no_en_la_de_la_clinica(client, admin, operador, clinica_b):
    def actividades_clinica_1():
        db = SessionLocal()
        try:
            return db.execute(text("SELECT count(*) FROM actividades")).scalar()
        finally:
            db.close()

    antes = actividades_clinica_1()
    r = client.put(f"/api/plataforma/clinicas/{clinica_b['id']}", headers=operador["h"],
                   json={"nota_interna": "Nota de prueba"})
    assert r.status_code == 200
    assert actividades_clinica_1() == antes            # no ensucia la bitácora de ninguna clínica
    ultimas = client.get("/api/plataforma/acciones", headers=operador["h"]).json()
    mia = next(a for a in ultimas if a["operador"] == operador["usuario"] and a["accion"] == "nota")
    assert mia["clinica"] == "Clínica Operada QA"


# ── Restablecer contraseña ───────────────────────────────────────────────────

def test_restablecer_la_clave_de_la_administradora(client, operador, clinica_b):
    h, b = operador["h"], clinica_b
    assert client.get("/api/clientes/", headers=b["h"]).status_code == 200

    r = client.post(f"/api/plataforma/clinicas/{b['id']}/restablecer-clave", headers=h)
    assert r.status_code == 200, r.text
    temporal = r.json()["clave_temporal"]
    assert r.json()["usuario"] == b["usuario"] and len(temporal) >= 12

    # la sesión anterior se cierra; la clave vieja ya no entra; la temporal sí
    assert client.get("/api/clientes/", headers=b["h"]).status_code == 401
    assert client.post("/api/auth/login", json={"usuario": b["usuario"], "password": "contraseña-segura"}).status_code == 401
    assert client.post("/api/auth/login", json={"usuario": b["usuario"], "password": temporal}).status_code == 200

    # la contraseña no queda en ningún sitio consultable
    assert temporal not in client.get(f"/api/plataforma/clinicas/{b['id']}", headers=h).text
    assert temporal not in client.get("/api/plataforma/acciones", headers=h).text


def test_restablecer_solo_a_alguien_de_esa_clinica(client, admin, operador, clinica_b):
    uid_de_otra = next(u["id"] for u in client.get("/api/usuarios/", headers=admin).json() if u["usuario"] == "qa_doc")
    r = client.post(f"/api/plataforma/clinicas/{clinica_b['id']}/restablecer-clave", headers=operador["h"],
                    json={"usuario_id": uid_de_otra})
    assert r.status_code == 404
