from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario
from core.security import crear_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    usuario:  str
    password: str


class LoginResponse(BaseModel):
    token:   str
    usuario: str
    nombre:  str
    rol:     str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    u = db.query(Usuario).filter(Usuario.usuario == body.usuario).first()
    if not u or not u.activo or not verify_password(body.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    return LoginResponse(
        token=crear_token(u.usuario, u.rol),
        usuario=u.usuario,
        nombre=u.nombre,
        rol=u.rol,
    )
