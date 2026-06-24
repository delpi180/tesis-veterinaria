from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario
from core.security import crear_token, verify_password
from core.config import settings
from core import ratelimit

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    usuario:  str
    password: str


class LoginResponse(BaseModel):
    token:   str
    usuario: str
    nombre:  str
    rol:     str


def _clave_cliente(request: Request) -> str:
    """IP del cliente para el rate-limit (respeta el proxy de Render/Vercel)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    clave = _clave_cliente(request)

    # Anti fuerza bruta: bloquea tras demasiados intentos fallidos
    if not ratelimit.permitido(clave, settings.login_max_intentos, settings.login_ventana_seg):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
        )

    u = db.query(Usuario).filter(Usuario.usuario == body.usuario).first()
    if not u or not u.activo or not verify_password(body.password, u.password_hash):
        ratelimit.registrar_fallo(clave)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    ratelimit.limpiar(clave)
    return LoginResponse(
        token=crear_token(u.usuario, u.rol),
        usuario=u.usuario,
        nombre=u.nombre,
        rol=u.rol,
    )
