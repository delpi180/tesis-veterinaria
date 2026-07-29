"""Registro de errores para soporte.

Se prueba a través de la aplicación real (no llamando a registrar_error() por
dentro): en esta misma sesión un bug del rate-limit se escapó justamente por
verificar la función interna en vez del endpoint.

    cd backend
    python -m pytest tests/test_errores.py -v
"""
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text

from database import SessionLocal
import main


def _limpiar(marca: str):
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM errores WHERE mensaje LIKE :m"), {"m": f"%{marca}%"})
        db.commit()
    finally:
        db.close()


def test_reportar_error_del_navegador_sin_sesion(client, admin):
    """Un error del navegador se puede reportar SIN sesión.

    Si la app se rompe en la pantalla de acceso, ese es justamente el error que
    hay que poder ver; exigir sesión lo dejaría invisible.
    """
    marca = f"ErrorQA{uuid.uuid4().hex[:8]}"
    try:
        r = client.post("/api/errores/", json={
            "mensaje": f"TypeError: {marca}", "ruta": "/login", "detalle": "stack de prueba",
        })
        assert r.status_code == 204, "reportar un error no debe exigir sesión"

        errores = client.get("/api/errores/", headers=admin).json()
        guardado = next((e for e in errores if marca in e["mensaje"]), None)
        assert guardado is not None, "el error reportado no quedó registrado"
        assert guardado["origen"] == "frontend"
        assert guardado["ruta"] == "/login"
    finally:
        _limpiar(marca)


def test_leer_errores_es_solo_de_la_administradora(client, doctor):
    """Los errores son datos de soporte: el veterinario no los consulta."""
    assert client.get("/api/errores/").status_code == 401          # sin sesión
    assert client.get("/api/errores/", headers=doctor).status_code == 403


def test_errores_repetidos_se_agrupan(client, admin):
    """El mismo fallo repetido suma al contador en vez de llenar la tabla.

    Un componente que re-renderiza puede disparar el mismo error decenas de
    veces; sin agrupar, el registro se vuelve inservible por ruido.
    """
    marca = f"ErrorQA{uuid.uuid4().hex[:8]}"
    try:
        for _ in range(4):
            client.post("/api/errores/", json={"mensaje": f"TypeError: {marca}", "ruta": "/clientes"})

        errores = client.get("/api/errores/", headers=admin).json()
        coincidencias = [e for e in errores if marca in e["mensaje"]]
        assert len(coincidencias) == 1, "los repetidos deberían agruparse en una sola fila"
        assert coincidencias[0]["veces"] == 4
    finally:
        _limpiar(marca)


def test_error_no_controlado_del_backend_queda_registrado(client, admin):
    """Un fallo real del servidor se guarda con su contexto.

    Se agrega una ruta que revienta a propósito para ejercitar el manejador
    global de verdad; los logs de Railway rotan y hay que ir a buscarlos, así
    que el error tiene que quedar en la base para poder darle soporte después.
    """
    marca = f"ErrorQA{uuid.uuid4().hex[:8]}"
    ruta = f"/api/_qa_error_{marca}"

    @main.app.get(ruta)
    def _revienta():
        raise RuntimeError(f"Fallo simulado {marca}")

    # Por defecto TestClient re-lanza la excepción del servidor en vez de
    # devolver la respuesta; con raise_server_exceptions=False se comporta como
    # un navegador real y se puede comprobar el 500 que ve el usuario.
    cliente_real = TestClient(main.app, raise_server_exceptions=False)

    try:
        r = cliente_real.get(ruta, headers=admin)
        assert r.status_code == 500
        assert "detalle" not in r.json(), "el 500 no debe filtrar detalles internos al cliente"

        errores = client.get("/api/errores/", headers=admin).json()
        guardado = next((e for e in errores if marca in e["mensaje"]), None)
        assert guardado is not None, "el fallo del servidor no quedó registrado"
        assert guardado["origen"] == "backend"
        assert guardado["usuario"] == "qa_admin"        # se sabe a quién le pasó
        assert "Traceback" in (guardado["detalle"] or "")
    finally:
        _limpiar(marca)
        # quitar la ruta de prueba para no afectar a los demás tests
        main.app.router.routes = [
            r for r in main.app.router.routes if getattr(r, "path", None) != ruta
        ]
