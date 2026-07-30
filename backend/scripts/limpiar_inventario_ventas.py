"""Vacía inventario y ventas para arrancar en limpio en producción.

Pensado para el momento en que todo lo cargado hasta ahora (productos, ventas,
movimientos de stock, cierres de caja) fue de prueba y la clínica va a
empezar a operar de verdad. Borra ESOS datos; no toca clientes, mascotas,
historias clínicas, turnos ni usuarios — eso sigue siendo información real
del negocio aunque se haya probado con el sistema en marcha.

Los servicios (consultas, cirugías, etc.) tampoco se tocan por defecto: son
catálogo de la clínica, no inventario. Si también fueron de prueba, hay que
pasar --con-servicios.

MODO REVISIÓN por defecto: solo cuenta y muestra lo que borraría. Nada se
toca hasta correrlo con --ejecutar.

Uso:
    cd backend
    .venv/Scripts/python.exe scripts/limpiar_inventario_ventas.py                  # solo muestra
    .venv/Scripts/python.exe scripts/limpiar_inventario_ventas.py --ejecutar        # aplica
    .venv/Scripts/python.exe scripts/limpiar_inventario_ventas.py --ejecutar --con-servicios

Después de correrlo, el catálogo de productos vuelve a estar vacío: hay que
cargar el inventario real desde Inventario → Nuevo Producto (o Entrada por
voz/texto) antes de vender nada.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# La consola de Windows no siempre usa UTF-8 por defecto: sin esto, las
# tildes de este mismo script salen como caracteres sueltos.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import func, select               # noqa: E402
from database import SessionLocal                 # noqa: E402
from models import (                               # noqa: E402
    CierreCaja, MovimientoInventario, Producto, Servicio, Venta, VentaItem,
)


def main() -> None:
    ejecutar = "--ejecutar" in sys.argv
    con_servicios = "--con-servicios" in sys.argv

    db = SessionLocal()
    try:
        conteos = {
            "Ventas":                  db.scalar(select(func.count(Venta.id))),
            "  · líneas de venta":     db.scalar(select(func.count(VentaItem.id))),
            "Movimientos de stock":    db.scalar(select(func.count(MovimientoInventario.id))),
            "Productos":               db.scalar(select(func.count(Producto.id))),
            "Cierres de caja":         db.scalar(select(func.count(CierreCaja.id))),
        }
        if con_servicios:
            conteos["Servicios"] = db.scalar(select(func.count(Servicio.id)))

        print("Esto es lo que hay guardado ahora mismo:\n")
        for etiqueta, n in conteos.items():
            print(f"  {etiqueta:<24} {n}")
        print()

        total = sum(n for etiqueta, n in conteos.items() if not etiqueta.startswith("  ·"))
        if total == 0:
            print("No hay nada que borrar.")
            return

        if not con_servicios:
            print("Los servicios (catálogo de consultas/cirugías/etc.) NO se tocan.")
            print("Si también fueron de prueba, volvé a correr con --con-servicios.\n")

        if not ejecutar:
            print("MODO REVISIÓN: no se borró nada.")
            print("Para aplicarlo, volvé a correrlo con  --ejecutar")
            return

        # Orden que respeta las llaves foráneas: primero lo que referencia,
        # después lo referenciado.
        db.query(VentaItem).delete()
        db.query(MovimientoInventario).delete()
        db.query(Venta).delete()
        db.query(Producto).delete()
        db.query(CierreCaja).delete()
        if con_servicios:
            db.query(Servicio).delete()
        db.commit()

        print("Listo. Se vació el inventario y las ventas.")
        print("Clientes, mascotas, historias clínicas, turnos y usuarios NO se tocaron.")
        print("Cargá el inventario real desde Inventario → Nuevo Producto antes de vender.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
