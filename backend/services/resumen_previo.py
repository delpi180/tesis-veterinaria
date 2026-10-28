"""Resumen de una mascota para leer antes de entrar a la consulta.

No usa IA a propósito: es solo juntar lo que ya está registrado (última visita,
peso, tratamientos en curso, vacunas y desparasitaciones pendientes, alergias).
Un resumen escrito por un modelo podría omitir o inventar un dato clínico;
este no, porque cada línea sale directo de la historia y se puede comprobar.
"""
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from core.vacunas import normalizar as normalizar_vacuna
from models import Cita, HistoriaClinica, Paciente, RegistroClinico, Tratamiento
from routers.dashboard import _parse_fecha_libre


def _fecha_local(dt: datetime | None) -> str | None:
    return dt.astimezone().date().isoformat() if dt else None


def _peso(h: HistoriaClinica) -> float | None:
    return float(h.peso_kg) if h.peso_kg is not None else None


def armar_resumen_previo(db: Session, paciente: Paciente, hoy: date | None = None) -> dict:
    hoy = hoy or date.today()

    historias = (
        db.query(HistoriaClinica)
        .filter(HistoriaClinica.paciente_id == paciente.id)
        .order_by(HistoriaClinica.fecha.desc())
        .all()
    )

    # Última visita
    ultima = None
    if historias:
        h = historias[0]
        ultima = {
            "id": h.id,
            "fecha": _fecha_local(h.fecha),
            "motivo": h.motivo_consulta,
            "diagnostico": h.diagnostico_definitivo or h.diagnostico_presuntivo,
            "indicaciones": h.indicaciones,
            "veterinario": h.firmado_por or (h.veterinario.nombre if h.veterinario else None),
        }

    # Peso: el último y cuánto cambió respecto al anterior
    pesos = [(h, _peso(h)) for h in historias if _peso(h) is not None]
    peso = None
    if pesos:
        actual = pesos[0][1]
        peso = {"kg": actual, "fecha": _fecha_local(pesos[0][0].fecha), "cambio_kg": None}
        if len(pesos) > 1:
            peso["cambio_kg"] = round(actual - pesos[1][1], 2)

    # Tratamientos que siguen en curso hoy
    tratamientos = [
        {
            "medicamento": t.medicamento, "dosis": t.dosis, "frecuencia": t.frecuencia,
            "fin": t.fin.isoformat() if t.fin else None,
        }
        for t in db.query(Tratamiento).filter(Tratamiento.paciente_id == paciente.id).all()
        if t.estado_actual == "en_curso"
    ]

    # Vacunas: solo la aplicación más reciente de cada una cuenta
    pendientes: list[dict] = []
    vistas: set[str] = set()
    for h in historias:
        for item in (h.vacunas_items or []):
            nombre = normalizar_vacuna((item.get("vacuna") or "").strip())
            prox = item.get("proxima_dosis")
            if not nombre or nombre.lower() in vistas:
                continue
            vistas.add(nombre.lower())
            fecha = _parse_fecha_libre(prox)
            if fecha:
                pendientes.append({"tipo": "vacuna", "nombre": nombre, "fecha": fecha.isoformat(), "vencida": fecha < hoy})

    # Desparasitaciones: igual, la más reciente por producto
    regs = (
        db.query(RegistroClinico)
        .filter(RegistroClinico.paciente_id == paciente.id, RegistroClinico.tipo == "antiparasitario")
        .order_by(RegistroClinico.fecha.desc(), RegistroClinico.id.desc())
        .all()
    )
    vistos_prod: set[str] = set()
    for r in regs:
        clave = (r.producto or "").strip().lower()
        if clave in vistos_prod:
            continue
        vistos_prod.add(clave)
        if r.proxima_fecha:
            pendientes.append({
                "tipo": "antiparasitario", "nombre": r.producto or "Antiparasitario",
                "fecha": r.proxima_fecha.isoformat(), "vencida": r.proxima_fecha < hoy,
            })
    pendientes.sort(key=lambda p: p["fecha"])

    # Próximo turno (el más cercano que aún no pasó ni se canceló)
    ahora = datetime.now(timezone.utc)
    cita = (
        db.query(Cita)
        .filter(Cita.paciente_id == paciente.id, Cita.fecha_hora >= ahora, Cita.estado.in_(["pendiente", "confirmada"]))
        .order_by(Cita.fecha_hora)
        .first()
    )
    proxima_cita = None
    if cita:
        proxima_cita = {"fecha_hora": cita.fecha_hora.isoformat(), "motivo": cita.motivo, "veterinario": cita.veterinario_nombre}

    return {
        "paciente": {"nombre": paciente.nombre, "especie": paciente.especie, "raza": paciente.raza, "edad": paciente.edad},
        "alergias": paciente.alergias or None,
        "condiciones_cronicas": paciente.condiciones_cronicas or None,
        "total_consultas": len(historias),
        "ultima_visita": ultima,
        "peso": peso,
        "tratamientos_en_curso": tratamientos,
        "pendientes": pendientes,
        "proxima_cita": proxima_cita,
    }
