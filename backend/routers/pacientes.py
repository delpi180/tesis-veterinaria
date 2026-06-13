from datetime import time

import base64

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from database import get_db
from models import Cita, Paciente, HistoriaClinica
from schemas import (
    PacienteOut, PacienteUpdate,
    HistoriaClinicaCreate, HistoriaClinicaOut,
)

router = APIRouter(prefix="/api/pacientes", tags=["Pacientes"])


def _generar_cita_proxima(db: Session, historia: HistoriaClinica) -> None:
    """
    Crea un turno en la agenda a partir de la 'próxima cita' de una historia.
    Evita duplicados: no crea otra cita si ya existe una para ese paciente a la
    misma fecha/hora. Si la hora viene en 00:00 (fecha sin hora), usa las 09:00.
    """
    fecha = historia.proxima_cita
    if not fecha:
        return

    # Fecha sin hora → asignar 09:00 (apertura de clínica) para que no caiga a medianoche
    if fecha.hour == 0 and fecha.minute == 0:
        fecha = fecha.replace(hour=9, minute=0)

    existe = (
        db.query(Cita.id)
        .filter(Cita.paciente_id == historia.paciente_id, Cita.fecha_hora == fecha)
        .first()
    )
    if existe:
        return

    db.add(Cita(
        paciente_id=historia.paciente_id,
        fecha_hora=fecha,
        motivo="Control (programado en consulta)",
        estado="pendiente",
        notas=f"Generado automáticamente desde la historia clínica #{historia.id}",
    ))


@router.get("/{paciente_id}", response_model=PacienteOut)
def obtener_paciente(paciente_id: int, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


@router.put("/{paciente_id}", response_model=PacienteOut)
def actualizar_paciente(
    paciente_id: int, payload: PacienteUpdate, db: Session = Depends(get_db)
):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(paciente, campo, valor)
    db.commit()
    db.refresh(paciente)
    return paciente


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_paciente(paciente_id: int, db: Session = Depends(get_db)):
    """Elimina la mascota junto con sus historias y citas (cascade en el modelo)."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    db.delete(paciente)
    db.commit()


# ── Historias clínicas de un paciente ────────────────────────────────────────

@router.post(
    "/{paciente_id}/historias/",
    response_model=HistoriaClinicaOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_historia(
    paciente_id: int, payload: HistoriaClinicaCreate, db: Session = Depends(get_db)
):
    print(f"[DEBUG] POST /historias/ — paciente_id={paciente_id} payload={payload.model_dump()}")
    if not db.get(Paciente, paciente_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    try:
        historia = HistoriaClinica(**payload.model_dump(), paciente_id=paciente_id)
        db.add(historia)
        db.flush()  # obtener historia.id antes de generar la cita
        # Si la consulta fijó una próxima cita, agéndala en Turnos automáticamente
        _generar_cita_proxima(db, historia)
        db.commit()
        db.refresh(historia)
        print(f"[DEBUG] Historia guardada OK — id={historia.id} fecha={historia.fecha}")
        return historia
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Fallo al guardar historia: {e}")
        raise HTTPException(status_code=500, detail=f"Error al guardar historia clínica: {str(e)}")


@router.get("/{paciente_id}/historias/", response_model=list[HistoriaClinicaOut])
def listar_historias(paciente_id: int, db: Session = Depends(get_db)):
    return (
        db.query(HistoriaClinica)
        .filter(HistoriaClinica.paciente_id == paciente_id)
        .order_by(HistoriaClinica.fecha.desc())
        .all()
    )


@router.get("/{paciente_id}/historias/{historia_id}", response_model=HistoriaClinicaOut)
def obtener_historia(
    paciente_id: int, historia_id: int, db: Session = Depends(get_db)
):
    historia = db.get(HistoriaClinica, historia_id)
    if not historia or historia.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Historia clínica no encontrada")
    return historia


@router.put("/{paciente_id}/historias/{historia_id}", response_model=HistoriaClinicaOut)
def actualizar_historia(
    paciente_id: int,
    historia_id: int,
    payload: HistoriaClinicaCreate,
    db: Session = Depends(get_db),
):
    historia = db.get(HistoriaClinica, historia_id)
    if not historia or historia.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Historia clínica no encontrada")
    cita_anterior = historia.proxima_cita
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(historia, campo, valor)
    # Si la próxima cita cambió a un valor nuevo, agéndala en Turnos
    if historia.proxima_cita and historia.proxima_cita != cita_anterior:
        _generar_cita_proxima(db, historia)
    db.commit()
    db.refresh(historia)
    return historia


# ── Foto de la mascota ───────────────────────────────────────────────────────

@router.post("/{paciente_id}/foto")
async def subir_foto(paciente_id: int, foto: UploadFile = File(...), db: Session = Depends(get_db)):
    """Sube una foto de la mascota y la guarda como data URI (base64) en la BD."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    MAX_SIZE = 2 * 1024 * 1024  # 2 MB
    contenido = await foto.read()
    if len(contenido) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"La imagen excede el tamaño máximo de 2 MB ({len(contenido)} bytes).",
        )

    import os
    ext = os.path.splitext(foto.filename or "foto.png")[-1].lstrip(".").lower()
    if ext == "jpg":
        ext = "jpeg"
    b64 = base64.b64encode(contenido).decode("utf-8")
    data_uri = f"data:image/{ext};base64,{b64}"

    paciente.foto_url = data_uri
    db.commit()
    db.refresh(paciente)
    return {"foto_url": paciente.foto_url}
