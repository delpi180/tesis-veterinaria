import logging
import os
from datetime import datetime, time, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, Form, HTTPException, Query, Request, Response,
    UploadFile, File, status,
)
from sqlalchemy.orm import Session

from database import get_db
from models import Cita, DocumentoPaciente, Paciente, HistoriaClinica, RegistroClinico, Usuario
from schemas import (
    PacienteOut, PacienteUpdate,
    HistoriaClinicaCreate, HistoriaClinicaOut,
    DocumentoOut,
    RegistroClinicoCreate, RegistroClinicoOut,
)
from core.deps import usuario_actual

router = APIRouter(prefix="/api/pacientes", tags=["Pacientes"])
logger = logging.getLogger("vetlospinos")


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
        veterinario_id=historia.veterinario_id,  # se asigna al doctor que atendió
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
    paciente_id: int,
    payload: HistoriaClinicaCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    request.state.actividad_detalle = paciente.nombre
    try:
        historia = HistoriaClinica(
            **payload.model_dump(),
            paciente_id=paciente_id,
            veterinario_id=usuario.id if usuario else None,  # firma del doctor
        )
        db.add(historia)
        db.flush()  # obtener historia.id antes de generar la cita
        # Si la consulta fijó una próxima cita, agéndala en Turnos automáticamente
        _generar_cita_proxima(db, historia)
        db.commit()
        db.refresh(historia)
        return historia
    except Exception:
        db.rollback()
        # Registramos el detalle del lado servidor (sin exponerlo al cliente ni
        # volcar datos clínicos del paciente en los logs).
        logger.exception("Fallo al guardar historia clínica (paciente_id=%s)", paciente_id)
        raise HTTPException(status_code=500, detail="No se pudo guardar la historia clínica.")


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
    request: Request,
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
    request.state.actividad_detalle = historia.paciente.nombre if historia.paciente else f"historia #{historia_id}"
    db.commit()
    db.refresh(historia)
    return historia


@router.delete(
    "/{paciente_id}/historias/{historia_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_historia(
    paciente_id: int,
    historia_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Elimina una consulta del historial clínico del paciente."""
    historia = db.get(HistoriaClinica, historia_id)
    if not historia or historia.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Historia clínica no encontrada")
    request.state.actividad_detalle = historia.paciente.nombre if historia.paciente else f"historia #{historia_id}"
    db.delete(historia)
    db.commit()


# ── Documentos complementarios (radiografías, análisis, recetas, etc.) ────────

MAX_DOC_MB = 10
CATEGORIAS_DOC = {"radiografia", "analisis", "receta", "otro"}
EXTENSIONES_DOC = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".dcm",
}


@router.post(
    "/{paciente_id}/documentos/",
    response_model=DocumentoOut,
    status_code=status.HTTP_201_CREATED,
)
async def subir_documento(
    paciente_id: int,
    request: Request,
    archivo: UploadFile = File(...),
    categoria: str = Form("otro"),
    descripcion: str = Form(""),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Sube un archivo complementario y lo guarda en la BD."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")

    cat = categoria if categoria in CATEGORIAS_DOC else "otro"
    ext = os.path.splitext(archivo.filename or "")[-1].lower()
    if ext not in EXTENSIONES_DOC:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido: '{ext}'. "
                   f"Acepta imágenes, PDF y documentos de oficina.",
        )

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(contenido) > MAX_DOC_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"El archivo pesa {len(contenido) / 1024 / 1024:.1f} MB y "
                   f"supera el límite de {MAX_DOC_MB} MB.",
        )

    doc = DocumentoPaciente(
        paciente_id=paciente_id,
        nombre=archivo.filename or "documento",
        categoria=cat,
        descripcion=(descripcion or "").strip() or None,
        mime_type=archivo.content_type,
        tamano_bytes=len(contenido),
        contenido=contenido,
        subido_por=usuario.usuario if usuario else None,
    )
    db.add(doc)
    request.state.actividad_detalle = f"{paciente.nombre} — {doc.nombre}"
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{paciente_id}/documentos/", response_model=list[DocumentoOut])
def listar_documentos(paciente_id: int, db: Session = Depends(get_db)):
    return (
        db.query(DocumentoPaciente)
        .filter(DocumentoPaciente.paciente_id == paciente_id)
        .order_by(DocumentoPaciente.creado_en.desc())
        .all()
    )


@router.get("/{paciente_id}/documentos/{documento_id}/descargar")
def descargar_documento(paciente_id: int, documento_id: int, db: Session = Depends(get_db)):
    doc = db.get(DocumentoPaciente, documento_id)
    if not doc or doc.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return Response(
        content=doc.contenido,
        media_type=doc.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{doc.nombre}"'},
    )


@router.delete(
    "/{paciente_id}/documentos/{documento_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_documento(
    paciente_id: int,
    documento_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    doc = db.get(DocumentoPaciente, documento_id)
    if not doc or doc.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    request.state.actividad_detalle = f"{doc.paciente.nombre if doc.paciente else paciente_id} — {doc.nombre}"
    db.delete(doc)
    db.commit()


# ── Registros complementarios (antiparasitarios / estética) ───────────────────

@router.post(
    "/{paciente_id}/registros/",
    response_model=RegistroClinicoOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_registro(
    paciente_id: int,
    payload: RegistroClinicoCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    reg = RegistroClinico(
        paciente_id=paciente_id,
        tipo=payload.tipo,
        fecha=datos.get("fecha"),  # si viene None, el default del modelo pone hoy
        producto=(payload.producto or None),
        notas=(payload.notas or None),
        registrado_por=usuario.usuario if usuario else None,
    )
    if reg.fecha is None:
        reg.fecha = datetime.now(timezone.utc).date()
    db.add(reg)
    request.state.actividad_detalle = f"{paciente.nombre} — {payload.tipo}"
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/{paciente_id}/registros/", response_model=list[RegistroClinicoOut])
def listar_registros(
    paciente_id: int,
    tipo: Optional[str] = Query(None, description="antiparasitario | estetica"),
    db: Session = Depends(get_db),
):
    q = db.query(RegistroClinico).filter(RegistroClinico.paciente_id == paciente_id)
    if tipo:
        q = q.filter(RegistroClinico.tipo == tipo)
    return q.order_by(RegistroClinico.fecha.desc(), RegistroClinico.id.desc()).all()


@router.delete(
    "/{paciente_id}/registros/{registro_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_registro(
    paciente_id: int,
    registro_id: int,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    reg = db.get(RegistroClinico, registro_id)
    if not reg or reg.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    request.state.actividad_detalle = f"{paciente_id} — {reg.tipo}"
    db.delete(reg)
    db.commit()

