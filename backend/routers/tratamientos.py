"""Tratamientos en curso: la lista de trabajo que no existía.

Hasta acá, lo indicado en una consulta se escribía y se olvidaba. No había
forma de saber qué mascotas están medicadas hoy, cuáles terminan esta semana
ni cuáles llegaron a su fin sin que nadie volviera a verlas. Esto último es lo
que se cae entre las sillas en una clínica: el tratamiento termina, el dueño
no vuelve, y nadie se entera hasta que el animal recae.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Cita, HistoriaClinica, Paciente, Tratamiento, Usuario
from core.deps import usuario_actual

router = APIRouter(prefix="/api/tratamientos", tags=["Tratamientos"])

ESTADOS_CERRABLES = ("terminado", "suspendido")


def _salida(t: Tratamiento, hoy: date, sin_control_ids: set[int]) -> dict:
    pac = t.paciente
    estado = t.estado_actual
    dias_restantes = (t.fin - hoy).days if (t.fin and estado == "en_curso") else None
    return {
        "id": t.id,
        "paciente_id": t.paciente_id,
        "paciente": pac.nombre if pac else None,
        "especie": pac.especie if pac else None,
        "cliente_id": pac.cliente_id if pac else None,
        "propietario": pac.cliente.nombre if pac and pac.cliente else None,
        "telefono": pac.cliente.telefono if pac and pac.cliente else None,
        "historia_id": t.historia_id,
        "medicamento": t.medicamento,
        "dosis": t.dosis,
        "via": t.via,
        "frecuencia": t.frecuencia,
        "dias": t.dias,
        "inicio": t.inicio.isoformat() if t.inicio else None,
        "fin": t.fin.isoformat() if t.fin else None,
        "estado": estado,
        "dias_restantes": dias_restantes,
        "motivo_corte": t.motivo_corte,
        "veterinario": t.veterinario_nombre,
        # "Terminó y no volvió": el tratamiento llegó a su fin y no hay ni una
        # consulta ni un turno posterior. Es el que hay que llamar.
        "sin_control": estado == "terminado" and t.estado != "suspendido" and t.id in sin_control_ids,
    }


def _sin_control_posterior(db: Session, tratamientos: list[Tratamiento]) -> set[int]:
    """Ids de tratamientos terminados sin consulta ni turno después del fin."""
    pendientes = [t for t in tratamientos if t.fin and t.estado_actual == "terminado"]
    if not pendientes:
        return set()

    ids_pacientes = {t.paciente_id for t in pendientes}
    consultas = (
        db.query(HistoriaClinica.paciente_id, HistoriaClinica.fecha)
        .filter(HistoriaClinica.paciente_id.in_(ids_pacientes))
        .all()
    )
    turnos = (
        db.query(Cita.paciente_id, Cita.fecha_hora)
        .filter(Cita.paciente_id.in_(ids_pacientes), Cita.estado != "cancelada")
        .all()
    )
    por_paciente: dict[int, list[date]] = {}
    for pid, cuando in list(consultas) + list(turnos):
        if cuando:
            por_paciente.setdefault(pid, []).append(cuando.date())

    fuera = set()
    for t in pendientes:
        posteriores = [d for d in por_paciente.get(t.paciente_id, []) if d > t.fin]
        if not posteriores:
            fuera.add(t.id)
    return fuera


@router.get("/")
def listar(
    estado: Optional[str] = Query(None, description="en_curso | terminado | suspendido | sin_duracion"),
    paciente_id: Optional[int] = Query(None),
    dias: int = Query(90, ge=1, le=365, description="Ventana hacia atrás, en días"),
    db: Session = Depends(get_db),
):
    hoy = datetime.now(timezone.utc).date()
    desde = hoy - timedelta(days=dias)

    q = (
        db.query(Tratamiento)
        .options(joinedload(Tratamiento.paciente).joinedload(Paciente.cliente),
                 joinedload(Tratamiento.veterinario))
    )
    if paciente_id:
        q = q.filter(Tratamiento.paciente_id == paciente_id)
    else:
        # Sin filtro de paciente esto es la bandeja de la clínica: lo viejo no
        # aporta y haría la lista impracticable.
        q = q.filter(Tratamiento.inicio >= desde)

    filas = q.order_by(Tratamiento.fin.asc().nullslast(), Tratamiento.id.desc()).all()
    sin_control_ids = _sin_control_posterior(db, filas)
    salida = [_salida(t, hoy, sin_control_ids) for t in filas]
    if estado:
        salida = [s for s in salida if s["estado"] == estado]
    return salida


@router.get("/resumen")
def resumen(db: Session = Depends(get_db)):
    """Los tres números de la pantalla, para no traerse la lista entera."""
    hoy = datetime.now(timezone.utc).date()
    filas = (
        db.query(Tratamiento)
        .filter(Tratamiento.inicio >= hoy - timedelta(days=90))
        .all()
    )
    sin_control_ids = _sin_control_posterior(db, filas)
    en_curso = sum(1 for t in filas if t.estado_actual == "en_curso")
    terminan_semana = sum(
        1 for t in filas
        if t.estado_actual == "en_curso" and t.fin and t.fin <= hoy + timedelta(days=7)
    )
    return {
        "en_curso": en_curso,
        "terminan_semana": terminan_semana,
        "sin_control": len(sin_control_ids),
        "sin_duracion": sum(1 for t in filas if t.estado_actual == "sin_duracion"),
    }


class CierreTratamiento(BaseModel):
    estado: str                      # terminado | suspendido
    motivo: Optional[str] = None


@router.put("/{tratamiento_id}")
def cerrar(
    tratamiento_id: int,
    payload: CierreTratamiento,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Cierra o suspende un tratamiento.

    Suspender no es lo mismo que terminar y por eso se piden separados: uno
    dice "se cumplió", el otro "se cortó" — y el motivo del corte es
    información clínica (reacción adversa, no lo toleró, el dueño lo dejó).
    """
    t = db.get(Tratamiento, tratamiento_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    if payload.estado not in ESTADOS_CERRABLES:
        raise HTTPException(status_code=422, detail="Estado inválido: usa 'terminado' o 'suspendido'.")
    if payload.estado == "suspendido" and not (payload.motivo or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Indica por qué se suspendió: queda en la historia del animal.",
        )

    t.estado = payload.estado
    t.motivo_corte = (payload.motivo or "").strip()[:200] or None
    t.cerrado_por = usuario.usuario if usuario else None
    t.cerrado_en = datetime.now(timezone.utc)
    # Un tratamiento cortado terminó hoy, no el día que estaba previsto.
    if payload.estado == "suspendido":
        t.fin = datetime.now(timezone.utc).date()
    db.commit()
    db.refresh(t)
    hoy = datetime.now(timezone.utc).date()
    return _salida(t, hoy, set())


@router.post("/{tratamiento_id}/reabrir")
def reabrir(
    tratamiento_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Deshace un cierre marcado por error."""
    t = db.get(Tratamiento, tratamiento_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tratamiento no encontrado")
    t.estado = "en_curso"
    t.motivo_corte = None
    t.cerrado_por = None
    t.cerrado_en = None
    db.commit()
    db.refresh(t)
    return _salida(t, datetime.now(timezone.utc).date(), set())
