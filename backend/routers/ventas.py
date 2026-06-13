from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload, joinedload

from database import get_db
from models import Cliente, MovimientoInventario, Producto, Servicio, Venta, VentaItem
from schemas import VentaCreate, VentaOut

router = APIRouter(prefix="/api/ventas", tags=["Ventas"])


def _cargar_venta(db: Session, venta_id: int) -> Venta | None:
    """Carga una venta con sus items y el producto/servicio de cada item (evita N+1)."""
    return (
        db.query(Venta)
        .options(
            selectinload(Venta.items).joinedload(VentaItem.producto),
            selectinload(Venta.items).joinedload(VentaItem.servicio),
        )
        .filter(Venta.id == venta_id)
        .first()
    )


def _loader(q):
    return q.options(
        selectinload(Venta.items).joinedload(VentaItem.producto),
        selectinload(Venta.items).joinedload(VentaItem.servicio),
    )


# ── Crear venta (transaccional) ───────────────────────────────────────────────

@router.post("/", response_model=VentaOut, status_code=status.HTTP_201_CREATED)
def crear_venta(payload: VentaCreate, db: Session = Depends(get_db)):
    # Verificar cliente
    if not db.get(Cliente, payload.cliente_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # ── FASE 1: validar TODAS las líneas antes de tocar nada ─────────────────
    lineas: list[dict] = []                       # líneas resueltas
    productos: dict[int, Producto] = {}           # productos involucrados
    qty_por_producto: dict[int, int] = defaultdict(int)

    for item in payload.items:
        # ── Línea de PRODUCTO ────────────────────────────────────────────────
        if item.producto_id:
            p = db.get(Producto, item.producto_id)
            if not p:
                raise HTTPException(status_code=404, detail=f"Producto id={item.producto_id} no existe")
            if not p.activo:
                raise HTTPException(status_code=422, detail=f"Producto '{p.nombre}' no está activo y no puede venderse")
            productos[p.id] = p
            qty_por_producto[p.id] += item.cantidad
            lineas.append({
                "producto_id": p.id, "servicio_id": None,
                "descripcion": p.nombre, "cantidad": item.cantidad,
                "precio_unitario": float(p.precio),
            })
        # ── Línea de SERVICIO ────────────────────────────────────────────────
        else:
            s = db.get(Servicio, item.servicio_id)
            if not s:
                raise HTTPException(status_code=404, detail=f"Servicio id={item.servicio_id} no existe")
            if not s.activo:
                raise HTTPException(status_code=422, detail=f"Servicio '{s.nombre}' no está activo")
            if s.precio_variable:
                if not item.precio or item.precio <= 0:
                    raise HTTPException(status_code=422, detail=f"El servicio '{s.nombre}' requiere un monto.")
                precio = float(item.precio)
            else:
                precio = float(s.precio)
            lineas.append({
                "producto_id": None, "servicio_id": s.id,
                "descripcion": s.nombre, "cantidad": item.cantidad,
                "precio_unitario": precio,
            })

    # Validar stock por producto (sumando cantidades repetidas)
    errores_stock = [
        f"'{productos[pid].nombre}' — solicitado: {qty}, disponible: {productos[pid].stock}"
        for pid, qty in qty_por_producto.items()
        if productos[pid].stock < qty
    ]
    if errores_stock:
        raise HTTPException(status_code=422, detail="Stock insuficiente — " + "; ".join(errores_stock))

    # ── FASE 2: crear venta + items + descontar stock, todo o nada ───────────
    try:
        total = sum(l["precio_unitario"] * l["cantidad"] for l in lineas)

        venta = Venta(
            cliente_id=payload.cliente_id,
            total=total,
            metodo_pago=payload.metodo_pago,
        )
        db.add(venta)
        db.flush()  # obtiene venta.id sin commitear aún

        for l in lineas:
            db.add(VentaItem(venta_id=venta.id, **l))

        referencia = f"Venta B-{venta.id:06d}"
        for pid, qty in qty_por_producto.items():
            p = productos[pid]
            p.stock -= qty                        # descontar stock
            db.add(MovimientoInventario(          # kardex: salida por venta
                producto_id=pid,
                tipo="salida",
                cantidad=-qty,
                stock_resultante=p.stock,
                motivo="Venta de producto",
                referencia=referencia,
            ))

        db.commit()

    except Exception:
        db.rollback()
        raise

    # Recargar con relaciones completas para la respuesta
    return _cargar_venta(db, venta.id)


# ── Consultas ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[VentaOut])
def listar_ventas(
    cliente_id: Optional[int]  = Query(None, description="Filtrar por cliente"),
    desde:      Optional[date] = Query(None, description="Fecha inicial (inclusive)"),
    hasta:      Optional[date] = Query(None, description="Fecha final (inclusive)"),
    skip:       int            = Query(0,    ge=0),
    limit:      int            = Query(50,   ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = _loader(db.query(Venta)).order_by(Venta.fecha.desc())
    if cliente_id is not None:
        q = q.filter(Venta.cliente_id == cliente_id)
    tz = datetime.now().astimezone().tzinfo
    if desde is not None:
        q = q.filter(Venta.fecha >= datetime.combine(desde, time.min).replace(tzinfo=tz))
    if hasta is not None:
        fin = datetime.combine(hasta, time.min).replace(tzinfo=tz) + timedelta(days=1)
        q = q.filter(Venta.fecha < fin)
    return q.offset(skip).limit(limit).all()


@router.get("/cliente/{cliente_id}", response_model=list[VentaOut])
def ventas_de_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
):
    """Historial completo de compras de un cliente."""
    if not db.get(Cliente, cliente_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return (
        _loader(db.query(Venta))
        .filter(Venta.cliente_id == cliente_id)
        .order_by(Venta.fecha.desc())
        .all()
    )


@router.get("/{venta_id}", response_model=VentaOut)
def obtener_venta(venta_id: int, db: Session = Depends(get_db)):
    venta = _cargar_venta(db, venta_id)
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return venta
