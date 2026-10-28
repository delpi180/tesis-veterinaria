"""Hora de la clínica. El servidor corre en UTC; la clínica vive en Lima (UTC-5, sin horario de verano).

Todo lo que diga "hoy" o agrupe por día calendario debe salir de aquí: con la fecha UTC,
después de las 19:00 en Lima ya sería mañana y un tratamiento terminaría un día antes.
"""
from datetime import date, datetime, timedelta, timezone

PERU_TZ = timezone(timedelta(hours=-5))


def hoy_peru() -> date:
    return datetime.now(PERU_TZ).date()
