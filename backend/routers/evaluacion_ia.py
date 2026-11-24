"""Evaluación de la IA para la tesis: WER de la voz, banco de casos y exportación a CSV.

Solo se monta con MODULOS_TESIS=true (ver main.py).
"""
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import CorridaEvaluacion, EvaluacionVoz, HistoriaClinica, UsoIA
from services import banco_evaluacion, uso_ia
from services.calidad_voz import calcular_wer
from services.estadistica import descriptivos

router = APIRouter(prefix="/api/evaluacion", tags=["Evaluación IA (tesis)"])


# ── WER de la transcripción ──────────────────────────────────────────────────

class WerRequest(BaseModel):
    referencia: str = Field(min_length=1, description="Lo que de verdad se dijo, escrito a mano")
    hipotesis: str = Field(min_length=1, description="Lo que escribió el sistema (Deepgram)")
    etiqueta: str | None = Field(None, max_length=120)
    duracion_audio_s: float | None = Field(None, ge=0)


@router.post("/wer")
def evaluar_wer(body: WerRequest, db: Session = Depends(get_db)):
    """Calcula el WER de una transcripción y lo guarda para sumarlo a los resultados."""
    try:
        r = calcular_wer(body.referencia, body.hipotesis)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    db.add(EvaluacionVoz(
        etiqueta=body.etiqueta, texto_referencia=body.referencia, texto_deepgram=body.hipotesis,
        palabras_ref=r["palabras_ref"], sustituidas=r["sustituidas"], borradas=r["borradas"],
        insertadas=r["insertadas"], wer=r["wer"], wer_clinico=r["wer_clinico"],
        terminos_clinicos=r["terminos_clinicos"], duracion_audio_s=body.duracion_audio_s,
    ))
    db.commit()
    return r


@router.get("/wer")
def listar_wer(db: Session = Depends(get_db)):
    """Evaluaciones guardadas y su resumen (WER promedio, mediana y WER global ponderado)."""
    filas = db.query(EvaluacionVoz).order_by(EvaluacionVoz.creado_en.desc()).all()
    palabras = sum(f.palabras_ref or 0 for f in filas)
    errores = sum((f.sustituidas or 0) + (f.borradas or 0) + (f.insertadas or 0) for f in filas)
    clin_total = sum(f.terminos_clinicos or 0 for f in filas)
    clin_error = sum(round((f.wer_clinico or 0) * (f.terminos_clinicos or 0)) for f in filas)
    return {
        "n": len(filas),
        "wer": descriptivos([f.wer for f in filas]),
        # WER global: errores totales / palabras totales (pesa más a las consultas largas).
        "wer_global": round(errores / palabras, 4) if palabras else None,
        "wer_clinico_global": round(clin_error / clin_total, 4) if clin_total else None,
        "terminos_clinicos": clin_total,
        "recientes": [
            {"id": f.id, "etiqueta": f.etiqueta, "wer": f.wer, "wer_clinico": f.wer_clinico,
             "palabras": f.palabras_ref, "fecha": f.creado_en.isoformat() if f.creado_en else None}
            for f in filas[:30]
        ],
    }


# ── Banco de casos (gold standard) ───────────────────────────────────────────

@router.get("/banco/estimar")
def estimar_banco(tipo: str = Query("todos", pattern="^(historia|receta|todos)$"), db: Session = Depends(get_db)):
    """Cuántos casos tiene el banco y cuánto costaría correrlo, SIN llamar a la IA."""
    n = len(banco_evaluacion.casos_de(tipo))
    r = uso_ia.resumen_gasto(db)
    tin, tout = r["tokens_entrada_promedio"], r["tokens_salida_promedio"]
    origen = "datos reales"
    if not tin or not tout:
        tin, tout, origen = 3000, 700, "supuesto (aún faltan datos reales)"
    est = uso_ia.estimar_pruebas(n, 0, int(tin), int(tout), con_voz=False)
    est.update(origen=origen, casos=n, tope_diario_usd=r["tope_diario_usd"], gasto_hoy_usd=r["hoy_usd"])
    return est


