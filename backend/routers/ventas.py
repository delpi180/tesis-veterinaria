from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session, selectinload, joinedload

from database import get_db
from models import (
    CierreCaja, Cliente, MovimientoInventario, Producto, Servicio, Usuario,
    Venta, VentaItem,
)
from schemas import VentaAnular, VentaCreate, VentaOut
from core.deps import usuario_actual, solo_admin

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

    # Vencidos: entregar un medicamento caducado es un problema sanitario, no
    # de inventario. Se bloquea la venta y se dice qué hacer si la fecha está
    # mal cargada, para que nadie quede trabado sin salida.
    hoy = date.today()
    vencidos = [
        f"'{p.nombre}' venció el {p.fecha_vencimiento.strftime('%d/%m/%Y')}"
        for p in productos.values()
        if p.fecha_vencimiento and p.fecha_vencimiento < hoy
    ]
    if vencidos:
        raise HTTPException(
            status_code=422,
            detail=("No se puede vender producto vencido — " + "; ".join(vencidos) +
                    ". Si la fecha está equivocada, corrígela en Inventario."),
        )

    # ── FASE 2: crear venta + items + descontar stock, todo o nada ───────────
    try:
        subtotal = sum(l["precio_unitario"] * l["cantidad"] for l in lineas)
        pct = max(0.0, min(100.0, float(payload.descuento_pct or 0)))
        total = round(subtotal * (1 - pct / 100), 2)

        venta = Venta(
            cliente_id=payload.cliente_id,
            total=total,
            descuento_pct=pct,
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


# ── Anular una venta ─────────────────────────────────────────────────────────

@router.post("/{venta_id}/anular", response_model=VentaOut)
def anular_venta(
    venta_id: int,
    payload: VentaAnular,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Anula una venta mal hecha y devuelve el stock al inventario.

    NO borra la venta: el comprobante ya se entregó y su número tiene que
    seguir existiendo. Queda marcada como anulada, fuera de los totales de
    caja, y con constancia de quién la anuló y por qué.

    Devolver el stock es la mitad del asunto: al vender se descontó, así que
    sin esta reversión un error de cobro se convertiría además en un error de
    inventario.
    """
    # Anular mueve dinero e inventario: queda reservado a la administradora,
    # igual que el cierre de caja.
    solo_admin(request)

    venta = _cargar_venta(db, venta_id)
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if venta.anulada:
        raise HTTPException(status_code=409, detail="Esta venta ya estaba anulada.")

    motivo = (payload.motivo or "").strip()
    if len(motivo) < 3:
        raise HTTPException(
            status_code=422,
            detail="Indica el motivo de la anulación (queda como constancia).",
        )

    # Si el día ya fue cerrado, anular cambiaría un arqueo firmado: se bloquea
    # para que el cierre siga siendo una constancia y no algo que se mueve solo.
    # El arqueo y los totales del panel agrupan por día LOCAL de la clínica, no
    # por día UTC. Con la hora de Lima (UTC-5) toda venta posterior a las 19:00
    # cae en el día UTC siguiente: comparar en UTC dejaba anular ventas de un
    # día ya cerrado justamente en el horario de cierre.
    tz_local = datetime.now().astimezone().tzinfo
    dia_venta = venta.fecha.astimezone(tz_local).date() if venta.fecha else None
    if dia_venta and db.query(CierreCaja).filter(CierreCaja.fecha == dia_venta).first():
        raise HTTPException(
            status_code=409,
            detail=f"La caja del {dia_venta.isoformat()} ya fue cerrada; esa venta no se puede anular.",
        )

    try:
        ahora = datetime.now(timezone.utc)
        venta.anulada = True
        venta.anulada_en = ahora
        venta.anulada_por = usuario.usuario if usuario else None
        venta.motivo_anulacion = motivo[:200]

        # Devolver al inventario lo que se había descontado
        referencia = f"Anulación B-{venta.id:06d}"
        devueltos: dict[int, int] = defaultdict(int)
        for item in venta.items:
            if item.producto_id:
                devueltos[item.producto_id] += item.cantidad

        for pid, qty in devueltos.items():
            p = db.get(Producto, pid)
            if not p:
                continue          # el producto fue eliminado: no hay stock que devolver
            p.stock += qty
            db.add(MovimientoInventario(
                producto_id=pid,
                tipo="entrada",
                cantidad=qty,
                stock_resultante=p.stock,
                motivo=f"Devolución por anulación: {motivo[:120]}",
                referencia=referencia,
            ))

        request.state.actividad_detalle = f"Venta B-{venta.id:06d} — {motivo[:80]}"
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    return _cargar_venta(db, venta_id)


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
