import os
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session

from database import get_db
from models import Servicio, VentaItem
from schemas import (
    ServicioCreate, ServicioUpdate, ServicioOut,
    ServicioInterpretarReq, ServInItemPreview, ServiciosAplicarReq,
)
from services.servicio_extractor import interpretar_servicios
from services.transcription import transcribe_audio

router = APIRouter(prefix="/api/servicios", tags=["Servicios"])


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _armar_preview_serv(items: list[dict], db: Session) -> list[dict]:
    """Marca cada servicio como 'nuevo' o 'actualizar' (si ya existe por nombre)."""
    existentes = db.query(Servicio).all()
    por_nombre = {_norm(s.nombre): s for s in existentes}
    preview = []
    for it in items:
        match = por_nombre.get(_norm(it["nombre"]))
        if match:
            preview.append({**it, "accion": "actualizar", "servicio_id": match.id})
        else:
            preview.append({**it, "accion": "nuevo", "servicio_id": None})
    return preview


@router.post("/", response_model=ServicioOut, status_code=status.HTTP_201_CREATED)
def crear_servicio(payload: ServicioCreate, db: Session = Depends(get_db)):
    servicio = Servicio(**payload.model_dump())
    db.add(servicio)
    db.commit()
    db.refresh(servicio)
    return servicio


@router.get("/", response_model=list[ServicioOut])
def listar_servicios(
    solo_activos: bool = Query(True, description="Filtrar por activo=True"),
    db: Session = Depends(get_db),
):
    q = db.query(Servicio)
    if solo_activos:
        q = q.filter(Servicio.activo.is_(True))
    return q.order_by(Servicio.nombre).all()


@router.get("/{servicio_id}", response_model=ServicioOut)
def obtener_servicio(servicio_id: int, db: Session = Depends(get_db)):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return s


@router.put("/{servicio_id}", response_model=ServicioOut)
def actualizar_servicio(
    servicio_id: int, payload: ServicioUpdate, db: Session = Depends(get_db)
):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(s, campo, valor)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{servicio_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_servicio(servicio_id: int, db: Session = Depends(get_db)):
    s = db.get(Servicio, servicio_id)
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    usado = db.query(VentaItem.id).filter(VentaItem.servicio_id == servicio_id).first()
    if usado:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el servicio figura en ventas. "
                   "Desactívalo para retirarlo del catálogo sin perder el historial.",
        )

    db.delete(s)
    db.commit()


# ── Catálogo de servicios por voz/texto (IA) ─────────────────────────────────

@router.post("/interpretar", response_model=list[ServInItemPreview])
def interpretar(body: ServicioInterpretarReq, db: Session = Depends(get_db)):
    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío.")
    try:
        items = interpretar_servicios(body.texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _armar_preview_serv(items, db)


@router.post("/interpretar-audio", response_model=list[ServInItemPreview])
async def interpretar_audio(audio: UploadFile = File(...), db: Session = Depends(get_db)):
    allowed = {".wav", ".mp3", ".mp4", ".m4a", ".webm", ".ogg", ".flac"}
    ext = os.path.splitext(audio.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Formato de audio no soportado: '{ext}'.")
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="El audio está vacío.")
    try:
        import asyncio
        texto = await asyncio.to_thread(transcribe_audio, data, filename=audio.filename or "serv.webm")
        items = await asyncio.to_thread(interpretar_servicios, texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _armar_preview_serv(items, db)



@router.post("/aplicar")
def aplicar(body: ServiciosAplicarReq, db: Session = Depends(get_db)):
    """Crea servicios nuevos y actualiza los existentes (precio/descripción)."""
    creados, actualizados = [], []
    try:
        for it in body.items:
            if it.accion == "nuevo":
                s = Servicio(
                    nombre=it.nombre, descripcion=it.descripcion,
                    precio=it.precio, precio_variable=it.precio_variable, activo=True,
                )
                db.add(s)
                creados.append(it.nombre)
            else:  # actualizar existente
                s = db.get(Servicio, it.servicio_id)
                if not s:
                    raise HTTPException(status_code=404, detail=f"Servicio id={it.servicio_id} no existe.")
                s.precio = it.precio
                s.precio_variable = it.precio_variable
                if it.descripcion:
                    s.descripcion = it.descripcion
                s.activo = True
                actualizados.append(s.nombre)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al aplicar servicios: {e}")

    return {"creados": creados, "actualizados": actualizados, "total": len(creados) + len(actualizados)}
