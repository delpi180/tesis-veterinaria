"""Carnet de la mascota para el dueño: lo que es seguro mostrar en un enlace sin sesión.

Solo el estado de vacunas y desparasitaciones y la próxima cita. A propósito NO
incluye datos del dueño (teléfono, DNI, dirección), diagnósticos, tratamientos
ni precios: quien tenga el enlace ve el carnet y nada más.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from core.tiempo import PERU_TZ, hoy_peru
from core.vacunas import normalizar as normalizar_vacuna
from models import Cita, HistoriaClinica, Paciente, RegistroClinico
from routers.dashboard import _parse_fecha_libre


def _estado(proxima: date | None, hoy: date) -> str | None:
    if proxima is None:
        return None
    return "vencida" if proxima < hoy else "al_dia"


def armar_carnet(db: Session, paciente: Paciente, clinica: str, hoy: date | None = None) -> dict:
    hoy = hoy or hoy_peru()

    historias = (
        db.query(HistoriaClinica)
        .filter(HistoriaClinica.paciente_id == paciente.id, HistoriaClinica.vacunas_items.isnot(None))
        .order_by(HistoriaClinica.fecha.desc())
        .all()
    )
    vacunas: list[dict] = []
    vistas: set[str] = set()
    for h in historias:
        aplicada = h.fecha.astimezone(PERU_TZ).date() if h.fecha else None
        for item in (h.vacunas_items or []):
            nombre = normalizar_vacuna((item.get("vacuna") or "").strip())
            if not nombre or nombre.lower() in vistas:
                continue                       # solo la aplicación más reciente de cada una
            vistas.add(nombre.lower())
            prox = _parse_fecha_libre(item.get("proxima_dosis"))
            vacunas.append({
                "nombre": nombre,
                "aplicada": aplicada.isoformat() if aplicada else None,
                "proxima": prox.isoformat() if prox else None,
                "estado": _estado(prox, hoy),
            })

    regs = (
        db.query(RegistroClinico)
        .filter(RegistroClinico.paciente_id == paciente.id, RegistroClinico.tipo == "antiparasitario")
        .order_by(RegistroClinico.fecha.desc(), RegistroClinico.id.desc())
        .all()
    )
    desparasitaciones: list[dict] = []
    vistos: set[str] = set()
    for r in regs:
        clave = (r.producto or "").strip().lower()
        if clave in vistos:
            continue
        vistos.add(clave)
        desparasitaciones.append({
            "producto": r.producto or "Antiparasitario",
            "aplicada": r.fecha.isoformat() if r.fecha else None,
            "proxima": r.proxima_fecha.isoformat() if r.proxima_fecha else None,
            "estado": _estado(r.proxima_fecha, hoy),
        })

    cita = (
        db.query(Cita)
        .filter(Cita.paciente_id == paciente.id, Cita.fecha_hora >= datetime.now(timezone.utc),
                Cita.estado.in_(["pendiente", "confirmada"]))
        .order_by(Cita.fecha_hora)
        .first()
    )

    return {
        "clinica": clinica,
        "mascota": {"nombre": paciente.nombre, "especie": paciente.especie, "raza": paciente.raza},
        "vacunas": vacunas,
        "desparasitaciones": desparasitaciones,
        "proxima_cita": cita.fecha_hora.isoformat() if cita else None,
    }
