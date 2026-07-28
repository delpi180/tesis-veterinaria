import asyncio
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Cita, Paciente, Usuario
from schemas import CitaCreate, CitaUpdate, CitaResponse
from core.deps import usuario_actual

router = APIRouter(prefix="/api/citas", tags=["Citas"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[asyncio.Queue] = set()

    async def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.active_connections.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.active_connections.discard(q)

    def _local_broadcast(self, message: str):
        for q in list(self.active_connections):
            q.put_nowait(message)

    def broadcast(self, message: str):
        # 1. Enviar a BD para replicar en otras instancias
        import time
        from database import SessionLocal
        from models import SseEvent
        try:
            with SessionLocal() as db:
                event = SseEvent(message=message, timestamp=time.time())
                db.add(event)
                db.commit()
        except Exception as e:
            print(f"[SSE] Error al persistir evento en BD: {e}")
            
        # 2. Enviar localmente de forma inmediata a los conectados a esta instancia
        self._local_broadcast(message)


manager = ConnectionManager()


async def poll_sse_events():
    """
    Bucle en segundo plano que revisa periódicamente (cada 1s) nuevos eventos en la BD
    para retransmitirlos de forma local a las colas de esta instancia.
    """
    import time
    from database import SessionLocal
    from models import SseEvent
    from sqlalchemy import delete

    last_timestamp = time.time()

    # Pruning inicial de eventos de más de 1 minuto para mantener la tabla liviana
    try:
        with SessionLocal() as db:
            db.execute(delete(SseEvent).where(SseEvent.timestamp < last_timestamp - 60.0))
            db.commit()
    except Exception as e:
        print(f"[SSE] Error de pruning inicial: {e}")

    ultima_purga = last_timestamp

    while True:
        await asyncio.sleep(1.0)

        # Si nadie está viendo la agenda, no hay a quién notificar: no se
        # consulta la BD. Antes este bucle hacía ~86.400 consultas al día aun
        # con el sistema vacío, gastando cuota del plan gratuito sin motivo.
        # Se adelanta la marca de tiempo para que, al reconectarse alguien, no
        # le llegue de golpe una ráfaga de avisos viejos.
        if not manager.active_connections:
            last_timestamp = time.time()
            continue

        try:
            with SessionLocal() as db:
                # Consultar eventos más nuevos que el último marca de tiempo registrado
                events = (
                    db.query(SseEvent)
                    .filter(SseEvent.timestamp > last_timestamp)
                    .order_by(SseEvent.timestamp.asc())
                    .all()
                )
                if events:
                    for event in events:
                        # Broadcast local
                        manager._local_broadcast(event.message)
                        last_timestamp = max(last_timestamp, event.timestamp)

                # Purga periódica (cada 5 min). Antes solo se purgaba una vez,
                # al arrancar: en un proceso de larga vida la tabla crecía sin
                # tope hasta el siguiente reinicio.
                ahora = time.time()
                if ahora - ultima_purga > 300:
                    db.execute(delete(SseEvent).where(SseEvent.timestamp < ahora - 60.0))
                    db.commit()
                    ultima_purga = ahora
        except Exception:
            # Silenciar errores de BD temporales para evitar caída de la tarea
            pass



def _verificar_choque(db: Session, veterinario_id: Optional[int], fecha_hora, excluir_id: Optional[int] = None):
    """Control real (no solo aviso en el frontend): un mismo doctor no puede
    tener dos turnos activos (no cancelados) a la misma fecha y hora exacta."""
    if not veterinario_id:
        return
    q = db.query(Cita).filter(
        Cita.veterinario_id == veterinario_id,
        Cita.fecha_hora == fecha_hora,
        Cita.estado != "cancelada",
    )
    if excluir_id is not None:
        q = q.filter(Cita.id != excluir_id)
    if q.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="Este doctor ya tiene un turno activo a esa misma fecha y hora.",
        )


@router.post("/", response_model=CitaResponse, status_code=status.HTTP_201_CREATED)
def crear_cita(
    payload: CitaCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    paciente = db.get(Paciente, payload.paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    datos = payload.model_dump()
    # Trazabilidad: si lo crea un doctor y no eligió otro veterinario, se le asigna
    # a él automáticamente → así el turno SIEMPRE aparece en su "Mi panel".
    if datos.get("veterinario_id") is None and usuario and usuario.rol == "veterinario":
        datos["veterinario_id"] = usuario.id
    _verificar_choque(db, datos.get("veterinario_id"), datos["fecha_hora"])
    ahora = datetime.now(timezone.utc)
    quien = usuario.usuario if usuario else None
    cita = Cita(**datos, creado_por=quien, actualizado_por=quien, actualizado_en=ahora)
    db.add(cita)
    db.commit()
    db.refresh(cita)
    request.state.actividad_detalle = f"{paciente.nombre}"
    manager.broadcast("citas_updated")
    return cita


def _filtrar_citas(q, paciente_id, estado, veterinario_id, desde, hasta):
    if paciente_id is not None:
        q = q.filter(Cita.paciente_id == paciente_id)
    if estado is not None:
        q = q.filter(Cita.estado == estado)
    if veterinario_id is not None:
        q = q.filter(Cita.veterinario_id == veterinario_id)
    if desde is not None:
        q = q.filter(Cita.fecha_hora >= datetime.combine(desde, time.min))
    if hasta is not None:
        q = q.filter(Cita.fecha_hora < datetime.combine(hasta, time.min) + timedelta(days=1))
    return q


@router.get("/", response_model=list[CitaResponse])
def listar_citas(
    paciente_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    veterinario_id: Optional[int] = Query(None),
    desde: Optional[date] = Query(None, description="Fecha inicial (inclusive)"),
    hasta: Optional[date] = Query(None, description="Fecha final (inclusive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(Cita).options(
        joinedload(Cita.paciente).joinedload(Paciente.cliente),
        joinedload(Cita.veterinario),
    )
    q = _filtrar_citas(q, paciente_id, estado, veterinario_id, desde, hasta)
    return q.order_by(Cita.fecha_hora).offset(skip).limit(limit).all()


@router.get("/contar")
def contar_citas(
    paciente_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    veterinario_id: Optional[int] = Query(None),
    desde: Optional[date] = Query(None),
    hasta: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    """Total de citas que cumplen el filtro, para la paginación."""
    q = db.query(func.count(Cita.id))
    q = _filtrar_citas(q, paciente_id, estado, veterinario_id, desde, hasta)
    return {"total": q.scalar()}


@router.get("/stream")
async def stream_citas():
    async def event_generator():
        q = await manager.subscribe()
        try:
            yield "data: connected\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield "data: ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            manager.unsubscribe(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{cita_id}", response_model=CitaResponse)
def obtener_cita(cita_id: int, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return cita


@router.put("/{cita_id}", response_model=CitaResponse)
def actualizar_cita(
    cita_id: int,
    payload: CitaUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    datos = payload.model_dump(exclude_unset=True)
    nueva_fecha = datos.get("fecha_hora", cita.fecha_hora)
    nuevo_vet   = datos.get("veterinario_id", cita.veterinario_id)
    if "fecha_hora" in datos or "veterinario_id" in datos:
        _verificar_choque(db, nuevo_vet, nueva_fecha, excluir_id=cita.id)

    estado_anterior = cita.estado
    for campo, valor in datos.items():
        setattr(cita, campo, valor)
    cita.actualizado_por = usuario.usuario if usuario else None
    cita.actualizado_en = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cita)

    # Trazabilidad legible en la bitácora: paciente y, si cambió, el estado.
    nombre = cita.paciente.nombre if cita.paciente else None
    if "estado" in datos and datos["estado"] != estado_anterior:
        request.state.actividad_detalle = f"{nombre} — estado: {estado_anterior} → {cita.estado}"
    else:
        request.state.actividad_detalle = nombre
    manager.broadcast("citas_updated")
    return cita


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cita(cita_id: int, request: Request, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    nombre = cita.paciente.nombre if cita.paciente else None
    fecha_txt = cita.fecha_hora.strftime("%d/%m/%Y %H:%M") if cita.fecha_hora else ""
    db.delete(cita)
    db.commit()
    request.state.actividad_detalle = f"{nombre} — {fecha_txt}" if nombre else fecha_txt
    manager.broadcast("citas_updated")
