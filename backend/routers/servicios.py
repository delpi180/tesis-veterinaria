from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from models import Servicio, VentaItem
from schemas import ServicioCreate, ServicioUpdate, ServicioOut

router = APIRouter(prefix="/api/servicios", tags=["Servicios"])


@router.post("/", response_model=ServicioOut, status_code=status.HTTP_201_CREATED)
def crear_servicio(payload: ServicioCreate, db: Session = Depends(get_db)):
    servicio = Servicio(**payload.model_dump())
    db.add(servicio)
    db.commit()
    db.refresh(servicio)
    return servicio


@router.get("/", response_model=list[ServicioOut])
def listar_servicios(
    solo_activos: bool = Query(True, description="Filtrar por activo=True"),
    db: Session = Depends(get_db),
):
    q = db.query(Servicio)
    if solo_activos:
        q = q.filter(Servicio.activo.is_(True))
    return q.order_by(Servicio.nombre).all()


@router.get("/{servicio_id}", response_model=ServicioOut)
def obtener_servicio(servicio_id: int, db: Session = Depends(get_db)):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return s


@router.put("/{servicio_id}", response_model=ServicioOut)
def actualizar_servicio(
    servicio_id: int, payload: ServicioUpdate, db: Session = Depends(get_db)
):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(s, campo, valor)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_servicio(servicio_id: int, db: Session = Depends(get_db)):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    usado = db.query(VentaItem.id).filter(VentaItem.servicio_id == servicio_id).first()
    if usado:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el servicio figura en ventas. "
                   "Desactívalo para retirarlo del catálogo sin perder el historial.",
        )

    db.delete(s)
    db.commit()
