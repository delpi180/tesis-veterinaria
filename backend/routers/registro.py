"""Alta de una clínica nueva: crea la clínica y a su administradora.

Es pública (todavía no hay sesión) y por eso lleva tres cuidados: un tope de
altas por IP, una contraseña mínima y que el usuario sea único en todo el
sistema (el usuario es lo único que se pide al iniciar sesión, así que dos
clínicas no pueden repetirlo).
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from core import ratelimit
from core.config import settings
from core.security import crear_token, hash_password
from database import get_db
from models import Clinica, ConfiguracionClinica, Usuario

router = APIRouter(prefix="/api/registro", tags=["Registro"])

ALTAS_MAX_POR_HORA = 5


class RegistroIn(BaseModel):
    clinica: str
    nombre: str          # nombre de quien administra
    usuario: str
    password: str

    @field_validator("clinica", "nombre")
    @classmethod
    def _texto(cls, v):
        v = " ".join((v or "").split())
        if len(v) < 2:
            raise ValueError("Escribe al menos 2 letras")
        return v[:120]

    @field_validator("usuario")
    @classmethod
    def _usuario(cls, v):
        v = (v or "").strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,30}", v):
            raise ValueError("El usuario: 3 a 30 caracteres, solo letras, números, punto, guion y guion bajo")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v):
        if len(v or "") < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


@router.post("/", status_code=201)
def registrar_clinica(body: RegistroIn, request: Request, db: Session = Depends(get_db)):
    if not settings.registro_abierto:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro de clínicas está cerrado.")

    clave = f"registro_{_ip(request)}"
    if not ratelimit.permitido(clave, ALTAS_MAX_POR_HORA, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Demasiados registros desde esta conexión. Inténtalo más tarde.")

    if db.query(Usuario.id).filter(Usuario.usuario == body.usuario).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese usuario ya está en uso. Elige otro.")

    clinica = Clinica(nombre=body.clinica)
    db.add(clinica)
    db.flush()
    admin = Usuario(
        usuario=body.usuario, nombre=body.nombre,
        password_hash=hash_password(body.password),
        rol="recepcionista", activo=True, clinica_id=clinica.id,
    )
    db.add(admin)
    db.add(ConfiguracionClinica(
        clinica_id=clinica.id, nombre=body.clinica,
        pie_comprobante="Gracias por su preferencia",
    ))
    db.commit()
    ratelimit.registrar_fallo(clave)   # cuenta el alta contra el tope por IP

    return {
        "token": crear_token(admin.usuario, admin.rol),
        "usuario": admin.usuario, "nombre": admin.nombre, "rol": admin.rol,
    }
