"""Gasto y latencia de la IA (Deepgram + OpenAI): cuánto se gasta, cuánto tarda y cuánto costaría probar más."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.deps import solo_admin
from core.tiempo import PERU_TZ
from database import get_db
from models import UsoIA
from services import uso_ia
from services.estadistica import descriptivos, percentil

router = APIRouter(prefix="/api/ia", tags=["Gasto de IA"], dependencies=[Depends(solo_admin)])

# Si todavía no hay datos reales, el estimador usa estas medidas. Son SUPUESTOS, no
# mediciones: el prompt lleva el catálogo de la clínica y su tamaño depende de ella.
_SUPUESTO = {"segundos_audio": 90.0, "tokens_entrada": 3000, "tokens_salida": 700}


def _latencias(filas: list[UsoIA]) -> dict:
    """Mediana y p95 de la latencia por servicio, solo de llamadas exitosas."""
    por: dict[str, list[int]] = defaultdict(list)
    for f in filas:
        if f.exito and f.latencia_ms is not None and f.operacion != "evaluacion":
            por[f.servicio].append(f.latencia_ms)
    return {
        s: {"n": len(v), "mediana_ms": descriptivos(v)["mediana"], "p95_ms": percentil(v, 95)}
        for s, v in por.items()
    }


@router.get("/gasto")
def gasto(db: Session = Depends(get_db)):
    """Gasto de hoy / semana / mes, costo por historia, proyección y latencia del servicio."""
    resumen = uso_ia.resumen_gasto(db)

    desde = datetime.now(timezone.utc) - timedelta(days=30)
    filas = db.query(UsoIA).filter(UsoIA.creado_en >= desde).all()
    resumen["latencia"] = _latencias(filas)

    # Gasto por día de los últimos 14 días (hora de Lima), para el gráfico.
    por_dia: dict[str, float] = defaultdict(float)
    for f in filas:
        if f.creado_en:
            por_dia[f.creado_en.astimezone(PERU_TZ).date().isoformat()] += f.costo_usd or 0
    hoy = datetime.now(PERU_TZ).date()
    resumen["por_dia"] = [
        {"dia": (hoy - timedelta(days=i)).isoformat(),
         "usd": round(por_dia.get((hoy - timedelta(days=i)).isoformat(), 0.0), 4)}
        for i in range(13, -1, -1)
    ]
    resumen["llamadas_fallidas_30d"] = sum(1 for f in filas if not f.exito)
    return resumen


@router.get("/gasto/estimar")
def estimar(
    historias: int = Query(30, ge=1, le=5000),
    con_voz: bool = True,
    segundos_audio: float | None = Query(None, gt=0),
    db: Session = Depends(get_db),
):
    """Cuánto costaría procesar N historias. Usa los promedios reales si ya existen."""
    r = uso_ia.resumen_gasto(db)
    real = {
        "segundos_audio": segundos_audio or r["segundos_audio_promedio"],
        "tokens_entrada": r["tokens_entrada_promedio"],
        "tokens_salida": r["tokens_salida_promedio"],
    }
    origen = "datos reales"
    medidas = {}
    for k, v in real.items():
        if v:
            medidas[k] = v
        else:
            medidas[k] = _SUPUESTO[k]
            origen = "supuesto (aún faltan datos reales)"
    est = uso_ia.estimar_pruebas(historias, medidas["segundos_audio"], int(medidas["tokens_entrada"]),
                                 int(medidas["tokens_salida"]), con_voz=con_voz)
    est.update(origen=origen, medidas=medidas, con_voz=con_voz,
               tope_diario_usd=r["tope_diario_usd"], gasto_hoy_usd=r["hoy_usd"])
    return est
