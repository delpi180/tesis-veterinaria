import unicodedata

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from models import MovimientoInventario, Producto
from schemas import (
    InventarioInterpretarReq, InvItemPreview,
    InventarioAplicarReq, ProductoOut,
)
from services.inventario_extractor import interpretar_inventario
from services.transcription import transcribe_audio
from routers.productos import _generar_codigo

router = APIRouter(prefix="/api/inventario", tags=["Inventario IA"])


# ── Matching difuso de nombres contra productos existentes ───────────────────

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _match_producto(nombre: str, productos: list[Producto]) -> Producto | None:
    objetivo = _norm(nombre)
    if not objetivo:
        return None
    palabras = {w for w in objetivo.split() if len(w) > 2}

    mejor, mejor_score = None, 0.0
    for p in productos:
        pn = _norm(p.nombre)
        if objetivo == pn or objetivo in pn or pn in objetivo:
            return p   # match directo
        tokens = {w for w in pn.split() if len(w) > 2}
        if not palabras or not tokens:
            continue
        score = len(palabras & tokens) / len(palabras | tokens)
        if score > mejor_score:
            mejor, mejor_score = p, score
    return mejor if mejor_score >= 0.5 else None


def _armar_preview(items: list[dict], db: Session) -> list[dict]:
    productos = db.query(Producto).all()
    preview = []
    for it in items:
        match = _match_producto(it["nombre"], productos)
        if match:
            preview.append({
                **it,
                "producto_id":  match.id,
                "codigo":       match.codigo,
                "categoria":    it["categoria"] or match.categoria,
                "accion":       "entrada",
                "stock_actual": match.stock,
            })
        else:
            preview.append({
                **it,
                "producto_id":  None, "codigo": None,
                "accion":       "nuevo", "stock_actual": None,
            })
    return preview


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/interpretar", response_model=list[InvItemPreview])
def interpretar(body: InventarioInterpretarReq, db: Session = Depends(get_db)):
    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío.")
    try:
        items = interpretar_inventario(body.texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _armar_preview(items, db)


@router.post("/interpretar-audio", response_model=list[InvItemPreview])
async def interpretar_audio(audio: UploadFile = File(...), db: Session = Depends(get_db)):
    import os
    allowed = {".wav", ".mp3", ".mp4", ".m4a", ".webm", ".ogg", ".flac"}
    ext = os.path.splitext(audio.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Formato de audio no soportado: '{ext}'.")
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="El audio está vacío.")
    try:
        import asyncio
        texto = await asyncio.to_thread(transcribe_audio, data, filename=audio.filename or "inv.webm")
        items = await asyncio.to_thread(interpretar_inventario, texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _armar_preview(items, db)



@router.post("/aplicar")
def aplicar(body: InventarioAplicarReq, db: Session = Depends(get_db)):
    """Aplica la lista confirmada: crea productos nuevos y suma stock a los existentes."""
    creados, actualizados = [], []
    try:
        for it in body.items:
            if it.accion == "nuevo":
                if not it.precio or it.precio <= 0:
                    raise HTTPException(status_code=422, detail=f"'{it.nombre}': un producto nuevo requiere precio.")
                p = Producto(
                    nombre=it.nombre, categoria=it.categoria, unidad=it.unidad,
                    precio=it.precio, stock=it.cantidad, activo=True,
                )
                p.codigo = _generar_codigo(db, it.categoria)
                db.add(p)
                db.flush()
                db.add(MovimientoInventario(
                    producto_id=p.id, tipo="entrada", cantidad=it.cantidad,
                    stock_resultante=p.stock, motivo="Alta por dictado (entrada de mercadería)",
                ))
                creados.append(p.nombre)
            else:  # entrada a producto existente
                p = db.get(Producto, it.producto_id)
                if not p:
                    raise HTTPException(status_code=404, detail=f"Producto id={it.producto_id} no existe.")
                p.stock += it.cantidad
                if it.precio and it.precio > 0:
                    p.precio = it.precio   # actualizar precio de compra si se indicó
                db.add(MovimientoInventario(
                    producto_id=p.id, tipo="entrada", cantidad=it.cantidad,
                    stock_resultante=p.stock, motivo="Entrada por dictado (reposición)",
                ))
                actualizados.append(p.nombre)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al aplicar inventario: {e}")

    return {
        "creados": creados,
        "actualizados": actualizados,
        "total": len(creados) + len(actualizados),
    }
