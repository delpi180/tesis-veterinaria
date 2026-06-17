"""Dependencias de FastAPI compartidas: usuario autenticado y control de rol.

El middleware de auth (main.py) ya validó el token y dejó en request.state el
'usuario' (username) y el 'rol'. Aquí resolvemos el registro Usuario completo
para estampar autoría y exponemos el guard de administradora (recepcionista).
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario


def usuario_actual(request: Request, db: Session = Depends(get_db)) -> Usuario | None:
    """Devuelve el Usuario logueado (o None si no se pudo resolver)."""
    username = getattr(request.state, "usuario", None)
    if not username:
        return None
    return db.query(Usuario).filter(Usuario.usuario == username).first()


def solo_admin(request: Request) -> None:
    """La administradora es la recepcionista: gestiona usuarios, asistencia, etc."""
    if getattr(request.state, "rol", None) != "recepcionista":
        raise HTTPException(
            status_code=403,
            detail="Acción reservada a la administradora (recepcionista).",
        )
