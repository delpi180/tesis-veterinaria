"""Control de asistencia del personal (marcaciones de ingreso/salida).

Reservado a la administradora (recepcionista): registra cuándo entra y sale
cada doctor. Permite consultar un reporte por doctor y rango de fechas.
"""
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import Asistencia, Usuario
from schemas import AsistenciaIngresoReq, AsistenciaOut, AsistenciaUpdate
from core.deps import solo_admin

router = APIRouter(prefix="/api/asistencia", tags=["Asistencia"])

# Perú usa UTC-5; calculamos la "fecha laboral" en hora local para que una
# marcación nocturna no se cuente en el día siguiente (UTC).
PERU_TZ = timezone(timedelta(hours=-5))


def _ahora_local() -> datetime:
    return datetime.now(PERU_TZ)


@router.post("/ingreso", response_model=AsistenciaOut, status_code=status.HTTP_201_CREATED)
def marcar_ingreso(
    payload: AsistenciaIngresoReq,
    request: Request,
    db: Session = Depends(get_db),
):
    # El control de asistencia lo lleva la recepción: es quien ve entrar y salir
    # al personal y quien ajusta los horarios cuando varían. El doctor consulta
    # su marcación en "Mi panel", pero no la registra él mismo.
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
    request.state.actividad_detalle = doctor.nombre
    return asistencia


@router.post("/{asistencia_id}/salida", response_model=AsistenciaOut)
def marcar_salida(
    asistencia_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    asistencia = db.get(Asistencia, asistencia_id)
    if not asistencia:
        raise HTTPException(status_code=404, detail="Marcación no encontrada")
    if asistencia.hora_salida is not None:
        raise HTTPException(status_code=409, detail="Esta marcación ya tiene salida registrada.")

    # Igual que el ingreso: la salida la registra la recepción.
    solo_admin(request)

    asistencia.hora_salida = _ahora_local()
    db.commit()
    db.refresh(asistencia)
    request.state.actividad_detalle = asistencia.usuario.nombre if asistencia.usuario else None
    return asistencia


@router.get("/", response_model=list[AsistenciaOut])
def listar_asistencia(
    request: Request,
    usuario_id: Optional[int] = Query(None),
    desde: Optional[date] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: Optional[date] = Query(None, description="Fecha fin YYYY-MM-DD"),
    skip: int = Query(0, ge=0),
    limit: int = Query(2000, ge=1, le=5000),
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
    return (
        q.order_by(Asistencia.fecha.desc(), Asistencia.hora_ingreso.desc())
        .offset(skip).limit(limit).all()
    )


@router.get("/resumen")
def resumen_asistencia(
    request: Request,
    desde: Optional[date] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: Optional[date] = Query(None, description="Fecha fin YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Totales por doctor en el rango: días, horas trabajadas y tardanzas."""
    solo_admin(request)

    q = db.query(Asistencia)
    if desde:
        q = q.filter(Asistencia.fecha >= desde)
    if hasta:
        q = q.filter(Asistencia.fecha <= hasta)

    agg: dict[int, dict] = {}
    for r in q.all():
        a = agg.setdefault(r.usuario_id, {
            "usuario_id": r.usuario_id,
            "usuario_nombre": r.usuario_nombre,
            "dias": 0,
            "total_horas": 0.0,
            "tardanzas": 0,
        })
        a["dias"] += 1
        if r.hora_ingreso and r.hora_salida:
            seg = (r.hora_salida - r.hora_ingreso).total_seconds()
            if seg > 0:
                a["total_horas"] += seg / 3600
        if r.hora_ingreso and r.hora_entrada_perfil:
            try:
                sh, sm = (int(x) for x in r.hora_entrada_perfil.split(":"))
                local_dt = r.hora_ingreso
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=timezone.utc)
                local_dt = local_dt.astimezone(PERU_TZ)
                
                if (local_dt.hour * 60 + local_dt.minute) - (sh * 60 + sm) > 0:
                    a["tardanzas"] += 1
            except (ValueError, AttributeError):
                pass

    salida = sorted(agg.values(), key=lambda x: (x["usuario_nombre"] or "").lower())
    for a in salida:
        a["total_horas"] = round(a["total_horas"], 2)
    return salida


@router.put("/{asistencia_id}", response_model=AsistenciaOut)
def corregir_asistencia(
    asistencia_id: int,
    payload: AsistenciaUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Ajusta la hora real de ingreso/salida de una marcación.

    Los horarios del personal varían y la recepción no siempre alcanza a marcar
    en el momento exacto. Antes la única salida era borrar la marcación y
    volver a crearla (perdiendo el registro); ahora se corrige.
    """
    solo_admin(request)
    asistencia = db.get(Asistencia, asistencia_id)
    if not asistencia:
        raise HTTPException(status_code=404, detail="Marcación no encontrada")

    datos = payload.model_dump(exclude_unset=True)

    # Validar contra los valores que quedarán finalmente (uno puede venir en el
    # payload y el otro ya estar guardado).
    ingreso_final = datos.get("hora_ingreso", asistencia.hora_ingreso)
    salida_final  = datos.get("hora_salida",  asistencia.hora_salida)
    if ingreso_final and salida_final and salida_final <= ingreso_final:
        raise HTTPException(
            status_code=422,
            detail="La hora de salida debe ser posterior a la de ingreso.",
        )

    for campo, valor in datos.items():
        setattr(asistencia, campo, valor)
    # La fecha laboral sigue a la hora de ingreso (hora de Perú)
    if asistencia.hora_ingreso:
        local = asistencia.hora_ingreso
        if local.tzinfo is None:
            local = local.replace(tzinfo=timezone.utc)
        asistencia.fecha = local.astimezone(PERU_TZ).date()

    db.commit()
    db.refresh(asistencia)
    request.state.actividad_detalle = asistencia.usuario.nombre if asistencia.usuario else None
    return asistencia


@router.delete("/{asistencia_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_asistencia(asistencia_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    asistencia = db.get(Asistencia, asistencia_id)
    if not asistencia:
        raise HTTPException(status_code=404, detail="Marcación no encontrada")
    db.delete(asistencia)
    db.commit()
