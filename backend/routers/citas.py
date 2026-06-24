import asyncio
from typing import Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
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

    while True:
        await asyncio.sleep(1.0)
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
        except Exception as e:
            # Silenciar errores de BD temporales para evitar caída de la tarea
            pass



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
    cita = Cita(**datos)
    db.add(cita)
    db.commit()
    db.refresh(cita)
    request.state.actividad_detalle = f"{paciente.nombre}"
    manager.broadcast("citas_updated")
    return cita


@router.get("/", response_model=list[CitaResponse])
def listar_citas(
    paciente_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    veterinario_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Cita).options(
        joinedload(Cita.paciente).joinedload(Paciente.cliente),
        joinedload(Cita.veterinario),
    )
    if paciente_id is not None:
        q = q.filter(Cita.paciente_id == paciente_id)
    if estado is not None:
        q = q.filter(Cita.estado == estado)
    if veterinario_id is not None:
        q = q.filter(Cita.veterinario_id == veterinario_id)
    return q.order_by(Cita.fecha_hora).all()


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
def actualizar_cita(cita_id: int, payload: CitaUpdate, request: Request, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(cita, campo, valor)
    db.commit()
    db.refresh(cita)
    request.state.actividad_detalle = cita.paciente.nombre if cita.paciente else None
    manager.broadcast("citas_updated")
    return cita


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cita(cita_id: int, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    db.delete(cita)
    db.commit()
    manager.broadcast("citas_updated")