@router.post("/banco")
def correr_banco(tipo: str = Query("todos", pattern="^(historia|receta|todos)$"), db: Session = Depends(get_db)):
    """Pasa todos los casos del banco por la IA y guarda la corrida (cuesta unos centavos)."""
    try:
        uso_ia.exigir_cupo(db)
    except uso_ia.TopeGastoExcedido as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    r = banco_evaluacion.correr_banco(db, tipo)
    fila = CorridaEvaluacion(
        modelo=r["modelo"], casos=r["casos"], correctos=r["correctos"], saltados=r["saltados"],
        exactitud=r["exactitud"], ic95_inf=r["ic95_inf"], ic95_sup=r["ic95_sup"],
        latencia_media_ms=r["latencia_media_ms"], costo_usd=r["costo_usd"], detalle=r["detalle"],
    )
    db.add(fila)
    db.commit()
    r["id"] = fila.id
    return r


@router.get("/banco")
def listar_corridas(db: Session = Depends(get_db)):
    filas = db.query(CorridaEvaluacion).order_by(CorridaEvaluacion.creado_en.desc()).limit(30).all()
    return [
        {"id": f.id, "fecha": f.creado_en.isoformat() if f.creado_en else None, "modelo": f.modelo,
         "casos": f.casos, "correctos": f.correctos, "saltados": f.saltados, "exactitud": f.exactitud,
         "ic95_inf": f.ic95_inf, "ic95_sup": f.ic95_sup, "latencia_media_ms": f.latencia_media_ms,
         "costo_usd": f.costo_usd, "detalle": f.detalle}
        for f in filas
    ]


# ── Exportación a CSV (para Excel / SPSS / R) ────────────────────────────────

def _csv(cabecera: list[str], filas: list[list]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cabecera)
    w.writerows(filas)
    # utf-8 con BOM: Excel abre bien las tildes.
    return Response(
        content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=medicion.csv"},
    )


@router.get("/exportar")
def exportar(tabla: str = Query(..., pattern="^(tiempos|uso_ia|wer|banco)$"), db: Session = Depends(get_db)):
    """Datos crudos de la medición, una fila por registro."""
    if tabla == "tiempos":
        hs = (db.query(HistoriaClinica).filter(HistoriaClinica.segundos_registro.isnot(None))
              .order_by(HistoriaClinica.creado_en).all())
        return _csv(
            ["historia_id", "fecha", "metodo", "segundos_total", "grabacion_s", "transcripcion_s",
             "extraccion_s", "revision_s"],
            [[h.id, h.creado_en.isoformat() if h.creado_en else "", h.metodo_registro, h.segundos_registro,
              *[(h.etapas_registro or {}).get(k, "") for k in
                ("grabacion_s", "transcripcion_s", "extraccion_s", "revision_s")]] for h in hs],
        )
    if tabla == "uso_ia":
        us = db.query(UsoIA).order_by(UsoIA.creado_en).all()
        return _csv(
            ["fecha", "servicio", "operacion", "modelo", "tokens_entrada", "tokens_salida",
             "segundos_audio", "latencia_ms", "costo_usd", "exito"],
            [[u.creado_en.isoformat() if u.creado_en else "", u.servicio, u.operacion, u.modelo,
              u.tokens_entrada, u.tokens_salida, u.segundos_audio, u.latencia_ms, u.costo_usd, u.exito]
             for u in us],
        )
    if tabla == "wer":
        ws = db.query(EvaluacionVoz).order_by(EvaluacionVoz.creado_en).all()
        return _csv(
            ["fecha", "etiqueta", "palabras_ref", "sustituidas", "borradas", "insertadas", "wer",
             "terminos_clinicos", "wer_clinico", "duracion_audio_s"],
            [[w.creado_en.isoformat() if w.creado_en else "", w.etiqueta, w.palabras_ref, w.sustituidas,
              w.borradas, w.insertadas, w.wer, w.terminos_clinicos, w.wer_clinico, w.duracion_audio_s]
             for w in ws],
        )
    cs = db.query(CorridaEvaluacion).order_by(CorridaEvaluacion.creado_en).all()
    filas = []
    for c in cs:
        for d in c.detalle or []:
            filas.append([c.id, c.creado_en.isoformat() if c.creado_en else "", c.modelo, d.get("tipo"),
                          d.get("nombre"), d.get("estado"), d.get("ms"), " | ".join(d.get("fallos") or [])])
    return _csv(["corrida_id", "fecha", "modelo", "tipo", "caso", "estado", "ms", "fallos"], filas)
