from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario
from schemas import UsuarioCreate, UsuarioUpdate, UsuarioOut, DoctorOut
from core.security import hash_password
from core.deps import solo_admin

router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])


@router.get("/doctores", response_model=list[DoctorOut])
def listar_doctores(db: Session = Depends(get_db)):
    """Doctores activos (id + nombre) para selectores de turno. Cualquier usuario logueado."""
    return (
        db.query(Usuario)
        .filter(Usuario.rol == "veterinario", Usuario.activo.is_(True))
        .order_by(Usuario.nombre)
        .all()
    )


@router.get("/", response_model=list[UsuarioOut])
def listar_usuarios(request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    return db.query(Usuario).order_by(Usuario.usuario).all()


@router.post("/", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(payload: UsuarioCreate, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    if db.query(Usuario).filter(Usuario.usuario == payload.usuario).first():
        raise HTTPException(status_code=409, detail=f"El usuario '{payload.usuario}' ya existe")
    u = Usuario(
        usuario=payload.usuario,
        nombre=payload.nombre,
        password_hash=hash_password(payload.password),
        rol=payload.rol,
        activo=payload.activo,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.put("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(usuario_id: int, payload: UsuarioUpdate, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    if "password" in datos:
        u.password_hash = hash_password(datos.pop("password"))
    for campo, valor in datos.items():
        setattr(u, campo, valor)
    db.commit()
    db.refresh(u)
    return u


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # No permitir quedarse sin veterinarios activos
    if u.rol == "veterinario":
        otros = (
            db.query(Usuario)
            .filter(Usuario.rol == "veterinario", Usuario.activo.is_(True), Usuario.id != usuario_id)
            .count()
        )
        if otros == 0:
            raise HTTPException(status_code=409, detail="No puedes eliminar al único veterinario activo.")
    db.delete(u)
    db.commit()
