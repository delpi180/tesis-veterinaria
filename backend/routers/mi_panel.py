"""Panel personal del doctor: solo lo de SU cuenta (no datos globales).

Reúne sus turnos próximos, el seguimiento de sus pacientes (próximos controles
o vacunas), un resumen de las historias que él registró y su asistencia de hoy.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Usuario, Cita, HistoriaClinica, Asistencia
from core.deps import usuario_actual

router = APIRouter(prefix="/api/mi-panel", tags=["Mi Panel"])

PERU_TZ = timezone(timedelta(hours=-5))


def _paciente_info(pac):
    if not pac:
        return {"paciente_id": None, "paciente": "—", "especie": "—", "propietario": "—", "cliente_id": None}
    return {
        "paciente_id": pac.id,
        "paciente": pac.nombre,
        "especie": pac.especie,
        "propietario": pac.cliente.nombre if pac.cliente else "—",
        "cliente_id": pac.cliente_id,
    }


@router.get("/")
def mi_panel(db: Session = Depends(get_db), usuario: Usuario = Depends(usuario_actual)):
    if not usuario:
        raise HTTPException(status_code=401, detail="Sesión no válida.")
    if usuario.rol != "veterinario":
        raise HTTPException(status_code=403, detail="El panel personal es solo para doctores veterinarios.")

    ahora = datetime.now(timezone.utc)

    # ── Mis turnos próximos (citas donde yo soy el doctor asignado) ──────────
    turnos = (
        db.query(Cita)
        .filter(
            Cita.veterinario_id == usuario.id,
            Cita.fecha_hora >= ahora,
            Cita.estado.in_(["pendiente", "confirmada"]),
        )
        .order_by(Cita.fecha_hora)
        .limit(30)
        .all()
    )
    mis_turnos = [
        {"id": c.id, "fecha_hora": c.fecha_hora, "motivo": c.motivo, "estado": c.estado, **_paciente_info(c.paciente)}
        for c in turnos
    ]

    # ── Seguimiento: pacientes que atendí con una próxima cita agendada ──────
    historias_seguimiento = (
        db.query(HistoriaClinica)
        .filter(
            HistoriaClinica.veterinario_id == usuario.id,
            HistoriaClinica.proxima_cita.isnot(None),
            HistoriaClinica.proxima_cita >= ahora,
        )
        .order_by(HistoriaClinica.proxima_cita)
        .limit(30)
        .all()
    )
    # Un registro por paciente (el control más cercano)
    seguimiento, vistos = [], set()
    for h in historias_seguimiento:
        if h.paciente_id in vistos:
            continue
        vistos.add(h.paciente_id)
        seguimiento.append({"proxima_cita": h.proxima_cita, **_paciente_info(h.paciente)})

    # ── Resumen de mis historias ─────────────────────────────────────────────
    total_historias = (
        db.query(HistoriaClinica).filter(HistoriaClinica.veterinario_id == usuario.id).count()
    )
    ultimas = (
        db.query(HistoriaClinica)
        .filter(HistoriaClinica.veterinario_id == usuario.id)
        .order_by(HistoriaClinica.creado_en.desc())
        .limit(5)
        .all()
    )
    mis_historias_recientes = [
        {
            "id": h.id,
            "fecha": h.fecha or h.creado_en,
            "motivo": h.motivo_consulta,
            **_paciente_info(h.paciente),
        }
        for h in ultimas
    ]

    # ── Mi asistencia de hoy + mi horario configurado ────────────────────────
    hoy = datetime.now(PERU_TZ).date()
    asis = (
        db.query(Asistencia)
        .filter(Asistencia.usuario_id == usuario.id, Asistencia.fecha == hoy)
        .order_by(Asistencia.hora_ingreso.desc())
        .first()
    )
    asistencia_hoy = {
        "marcado": asis is not None,
        "id": asis.id if asis else None,
        "hora_ingreso": asis.hora_ingreso if asis else None,
        "hora_salida": asis.hora_salida if asis else None,
        "hora_entrada_perfil": usuario.hora_entrada,
        "dias_laborales": usuario.dias_laborales,
    }

    return {
        "doctor": {"id": usuario.id, "nombre": usuario.nombre},
        "mis_turnos": mis_turnos,
        "seguimiento": seguimiento,
        "resumen_historias": {"total": total_historias, "recientes": mis_historias_recientes},
        "asistencia_hoy": asistencia_hoy,
    }
