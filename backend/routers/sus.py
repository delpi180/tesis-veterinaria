from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Evaluador, RespuestaSUS
from schemas import SUSCreate, SUSOut

router = APIRouter(prefix="/api/sus", tags=["Encuesta SUS"])


def _calcular_sus(p: dict) -> int:
    positivos = sum(p[f"p{i}"] - 1 for i in [1, 3, 5, 7, 9])
    negativos = sum(5 - p[f"p{i}"] for i in [2, 4, 6, 8, 10])
    return int((positivos + negativos) * 2.5)


@router.post("/", response_model=SUSOut, status_code=status.HTTP_201_CREATED)
def crear_sus(payload: SUSCreate, db: Session = Depends(get_db)):
    if not db.get(Evaluador, payload.evaluador_id):
        raise HTTPException(status_code=404, detail="Evaluador no encontrado")
    datos = payload.model_dump()
    datos["puntaje"] = _calcular_sus(datos)
    respuesta = RespuestaSUS(**datos)
    db.add(respuesta)
    db.commit()
    db.refresh(respuesta)
    return respuesta


@router.get("/", response_model=list[SUSOut])
def listar_sus(db: Session = Depends(get_db)):
    return db.query(RespuestaSUS).order_by(RespuestaSUS.creado_en.desc()).all()


@router.get("/{respuesta_id}", response_model=SUSOut)
def obtener_sus(respuesta_id: int, db: Session = Depends(get_db)):
    r = db.get(RespuestaSUS, respuesta_id)
    if not r:
        raise HTTPException(status_code=404, detail="Respuesta SUS no encontrada")
    return r
