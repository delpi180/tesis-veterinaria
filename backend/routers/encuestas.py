from statistics import NormalDist

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import HistoriaClinica, Paciente, RespuestaSUS, RespuestaTAM
from schemas import ResumenEncuestas
from services.estadistica import (
    descriptivos, cronbach_alpha, interpretar_alpha, t_test_welch,
)

router = APIRouter(prefix="/api/encuestas", tags=["Resumen Encuestas"])

# Población de referencia SUS (Sauro & Lewis): media 68, sd 12.5
_SUS_POBLACION = NormalDist(68, 12.5)


def _interpretar_sus(media: float | None) -> dict:
    if media is None:
        return {"adjetivo": "—", "aceptabilidad": "—", "percentil": None, "nota": "—"}
    if   media >= 85.5: adj = "Excelente"
    elif media >= 71.4: adj = "Bueno"
    elif media >= 50.9: adj = "Aceptable (OK)"
    elif media >= 35.7: adj = "Pobre"
    else:               adj = "Deficiente"
    acept = "Aceptable" if media >= 70 else ("Marginal" if media >= 50 else "No aceptable")
    nota = ("A" if media >= 80 else "B" if media >= 70 else
            "C" if media >= 60 else "D" if media >= 50 else "F")
    percentil = round(_SUS_POBLACION.cdf(media) * 100, 1)
    return {"adjetivo": adj, "aceptabilidad": acept, "percentil": percentil, "nota": nota}


@router.get("/resumen", response_model=ResumenEncuestas)
def resumen_encuestas(db: Session = Depends(get_db)):
    total_sus  = db.query(RespuestaSUS).count()
    avg_sus    = db.query(func.avg(RespuestaSUS.puntaje)).scalar()

    total_tam  = db.query(RespuestaTAM).count()
    avg_util   = db.query(func.avg(RespuestaTAM.util_percibida)).scalar()
    avg_facil  = db.query(func.avg(RespuestaTAM.facilidad_uso)).scalar()
    avg_inten  = db.query(func.avg(RespuestaTAM.intencion_uso)).scalar()

    def _r(v):
        return round(float(v), 2) if v is not None else None

    return ResumenEncuestas(
        total_sus=total_sus,
        puntaje_sus_promedio=_r(avg_sus),
        total_tam=total_tam,
        util_percibida_promedio=_r(avg_util),
        facilidad_uso_promedio=_r(avg_facil),
        intencion_uso_promedio=_r(avg_inten),
    )


@router.get("/estadisticas")
def estadisticas_encuestas(db: Session = Depends(get_db)):
    """
    Estadística inferencial de tesis: descriptivos con IC 95%, fiabilidad
    (Cronbach's alpha) e interpretación estándar SUS.
    """
    sus = db.query(RespuestaSUS).all()
    tam = db.query(RespuestaTAM).all()

    # ── SUS ───────────────────────────────────────────────────────────────────
    sus_puntajes = [s.puntaje for s in sus if s.puntaje is not None]
    # Matriz de contribuciones (0–4): impares xi-1, pares 5-xi
    sus_matriz = []
    for s in sus:
        fila = []
        for i in range(1, 11):
            xi = getattr(s, f"p{i}")
            if xi is None:
                fila = None
                break
            fila.append((xi - 1) if i % 2 == 1 else (5 - xi))
        if fila:
            sus_matriz.append(fila)
    alpha_sus = cronbach_alpha(sus_matriz)

    sus_desc = descriptivos(sus_puntajes)
    sus_block = {
        **sus_desc,
        "alpha": alpha_sus,
        "alpha_interp": interpretar_alpha(alpha_sus),
        "interpretacion": _interpretar_sus(sus_desc["media"]),
    }

    # ── TAM ───────────────────────────────────────────────────────────────────
    def _col(attr):
        return [getattr(t, attr) for t in tam if getattr(t, attr) is not None]

    def _matriz(rango):
        m = []
        for t in tam:
            fila = [getattr(t, f"p{i}") for i in rango]
            if all(v is not None for v in fila):
                m.append(fila)
        return m

    dimensiones = {
        "utilidad":  {"rango": range(1, 6),   "attr": "util_percibida"},
        "facilidad": {"rango": range(6, 10),  "attr": "facilidad_uso"},
        "intencion": {"rango": range(10, 13), "attr": "intencion_uso"},
    }
    tam_block = {}
    for nombre, cfg in dimensiones.items():
        a = cronbach_alpha(_matriz(cfg["rango"]))
        tam_block[nombre] = {
            **descriptivos(_col(cfg["attr"])),
            "alpha": a,
            "alpha_interp": interpretar_alpha(a),
        }
    alpha_tam_global = cronbach_alpha(_matriz(range(1, 13)))

    n = max(len(sus_puntajes), len(tam))
    return {
        "n_evaluadores": n,
        "muestra_suficiente": n >= 12,   # umbral práctico para la sustentación
        "sus": sus_block,
        "tam": {
            **tam_block,
            "alpha_global": alpha_tam_global,
            "alpha_global_interp": interpretar_alpha(alpha_tam_global),
        },
    }


@router.get("/tiempos")
def metricas_tiempo(db: Session = Depends(get_db)):
    """
    Tiempo de registro de historias clínicas, comparando método manual vs IA.
    Métrica central de la tesis (eficiencia documental).
    """
    filas = (
        db.query(HistoriaClinica)
        .options(joinedload(HistoriaClinica.paciente))
        .filter(HistoriaClinica.segundos_registro.isnot(None))
        .order_by(HistoriaClinica.creado_en.desc())
        .all()
    )

    vals_manual = [h.segundos_registro for h in filas if h.metodo_registro == "manual"]
    vals_ia     = [h.segundos_registro for h in filas if h.metodo_registro == "ia"]

    def _stats(vals):
        d = descriptivos(vals)
        return {
            "n": d["n"], "promedio_seg": d["media"], "sd_seg": d["sd"],
            "mediana_seg": d["mediana"], "min_seg": d["min"], "max_seg": d["max"],
            "ic95_low": d["ic95_low"], "ic95_high": d["ic95_high"],
        }

    manual = _stats(vals_manual)
    ia     = _stats(vals_ia)

    # % de ahorro de la IA respecto al método manual
    ahorro_pct = None
    if manual["promedio_seg"] and ia["promedio_seg"]:
        ahorro_pct = round((1 - ia["promedio_seg"] / manual["promedio_seg"]) * 100, 1)

    # Prueba t de Welch: ¿la diferencia manual vs IA es significativa?
    prueba_t = t_test_welch(vals_manual, vals_ia)

    recientes = [
        {
            "id": h.id,
            "paciente": h.paciente.nombre if h.paciente else f"#{h.paciente_id}",
            "metodo": h.metodo_registro,
            "segundos": h.segundos_registro,
            "fecha": h.creado_en.isoformat() if h.creado_en else None,
        }
        for h in filas[:30]
    ]

    return {
        "total": len(filas),
        "manual": manual,
        "ia": ia,
        "ahorro_pct": ahorro_pct,
        "prueba_t": prueba_t,
        "recientes": recientes,
    }
