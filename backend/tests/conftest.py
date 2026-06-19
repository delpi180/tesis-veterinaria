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
