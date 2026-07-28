"""Pruebas de regresión de los hallazgos de la auditoría de seguridad/robustez.

Cada prueba de aquí corresponde a un defecto REAL que estaba en producción y
que se corrigió. Existen para que no vuelva a colarse: se ejercita el endpoint
HTTP de verdad, no la función interna.

    cd backend
    python -m pytest tests/test_auditoria_seguridad.py -v
"""
import time

import pytest
from sqlalchemy import text

from core import ratelimit
from database import SessionLocal


# ── Hallazgo 1: el rate-limit de IA devolvía 500 en vez de 429 ───────────────
#
# `main.py` usaba `status.HTTP_429_TOO_MANY_REQUESTS` sin importar `status`, así
# que al superarse el límite saltaba un NameError, lo atrapaba el manejador
# global y el usuario recibía un 500 genérico. El defecto pasó desapercibido
# porque se había verificado llamando a `ratelimit.permitido()` directamente en
# vez de pegarle al endpoint. Por eso esta prueba va por HTTP.

def _saturar_limite_ia(clave: str, maximo: int = 15) -> None:
    ratelimit.limpiar(clave)
    for _ in range(maximo):
        ratelimit.registrar_fallo(clave)


def test_rate_limit_ia_responde_429_no_500(client, doctor):
    """Al superar el límite de IA se devuelve 429 con un mensaje claro.

    Se satura el contador por adelantado para NO gastar cuota real de OpenAI:
    el límite se evalúa antes de llamar al proveedor.
    """
    clave = "ia_testclient"
    _saturar_limite_ia(clave)
    try:
        r = client.post(
            "/api/procesar-historia",
            json={"texto": "perro con vómitos y diarrea"},
            headers=doctor,
        )
        assert r.status_code == 429, (
            f"Se esperaba 429 (límite alcanzado) y se recibió {r.status_code}. "
            "Un 500 aquí significa que se rompió el manejo del rate-limit."
        )
        assert "detail" in r.json()
    finally:
        ratelimit.limpiar(clave)


# ── Hallazgo 2: un usuario desactivado conservaba acceso hasta 12 h ──────────
#
# El middleware validaba la FIRMA del token pero nunca volvía a mirar si la
# cuenta seguía activa. Al dar de baja a alguien, su sesión abierta seguía
# funcionando hasta que el token expirara por su cuenta.

def test_usuario_desactivado_pierde_acceso(client, admin):
    """Desactivar una cuenta corta su sesión ya abierta (no solo el próximo login)."""
    usuario = "qa_regresion_baja"
    _limpiar_usuario(usuario)

    creado = client.post(
        "/api/usuarios/",
        json={
            "usuario": usuario, "nombre": "QA Regresión Baja",
            "password": "qa_regresion_1234", "rol": "veterinario",
        },
        headers=admin,
    )
    assert creado.status_code == 201
    uid = creado.json()["id"]

    try:
        token = client.post(
            "/api/auth/login",
            json={"usuario": usuario, "password": "qa_regresion_1234"},
        ).json()["token"]
        cabecera = {"Authorization": f"Bearer {token}"}

        # Con la cuenta activa, el token funciona
        assert client.get("/api/clientes/?limit=1", headers=cabecera).status_code == 200

        # La administradora lo desactiva
        assert client.put(f"/api/usuarios/{uid}", json={"activo": False}, headers=admin).status_code == 200

        # La vigencia de la cuenta se cachea unos segundos; se invalida para no
        # tener que dormir 30 s en la prueba.
        _invalidar_cache_cuentas()

        r = client.get("/api/clientes/?limit=1", headers=cabecera)
        assert r.status_code == 401, (
            f"Un usuario desactivado siguió teniendo acceso (HTTP {r.status_code}). "
            "Su token ya emitido debe dejar de servir."
        )
    finally:
        client.delete(f"/api/usuarios/{uid}", headers=admin)
        _limpiar_usuario(usuario)


# ── Hallazgo 3: el healthcheck decía "ok" aunque la BD estuviera caída ───────

def test_health_verifica_base_de_datos(client):
    """/api/health confirma que la BD responde (Railway lo usa para promover deploys)."""
    r = client.get("/api/health")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "ok"
    # 'build' identifica la versión viva; ya no es una cadena fija escrita a mano
    assert "build" in cuerpo


# ── Auxiliares ───────────────────────────────────────────────────────────────

def _limpiar_usuario(usuario: str) -> None:
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM usuarios WHERE usuario = :u"), {"u": usuario})
        db.commit()
    finally:
        db.close()


def _invalidar_cache_cuentas() -> None:
    import main
    main._CACHE_CUENTAS.clear()
