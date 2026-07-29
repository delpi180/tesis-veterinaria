"""Registro de errores, para poder dar soporte sin adivinar.

Cuando algo falla en la clínica, el error queda guardado con su contexto
(quién, en qué pantalla, qué pasó) en vez de morir en la consola del navegador
del usuario o perderse entre los logs del servidor.

La administradora los consulta desde la app; el registro NO expone datos
clínicos, solo mensajes técnicos.
"""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import ErrorRegistrado
from core.deps import solo_admin
from core.security import verificar_token

router = APIRouter(prefix="/api/errores", tags=["Errores"])

# Un mismo fallo puede dispararse decenas de veces seguidas (un componente que
# re-renderiza, un usuario que reintenta). Se agrupan los idénticos dentro de
# esta ventana y se lleva la cuenta, en vez de llenar la tabla con copias.
VENTANA_AGRUPADO = timedelta(hours=12)


def _huella(origen: str, mensaje: str, ruta: str | None) -> str:
    """Identifica un error 'del mismo tipo' para poder agruparlos."""
    base = f"{origen}|{(mensaje or '')[:200]}|{ruta or ''}"
    return hashlib.sha256(base.encode()).hexdigest()[:64]


def registrar_error(
    db: Session,
    *,
    origen: str,
    mensaje: str,
    detalle: str | None = None,
    ruta: str | None = None,
    usuario: str | None = None,
    rol: str | None = None,
    navegador: str | None = None,
) -> None:
    """Guarda un error, agrupándolo si ya ocurrió hace poco.

    Nunca lanza: registrar un fallo no puede ser la causa de otro fallo. Si
    esto explota, el usuario perdería la operación que estaba haciendo por un
    problema de telemetría, que es exactamente lo que no debe pasar.
    """
    try:
        h = _huella(origen, mensaje, ruta)
        desde = datetime.now(timezone.utc) - VENTANA_AGRUPADO
        existente = (
            db.query(ErrorRegistrado)
            .filter(ErrorRegistrado.huella == h, ErrorRegistrado.fecha >= desde)
            .order_by(ErrorRegistrado.fecha.desc())
            .first()
        )
        if existente:
            existente.veces = (existente.veces or 1) + 1
            existente.fecha = datetime.now(timezone.utc)
            existente.visto = False       # volvió a pasar: vuelve a ser relevante
        else:
            db.add(ErrorRegistrado(
                origen=origen,
                mensaje=(mensaje or "(sin mensaje)")[:500],
                detalle=detalle,
                ruta=(ruta or None) and ruta[:300],
                usuario=usuario,
                rol=rol,
                navegador=(navegador or None) and navegador[:300],
                huella=h,
                veces=1,
            ))
        db.commit()
    except Exception:
        db.rollback()


class ErrorFrontend(BaseModel):
    mensaje: str = Field(..., max_length=500)
    detalle: Optional[str] = None
    ruta: Optional[str] = None


@router.post("/", status_code=204)
def reportar_error_frontend(
    payload: ErrorFrontend,
    request: Request,
    db: Session = Depends(get_db),
):
    """Recibe un error ocurrido en el navegador.

    No exige sesión a propósito: si la app se rompe en la pantalla de acceso,
    ese es justamente el error que hay que poder ver.

    Aun así se intenta identificar a quién le pasó: saber que el fallo lo tuvo
    la recepcionista y no el veterinario suele ser la mitad del diagnóstico.
    Como el middleware saltea la autenticación en esta ruta (por ser pública),
    el token se lee acá a mano; si no hay o no vale, se registra sin usuario.
    """
    usuario = rol = None
    header = request.headers.get("Authorization", "")
    token = header.removeprefix("Bearer ").strip()
    if token:
        sesion = verificar_token(token)
        if sesion:
            usuario, rol = sesion.get("usuario"), sesion.get("rol")

    registrar_error(
        db,
        origen="frontend",
        mensaje=payload.mensaje,
        detalle=payload.detalle,
        ruta=payload.ruta,
        usuario=usuario,
        rol=rol,
        navegador=request.headers.get("user-agent"),
    )


@router.get("/")
def listar_errores(
    request: Request,
    solo_pendientes: bool = Query(False, description="Ocultar los ya revisados"),
    limite: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    solo_admin(request)
    q = db.query(ErrorRegistrado)
    if solo_pendientes:
        q = q.filter(ErrorRegistrado.visto.is_(False))
    filas = q.order_by(ErrorRegistrado.fecha.desc()).limit(limite).all()
    return [
        {
            "id": e.id,
            "origen": e.origen,
            "mensaje": e.mensaje,
            "detalle": e.detalle,
            "ruta": e.ruta,
            "usuario": e.usuario,
            "rol": e.rol,
            "navegador": e.navegador,
            "fecha": e.fecha,
            "veces": e.veces or 1,
            "visto": bool(e.visto),
        }
        for e in filas
    ]


@router.get("/pendientes")
def contar_pendientes(request: Request, db: Session = Depends(get_db)):
    """Cuántos errores sin revisar hay (para el aviso en el menú)."""
    solo_admin(request)
    return {"pendientes": db.query(ErrorRegistrado).filter(ErrorRegistrado.visto.is_(False)).count()}


@router.put("/{error_id}/visto", status_code=204)
def marcar_visto(error_id: int, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    e = db.get(ErrorRegistrado, error_id)
    if e:
        e.visto = True
        db.commit()
