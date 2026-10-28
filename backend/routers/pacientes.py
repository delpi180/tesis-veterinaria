import logging
import os
from datetime import datetime, time, timedelta, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, Form, HTTPException, Query, Request, Response,
    UploadFile, File, status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Cita, Cliente, DocumentoPaciente, Paciente, HistoriaClinica, RegistroClinico, Receta, Usuario, VacunaAvisada
from schemas import (
    CambiarResponsableIn,
    PacienteOut, PacienteUpdate,
    HistoriaClinicaCreate, HistoriaClinicaOut,
    DocumentoOut,
    RegistroClinicoCreate, RegistroClinicoOut,
    RecetaCreate, RecetaUpdate, RecetaOut,
)
from core.deps import usuario_actual
from services.tratamientos import sincronizar_desde_historia as sincronizar_tratamientos
from services.resumen_previo import armar_resumen_previo
from core.tiempo import PERU_TZ, hoy_peru

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

    # Varios doctores atendiendo a la misma hora está bien (es una clínica con
    # varios consultorios); lo que no puede pasar es que UNO quede con dos
    # turnos encima. El alta manual de turnos ya lo impide, pero este camino
    # no pasaba por ahí y sí podía duplicarlo.
    #
    # No se aborta: la consulta no puede dejar de guardarse por un tema de
    # agenda. El turno se crea sin doctor y recepción lo ubica.
    veterinario_id = historia.veterinario_id
    if veterinario_id:
        ocupado = (
            db.query(Cita.id)
            .filter(
                Cita.veterinario_id == veterinario_id,
                Cita.fecha_hora == fecha,
                Cita.estado != "cancelada",
            )
            .first()
        )
        if ocupado:
            veterinario_id = None

    notas = f"Generado automáticamente desde la historia clínica #{historia.id}"
    if historia.veterinario_id and veterinario_id is None:
        notas += " — el doctor ya tenía otro turno a esa hora; asignar doctor."

    db.add(Cita(
        paciente_id=historia.paciente_id,
        fecha_hora=fecha,
        motivo="Control (programado en consulta)",
        estado="pendiente",
        notas=notas,
        veterinario_id=veterinario_id,   # el doctor que atendió, si está libre
    ))


# ── Búsqueda por mascota ──────────────────────────────────────────────────────
# Va ANTES de /{paciente_id} para que "buscar" no se intente leer como un id.

