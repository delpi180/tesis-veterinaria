"""Bitácora de actividad (auditoría). Solo la administradora la consulta."""
from datetime import datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
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


@router.get("/", response_model=list[ActividadOut])
def listar_actividad(
    request: Request,
    usuario: Optional[str] = Query(None),
    desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    limite: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    solo_admin(request)
    q = db.query(Actividad)
    if usuario:
        q = q.filter(Actividad.usuario == usuario)
    d_desde = _a_fecha(desde)
    d_hasta = _a_fecha(hasta)
    if d_desde:
        q = q.filter(Actividad.fecha >= datetime.combine(d_desde, time.min, tzinfo=timezone.utc))
    if d_hasta:
        q = q.filter(Actividad.fecha <= datetime.combine(d_hasta, time.max, tzinfo=timezone.utc))
    return q.order_by(Actividad.fecha.desc()).limit(limite).all()
