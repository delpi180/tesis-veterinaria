from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from models import Cita, Paciente
from schemas import CitaCreate, CitaUpdate, CitaResponse

router = APIRouter(prefix="/api/citas", tags=["Citas"])


@router.post("/", response_model=CitaResponse, status_code=status.HTTP_201_CREATED)
def crear_cita(payload: CitaCreate, db: Session = Depends(get_db)):
    if not db.get(Paciente, payload.paciente_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    cita = Cita(**payload.model_dump())
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita


@router.get("/", response_model=list[CitaResponse])
def listar_citas(
    paciente_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    veterinario_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Cita)
    if paciente_id is not None:
        q = q.filter(Cita.paciente_id == paciente_id)
    if estado is not None:
        q = q.filter(Cita.estado == estado)
    if veterinario_id is not None:
        q = q.filter(Cita.veterinario_id == veterinario_id)
    return q.order_by(Cita.fecha_hora).all()


@router.get("/{cita_id}", response_model=CitaResponse)
def obtener_cita(cita_id: int, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


@router.put("/{cita_id}", response_model=CitaResponse)
def actualizar_cita(cita_id: int, payload: CitaUpdate, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(cita, campo, valor)
    db.commit()
    db.refresh(cita)
    return cita


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cita(cita_id: int, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    db.delete(cita)
    db.commit()
