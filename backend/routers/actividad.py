"""Bitácora de actividad (auditoría). Solo la administradora la consulta."""
from datetime import datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Actividad
from schemas import ActividadOut
from core.deps import solo_admin

router = APIRouter(prefix="/api/actividad", tags=["Actividad"])


def _a_fecha(s: str | None):
    """Convierte 'YYYY-MM-DD' a date; ignora valores inválidos."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _filtrar_actividad(q, usuario, desde, hasta):
    if usuario:
        q = q.filter(Actividad.usuario == usuario)
    d_desde = _a_fecha(desde)
    d_hasta = _a_fecha(hasta)
    if d_desde:
        q = q.filter(Actividad.fecha >= datetime.combine(d_desde, time.min, tzinfo=timezone.utc))
    if d_hasta:
        q = q.filter(Actividad.fecha <= datetime.combine(d_hasta, time.max, tzinfo=timezone.utc))
    return q


@router.get("/", response_model=list[ActividadOut])
def listar_actividad(
    request: Request,
    usuario: Optional[str] = Query(None),
    desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    skip: int = Query(0, ge=0),
    limite: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    solo_admin(request)
    q = _filtrar_actividad(db.query(Actividad), usuario, desde, hasta)
    return q.order_by(Actividad.fecha.desc()).offset(skip).limit(limite).all()


@router.get("/contar")
def contar_actividad(
    request: Request,
    usuario: Optional[str] = Query(None),
    desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Total de eventos que cumplen el filtro, para la paginación."""
    solo_admin(request)
    q = _filtrar_actividad(db.query(func.count(Actividad.id)), usuario, desde, hasta)
    return {"total": q.scalar()}
