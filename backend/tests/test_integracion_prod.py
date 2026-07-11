"""
Pruebas de integración contra el sistema real desplegado:
frontend en Vercel (PROD_FRONTEND_URL) <-> backend en Railway (PROD_BACKEND_URL).

No corren en el job normal de CI (marcadas @pytest.mark.prod) porque le pegan
a producción. Se saltan automáticamente si no está la variable de entorno
PROD_ADMIN_PASSWORD (nunca se hardcodea una contraseña real en el repo).

Uso local:
    cd backend
    set PROD_ADMIN_PASSWORD=xxxxx   (PowerShell: $env:PROD_ADMIN_PASSWORD="xxxxx")
    python -m pytest -m prod tests/test_integracion_prod.py -v
"""
import os

import httpx
import pytest
from dotenv import load_dotenv

# PROD_ADMIN_PASSWORD vive en un .env aparte (nunca en el .env normal ni en el repo,
# para no chocar con el Settings estricto de pydantic ni exponer la clave real).
load_dotenv(".env.pruebas-prod")

PROD_BACKEND_URL = os.environ.get(
    "PROD_BACKEND_URL", "https://tesis-veterinaria-backend-production.up.railway.app"
)
PROD_FRONTEND_URL = os.environ.get("PROD_FRONTEND_URL", "https://tesis-veterinaria.vercel.app")
PROD_ADMIN_USER = os.environ.get("PROD_ADMIN_USER", "admin")
PROD_ADMIN_PASSWORD = os.environ.get("PROD_ADMIN_PASSWORD")

pytestmark = pytest.mark.prod

if not PROD_ADMIN_PASSWORD:
    pytest.skip(
        "PROD_ADMIN_PASSWORD no está seteada: se salta la suite de integración contra producción.",
        allow_module_level=True,
    )


@pytest.fixture(scope="module")
def prod_client():
    with httpx.Client(base_url=PROD_BACKEND_URL, timeout=30) as c:
        yield c


@pytest.fixture(scope="module")
def admin_headers(prod_client):
    r = prod_client.post(
        "/api/auth/login", json={"usuario": PROD_ADMIN_USER, "password": PROD_ADMIN_PASSWORD}
    )
    assert r.status_code == 200, f"login falló contra producción: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_health_publico_sin_token(prod_client):
    r = prod_client.get("/api/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_cors_permite_origen_del_frontend_vercel(prod_client):
    """El backend en Railway debe aceptar peticiones con Origin = el frontend de Vercel."""
    r = prod_client.get("/api/health", headers={"Origin": PROD_FRONTEND_URL})
    assert r.status_code == 200
    acao = r.headers.get("access-control-allow-origin")
    assert acao is not None, "el backend no devolvió Access-Control-Allow-Origin"
    assert acao == "*" or acao == PROD_FRONTEND_URL


def test_login_incorrecto_rechazado(prod_client):
    r = prod_client.post(
        "/api/auth/login", json={"usuario": PROD_ADMIN_USER, "password": "password-incorrecta-qa"}
    )
    assert r.status_code == 401


def test_flujo_cliente_paciente_cita_conectado(prod_client, admin_headers):
    """
    Verifica que los módulos de clientes, pacientes, citas, productos y servicios
    de Railway están realmente conectados entre sí (no aislados), creando y
    limpiando datos de prueba propios, sin tocar datos reales existentes.
    """
    c, A = prod_client, admin_headers
    cli = pac = prod = serv = None
    try:
        # cliente + paciente
        cli = c.post(
            "/api/clientes/",
            json={"nombre": "QA Integracion Prod", "dni": "90909090", "telefono": "900900900"},
            headers=A,
        ).json()
        assert "id" in cli

        pac = c.post(
            f"/api/clientes/{cli['id']}/pacientes/",
            json={"nombre": "QAProdTest", "especie": "Canino"},
            headers=A,
        ).json()
        assert pac.get("cliente_id") == cli["id"]

        # el listado sin filtro pagina (limit por defecto), así que buscamos por nombre
        clientes = c.get("/api/clientes/", params={"q": "QA Integracion Prod"}, headers=A).json()
        assert any(x["id"] == cli["id"] for x in clientes)

        # producto + servicio (sin venderlos, solo verificar que quedan en el catálogo)
        prod = c.post(
            "/api/productos/",
            json={"nombre": "QA Integracion Producto", "categoria": "medicamento", "precio": 15, "stock": 5},
            headers=A,
        ).json()
        assert prod.get("stock") == 5

        serv = c.post(
            "/api/servicios/", json={"nombre": "QA Integracion Servicio", "precio": 25}, headers=A
        ).json()
        assert "id" in serv

        # turno asignado a un doctor real del sistema
        doctores = c.get("/api/usuarios/doctores", headers=A).json()
        assert doctores, "no hay ningún doctor registrado en producción"
        doc = doctores[0]

        cita = c.post(
            "/api/citas/",
            json={
                "paciente_id": pac["id"],
                "fecha_hora": "2027-03-10T10:00:00",
                "motivo": "QA integración producción",
                "veterinario_id": doc["id"],
            },
            headers=A,
        ).json()
        assert cita.get("veterinario_nombre") == doc["nombre"]

        citas = c.get("/api/citas/", headers=A).json()
        assert any(x["id"] == cita["id"] for x in citas)

    finally:
        # limpieza: borrar el cliente cascadea paciente/citas/historias (ver models.py)
        if cli:
            c.delete(f"/api/clientes/{cli['id']}", headers=A)
        if serv:
            c.delete(f"/api/servicios/{serv['id']}", headers=A)
        if prod:
            c.delete(f"/api/productos/{prod['id']}", headers=A)
