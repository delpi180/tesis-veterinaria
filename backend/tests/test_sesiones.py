"""Sesiones y cuentas: que un cambio en la cuenta rija en el acto.

El token prueba que alguien inició sesión alguna vez; no debe seguir mandando
cuando la cuenta cambió. Lo que se prueba aquí es lo que ve el servidor, no el
menú.

    cd backend
    python -m pytest tests/test_sesiones.py -v
"""
import uuid

import pytest
from sqlalchemy import text

from core.security import crear_token
from database import SessionLocal


def _crear_usuario(client, admin, rol="veterinario"):
    usuario = f"qa_ses_{uuid.uuid4().hex[:8]}"
    r = client.post("/api/usuarios/", headers=admin, json={
        "usuario": usuario, "nombre": "QA Sesión", "password": "clave-inicial-1", "rol": rol})
    assert r.status_code == 201, r.text
    return usuario, r.json()["id"]


def _login(client, usuario, password):
    r = client.post("/api/auth/login", json={"usuario": usuario, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def colega(client, admin):
    usuario, uid = _crear_usuario(client, admin)
    yield usuario, uid
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM usuarios WHERE usuario = :u"), {"u": usuario})
        db.commit()
    finally:
        db.close()


def test_el_cambio_de_rol_rige_de_inmediato_en_la_sesion_abierta(client, admin, colega):
    usuario, uid = colega
    token = _login(client, usuario, "clave-inicial-1")
    assert client.get("/api/ventas/", headers=token).status_code == 403          # veterinario

    assert client.put(f"/api/usuarios/{uid}", headers=admin, json={"rol": "recepcionista"}).status_code == 200
    # La MISMA sesión, sin volver a iniciarla, ya tiene el rol nuevo
    assert client.get("/api/ventas/", headers=token).status_code == 200

    assert client.put(f"/api/usuarios/{uid}", headers=admin, json={"rol": "veterinario"}).status_code == 200
    assert client.get("/api/ventas/", headers=token).status_code == 403


def test_el_rol_del_token_no_manda(client, admin, colega):
    """Un token que dice 'recepcionista' no vale si la base dice 'veterinario'."""
    usuario, _ = colega
    login = client.post("/api/auth/login", json={"usuario": usuario, "password": "clave-inicial-1"}).json()
    from core.security import sello_de_sesion
    db = SessionLocal()
    try:
        ph = db.execute(text("SELECT password_hash FROM usuarios WHERE usuario = :u"), {"u": usuario}).scalar()
    finally:
        db.close()
    falso = {"Authorization": "Bearer " + crear_token(usuario, "recepcionista", sello_de_sesion(ph))}
    assert client.get("/api/ventas/", headers=falso).status_code == 403
    assert login["rol"] == "veterinario"


def test_cambiar_la_contrasena_cierra_las_sesiones_abiertas(client, admin, colega):
    usuario, uid = colega
    vieja = _login(client, usuario, "clave-inicial-1")
    assert client.get("/api/clientes/", headers=vieja).status_code == 200

    assert client.put(f"/api/usuarios/{uid}", headers=admin, json={"password": "clave-nueva-2"}).status_code == 200
    r = client.get("/api/clientes/", headers=vieja)
    assert r.status_code == 401 and "sesión" in r.json()["detail"].lower()
    # con la clave nueva entra, con la vieja no
    assert client.get("/api/clientes/", headers=_login(client, usuario, "clave-nueva-2")).status_code == 200
    assert client.post("/api/auth/login", json={"usuario": usuario, "password": "clave-inicial-1"}).status_code == 401


def test_desactivar_una_cuenta_corta_su_sesion_en_el_acto(client, admin, colega):
    usuario, uid = colega
    token = _login(client, usuario, "clave-inicial-1")
    assert client.get("/api/clientes/", headers=token).status_code == 200
    assert client.put(f"/api/usuarios/{uid}", headers=admin, json={"activo": False}).status_code == 200
    assert client.get("/api/clientes/", headers=token).status_code == 401


def test_un_token_del_formato_anterior_o_alterado_no_vale(client, admin, colega):
    usuario, _ = colega
    sin_sello = {"Authorization": "Bearer " + crear_token(usuario, "veterinario")}
    assert client.get("/api/clientes/", headers=sin_sello).status_code == 401
    otro_sello = {"Authorization": "Bearer " + crear_token(usuario, "veterinario", "0123456789abcdef")}
    assert client.get("/api/clientes/", headers=otro_sello).status_code == 401


def test_la_contrasena_minima_al_crear_usuarios(client, admin):
    r = client.post("/api/usuarios/", headers=admin, json={
        "usuario": f"qa_debil_{uuid.uuid4().hex[:6]}", "nombre": "Débil", "password": "1234"})
    assert r.status_code == 422


# ── Una clínica no se queda sin administradora ───────────────────────────────

@pytest.fixture()
def clinica_sola(client):
    """Una clínica recién creada: su única administradora es quien la registró."""
    from tests.test_multiclinica import _borrar_clinica   # noqa: PLC0415
    usuario = f"solo{uuid.uuid4().hex[:8]}"
    r = client.post("/api/registro/", json={
        "clinica": "Clínica Sola", "nombre": "Única Admin", "usuario": usuario,
        "password": "contraseña-segura"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    db = SessionLocal()
    try:
        cid = db.execute(text("SELECT clinica_id FROM usuarios WHERE usuario = :u"), {"u": usuario}).scalar()
        uid = db.execute(text("SELECT id FROM usuarios WHERE usuario = :u"), {"u": usuario}).scalar()
    finally:
        db.close()
    yield {"h": h, "uid": uid, "cid": cid}
    _borrar_clinica(cid)


@pytest.fixture(autouse=True)
def _sin_tope_de_altas(monkeypatch):
    from routers import registro
    monkeypatch.setattr(registro, "ALTAS_MAX_POR_HORA", 10_000)


def test_la_unica_administradora_no_puede_dejar_la_clinica_sin_administradora(client, clinica_sola):
    h, uid = clinica_sola["h"], clinica_sola["uid"]
    # no puede degradarse
    r = client.put(f"/api/usuarios/{uid}", headers=h, json={"rol": "veterinario"})
    assert r.status_code == 409 and "administradora" in r.json()["detail"]
    # no puede desactivarse
    assert client.put(f"/api/usuarios/{uid}", headers=h, json={"activo": False}).status_code == 409
    # ni borrarse
    assert client.delete(f"/api/usuarios/{uid}", headers=h).status_code == 409
    # sigue siendo administradora
    assert client.get("/api/usuarios/", headers=h).status_code == 200


def test_con_otra_administradora_si_puede_cederle_el_cargo(client, clinica_sola):
    h, uid = clinica_sola["h"], clinica_sola["uid"]
    nuevo = client.post("/api/usuarios/", headers=h, json={
        "usuario": f"seg{uuid.uuid4().hex[:8]}", "nombre": "Segunda", "password": "clave-segura-2",
        "rol": "recepcionista"})
    assert nuevo.status_code == 201, nuevo.text
    # ahora hay dos: la primera puede pasar a veterinaria
    assert client.put(f"/api/usuarios/{uid}", headers=h, json={"rol": "veterinario"}).status_code == 200
    # y, ya sin ese rol, su misma sesión deja de administrar
    assert client.get("/api/usuarios/", headers=h).status_code == 403


def test_nadie_se_desactiva_a_si_mismo(client, admin):
    uid = next(u["id"] for u in client.get("/api/usuarios/", headers=admin).json() if u["usuario"] == "qa_admin")
    r = client.put(f"/api/usuarios/{uid}", headers=admin, json={"activo": False})
    assert r.status_code == 409
