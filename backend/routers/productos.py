from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import MovimientoInventario, Producto, VentaItem
from schemas import ProductoCreate, ProductoUpdate, ProductoOut, AjusteStock, MovimientoOut

router = APIRouter(prefix="/api/productos", tags=["Productos"])

# Prefijo de código (SKU) por categoría
_PREFIJOS = {"comida": "COM", "accesorio": "ACC", "medicamento": "MED"}


def _generar_codigo(db: Session, categoria: Optional[str]) -> str:
    """SKU correlativo por categoría: MED-0001, COM-0002, … (GEN para sin categoría)."""
    prefijo = _PREFIJOS.get(categoria or "", "GEN")
    # Mayor sufijo numérico existente para este prefijo → siguiente
    ultimos = (
        db.query(Producto.codigo)
        .filter(Producto.codigo.like(f"{prefijo}-%"))
        .all()
    )
    maximo = 0
    for (codigo,) in ultimos:
        try:
            maximo = max(maximo, int(codigo.split("-")[1]))
        except (IndexError, ValueError):
            continue
    return f"{prefijo}-{maximo + 1:04d}"


@router.post("/", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear_producto(payload: ProductoCreate, db: Session = Depends(get_db)):
    producto = Producto(**payload.model_dump())
    producto.codigo = _generar_codigo(db, payload.categoria)
    db.add(producto)
    db.flush()
    # Kardex: stock inicial como entrada
    if producto.stock and producto.stock != 0:
        db.add(MovimientoInventario(
            producto_id=producto.id,
            tipo="entrada",
            cantidad=producto.stock,
            stock_resultante=producto.stock,
            motivo="Stock inicial",
        ))
    db.commit()
    db.refresh(producto)
    return producto


@router.get("/", response_model=list[ProductoOut])
def listar_productos(
    categoria:   Optional[str] = Query(None, description="comida | accesorio | medicamento"),
    proveedor:   Optional[str] = Query(None, description="Filtrar por proveedor (coincidencia parcial)"),
    buscar:      Optional[str] = Query(None, description="Texto en nombre o código"),
    stock_bajo:  bool          = Query(False, description="Solo productos con stock <= stock_minimo"),
    solo_activos: bool         = Query(True,  description="Filtrar por activo=True"),
    db: Session = Depends(get_db),
):
    q = db.query(Producto)
    if solo_activos:
        q = q.filter(Producto.activo.is_(True))
    if categoria:
        q = q.filter(Producto.categoria == categoria)
    if proveedor:
        q = q.filter(Producto.proveedor.ilike(f"%{proveedor}%"))
    if buscar:
        like = f"%{buscar}%"
        q = q.filter(func.coalesce(Producto.nombre, "").ilike(like) |
                     func.coalesce(Producto.codigo, "").ilike(like))
    if stock_bajo:
        q = q.filter(Producto.stock <= Producto.stock_minimo)
    return q.order_by(Producto.nombre).all()


@router.get("/stock-bajo", response_model=list[ProductoOut])
def productos_stock_bajo(db: Session = Depends(get_db)):
    """Shortcut: devuelve todos los productos activos con stock <= stock_minimo."""
    return (
        db.query(Producto)
        .filter(Producto.activo.is_(True), Producto.stock <= Producto.stock_minimo)
        .order_by(Producto.stock)
        .all()
    )


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener_producto(producto_id: int, db: Session = Depends(get_db)):
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return p


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar_producto(
    producto_id: int, payload: ProductoUpdate, db: Session = Depends(get_db)
):
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    stock_anterior = p.stock
    for campo, valor in datos.items():
        setattr(p, campo, valor)
    # Kardex: si el stock se modificó manualmente, registrar el ajuste
    if "stock" in datos and p.stock != stock_anterior:
        diff = p.stock - stock_anterior
        db.add(MovimientoInventario(
            producto_id=p.id,
            tipo="ajuste",
            cantidad=diff,
            stock_resultante=p.stock,
            motivo="Ajuste manual (edición de producto)",
        ))
    db.commit()
    db.refresh(p)
    return p


@router.post("/{producto_id}/ajuste-stock", response_model=ProductoOut)
def ajustar_stock(producto_id: int, payload: AjusteStock, db: Session = Depends(get_db)):
    """Entrada (+) o salida (-) de stock con motivo, registrada en el kardex."""
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    nuevo = p.stock + payload.cantidad
    if nuevo < 0:
        raise HTTPException(status_code=422, detail=f"Stock insuficiente: hay {p.stock}, no puedes retirar {-payload.cantidad}.")
    p.stock = nuevo
    db.add(MovimientoInventario(
        producto_id=p.id,
        tipo="entrada" if payload.cantidad > 0 else "salida",
        cantidad=payload.cantidad,
        stock_resultante=nuevo,
        motivo=payload.motivo or ("Entrada de stock" if payload.cantidad > 0 else "Salida de stock"),
    ))
    db.commit()
    db.refresh(p)
    return p


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoOut])
def listar_movimientos(producto_id: int, db: Session = Depends(get_db)):
    if not db.get(Producto, producto_id):
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return (
        db.query(MovimientoInventario)
        .filter(MovimientoInventario.producto_id == producto_id)
        .order_by(MovimientoInventario.fecha.desc(), MovimientoInventario.id.desc())
        .all()
    )


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(producto_id: int, db: Session = Depends(get_db)):
    p = db.get(Producto, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # No se puede borrar un producto que ya figura en ventas (integridad histórica).
    # En ese caso se sugiere desactivarlo para sacarlo del catálogo de venta.
    vendido = (
        db.query(VentaItem.id)
        .filter(VentaItem.producto_id == producto_id)
        .first()
    )
    if vendido:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el producto tiene ventas registradas. "
                   "Desactívalo para retirarlo del catálogo sin perder el historial.",
        )

    # Limpiar su kardex (es solo registro de auditoría del producto)
    db.query(MovimientoInventario).filter(
        MovimientoInventario.producto_id == producto_id
    ).delete()
    db.delete(p)
    db.commit()
