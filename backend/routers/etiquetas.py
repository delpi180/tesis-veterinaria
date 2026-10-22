from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.deps import solo_admin
from database import get_db
from models import Etiqueta, cliente_etiquetas
from schemas import EtiquetaIn, EtiquetaOut

router = APIRouter(prefix="/api/etiquetas", tags=["Etiquetas"])


class _EtiquetaConConteo(EtiquetaOut):
    clientes: int = 0


def _existe_nombre(db: Session, nombre: str, excepto_id: int | None = None) -> bool:
    q = db.query(Etiqueta.id).filter(func.lower(Etiqueta.nombre) == nombre.lower())
    if excepto_id is not None:
        q = q.filter(Etiqueta.id != excepto_id)
    return q.first() is not None


@router.get("/", response_model=list[_EtiquetaConConteo])
def listar_etiquetas(db: Session = Depends(get_db)):
    """Todas las etiquetas, con cuántos clientes tiene cada una."""
    conteos = dict(
        db.query(cliente_etiquetas.c.etiqueta_id, func.count())
        .group_by(cliente_etiquetas.c.etiqueta_id)
        .all()
    )
    return [
        _EtiquetaConConteo(id=e.id, nombre=e.nombre, color=e.color, clientes=conteos.get(e.id, 0))
        for e in db.query(Etiqueta).order_by(Etiqueta.nombre).all()
    ]


@router.post("/", response_model=EtiquetaOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(solo_admin)])
def crear_etiqueta(payload: EtiquetaIn, request: Request, db: Session = Depends(get_db)):
    if _existe_nombre(db, payload.nombre):
        raise HTTPException(status_code=409, detail=f"Ya existe la etiqueta «{payload.nombre}»")
    request.state.actividad_detalle = payload.nombre
    etiqueta = Etiqueta(nombre=payload.nombre, color=payload.color)
    db.add(etiqueta)
    db.commit()
    db.refresh(etiqueta)
    return etiqueta


@router.put("/{etiqueta_id}", response_model=EtiquetaOut, dependencies=[Depends(solo_admin)])
def editar_etiqueta(etiqueta_id: int, payload: EtiquetaIn, request: Request,
                    db: Session = Depends(get_db)):
    etiqueta = db.get(Etiqueta, etiqueta_id)
    if not etiqueta:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")
    if _existe_nombre(db, payload.nombre, excepto_id=etiqueta_id):
        raise HTTPException(status_code=409, detail=f"Ya existe la etiqueta «{payload.nombre}»")
    request.state.actividad_detalle = f"{etiqueta.nombre} → {payload.nombre}"
    etiqueta.nombre = payload.nombre
    etiqueta.color = payload.color
    db.commit()
    db.refresh(etiqueta)
    return etiqueta


@router.delete("/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(solo_admin)])
def borrar_etiqueta(etiqueta_id: int, request: Request, db: Session = Depends(get_db)):
    """Borra la etiqueta y se la quita a los clientes que la tenían (los clientes no se tocan)."""
    etiqueta = db.get(Etiqueta, etiqueta_id)
    if not etiqueta:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")
    request.state.actividad_detalle = etiqueta.nombre
    db.delete(etiqueta)
    db.commit()
