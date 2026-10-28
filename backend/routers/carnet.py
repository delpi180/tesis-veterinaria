"""Enlace privado al carnet de la mascota, para mandárselo al dueño por WhatsApp.

El enlace es el permiso: el código es aleatorio (128 bits), no se puede adivinar,
y recepción puede revocarlo cuando quiera. Quien lo tiene ve el carnet y nada más
(ver `services/carnet.py`).
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from core import ratelimit
from database import get_db
from models import Paciente
from routers.auth import _clave_cliente
from routers.configuracion import obtener_o_crear
from services.carnet import armar_carnet

router = APIRouter(prefix="/api/carnet", tags=["Carnet"])

# Intentos con un código que no existe, por IP: frena a quien pruebe códigos al azar.
FALLOS_MAX = 20
FALLOS_VENTANA_SEG = 600


@router.post("/paciente/{paciente_id}")
def obtener_o_crear_enlace(paciente_id: int, request: Request, db: Session = Depends(get_db)):
    """Devuelve el enlace de la mascota; lo crea si todavía no tiene."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    if not paciente.carnet_token:
        paciente.carnet_token = secrets.token_urlsafe(18)
        db.commit()
    request.state.actividad_detalle = f"{paciente.nombre} — enlace del carnet"
    return {"token": paciente.carnet_token, "ruta": f"/carnet/{paciente.carnet_token}"}


@router.delete("/paciente/{paciente_id}", status_code=204)
def revocar_enlace(paciente_id: int, request: Request, db: Session = Depends(get_db)):
    """Anula el enlace: el que ya se mandó deja de funcionar."""
    paciente = db.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    paciente.carnet_token = None
    db.commit()
    request.state.actividad_detalle = f"{paciente.nombre} — enlace del carnet revocado"


@router.get("/publico/{token}")
def ver_carnet(token: str, request: Request, response: Response, db: Session = Depends(get_db)):
    """Sin sesión (ver RUTAS_PUBLICAS_PREFIJO en main.py). Solo lectura."""
    clave = f"carnet:{_clave_cliente(request)}"
    if not ratelimit.permitido(clave, FALLOS_MAX, FALLOS_VENTANA_SEG):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos.")

    paciente = db.query(Paciente).filter(Paciente.carnet_token == token).first() if len(token) >= 16 else None
    if not paciente or not paciente.activo:
        ratelimit.registrar_fallo(clave)
        raise HTTPException(status_code=404, detail="Este enlace no existe o ya no está disponible.")

    # Es un dato de salud: que ni el navegador ni un buscador lo guarden.
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return armar_carnet(db, paciente, obtener_o_crear(db).nombre)
