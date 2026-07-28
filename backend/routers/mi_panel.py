"""Panel del doctor: lo suyo, más lo que está pasando hoy en la clínica.

Reúne sus turnos próximos, el seguimiento de sus pacientes, un resumen de las
historias que él registró y su asistencia de hoy.

Incluye además una vista compartida del día (agenda completa, colegas de turno
y últimas consultas de todo el equipo): los veterinarios se cubren entre sí, y
para preguntarle algo a un colega o retomar un paciente que atendió otro hace
falta ver qué está pasando, no solo lo propio. La ficha clínica ya era común a
todos; lo que faltaba era esta vista de conjunto.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

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

    # ── La clínica hoy (compartido con todo el equipo) ───────────────────────
    inicio_dia = datetime.combine(hoy, datetime.min.time(), tzinfo=PERU_TZ)
    fin_dia = inicio_dia + timedelta(days=1)

    agenda_rows = (
        db.query(Cita)
        .options(joinedload(Cita.paciente), joinedload(Cita.veterinario))
        .filter(Cita.fecha_hora >= inicio_dia, Cita.fecha_hora < fin_dia)
        .order_by(Cita.fecha_hora)
        .all()
    )
    agenda_hoy = [
        {
            "id": c.id,
            "fecha_hora": c.fecha_hora,
            "motivo": c.motivo,
            "estado": c.estado,
            "veterinario": c.veterinario.nombre if c.veterinario else None,
            "es_mio": c.veterinario_id == usuario.id,
            **_paciente_info(c.paciente),
        }
        for c in agenda_rows
    ]

    # Colegas con marcación de hoy: saber quién está para poder consultarle.
    colegas_rows = (
        db.query(Asistencia)
        .options(joinedload(Asistencia.usuario))
        .filter(Asistencia.fecha == hoy, Asistencia.usuario_id != usuario.id)
        .order_by(Asistencia.hora_ingreso)
        .all()
    )
    colegas_hoy = [
        {
            "nombre": a.usuario.nombre if a.usuario else "—",
            "rol": a.usuario.rol if a.usuario else None,
            "hora_ingreso": a.hora_ingreso,
            "en_turno": a.hora_salida is None,
        }
        for a in colegas_rows
    ]

    # Últimas consultas de TODO el equipo (incluidas las propias, para tener el
    # hilo completo de lo que se atendió).
    equipo_rows = (
        db.query(HistoriaClinica)
        .options(joinedload(HistoriaClinica.paciente), joinedload(HistoriaClinica.veterinario))
        .order_by(HistoriaClinica.creado_en.desc())
        .limit(8)
        .all()
    )
    consultas_equipo = [
        {
            "id": h.id,
            "fecha": h.fecha or h.creado_en,
            "motivo": h.motivo_consulta,
            "diagnostico": h.diagnostico_presuntivo or h.diagnostico_definitivo,
            "veterinario": h.veterinario.nombre if h.veterinario else None,
            "es_mio": h.veterinario_id == usuario.id,
            **_paciente_info(h.paciente),
        }
        for h in equipo_rows
    ]

    return {
        "doctor": {"id": usuario.id, "nombre": usuario.nombre},
        "mis_turnos": mis_turnos,
        "seguimiento": seguimiento,
        "resumen_historias": {"total": total_historias, "recientes": mis_historias_recientes},
        "asistencia_hoy": asistencia_hoy,
        "clinica_hoy": {
            "agenda": agenda_hoy,
            "colegas": colegas_hoy,
            "consultas_equipo": consultas_equipo,
        },
    }
