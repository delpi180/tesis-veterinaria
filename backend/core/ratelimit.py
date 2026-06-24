"""Limitador de intentos en memoria (anti fuerza bruta) para el login.

Cuenta intentos fallidos por clave (p. ej. IP) dentro de una ventana de tiempo.
Suficiente para un único proceso (Render free = 1 instancia). Para múltiples
instancias se reemplazaría por Redis.
"""
import time
from collections import defaultdict, deque

_intentos: dict[str, deque] = defaultdict(deque)


def _purgar(cola: deque, ventana: int) -> None:
    limite = time.time() - ventana
    while cola and cola[0] < limite:
        cola.popleft()


def permitido(clave: str, maximo: int, ventana: int) -> bool:
    """True si la clave aún puede intentar; False si superó el máximo en la ventana."""
    cola = _intentos[clave]
    _purgar(cola, ventana)
    return len(cola) < maximo


def registrar_fallo(clave: str) -> None:
    _intentos[clave].append(time.time())


def limpiar(clave: str) -> None:
    """Tras un login exitoso, se borra el historial de la clave."""
    _intentos.pop(clave, None)
