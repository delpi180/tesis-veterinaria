"""Limitador de intentos persistido en Base de Datos (anti fuerza bruta).

Cuenta intentos fallidos por clave (p. ej. IP) dentro de una ventana de tiempo.
Compatible con entornos multi-instancia ya que comparte el estado en la BD.
"""
import time
from sqlalchemy import delete, func
from database import SessionLocal
from models import RateLimitHit


def permitido(clave: str, maximo: int, ventana: int) -> bool:
    """True si la clave aún puede intentar; False si superó el máximo en la ventana."""
    limite = time.time() - ventana
    try:
        with SessionLocal() as db:
            # Purgar marcas antiguas
            db.execute(
                delete(RateLimitHit).where(
                    RateLimitHit.key == clave,
                    RateLimitHit.timestamp < limite
                )
            )
            # Contar marcas actuales
            count = db.query(func.count(RateLimitHit.id)).filter(
                RateLimitHit.key == clave
            ).scalar()
            db.commit()
            return count < maximo
    except Exception:
        # En caso de error de BD, permitir por defecto para no degradar el servicio
        return True


def registrar_fallo(clave: str) -> None:
    try:
        with SessionLocal() as db:
            hit = RateLimitHit(key=clave, timestamp=time.time())
            db.add(hit)
            db.commit()
    except Exception:
        pass


def limpiar(clave: str) -> None:
    """Tras un login exitoso, se borra el historial de la clave."""
    try:
        with SessionLocal() as db:
            db.execute(
                delete(RateLimitHit).where(RateLimitHit.key == clave)
            )
            db.commit()
    except Exception:
        pass

