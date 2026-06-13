from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Evaluador
from schemas import EvaluadorCreate, EvaluadorOut

router = APIRouter(prefix="/api/evaluadores", tags=["Evaluadores"])


@router.post("/", response_model=EvaluadorOut, status_code=status.HTTP_201_CREATED)
def crear_evaluador(payload: EvaluadorCreate, db: Session = Depends(get_db)):
    evaluador = Evaluador(**payload.model_dump())
    db.add(evaluador)
    db.commit()
    db.refresh(evaluador)
    return evaluador


@router.get("/", response_model=list[EvaluadorOut])
def listar_evaluadores(db: Session = Depends(get_db)):
    return db.query(Evaluador).order_by(Evaluador.creado_en.desc()).all()


@router.get("/{evaluador_id}", response_model=EvaluadorOut)
def obtener_evaluador(evaluador_id: int, db: Session = Depends(get_db)):
    evaluador = db.get(Evaluador, evaluador_id)
    if not evaluador:
        raise HTTPException(status_code=404, detail="Evaluador no encontrado")
    return evaluador
