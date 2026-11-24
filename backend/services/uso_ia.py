"""Registro y control del gasto de IA (Deepgram + OpenAI).

Cada llamada a un servicio de IA deja una fila en `uso_ia` con lo que costó y lo
que tardó. Con eso se puede ver el gasto, predecir el de las pruebas y poner un
tope diario. Registrar NUNCA debe romper el trabajo del doctor: si falla, solo
se avisa en el log.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from core.config import settings
from core.tiempo import PERU_TZ
from models import UsoIA

logger = logging.getLogger("vet.uso_ia")


class TopeGastoExcedido(RuntimeError):
    """Se llegó al tope diario de gasto de IA."""


def costo_openai(tokens_entrada: int | None, tokens_salida: int | None) -> float:
    return (
        (tokens_entrada or 0) * settings.precio_openai_entrada_millon
        + (tokens_salida or 0) * settings.precio_openai_salida_millon
    ) / 1_000_000


def costo_deepgram(segundos_audio: float | None) -> float:
    return (segundos_audio or 0) / 60 * settings.precio_deepgram_minuto


def registrar(
    db,
    *,
    servicio: str,
    operacion: str,
    modelo: str | None = None,
    tokens_entrada: int | None = None,
    tokens_salida: int | None = None,
    segundos_audio: float | None = None,
    latencia_ms: int | None = None,
    exito: bool = True,
) -> None:
    """Guarda una llamada de IA. Sin sesión de base (pruebas, scripts) no hace nada."""
    if db is None:
        return
    if servicio == "openai":
        costo = costo_openai(tokens_entrada, tokens_salida)
    else:
        costo = costo_deepgram(segundos_audio)
    try:
        db.add(UsoIA(
            servicio=servicio, operacion=operacion, modelo=modelo,
            tokens_entrada=tokens_entrada, tokens_salida=tokens_salida,
            segundos_audio=segundos_audio, latencia_ms=latencia_ms,
            costo_usd=costo if exito else 0, exito=exito,
        ))
        db.commit()
    except Exception as exc:  # pragma: no cover - el log basta
        logger.warning("No se pudo registrar el uso de IA: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


# ── Consultas de gasto ───────────────────────────────────────────────────────

def _inicio_dia_peru(ahora: datetime | None = None) -> datetime:
    """Medianoche de Lima de hoy, expresada en UTC."""
    ahora = (ahora or datetime.now(timezone.utc)).astimezone(PERU_TZ)
    return ahora.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def gasto_desde(db, desde: datetime) -> float:
    total = db.query(func.coalesce(func.sum(UsoIA.costo_usd), 0.0)).filter(UsoIA.creado_en >= desde).scalar()
    return float(total or 0)


def gasto_hoy(db) -> float:
    return gasto_desde(db, _inicio_dia_peru())


def exigir_cupo(db) -> None:
    """Corta la IA si hoy ya se llegó al tope. Con tope 0 no hace nada."""
    tope = settings.tope_gasto_ia_diario_usd
    if not tope or tope <= 0:
        return
    usado = gasto_hoy(db)
    if usado >= tope:
        raise TopeGastoExcedido(
            f"Se llegó al tope de gasto de IA de hoy (US$ {tope:.2f}). "
            "Puedes seguir llenando la historia a mano; la IA vuelve mañana."
        )


def resumen_gasto(db, ahora: datetime | None = None) -> dict:
    """Gasto de hoy, de la semana y del mes, costo promedio por historia y proyección."""
    ahora = ahora or datetime.now(timezone.utc)
    inicio_hoy = _inicio_dia_peru(ahora)
    inicio_semana = inicio_hoy - timedelta(days=6)
    local = ahora.astimezone(PERU_TZ)
    inicio_mes = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    hoy = gasto_desde(db, inicio_hoy)
    semana = gasto_desde(db, inicio_semana)
    mes = gasto_desde(db, inicio_mes)

    # Costo por historia: lo que cuesta pasar un dictado por la IA (voz + extracción).
    # Se calcula con las llamadas de historia y su transcripción más reciente, no con
    # todo el gasto, para que las evaluaciones de prueba no inflen el promedio.
    n_historias = db.query(func.count(UsoIA.id)).filter(
        UsoIA.operacion == "historia", UsoIA.exito.is_(True)).scalar() or 0
    costo_extraccion = float(db.query(func.coalesce(func.sum(UsoIA.costo_usd), 0.0)).filter(
        UsoIA.operacion == "historia").scalar() or 0)
    n_audios = db.query(func.count(UsoIA.id)).filter(
        UsoIA.operacion == "transcripcion", UsoIA.exito.is_(True)).scalar() or 0
    costo_audio = float(db.query(func.coalesce(func.sum(UsoIA.costo_usd), 0.0)).filter(
        UsoIA.operacion == "transcripcion").scalar() or 0)
    seg_audio_prom = db.query(func.avg(UsoIA.segundos_audio)).filter(
        UsoIA.operacion == "transcripcion", UsoIA.exito.is_(True)).scalar()
    tok_in_prom = db.query(func.avg(UsoIA.tokens_entrada)).filter(
        UsoIA.operacion == "historia", UsoIA.exito.is_(True)).scalar()
    tok_out_prom = db.query(func.avg(UsoIA.tokens_salida)).filter(
        UsoIA.operacion == "historia", UsoIA.exito.is_(True)).scalar()

    por_historia = None
    if n_historias:
        por_historia = costo_extraccion / n_historias + (costo_audio / n_audios if n_audios else 0)

    # Proyección simple: ritmo diario del mes en curso × días del mes.
    dias_transcurridos = max(local.day, 1)
    siguiente = (local.replace(day=28) + timedelta(days=4)).replace(day=1)
    dias_mes = (siguiente - timedelta(days=1)).day
    proyeccion_mes = mes / dias_transcurridos * dias_mes if mes else 0.0

    return {
        "hoy_usd": round(hoy, 4),
        "semana_usd": round(semana, 4),
        "mes_usd": round(mes, 4),
        "proyeccion_mes_usd": round(proyeccion_mes, 4),
        "por_historia_usd": round(por_historia, 5) if por_historia is not None else None,
        "historias_con_ia": int(n_historias),
        "segundos_audio_promedio": round(float(seg_audio_prom), 1) if seg_audio_prom else None,
        "tokens_entrada_promedio": round(float(tok_in_prom)) if tok_in_prom else None,
        "tokens_salida_promedio": round(float(tok_out_prom)) if tok_out_prom else None,
        "tope_diario_usd": settings.tope_gasto_ia_diario_usd or None,
        "tope_alcanzado": bool(settings.tope_gasto_ia_diario_usd and hoy >= settings.tope_gasto_ia_diario_usd),
        "alerta_mensual_usd": settings.alerta_gasto_ia_mensual_usd or None,
        "alerta_mensual_superada": bool(settings.alerta_gasto_ia_mensual_usd and mes >= settings.alerta_gasto_ia_mensual_usd),
        "precios": {
            "openai_entrada_millon": settings.precio_openai_entrada_millon,
            "openai_salida_millon": settings.precio_openai_salida_millon,
            "deepgram_minuto": settings.precio_deepgram_minuto,
            "modelo_llm": settings.llm_model,
            "modelo_voz": settings.deepgram_model,
        },
    }


def estimar_pruebas(
    n_historias: int,
    segundos_audio: float,
    tokens_entrada: int,
    tokens_salida: int,
    con_voz: bool = True,
) -> dict:
    """Cuánto costaría procesar `n_historias` con estas medidas por historia.

    Es una cuenta con los precios configurados: no consulta ninguna API.
    """
    por_voz = costo_deepgram(segundos_audio) if con_voz else 0.0
    por_texto = costo_openai(tokens_entrada, tokens_salida)
    por_historia = por_voz + por_texto
    return {
        "n_historias": n_historias,
        "por_historia_usd": round(por_historia, 5),
        "voz_usd": round(por_voz * n_historias, 4),
        "extraccion_usd": round(por_texto * n_historias, 4),
        "total_usd": round(por_historia * n_historias, 4),
    }
