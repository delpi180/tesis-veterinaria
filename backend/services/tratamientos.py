"""Del tratamiento escrito en la consulta a algo que se puede seguir.

La historia clínica guarda lo indicado ese día como texto (es un documento y
no se reescribe). Acá se traduce a filas de `tratamientos`, que es lo que
permite preguntar qué mascotas están medicadas hoy, cuáles terminan esta
semana y a quién no se volvió a ver.

La sincronización es "borrar y rehacer" para esa historia, con una excepción
importante: lo que una persona ya cerró o suspendió no se pisa. Corregir una
falta de ortografía en la indicación no puede revivir un tratamiento que el
doctor cortó ayer.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models import HistoriaClinica, Tratamiento


def _producto_id(item: dict) -> Optional[int]:
    """Producto del inventario elegido, si se eligió uno."""
    try:
        pid = int(item.get("producto_id"))
    except (TypeError, ValueError):
        return None
    return pid or None


def _dias(item: dict) -> Optional[int]:
    """Duración en días del ítem, si está anotada y es razonable."""
    valor = item.get("duracion_dias")
    try:
        dias = int(valor)
    except (TypeError, ValueError):
        return None
    return dias if 1 <= dias <= 365 else None


def _clave(t) -> tuple:
    """Identidad de un tratamiento dentro de una consulta: el medicamento.

    Dos filas del mismo medicamento en la misma consulta son un error de
    tipeo, no dos tratamientos; se toma la primera.
    """
    med = t.get("medicamento") if isinstance(t, dict) else t.medicamento
    return (med or "").strip().lower()


def sincronizar_desde_historia(db: Session, historia: HistoriaClinica) -> None:
    """Deja las filas de tratamiento de esta consulta iguales a lo indicado.

    No hace commit: se llama dentro de la transacción que guarda la historia,
    para que no pueda quedar una consulta guardada sin sus tratamientos ni al
    revés.
    """
    existentes = list(historia.tratamientos or [])
    # Lo que alguien decidió cerrar o suspender es una decisión clínica y se
    # respeta: editar la consulta no lo reabre.
    intocables = {_clave(t): t for t in existentes if t.estado in ("terminado", "suspendido")}

    for t in existentes:
        if t.estado not in ("terminado", "suspendido"):
            db.delete(t)

    inicio = (historia.fecha or historia.creado_en).date() if (historia.fecha or historia.creado_en) else date.today()

    vistos: set[str] = set()
    for item in (historia.tratamiento_items or []):
        if not isinstance(item, dict):
            continue
        med = (item.get("medicamento") or "").strip()
        if not med:
            continue
        clave = med.lower()
        if clave in vistos:
            continue
        vistos.add(clave)
        if clave in intocables:
            continue

        dias = _dias(item)
        db.add(Tratamiento(
            paciente_id=historia.paciente_id,
            historia_id=historia.id,
            medicamento=med[:200],
            producto_id=_producto_id(item),
            dosis=(item.get("dosis") or None),
            via=(item.get("via") or None),
            frecuencia=(item.get("frecuencia") or None),
            dias=dias,
            inicio=inicio,
            # El último día está incluido: 5 días desde el lunes termina el viernes.
            fin=(inicio + timedelta(days=dias - 1)) if dias else None,
            veterinario_id=historia.veterinario_id,
        ))
