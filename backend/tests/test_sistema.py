"""
Tests de los flujos críticos del sistema Veterinaria Los Pinos.
Se ejecutan contra la base de datos configurada en .env. Limpian sus propios datos.

    cd backend
    ./venv/Scripts/python.exe -m pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import main
from database import SessionLocal
from models import Usuario
from core.security import hash_password


@pytest.fixture(scope="module")
def client():
    # Context manager → dispara startup (siembra los usuarios iniciales)
    with TestClient(main.app) as c:
        yield c


def _ensure_user(usuario: str, password: str, rol: str, nombre: str) -> None:
    """Garantiza un usuario con rol/credenciales conocidos, sin depender del seed."""
    db = SessionLocal()
    try:
        u = db.query(Usuario).filter(Usuario.usuario == usuario).first()
        if not u:
            db.add(Usuario(usuario=usuario, nombre=nombre,
                           password_hash=hash_password(password), rol=rol, activo=True))
        else:
            u.rol = rol
            u.password_hash = hash_password(password)
            u.activo = True
        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="module")
def admin(client):
    """Administradora del sistema = recepcionista."""
    _ensure_user("qa_admin", "qa1234", "recepcionista", "QA Administradora")
    r = client.post("/api/auth/login", json={"usuario": "qa_admin", "password": "qa1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def doctor(client):
    """Doctor veterinario (atiende y firma historias)."""
    _ensure_user("qa_doc", "qa1234", "veterinario", "QA Doctor")
    r = client.post("/api/auth/login", json={"usuario": "qa_doc", "password": "qa1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ── Autenticación ────────────────────────────────────────────────────────────

def test_login_correcto(admin):
    assert "Authorization" in admin


def test_login_incorrecto(client):
    r = client.post("/api/auth/login", json={"usuario": "admin", "password": "malo"})
    assert r.status_code == 401


def test_sin_token_rechazado(client):
    assert client.get("/api/clientes/").status_code == 401


def test_token_invalido_rechazado(client):
    r = client.get("/api/clientes/", headers={"Authorization": "Bearer abc.def"})
    assert r.status_code == 401


# ── Roles ────────────────────────────────────────────────────────────────────

def test_roles(client, admin, doctor):
    # la recepcionista es la administradora: ve clientes y gestiona usuarios
    assert client.get("/api/clientes/", headers=admin).status_code == 200
    assert client.get("/api/usuarios/", headers=admin).status_code == 200
    # el doctor NO gestiona usuarios (función de la administradora)
    assert client.get("/api/usuarios/", headers=doctor).status_code == 403
    # historias clínicas: el doctor sí; la recepcionista no
    cli = client.get("/api/clientes/", headers=admin).json()
    if cli and cli[0]["pacientes"]:
        pid = cli[0]["pacientes"][0]["id"]
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=admin).status_code == 403
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=doctor).status_code == 200


def test_admin_es_recepcionista_no_ve_historias(client, admin):
    """La administradora del sistema es recepcionista: no accede a lo clínico."""
    cli = client.get("/api/clientes/", headers=admin).json()
    if cli and cli[0]["pacientes"]:
        pid = cli[0]["pacientes"][0]["id"]
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=admin).status_code == 403


def test_listar_doctores(client, admin, doctor):
    """El selector de turnos lista doctores activos (accesible a cualquier sesión)."""
    r = client.get("/api/usuarios/doctores", headers=admin)
    assert r.status_code == 200
    nombres = {d["nombre"] for d in r.json()}
    assert "QA Doctor" in nombres


# ── Validaciones ─────────────────────────────────────────────────────────────

def test_dni_invalido(client, admin):
    r = client.post("/api/clientes/", json={"nombre": "X", "dni": "123"}, headers=admin)
    assert r.status_code == 422


def test_telefono_invalido(client, admin):
    r = client.post("/api/clientes/", json={"nombre": "X", "dni": "99887766", "telefono": "1"}, headers=admin)
    assert r.status_code == 422


# ── Ventas, pagos y kardex ───────────────────────────────────────────────────

def test_venta_kardex_y_pago(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli:
        pytest.skip("No hay clientes en la BD para probar ventas")

    prod = client.post("/api/productos/", json={
        "nombre": "PyTestProd", "categoria": "comida", "precio": 10, "stock": 20,
    }, headers=admin).json()
    venta = None
    try:
        # venta con método de pago
        r = client.post("/api/ventas/", json={
            "cliente_id": cli[0]["id"], "metodo_pago": "yape",
            "items": [{"producto_id": prod["id"], "cantidad": 3}],
        }, headers=admin)
        assert r.status_code == 201
        venta = r.json()
        assert venta["metodo_pago"] == "yape"
        assert venta["total"] == 30.0

        # stock descontado
        assert client.get(f"/api/productos/{prod['id']}", headers=admin).json()["stock"] == 17

        # kardex: entrada inicial + salida por venta
        movs = client.get(f"/api/productos/{prod['id']}/movimientos", headers=admin).json()
        tipos = {m["tipo"] for m in movs}
        assert "entrada" in tipos and "salida" in tipos

        # ajuste manual de stock
        aj = client.post(f"/api/productos/{prod['id']}/ajuste-stock",
                         json={"cantidad": 5, "motivo": "compra"}, headers=admin)
        assert aj.status_code == 200 and aj.json()["stock"] == 22

        # ajuste que dejaría stock negativo → 422
        bad = client.post(f"/api/productos/{prod['id']}/ajuste-stock",
                          json={"cantidad": -999}, headers=admin)
        assert bad.status_code == 422
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id=:p"), {"p": prod["id"]})
        if venta:
            db.execute(text("DELETE FROM venta_items WHERE venta_id=:v"), {"v": venta["id"]})
            db.execute(text("DELETE FROM ventas WHERE id=:v"), {"v": venta["id"]})
        db.execute(text("DELETE FROM productos WHERE id=:p"), {"p": prod["id"]})
        db.commit(); db.close()


def test_cierre_caja(client, admin):
    r = client.get("/api/dashboard/cierre-caja", headers=admin)
    assert r.status_code == 200
    data = r.json()
    assert "total" in data and "por_metodo" in data
    assert {m["metodo"] for m in data["por_metodo"]} == {"efectivo", "tarjeta", "yape", "plin"}


# ── Ficha de mascota ─────────────────────────────────────────────────────────

def test_mascota_campos_ampliados(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli:
        pytest.skip("No hay clientes en la BD")
    nuevo = client.post(f"/api/clientes/{cli[0]['id']}/pacientes/", json={
        "nombre": "PyTestMascota", "especie": "Canino", "sexo": "macho",
        "esterilizado": True, "alergias": "Penicilina", "color": "Negro",
    }, headers=admin).json()
    try:
        assert nuevo["sexo"] == "macho"
        assert nuevo["esterilizado"] is True
        assert nuevo["alergias"] == "Penicilina"
    finally:
        client.delete(f"/api/pacientes/{nuevo['id']}", headers=admin)


# ── Dashboard ────────────────────────────────────────────────────────────────

def test_dashboard_resumen(client, admin):
    r = client.get("/api/dashboard/resumen", headers=admin)
    assert r.status_code == 200
    for clave in ("citas_hoy", "consultas_semana", "stock_bajo", "vacunas_proximas"):
        assert clave in r.json()


# ── Autoría de la historia clínica (firma del doctor) ────────────────────────

def test_historia_firma_del_doctor(client, admin, doctor):
    # cliente + paciente (los crea la recepcionista)
    cli = client.post("/api/clientes/", json={"nombre": "QA Dueño", "dni": "55667788"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": "QA Firulais", "especie": "Canino"}, headers=admin).json()
    try:
        # el doctor llena la historia → debe quedar firmada con su nombre
        r = client.post(f"/api/pacientes/{pac['id']}/historias/",
                        json={"motivo_consulta": "Control"}, headers=doctor)
        assert r.status_code == 201
        h = r.json()
        assert h["veterinario_nombre"] == "QA Doctor"
        assert h["veterinario_id"] is not None
    finally:
        client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit(); db.close()


# ── Control de asistencia (marcaciones) ──────────────────────────────────────

def _id_doctor(client, admin, nombre="QA Doctor"):
    docs = client.get("/api/usuarios/doctores", headers=admin).json()
    return next(d["id"] for d in docs if d["nombre"] == nombre)


def test_asistencia_ingreso_salida(client, admin, doctor):
    doc_id = _id_doctor(client, admin)
    reg = None
    try:
        # ingreso
        r = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin)
        assert r.status_code == 201
        reg = r.json()
        assert reg["hora_ingreso"] is not None
        assert reg["hora_salida"] is None

        # segundo ingreso abierto el mismo día → 409
        dup = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin)
        assert dup.status_code == 409

        # salida → calcula horas trabajadas
        s = client.post(f"/api/asistencia/{reg['id']}/salida", headers=admin)
        assert s.status_code == 200
        assert s.json()["hora_salida"] is not None
        assert s.json()["horas_trabajadas"] is not None
    finally:
        if reg:
            client.delete(f"/api/asistencia/{reg['id']}", headers=admin)


def test_asistencia_solo_admin(client, doctor, admin):
    doc_id = _id_doctor(client, admin)
    # un doctor NO puede registrar asistencia (es función de la administradora)
    r = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=doctor)
    assert r.status_code == 403
    assert client.get("/api/asistencia/", headers=doctor).status_code == 403