@router.get("/buscar")
def buscar_pacientes(
    q: str = Query(..., min_length=1, description="Nombre de la mascota (o su microchip)"),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Busca mascotas por NOMBRE y devuelve a su dueño al lado.

    En la clínica se pregunta por el animal ("vengo con Pepita"), no por el
    DNI del dueño. Como hay varias Pepitas, se listan todas con el propietario
    y su teléfono para poder distinguirlas de un vistazo.

    A propósito no busca por especie ni raza: escribir "canino" devolvería
    media clínica y taparía la búsqueda por dueño, que es la otra mitad del
    buscador. Solo el nombre — y el microchip, que identifica a un animal
    concreto igual que el nombre.
    """
    like = f"%{q.strip()}%"
    filas = (
        db.query(Paciente)
        .options(joinedload(Paciente.cliente))
        .filter(
            Paciente.nombre.ilike(like)
            | Paciente.microchip.ilike(like)
        )
        .order_by(Paciente.nombre, Paciente.id)
        .limit(limit)
        .all()
    )

    # Última consulta de cada mascota encontrada, en una sola consulta extra:
    # con ella la recepcionista distingue "la Pepita que vino la semana pasada".
    ultimas: dict[int, datetime] = {}
    if filas:
        ids = [p.id for p in filas]
        ultimas = dict(
            db.query(HistoriaClinica.paciente_id, func.max(HistoriaClinica.fecha))
            .filter(HistoriaClinica.paciente_id.in_(ids))
            .group_by(HistoriaClinica.paciente_id)
            .all()
        )

    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "especie": p.especie,
            "raza": p.raza,
            "sexo": p.sexo,
            "edad": p.edad,
            "microchip": p.microchip,
            "cliente_id": p.cliente_id,
            "propietario": p.cliente.nombre if p.cliente else None,
            "propietario_dni": p.cliente.dni if p.cliente else None,
            "propietario_telefono": p.cliente.telefono if p.cliente else None,
            "ultima_consulta": ultimas[p.id].isoformat() if ultimas.get(p.id) else None,
        }
        for p in filas
    ]


# ── Listado de pacientes (pestaña «Pacientes» de Clientes) ───────────────────
# Va ANTES de /{paciente_id}, igual que /buscar.

@router.get("/")
def listar_pacientes(
    q: Optional[str] = Query(None, description="Nombre o microchip de la mascota, o nombre/DNI del responsable"),
    estado: str = Query("activo", pattern="^(activo|inactivo|todos)$"),
    especie: Optional[str] = Query(None),
    raza: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Pacientes con su responsable y su próximo turno, paginados.

    Devuelve {"total": N, "items": [...]}: el total sirve para la paginación
    («1 – 10 de 3414») y respeta los mismos filtros que la lista.
    """
    query = db.query(Paciente).join(Cliente, Cliente.id == Paciente.cliente_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            Paciente.nombre.ilike(like)
            | Paciente.microchip.ilike(like)
            | Cliente.nombre.ilike(like)
            | Cliente.dni.ilike(like)
        )
    if estado != "todos":
        query = query.filter(Paciente.activo.is_(estado == "activo"))
    if especie:
        query = query.filter(func.lower(Paciente.especie) == especie.strip().lower())
    if raza:
        query = query.filter(func.lower(Paciente.raza) == raza.strip().lower())

    total = query.count()
    filas = (
        query.options(joinedload(Paciente.cliente))
        .order_by(func.lower(Paciente.nombre), Paciente.id)
        .offset(skip).limit(limit).all()
    )

    # Próximo turno de cada fila, en una sola consulta extra
    proximos: dict[int, datetime] = {}
    if filas:
        proximos = dict(
            db.query(Cita.paciente_id, func.min(Cita.fecha_hora))
            .filter(
                Cita.paciente_id.in_([p.id for p in filas]),
                Cita.fecha_hora >= datetime.now(timezone.utc),
                Cita.estado.in_(("pendiente", "confirmada")),
            )
            .group_by(Cita.paciente_id)
            .all()
        )

    return {
        "total": total,
        "items": [
            {
                "id": p.id,
                "nombre": p.nombre,
                "especie": p.especie,
                "raza": p.raza,
                "edad": p.edad,
                "sexo": p.sexo,
                "microchip": p.microchip,
                "activo": p.activo,
                "cliente_id": p.cliente_id,
                "responsable": p.cliente.nombre if p.cliente else None,
                "proximo_turno": proximos[p.id].isoformat() if proximos.get(p.id) else None,
            }
            for p in filas
        ],
    }


@router.get("/inactivos")
def pacientes_que_no_vuelven(
    meses: int = Query(12, ge=3, le=60, description="Sin consulta ni cita desde hace al menos tantos meses"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Mascotas activas que vinieron alguna vez y llevan meses sin volver.

    Para recuperarlas: las que se perdieron hace poco son las más fáciles de
    traer de vuelta, así que van primero. Quedan fuera las que tienen una cita
    reciente o próxima (ya están volviendo) y las que nunca se atendieron.
    """
    corte = datetime.now(timezone.utc) - timedelta(days=30 * meses)
    ultima = func.max(HistoriaClinica.fecha)
    reciente = (
        db.query(Cita.id)
        .filter(Cita.paciente_id == Paciente.id, Cita.estado != "cancelada", Cita.fecha_hora >= corte)
        .exists()
    )
    filas = (
        db.query(Paciente, Cliente, ultima)
        .join(Cliente, Paciente.cliente_id == Cliente.id)
        .join(HistoriaClinica, HistoriaClinica.paciente_id == Paciente.id)
        .filter(Paciente.activo.is_(True), ~reciente)
        .group_by(Paciente.id, Cliente.id)
        .having(ultima < corte)
        .order_by(ultima.desc())
        .limit(500)
        .all()
    )
    # Ya avisadas: la clave es la fecha de la última visita, así que si vuelve y
    # se pierde otra vez, es otro caso y reaparece.
    avisadas = {
        (a.paciente_id, a.proxima_dosis)
        for a in db.query(VacunaAvisada).filter(VacunaAvisada.tipo == "reactivacion").all()
    }
    hoy = hoy_peru()
    salida = []
    for p, c, ult in filas:
        dia = ult.astimezone(PERU_TZ).date()
        if (p.id, dia.isoformat()) in avisadas:
            continue
        salida.append({
            "paciente_id": p.id, "paciente": p.nombre, "especie": p.especie,
            "cliente_id": c.id, "propietario": c.nombre, "telefono": c.telefono,
            "ultima_visita": dia.isoformat(),
            "meses": (hoy - dia).days // 30,
        })
    return salida[:limit]


@router.get("/opciones")
def opciones_filtro(especie: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Especies y razas que existen, para los desplegables de filtro.

    Las razas se acotan a la especie elegida (sin especie no se ofrecen razas).
    """
    especies = [e for (e,) in db.query(Paciente.especie).distinct().order_by(Paciente.especie).all() if e]
    razas: list[str] = []
    if especie:
        razas = [
            r for (r,) in db.query(Paciente.raza)
            .filter(func.lower(Paciente.especie) == especie.strip().lower(), Paciente.raza.isnot(None), Paciente.raza != "")
            .distinct().order_by(Paciente.raza).all()
        ]
    return {"especies": especies, "razas": razas}


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


@router.put("/{paciente_id}/responsable", response_model=PacienteOut)
def cambiar_responsable(
    paciente_id: int, payload: CambiarResponsableIn, request: Request,
    db: Session = Depends(get_db),
):
    """Pasa la mascota a otro dueño. Recepción y veterinario pueden hacerlo.

    Las citas, historias y recetas siguen con la mascota. Las ventas ya hechas
    se quedan con quien las pagó.
    """
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    nuevo = db.get(Cliente, payload.cliente_id)
    if not nuevo:
        raise HTTPException(status_code=404, detail="El cliente nuevo no existe")
    if nuevo.id != paciente.cliente_id:
        anterior = paciente.cliente.nombre if paciente.cliente else f"#{paciente.cliente_id}"
        request.state.actividad_detalle = f"{paciente.nombre}: {anterior} → {nuevo.nombre}"
        paciente.cliente_id = nuevo.id
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

def _resolver_veterinario(db: Session, request: Request, usuario, propuesto):
    """Quién queda como veterinario que atendió la consulta.

    Si la escribe el propio doctor, firma él: nadie firma en nombre de otro.
    Si la escribe la recepcionista tiene que decir a qué doctor corresponde,
    porque una historia sin veterinario responsable no sirve como registro
    clínico. Quién la tecleó queda en la bitácora de actividad.
    """
    if getattr(request.state, "rol", None) == "veterinario":
        return usuario.id if usuario else None

    if not propuesto:
        raise HTTPException(
            status_code=422,
            detail="Indica qué veterinario atendió la consulta.",
        )
    vet = db.get(Usuario, propuesto)
    if not vet or vet.rol != "veterinario" or not vet.activo:
        raise HTTPException(
            status_code=422,
            detail="El veterinario indicado no existe o no está activo.",
        )
    return vet.id


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
    datos = payload.model_dump()
    vet_id = _resolver_veterinario(db, request, usuario, datos.pop("veterinario_id", None))
    # Sin fecha explícita manda el default del modelo (ahora). Un None explícito
    # dejaría la historia sin fecha y sin lugar en el orden del historial.
    if datos.get("fecha") is None:
        datos.pop("fecha", None)
    try:
        historia = HistoriaClinica(
            **datos,
            paciente_id=paciente_id,
            veterinario_id=vet_id,
        )
        db.add(historia)
        db.flush()  # obtener historia.id antes de generar la cita
        # Si la consulta fijó una próxima cita, agéndala en Turnos automáticamente
        _generar_cita_proxima(db, historia)
        # Y los medicamentos indicados pasan a la lista de tratamientos en
        # curso: escritos en la historia son un texto, acá son seguibles.
        sincronizar_tratamientos(db, historia)
        db.commit()
        db.refresh(historia)
        return historia
    except Exception:
        db.rollback()
        # Registramos el detalle del lado servidor (sin exponerlo al cliente ni
        # volcar datos clínicos del paciente en los logs).
        logger.exception("Fallo al guardar historia clínica (paciente_id=%s)", paciente_id)
        raise HTTPException(status_code=500, detail="No se pudo guardar la historia clínica.")


@router.get("/{paciente_id}/resumen-previo")
def resumen_previo(paciente_id: int, db: Session = Depends(get_db)):
    """Lo que conviene leer antes de entrar a la consulta, sin IA (ver el servicio)."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    return armar_resumen_previo(db, paciente)


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
    datos = payload.model_dump(exclude_unset=True)
    # La fecha solo se cambia si se manda una nueva; un None es "no la toques".
    if "fecha" in datos and datos["fecha"] is None:
        datos.pop("fecha")
    # Reasignar el veterinario responsable solo si viene explícito; editar
    # cualquier otro campo no debe cambiar de quién es la firma.
    if "veterinario_id" in datos:
        datos["veterinario_id"] = _resolver_veterinario(
            db, request, None, datos["veterinario_id"]
        ) if getattr(request.state, "rol", None) != "veterinario" else historia.veterinario_id
    for campo, valor in datos.items():
        setattr(historia, campo, valor)
    # Si la próxima cita cambió a un valor nuevo, agéndala en Turnos
    if historia.proxima_cita and historia.proxima_cita != cita_anterior:
        _generar_cita_proxima(db, historia)
    # Corregir la consulta corrige también sus tratamientos; lo que ya se
    # cerró o suspendió a mano no se reabre (ver services/tratamientos.py).
    sincronizar_tratamientos(db, historia)
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


async def _validar_y_leer_archivo(archivo: UploadFile) -> bytes:
    """Valida extensión y tamaño de un archivo subido y devuelve sus bytes."""
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
    return contenido


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
    contenido = await _validar_y_leer_archivo(archivo)

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
def listar_documentos(
    paciente_id: int,
    historia_id: Optional[int] = Query(None, description="Filtra los adjuntos de una consulta puntual"),
    db: Session = Depends(get_db),
):
    q = db.query(DocumentoPaciente).filter(DocumentoPaciente.paciente_id == paciente_id)
    if historia_id is not None:
        q = q.filter(DocumentoPaciente.historia_id == historia_id)
    return q.order_by(DocumentoPaciente.creado_en.desc()).all()


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


@router.post(
    "/{paciente_id}/historias/{historia_id}/documento",
    response_model=DocumentoOut,
    status_code=status.HTTP_201_CREATED,
)
async def adjuntar_documento_historia(
    paciente_id: int,
    historia_id: int,
    request: Request,
    archivo: UploadFile = File(...),
    categoria: str = Form("otro"),
    descripcion: str = Form(""),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Adjunta un archivo (radiografía, análisis, etc.) a la consulta puntual
    donde el veterinario lo solicitó, en vez de dejarlo suelto a nivel de la
    mascota sin saber a qué visita corresponde."""
    historia = db.get(HistoriaClinica, historia_id)
    if not historia or historia.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Historia clínica no encontrada")

    cat = categoria if categoria in CATEGORIAS_DOC else "otro"
    contenido = await _validar_y_leer_archivo(archivo)
    doc = DocumentoPaciente(
        paciente_id=paciente_id,
        historia_id=historia_id,
        nombre=archivo.filename or "documento",
        categoria=cat,
        descripcion=(descripcion or "").strip() or None,
        mime_type=archivo.content_type,
        tamano_bytes=len(contenido),
        contenido=contenido,
        subido_por=usuario.usuario if usuario else None,
    )
    db.add(doc)
    request.state.actividad_detalle = f"{historia.paciente.nombre if historia.paciente else paciente_id} — {doc.nombre}"
    db.commit()
    db.refresh(doc)
    return doc


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
        proxima_fecha=datos.get("proxima_fecha"),
        producto=(payload.producto or None),
        notas=(payload.notas or None),
        registrado_por=usuario.usuario if usuario else None,
    )
    if reg.fecha is None:
        reg.fecha = hoy_peru()
    db.add(reg)
    request.state.actividad_detalle = f"{paciente.nombre} — {payload.tipo}"
    db.commit()
    db.refresh(reg)
    return reg


@router.post(
    "/{paciente_id}/registros/{registro_id}/documento",
    response_model=RegistroClinicoOut,
    status_code=status.HTTP_201_CREATED,
)
async def adjuntar_documento_registro(
    paciente_id: int,
    registro_id: int,
    request: Request,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Adjunta un archivo (radiografía, análisis, etc.) a un registro de tipo
    'complementario'. Es la única vía de subida de archivos por mascota: los
    métodos complementarios llevan su propio estudio adjunto, en vez de un
    módulo de documentos genérico y desconectado."""
    reg = db.get(RegistroClinico, registro_id)
    if not reg or reg.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if reg.tipo != "complementario":
        raise HTTPException(
            status_code=400,
            detail="Solo los métodos complementarios admiten un archivo adjunto.",
        )

    contenido = await _validar_y_leer_archivo(archivo)
    doc = DocumentoPaciente(
        paciente_id=paciente_id,
        registro_id=registro_id,
        nombre=archivo.filename or "documento",
        categoria="otro",
        mime_type=archivo.content_type,
        tamano_bytes=len(contenido),
        contenido=contenido,
        subido_por=usuario.usuario if usuario else None,
    )
    db.add(doc)
    request.state.actividad_detalle = f"{reg.producto or reg.tipo} — {doc.nombre}"
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
    for doc in list(reg.documentos):
        db.delete(doc)
    request.state.actividad_detalle = f"{paciente_id} — {reg.tipo}"
    db.delete(reg)
    db.commit()


# ── Recetas (tratamiento formal indicado por el veterinario) ──────────────────

@router.post(
    "/{paciente_id}/recetas/",
    response_model=RecetaOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_receta(
    paciente_id: int,
    payload: RecetaCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    items = [i.model_dump() for i in payload.items if (i.medicamento or "").strip()]
    if not items:
        raise HTTPException(
            status_code=422,
            detail="La receta debe incluir al menos un medicamento.",
        )
    diagnostico = (payload.diagnostico or "").strip() or None

    # Guarda contra un doble envío accidental (doble clic, reintento de red
    # tras un timeout): si el mismo veterinario acaba de crear una receta
    # idéntica para este paciente hace unos segundos, se devuelve esa en vez
    # de crear un duplicado.
    ventana = datetime.now(timezone.utc) - timedelta(seconds=15)
    reciente = (
        db.query(Receta)
        .filter(
            Receta.paciente_id == paciente_id,
            Receta.veterinario_id == (usuario.id if usuario else None),
            Receta.creado_en >= ventana,
        )
        .order_by(Receta.creado_en.desc())
        .first()
    )
    if reciente and reciente.items == items and reciente.diagnostico == diagnostico:
        return reciente

    ahora = datetime.now(timezone.utc)
    receta = Receta(
        paciente_id=paciente_id,
        fecha=payload.fecha or ahora.date(),
        diagnostico=diagnostico,
        indicaciones=(payload.indicaciones or "").strip() or None,
        items=items,
        veterinario_id=usuario.id if usuario else None,
        actualizado_por=usuario.usuario if usuario else None,
        actualizado_en=ahora,
    )
    db.add(receta)
    request.state.actividad_detalle = paciente.nombre
    db.commit()
    db.refresh(receta)
    return receta


@router.get("/{paciente_id}/recetas/", response_model=list[RecetaOut])
def listar_recetas(paciente_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Receta)
        .filter(Receta.paciente_id == paciente_id)
        .order_by(Receta.fecha.desc(), Receta.id.desc())
        .all()
    )


@router.put("/{paciente_id}/recetas/{receta_id}", response_model=RecetaOut)
def actualizar_receta(
    paciente_id: int,
    receta_id: int,
    payload: RecetaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    receta = db.get(Receta, receta_id)
    if not receta or receta.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    datos = payload.model_dump(exclude_unset=True)
    if "items" in datos:
        items = [i for i in datos["items"] if (i.get("medicamento") or "").strip()]
        if not items:
            raise HTTPException(
                status_code=422,
                detail="La receta debe incluir al menos un medicamento.",
            )
        datos["items"] = items
    for campo, valor in datos.items():
        setattr(receta, campo, valor)
    receta.actualizado_por = usuario.usuario if usuario else None
    receta.actualizado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(receta)
    request.state.actividad_detalle = receta.paciente.nombre if receta.paciente else None
    return receta


@router.delete(
    "/{paciente_id}/recetas/{receta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def eliminar_receta(
    paciente_id: int,
    receta_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    receta = db.get(Receta, receta_id)
    if not receta or receta.paciente_id != paciente_id:
        raise HTTPException(status_code=404, detail="Receta no encontrada")
    nombre = receta.paciente.nombre if receta.paciente else None
    fecha_txt = receta.fecha.strftime("%d/%m/%Y") if receta.fecha else ""
    db.delete(receta)
    db.commit()
    request.state.actividad_detalle = f"{nombre} — {fecha_txt}" if nombre else fecha_txt

