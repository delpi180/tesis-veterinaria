"""Fixtures compartidos por la suite.

Modelo de roles del sistema:
- admin  → recepcionista (administradora): gestiona todo salvo lo clínico.
- doctor → veterinario: atiende y firma historias clínicas.

Los usuarios QA se garantizan por inserción directa, sin depender del seed ni
del estado previo de la base.
"""
import pytest
from fastapi.testclient import TestClient

import main
from sqlalchemy import text

from database import SessionLocal
from models import Usuario
from core.security import hash_password


@pytest.fixture(scope="session")
def client():
    # Context manager → dispara el startup (siembra inicial)
    with TestClient(main.app) as c:
        yield c


def _ensure_user(usuario: str, password: str, rol: str, nombre: str) -> None:
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


@pytest.fixture(scope="session")
def admin(client):
    """Administradora del sistema = recepcionista."""
    _ensure_user("qa_admin", "qa1234", "recepcionista", "QA Administradora")
    r = client.post("/api/auth/login", json={"usuario": "qa_admin", "password": "qa1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def doctor(client):
    """Doctor veterinario (atiende y firma historias)."""
    _ensure_user("qa_doc", "qa1234", "veterinario", "QA Doctor")
    r = client.post("/api/auth/login", json={"usuario": "qa_doc", "password": "qa1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ── Barrido final de artefactos de prueba ────────────────────────────────────
#
# Cada prueba limpia lo suyo en un `finally`, pero eso falla justo cuando más
# importa: si la prueba se corta a mitad (un assert que revienta antes del
# try, una desconexión, un Ctrl-C), el `finally` no alcanza a correr y el
# producto o la venta quedan en la base.
#
# Con la suite apuntando a la base de producción —que es como está hoy— eso
# significa inventario y ventas inventados apareciendo en el sistema de la
# clínica. Ya pasó varias veces. Este barrido corre al final pase lo que pase.
#
# No reemplaza a apuntar las pruebas a una base local; es la red mientras eso
# siga pendiente.

_PREFIJOS_PRUEBA = ("QA ", "ZZZ ")


@pytest.fixture(scope="session", autouse=True)
def _barrer_artefactos_de_prueba():
    yield
    db = SessionLocal()
    try:
        productos = [
            r[0] for r in db.execute(text(
                "SELECT id FROM productos "
                "WHERE nombre LIKE 'QA %' OR nombre LIKE 'ZZZ %' OR codigo LIKE 'QA-%'"
            ))
        ]
        if productos:
            ventas = [
                r[0] for r in db.execute(
                    text("SELECT DISTINCT venta_id FROM venta_items WHERE producto_id = ANY(:p)"),
                    {"p": productos},
                )
            ]
            if ventas:
                db.execute(text("DELETE FROM venta_items WHERE venta_id = ANY(:v)"), {"v": ventas})
                db.execute(text("DELETE FROM ventas WHERE id = ANY(:v)"), {"v": ventas})
            db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id = ANY(:p)"),
                       {"p": productos})
            db.execute(text("DELETE FROM productos WHERE id = ANY(:p)"), {"p": productos})

        # Clientes de prueba: solo los que no dejaron rastro clínico. Si por
        # algún camino quedó una historia colgando, se prefiere dejar el
        # cliente antes que borrar un registro médico por si acaso.
        db.execute(text(
            "DELETE FROM clientes c "
            "WHERE (c.nombre LIKE 'QA %' OR c.nombre LIKE 'ZZZ %') "
            "  AND NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.cliente_id = c.id)"
        ))

        # Usuarios creados por las pruebas de borrado, si alguna se cortó antes
        # de limpiar. Solo los del prefijo qa_del_, nunca qa_admin ni qa_doc.
        huerfanos = [r[0] for r in db.execute(text(
            "SELECT id FROM usuarios WHERE usuario LIKE 'qa/_del/_%' ESCAPE '/'"
        ))]
        if huerfanos:
            db.execute(text("DELETE FROM asistencias WHERE usuario_id = ANY(:u)"), {"u": huerfanos})
            db.execute(text("UPDATE citas SET veterinario_id = NULL WHERE veterinario_id = ANY(:u)"), {"u": huerfanos})
            db.execute(text("UPDATE historias_clinicas SET veterinario_id = NULL WHERE veterinario_id = ANY(:u)"), {"u": huerfanos})
            db.execute(text("UPDATE recetas SET veterinario_id = NULL WHERE veterinario_id = ANY(:u)"), {"u": huerfanos})
            db.execute(text("DELETE FROM usuarios WHERE id = ANY(:u)"), {"u": huerfanos})

        db.commit()
        if productos or huerfanos:
            print(f"\n[limpieza] {len(productos)} producto(s) y "
                  f"{len(huerfanos)} usuario(s) de prueba barridos.")
    except Exception as e:
        db.rollback()
        print(f"\n[limpieza] No se pudo barrer: {e}")
    finally:
        db.close()
