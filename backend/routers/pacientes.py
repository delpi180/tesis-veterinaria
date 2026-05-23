from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Paciente, HistoriaClinica
from schemas import (
    PacienteOut,
    HistoriaClinicaCreate, HistoriaClinicaOut,
)

router = APIRouter(prefix="/api/pacientes", tags=["Pacientes"])


@router.get("/{paciente_id}", response_model=PacienteOut)
def obtener_paciente(paciente_id: int, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return paciente


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
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(historia, campo, valor)
    db.commit()
    db.refresh(historia)
    return historia
