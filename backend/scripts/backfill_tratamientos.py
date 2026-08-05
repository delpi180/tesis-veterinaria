"""Pasa los tratamientos ya escritos en historias clínicas a la tabla nueva.

Sin esto, la pantalla de tratamientos arranca vacía y parece que la clínica
nunca medicó a nadie: lo indicado hasta hoy vive dentro del JSON de cada
historia. Se corre una vez después de desplegar; es idempotente (no duplica si
se vuelve a correr) y no toca las historias.

Los ítems viejos no tienen duración en días —era texto libre—, así que quedan
como 'sin_duracion': visibles en la pantalla para que alguien los complete o
los cierre, que es justamente el punto.

    cd backend
    python -m scripts.backfill_tratamientos          # muestra qué haría
    python -m scripts.backfill_tratamientos --aplicar
"""
import sys

from database import SessionLocal
from models import HistoriaClinica, Tratamiento
from services.tratamientos import sincronizar_desde_historia


def main(aplicar: bool) -> None:
    db = SessionLocal()
    try:
        historias = (
            db.query(HistoriaClinica)
            .filter(HistoriaClinica.tratamiento_items.isnot(None))
            .order_by(HistoriaClinica.fecha.asc())
            .all()
        )
        antes = db.query(Tratamiento).count()
        for h in historias:
            sincronizar_desde_historia(db, h)
        db.flush()
        despues = db.query(Tratamiento).count()

        print(f"historias con tratamiento: {len(historias)}")
        print(f"filas de tratamiento: {antes} → {despues}")
        if aplicar:
            db.commit()
            print("aplicado")
        else:
            db.rollback()
            print("simulación: nada se guardó (usa --aplicar)")
    finally:
        db.close()


if __name__ == "__main__":
    main("--aplicar" in sys.argv)
