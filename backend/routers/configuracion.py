"""Datos de la clínica: nombre, RUC, dirección y teléfono.

Es lo que aparece en las boletas, las historias en PDF y los recordatorios de
WhatsApp. Antes estaba escrito a mano en el código, así que no se podía cambiar
sin recompilar; ahora la administradora lo edita desde la aplicación.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from models import ConfiguracionClinica
from schemas import ConfiguracionOut, ConfiguracionUpdate
from core.deps import solo_admin

router = APIRouter(prefix="/api/configuracion", tags=["Configuración"])

ID_CONFIG = 1


def obtener_o_crear(db: Session) -> ConfiguracionClinica:
    """Devuelve la configuración; la crea con valores neutros si aún no existe."""
    cfg = db.get(ConfiguracionClinica, ID_CONFIG)
    if cfg is None:
        cfg = ConfiguracionClinica(
            id=ID_CONFIG,
            nombre="Mi Veterinaria",
            pie_comprobante="Gracias por su preferencia",
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/", response_model=ConfiguracionOut)
def obtener_configuracion(db: Session = Depends(get_db)):
    """Lectura pública: la pantalla de acceso necesita el nombre de la clínica
    antes de que nadie haya iniciado sesión. No expone ningún dato sensible."""
    return obtener_o_crear(db)


@router.put("/", response_model=ConfiguracionOut)
def actualizar_configuracion(
    payload: ConfiguracionUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    solo_admin(request)
    cfg = obtener_o_crear(db)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(cfg, campo, valor)
    cfg.actualizado_en = datetime.now(timezone.utc)
    cfg.actualizado_por = getattr(request.state, "usuario", None)
    db.commit()
    db.refresh(cfg)
    request.state.actividad_detalle = cfg.nombre
    return cfg
