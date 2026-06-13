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


@pytest.fixture(scope="module")
def client():
    # Context manager → dispara startup (siembra el admin)
    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def admin(client):
    r = client.post("/api/auth/login", json={"usuario": "admin", "password": "vetlospinos"})
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

def test_roles_recepcionista(client, admin):
    # crear recepcionista
    client.post("/api/usuarios/", json={
        "usuario": "test_recep", "nombre": "Test", "password": "1234", "rol": "recepcionista",
    }, headers=admin)
    tok = client.post("/api/auth/login", json={"usuario": "test_recep", "password": "1234"}).json()["token"]
    RH = {"Authorization": f"Bearer {tok}"}
    try:
        # accede a clientes
        assert client.get("/api/clientes/", headers=RH).status_code == 200
        # NO accede a usuarios
        assert client.get("/api/usuarios/", headers=RH).status_code == 403
        # NO accede a historias clínicas
        cli = client.get("/api/clientes/", headers=admin).json()
        if cli and cli[0]["pacientes"]:
            pid = cli[0]["pacientes"][0]["id"]
            assert client.get(f"/api/pacientes/{pid}/historias/", headers=RH).status_code == 403
            assert client.get(f"/api/pacientes/{pid}/historias/", headers=admin).status_code == 200
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM usuarios WHERE usuario='test_recep'"))
        db.commit(); db.close()


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
