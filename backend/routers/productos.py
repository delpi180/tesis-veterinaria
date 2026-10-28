import math
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from database import get_db
from models import MovimientoInventario, Producto, VentaItem
from schemas import ProductoCreate, ProductoUpdate, ProductoOut, AjusteStock, MovimientoOut
from core.tiempo import hoy_peru

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
    skip:        int           = Query(0,    ge=0),
    # El catálogo de una clínica está acotado por espacio físico de estantería
    # (nunca miles de SKU), así que 2000 alcanza de sobra en uso normal. Es un
    # tope defensivo, igual que en el resto de listados: sin él, esta era la
    # única lista del sistema sin ningún límite.
    limit:       int           = Query(2000, ge=1, le=5000),
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
    return q.order_by(Producto.nombre).offset(skip).limit(limit).all()


@router.get("/stock-bajo", response_model=list[ProductoOut])
def productos_stock_bajo(db: Session = Depends(get_db)):
    """Shortcut: devuelve todos los productos activos con stock <= stock_minimo."""
    return (
        db.query(Producto)
        .filter(Producto.activo.is_(True), Producto.stock <= Producto.stock_minimo)
        .order_by(Producto.stock)
        .all()
    )


@router.get("/por-vencer", response_model=list[ProductoOut])
def productos_por_vencer(
    dias: int = Query(30, ge=1, le=365, description="Ventana de aviso, en días"),
    db: Session = Depends(get_db),
):
    """Lo que ya venció o vence dentro de la ventana, lo más urgente primero.

    Los productos sin fecha quedan fuera: NULL es "no aplica", no "vencido".
    """
    limite = hoy_peru() + timedelta(days=dias)
    return (
        db.query(Producto)
        .filter(
            Producto.activo.is_(True),
            Producto.fecha_vencimiento.isnot(None),
            Producto.fecha_vencimiento <= limite,
            # Lo que ya se acabó no hay que retirarlo de la estantería
            Producto.stock > 0,
        )
        .order_by(Producto.fecha_vencimiento)
        .all()
    )


@router.get("/reposicion")
def reposicion_sugerida(
    historial: int = Query(30, ge=7, le=180, description="Días de ventas que se miran para medir el consumo"),
    cubrir: int = Query(30, ge=7, le=180, description="Para cuántos días se quiere tener stock"),
    db: Session = Depends(get_db),
):
    """Qué pedir al proveedor, según lo que de verdad se consume y no solo el mínimo fijo.

    Consumo = salidas del kardex en la ventana, menos lo devuelto por anulaciones.
    Las entradas de compra no cuentan. Un producto sin consumo no aparece: sin
    demanda no hay nada que predecir, y lo agotado sin ventas no es urgente.
    """
    desde = datetime.now(timezone.utc) - timedelta(days=historial)
    consumido = func.coalesce(func.sum(case(
        (MovimientoInventario.tipo == "salida", -MovimientoInventario.cantidad),
        (and_(MovimientoInventario.tipo == "entrada",
              MovimientoInventario.motivo.like("Devolución por anulación%")), -MovimientoInventario.cantidad),
        else_=0,
    )), 0)
    filas = (
        db.query(Producto, consumido)
        .join(MovimientoInventario, MovimientoInventario.producto_id == Producto.id)
        .filter(Producto.activo.is_(True), MovimientoInventario.fecha >= desde)
        .group_by(Producto.id)
        .all()
    )
    salida = []
    for p, total in filas:
        total = int(total)
        if total <= 0:
            continue
        diario = total / historial
        dias = p.stock / diario
        if dias >= cubrir:
            continue
        salida.append({
            "id": p.id, "codigo": p.codigo, "nombre": p.nombre, "proveedor": p.proveedor,
            "categoria": p.categoria, "unidad": p.unidad, "stock": p.stock,
            "consumo_diario": round(diario, 2),
            "dias_restantes": round(dias, 1),
            "sugerido": max(1, math.ceil(diario * cubrir - p.stock)),
            "urgente": dias <= 7,
        })
    salida.sort(key=lambda x: x["dias_restantes"])
    return salida


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
