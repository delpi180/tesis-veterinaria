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

from core.security import sello_de_sesion
from database import SessionLocal

logger = logging.getLogger("vetlospinos")

_TTL_SEG = 30
_CACHE: dict[str, tuple[float, "Cuenta"]] = {}


class Cuenta:
    __slots__ = ("habilitada", "clinica_id", "suspendida", "rol", "sello")

    def __init__(self, habilitada=False, clinica_id=None, suspendida=False, rol=None, sello=None):
        self.habilitada, self.clinica_id, self.suspendida = habilitada, clinica_id, suspendida
        self.rol, self.sello = rol, sello


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
                     models.Usuario.rol, models.Usuario.password_hash)
            .join(models.Clinica, models.Clinica.id == models.Usuario.clinica_id)
            .filter(models.Usuario.usuario == usuario)
            .first()
        )
        resultado = (
            Cuenta(bool(fila[0]), fila[1], fila[2] != "activa", fila[3], sello_de_sesion(fila[4]))
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
