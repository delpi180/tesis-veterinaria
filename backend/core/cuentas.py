"""Quién es quien hace la petición, según la base de datos de HOY.

El token solo prueba que la persona inició sesión alguna vez. Todo lo demás se
consulta aquí en cada petición (con un caché de segundos): si la cuenta sigue
activa, a qué clínica pertenece, si esa clínica está suspendida, qué rol tiene
AHORA y si la contraseña es la misma con la que se abrió la sesión.

Por eso un cambio surte efecto de inmediato (el caché se invalida al editar la
cuenta) y no cuando el token expire horas después: un empleado desactivado, una
administradora degradada o una contraseña cambiada cortan las sesiones abiertas.
"""
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from core.security import sello_de_sesion
from database import SessionLocal

logger = logging.getLogger("vetlospinos")

_TTL_SEG = 30
_CACHE: dict[str, tuple[float, "Cuenta"]] = {}


ROL_PLATAFORMA = "plataforma"
MENSAJE_SUSPENDIDA = "La cuenta de tu clínica está suspendida. Contacta al soporte."
MENSAJE_VENCIDA = "El periodo de uso de tu clínica terminó. Contacta al soporte para renovarlo."


class Cuenta:
    __slots__ = ("habilitada", "clinica_id", "bloqueo", "rol", "sello")

    def __init__(self, habilitada=False, clinica_id=None, bloqueo=None, rol=None, sello=None):
        self.habilitada, self.clinica_id, self.bloqueo = habilitada, clinica_id, bloqueo
        self.rol, self.sello = rol, sello

    @property
    def suspendida(self) -> bool:
        return self.bloqueo is not None

    @property
    def es_plataforma(self) -> bool:
        return self.rol == ROL_PLATAFORMA


def bloqueo_de(estado: str, vence_en) -> str | None:
    """Por qué una clínica no puede usar el sistema hoy (None = puede)."""
    if estado != "activa":
        return MENSAJE_SUSPENDIDA
    if vence_en is not None and vence_en < datetime.now(ZoneInfo("America/Lima")).date():
        return MENSAJE_VENCIDA
    return None


def cuenta(usuario: str) -> Cuenta:
    """Estado vigente de la cuenta. Se recuerda unos segundos."""
    import models   # import tardío: models importa database

    ahora = time.time()
    hit = _CACHE.get(usuario)
    if hit and (ahora - hit[0]) < _TTL_SEG:
        return hit[1]

    db = None
    try:
        db = SessionLocal()   # sesión de sistema: todavía no se sabe la clínica
        fila = (
            db.query(models.Usuario.activo, models.Usuario.clinica_id, models.Clinica.estado,
                     models.Usuario.rol, models.Usuario.password_hash, models.Clinica.vence_en)
            .join(models.Clinica, models.Clinica.id == models.Usuario.clinica_id)
            .filter(models.Usuario.usuario == usuario)
            .first()
        )
        resultado = (
            Cuenta(bool(fila[0]), fila[1], bloqueo_de(fila[2], fila[5]), fila[3], sello_de_sesion(fila[4]))
            if fila else Cuenta()
        )
    except Exception as e:
        # Sin poder verificar la cuenta NO se deja pasar: una petición sin clínica
        # ni rol confirmados podría ver datos que no le corresponden.
        logger.warning("No se pudo verificar la cuenta '%s': %s", usuario, e)
        return Cuenta()
    finally:
        if db is not None:
            db.close()

    _CACHE[usuario] = (ahora, resultado)
    return resultado


def invalidar(usuario: str | None = None) -> None:
    """Olvida lo recordado de una cuenta (o de todas), para que un cambio rija ya."""
    if usuario is None:
        _CACHE.clear()
    else:
        _CACHE.pop(usuario, None)
