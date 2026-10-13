"""Glosario del dictado: palabras propias de la clínica.

Lo lee cualquier usuario con sesión (el dictado lo usa); solo la administradora
lo edita. Cada cambio vacía la memoria del vocabulario para que el siguiente
dictado ya lo use, sin esperar los minutos que dura el caché.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.deps import solo_admin
from database import get_db
from models import TerminoGlosario
from schemas import GlosarioIn, GlosarioOut
from services import vocabulario

router = APIRouter(prefix="/api/glosario", tags=["Glosario"])


@router.get("/", response_model=list[GlosarioOut])
def listar(db: Session = Depends(get_db)):
    return db.query(TerminoGlosario).order_by(TerminoGlosario.termino).all()


@router.post("/", response_model=GlosarioOut, status_code=201)
def crear(payload: GlosarioIn, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    existe = db.query(TerminoGlosario).filter(
        TerminoGlosario.termino.ilike(payload.termino)).first()
    if existe:
        raise HTTPException(409, f"«{existe.termino}» ya está en el glosario.")
    t = TerminoGlosario(**payload.model_dump(),
                        creado_por=getattr(request.state, "usuario", None))
    db.add(t)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ese término ya está en el glosario.")
    db.refresh(t)
    vocabulario.invalidar_cache()
    request.state.actividad_detalle = t.termino
    return t


@router.put("/{termino_id}", response_model=GlosarioOut)
def editar(termino_id: int, payload: GlosarioIn, request: Request,
           db: Session = Depends(get_db)):
    solo_admin(request)
    t = db.get(TerminoGlosario, termino_id)
    if not t:
        raise HTTPException(404, "Término no encontrado")
    choque = db.query(TerminoGlosario).filter(
        TerminoGlosario.termino.ilike(payload.termino),
        TerminoGlosario.id != termino_id).first()
    if choque:
        raise HTTPException(409, f"«{choque.termino}» ya está en el glosario.")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    vocabulario.invalidar_cache()
    request.state.actividad_detalle = t.termino
    return t


@router.delete("/{termino_id}", status_code=204)
def borrar(termino_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    t = db.get(TerminoGlosario, termino_id)
    if not t:
        raise HTTPException(404, "Término no encontrado")
    request.state.actividad_detalle = t.termino
    db.delete(t)
    db.commit()
    vocabulario.invalidar_cache()
