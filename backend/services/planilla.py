"""Cálculo de la planilla mensual del personal.

Qué hace y qué NO hace
----------------------
Calcula lo que la clínica controla por sí misma: sueldo pactado, descuento por
tardanzas y por faltas (a partir de la asistencia), más bonos, adelantos y otros
descuentos que se anotan a mano.

NO calcula aportes ni beneficios de ley (AFP/ONP, EsSalud, CTS, gratificaciones,
renta de quinta categoría): dependen del régimen y de la situación de cada
trabajador, y un cálculo inventado aquí sería peor que ninguno. Lo define el
contador de la clínica; la pantalla lo dice a la vista.

Convención de descuento (la habitual y la más fácil de explicar al trabajador):
    valor del día    = sueldo ÷ días del mes (30 por defecto)
    valor del minuto = valor del día ÷ horas por día (8) ÷ 60
    tardanza         = minutos × valor del minuto
    falta            = un día completo
"""
import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from models import Asistencia, Usuario, calcular_tardanza_min

DIAS_MES = 30
HORAS_DIA = 8

_CODIGOS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]   # weekday(): lunes = 0


def _d(v) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _redondear(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calcular_linea(sueldo, minutos_tardanza, faltas, bonos=0, adelantos=0,
                   otros_descuentos=0, dias_mes=DIAS_MES, horas_dia=HORAS_DIA) -> dict:
    """Montos de una línea de planilla. Todo en Decimal con dos decimales."""
    sueldo = _d(sueldo)
    dias_mes = _d(dias_mes) or Decimal(DIAS_MES)
    horas_dia = _d(horas_dia) or Decimal(HORAS_DIA)
    valor_dia = sueldo / dias_mes
    valor_min = valor_dia / horas_dia / 60

    desc_tardanza = _redondear(_d(minutos_tardanza) * valor_min)
    desc_faltas = _redondear(_d(faltas) * valor_dia)
    ingresos = _redondear(sueldo + _d(bonos))
    descuentos = _redondear(desc_tardanza + desc_faltas + _d(adelantos) + _d(otros_descuentos))
    return {
        "descuento_tardanza": desc_tardanza,
        "descuento_faltas": desc_faltas,
        "total_ingresos": ingresos,
        "total_descuentos": descuentos,
        "neto": _redondear(ingresos - descuentos),
    }


def rango_del_mes(periodo: str) -> tuple[date, date]:
    """'2026-10' → (2026-10-01, 2026-10-31). Lanza ValueError si no es válido."""
    anio, mes = periodo.split("-")
    anio, mes = int(anio), int(mes)
    if not (1 <= mes <= 12 and 2000 <= anio <= 2100):
        raise ValueError(periodo)
    return date(anio, mes, 1), date(anio, mes, calendar.monthrange(anio, mes)[1])


def datos_de_asistencia(db: Session, usuario: Usuario, periodo: str, hoy: date,
                        tolerancia_min: int = 0) -> dict:
    """Minutos de tardanza y faltas del mes, según las marcaciones.

    - Tardanza: solo cuenta el día en que se pasó de la tolerancia, y entonces
      cuentan todos sus minutos.
    - Falta: día laborable del horario del trabajador, ya transcurrido, sin
      marcación. Los feriados no se conocen: la administradora corrige el
      número a mano. Sin horario asignado no se puede saber, y se avisa.
    """
    desde, hasta = rango_del_mes(periodo)
    marcaciones = (db.query(Asistencia)
                     .filter(Asistencia.usuario_id == usuario.id,
                             Asistencia.fecha >= desde, Asistencia.fecha <= hasta)
                     .all())

    minutos = 0
    for m in marcaciones:
        t = calcular_tardanza_min(m.hora_ingreso, usuario.hora_entrada)
        if t and t > tolerancia_min:
            minutos += t

    dias_con_marca = {m.fecha for m in marcaciones}
    laborales = {c.strip() for c in (usuario.dias_laborales or "").split(",") if c.strip()}
    faltas, sin_horario = 0, not laborales
    if laborales:
        ultimo = min(hasta, hoy)
        dia = desde
        while dia <= ultimo:
            if _CODIGOS[dia.weekday()] in laborales and dia not in dias_con_marca:
                # Hoy aún no es falta: el día no terminó.
                if dia < hoy:
                    faltas += 1
            dia = date.fromordinal(dia.toordinal() + 1)

    return {"minutos_tardanza": minutos, "faltas": faltas,
            "dias_asistidos": len(dias_con_marca), "sin_horario": sin_horario}
