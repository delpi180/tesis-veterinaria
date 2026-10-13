"""Cuentas de operador del SaaS.

Un operador es quien administra la plataforma (no una clínica): ve la lista de
clínicas, las suspende, les cambia el plan. NO es un usuario de ninguna clínica
y nunca ve sus datos clínicos.

Como toda cuenta pertenece a una clínica en la base, los operadores viven en una
clínica interna reservada (plan 'plataforma') que no aparece en ningún listado.
Solo se crean desde el servidor (scripts/crear_operador.py): ninguna pantalla ni
endpoint público puede otorgar este rol.
"""
from sqlalchemy.orm import Session

from core.cuentas import ROL_PLATAFORMA
from core.security import hash_password
from models import Clinica, Usuario

PLAN_INTERNO = "plataforma"
CLAVE_MINIMA_OPERADOR = 12


def clinica_interna(db: Session) -> Clinica:
    """La clínica donde viven los operadores; se crea la primera vez."""
    c = db.query(Clinica).filter(Clinica.plan == PLAN_INTERNO).first()
    if c is None:
        c = Clinica(nombre="Plataforma", plan=PLAN_INTERNO, estado="activa")
        db.add(c)
        db.flush()
    return c


def crear_operador(db: Session, usuario: str, password: str, nombre: str | None = None) -> Usuario:
    if len(password) < CLAVE_MINIMA_OPERADOR:
        raise ValueError(f"La contraseña de un operador debe tener al menos {CLAVE_MINIMA_OPERADOR} caracteres.")
    usuario = usuario.strip().lower()
    if db.query(Usuario.id).filter(Usuario.usuario == usuario).first():
        raise ValueError(f"El usuario «{usuario}» ya existe.")
    u = Usuario(
        usuario=usuario, nombre=nombre or usuario, rol=ROL_PLATAFORMA, activo=True,
        password_hash=hash_password(password), clinica_id=clinica_interna(db).id,
    )
    db.add(u)
    db.commit()
    return u
