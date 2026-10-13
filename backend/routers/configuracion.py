"""Datos de la clínica: nombre, RUC, dirección y teléfono.

Es lo que aparece en las boletas, las historias en PDF y los recordatorios de
WhatsApp. Antes estaba escrito a mano en el código, así que no se podía cambiar
sin recompilar; ahora la administradora lo edita desde la aplicación.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from core.config import settings
from models import Clinica, ConfiguracionClinica
from schemas import ConfiguracionOut, ConfiguracionUpdate
from core.deps import solo_admin

router = APIRouter(prefix="/api/configuracion", tags=["Configuración"])


def obtener_o_crear(db: Session) -> ConfiguracionClinica:
    """Configuración de la clínica de la sesión; la crea con su nombre si falta.

    Sin clínica (nadie ha iniciado sesión) devuelve valores genéricos del
    producto, sin guardar nada.
    """
    clinica_id = db.info.get("clinica_id")
    if clinica_id is None:
        return ConfiguracionClinica(nombre=settings.nombre_producto,
                                    pie_comprobante="Gracias por su preferencia")
    cfg = db.query(ConfiguracionClinica).first()   # la sesión ya la acota a su clínica
    if cfg is None:
        clinica = db.get(Clinica, clinica_id)
        cfg = ConfiguracionClinica(
            nombre=clinica.nombre if clinica else "Mi Veterinaria",
            pie_comprobante="Gracias por su preferencia",
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/", response_model=ConfiguracionOut)
def obtener_configuracion(db: Session = Depends(get_db)):
    """Lectura sin exigir sesión: la pantalla de acceso necesita un nombre antes
    de que nadie entre. Sin sesión devuelve los datos genéricos del producto; con
    sesión, los de la clínica de quien pregunta. Nada sensible en ningún caso."""
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
