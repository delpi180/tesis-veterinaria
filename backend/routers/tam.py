from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Evaluador, RespuestaTAM
from schemas import TAMCreate, TAMOut

router = APIRouter(prefix="/api/tam", tags=["Encuesta TAM"])


def _calcular_tam(p: dict) -> tuple[float, float, float]:
    util      = round(sum(p[f"p{i}"] for i in range(1,  6)) / 5, 2)
    facilidad = round(sum(p[f"p{i}"] for i in range(6, 10)) / 4, 2)
    intencion = round(sum(p[f"p{i}"] for i in range(10, 13)) / 3, 2)
    return util, facilidad, intencion


@router.post("/", response_model=TAMOut, status_code=status.HTTP_201_CREATED)
def crear_tam(payload: TAMCreate, db: Session = Depends(get_db)):
    if not db.get(Evaluador, payload.evaluador_id):
        raise HTTPException(status_code=404, detail="Evaluador no encontrado")
    datos = payload.model_dump()
    datos["util_percibida"], datos["facilidad_uso"], datos["intencion_uso"] = _calcular_tam(datos)
    respuesta = RespuestaTAM(**datos)
    db.add(respuesta)
    db.commit()
    db.refresh(respuesta)
    return respuesta


@router.get("/", response_model=list[TAMOut])
def listar_tam(db: Session = Depends(get_db)):
    return db.query(RespuestaTAM).order_by(RespuestaTAM.creado_en.desc()).all()


@router.get("/{respuesta_id}", response_model=TAMOut)
def obtener_tam(respuesta_id: int, db: Session = Depends(get_db)):
    r = db.get(RespuestaTAM, respuesta_id)
    if not r:
        raise HTTPException(status_code=404, detail="Respuesta TAM no encontrada")
    return r
