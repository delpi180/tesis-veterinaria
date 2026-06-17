"""Control de asistencia del personal (marcaciones de ingreso/salida).

Reservado a la administradora (recepcionista): registra cuándo entra y sale
cada doctor. Permite consultar un reporte por doctor y rango de fechas.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import Asistencia, Usuario
from schemas import AsistenciaIngresoReq, AsistenciaOut
from core.deps import solo_admin

router = APIRouter(prefix="/api/asistencia", tags=["Asistencia"])

# Perú usa UTC-5; calculamos la "fecha laboral" en hora local para que una
# marcación nocturna no se cuente en el día siguiente (UTC).
PERU_TZ = timezone(timedelta(hours=-5))


def _ahora_local() -> datetime:
    return datetime.now(PERU_TZ)


@router.post("/ingreso", response_model=AsistenciaOut, status_code=status.HTTP_201_CREATED)
def marcar_ingreso(payload: AsistenciaIngresoReq, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)

    doctor = db.get(Usuario, payload.usuario_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    ahora = _ahora_local()
    hoy = ahora.date()

    # Evitar una segunda marcación abierta (sin salida) el mismo día
    abierta = (
        db.query(Asistencia)
        .filter(
            Asistencia.usuario_id == payload.usuario_id,
            Asistencia.fecha == hoy,
            Asistencia.hora_salida.is_(None),
        )
        .first()
    )
    if abierta:
        raise HTTPException(
            status_code=409,
            detail=f"{doctor.nombre} ya tiene un ingreso sin salida registrado hoy.",
        )

    asistencia = Asistencia(
        usuario_id=payload.usuario_id,
        fecha=hoy,
        hora_ingreso=ahora,
        notas=payload.notas,
        registrado_por=getattr(request.state, "usuario", None),
    )
    db.add(asistencia)
    db.commit()
    db.refresh(asistencia)
    return asistencia


@router.post("/{asistencia_id}/salida", response_model=AsistenciaOut)
def marcar_salida(asistencia_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)

    asistencia = db.get(Asistencia, asistencia_id)
    if not asistencia:
        raise HTTPException(status_code=404, detail="Marcación no encontrada")
    if asistencia.hora_salida is not None:
        raise HTTPException(status_code=409, detail="Esta marcación ya tiene salida registrada.")

    asistencia.hora_salida = _ahora_local()
    db.commit()
    db.refresh(asistencia)
    return asistencia


@router.get("/", response_model=list[AsistenciaOut])
def listar_asistencia(
    request: Request,
    usuario_id: Optional[int] = Query(None),
    desde: Optional[str] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: Optional[str] = Query(None, description="Fecha fin YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    solo_admin(request)

    q = db.query(Asistencia)
    if usuario_id is not None:
        q = q.filter(Asistencia.usuario_id == usuario_id)
    if desde:
        q = q.filter(Asistencia.fecha >= desde)
    if hasta:
        q = q.filter(Asistencia.fecha <= hasta)
    return q.order_by(Asistencia.fecha.desc(), Asistencia.hora_ingreso.desc()).all()


@router.delete("/{asistencia_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_asistencia(asistencia_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    asistencia = db.get(Asistencia, asistencia_id)
    if not asistencia:
        raise HTTPException(status_code=404, detail="Marcación no encontrada")
    db.delete(asistencia)
    db.commit()
