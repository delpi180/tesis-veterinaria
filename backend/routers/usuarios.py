from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Usuario, Asistencia, Cita, HistoriaClinica, Paciente, Receta
from schemas import UsuarioCreate, UsuarioUpdate, UsuarioOut, DoctorOut
from core.security import hash_password
from core.deps import solo_admin, usuario_actual

router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])

PERU_TZ = timezone(timedelta(hours=-5))


@router.get("/doctores", response_model=list[DoctorOut])
def listar_doctores(db: Session = Depends(get_db)):
    """Doctores activos (id + nombre) para selectores de turno. Cualquier usuario logueado."""
    return (
        db.query(Usuario)
        .filter(Usuario.rol == "veterinario", Usuario.activo.is_(True))
        .order_by(Usuario.nombre)
        .all()
    )


@router.get("/", response_model=list[UsuarioOut])
def listar_usuarios(request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    return db.query(Usuario).order_by(Usuario.usuario).all()


@router.post("/", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(payload: UsuarioCreate, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    if db.query(Usuario).filter(Usuario.usuario == payload.usuario).first():
        raise HTTPException(status_code=409, detail=f"El usuario '{payload.usuario}' ya existe")
    u = Usuario(
        usuario=payload.usuario,
        nombre=payload.nombre,
        password_hash=hash_password(payload.password),
        rol=payload.rol,
        activo=payload.activo,
        dni=payload.dni,
        telefono=payload.telefono,
        especialidad=payload.especialidad,
        hora_entrada=payload.hora_entrada,
        dias_laborales=payload.dias_laborales,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.put("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(usuario_id: int, payload: UsuarioUpdate, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    if "password" in datos:
        u.password_hash = hash_password(datos.pop("password"))
    for campo, valor in datos.items():
        setattr(u, campo, valor)
    db.commit()
    db.refresh(u)
    return u


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    """Borra la cuenta y desengancha lo que dependía de ella.

    Antes esto reventaba con un error de base de datos apenas la persona tenía
    una marcación de asistencia o un turno asignado — o sea, siempre que
    hubiera trabajado. Cada tabla que la referencia se resuelve según a quién
    pertenece el dato:

    - Asistencias: son las marcaciones de esa persona. Se van con ella.
    - Turnos: son de la clínica. El turno queda sin doctor asignado y se
      reasigna; borrarlos sería perder la agenda.
    - Historias y recetas: son del paciente y no se tocan. Se les copia el
      nombre del veterinario para que no queden sin autor.
    """
    solo_admin(request)
    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Borrarse a uno mismo cierra la sesión en el acto y puede dejar la clínica
    # sin nadie que administre. Desactivarse a sí misma tampoco tiene sentido.
    if getattr(request.state, "usuario", None) == u.usuario:
        raise HTTPException(
            status_code=409,
            detail="No puedes eliminar tu propia cuenta. Pídeselo a otra administradora.",
        )

    # No permitir quedarse sin veterinarios activos
    if u.rol == "veterinario":
        otros = (
            db.query(Usuario)
            .filter(Usuario.rol == "veterinario", Usuario.activo.is_(True), Usuario.id != usuario_id)
            .count()
        )
        if otros == 0:
            raise HTTPException(status_code=409, detail="No puedes eliminar al único veterinario activo.")

    # Tampoco dejar la clínica sin administradora
    if u.rol == "recepcionista":
        otras = (
            db.query(Usuario)
            .filter(Usuario.rol == "recepcionista", Usuario.activo.is_(True), Usuario.id != usuario_id)
            .count()
        )
        if otras == 0:
            raise HTTPException(
                status_code=409,
                detail="No puedes eliminar a la única administradora activa: nadie podría gestionar el sistema.",
            )

    nombre = u.nombre
    request.state.actividad_detalle = nombre
    try:
        # Conservar la autoría clínica ANTES de soltar la referencia
        for modelo in (HistoriaClinica, Receta):
            (db.query(modelo)
               .filter(modelo.veterinario_id == usuario_id)
               .update({"firmado_por": nombre, "veterinario_id": None},
                       synchronize_session=False))

        (db.query(Cita)
           .filter(Cita.veterinario_id == usuario_id)
           .update({"veterinario_id": None}, synchronize_session=False))

        (db.query(Asistencia)
           .filter(Asistencia.usuario_id == usuario_id)
           .delete(synchronize_session=False))

        db.delete(u)
        db.commit()
    except Exception:
        db.rollback()
        raise


def _paciente_resumen(pac):
    if not pac:
        return {"paciente_id": None, "paciente": "—", "especie": "—", "propietario": "—", "cliente_id": None}
    return {
        "paciente_id": pac.id,
        "paciente": pac.nombre,
        "especie": pac.especie,
        "propietario": pac.cliente.nombre if pac.cliente else "—",
        "cliente_id": pac.cliente_id,
    }


@router.get("/{usuario_id}/perfil")
def perfil_usuario(
    usuario_id: int,
    request: Request,
    db: Session = Depends(get_db),
    quien: Usuario = Depends(usuario_actual),
):
    """Perfil completo de un usuario: datos personales, asistencia, pacientes
    tratados y en seguimiento (estos dos últimos solo aplican a veterinarios).
    Accesible a la administradora para cualquier usuario, o al propio usuario
    para verse a sí mismo."""
    es_admin = getattr(request.state, "rol", None) == "recepcionista"
    if not es_admin and (not quien or quien.id != usuario_id):
        raise HTTPException(status_code=403, detail="No autorizado para ver este perfil.")

    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # ── Asistencia: totales + últimas marcaciones ────────────────────────────
    marcaciones = (
        db.query(Asistencia)
        .filter(Asistencia.usuario_id == usuario_id)
        .order_by(Asistencia.fecha.desc(), Asistencia.hora_ingreso.desc())
        .all()
    )
    total_horas, tardanzas = 0.0, 0
    for r in marcaciones:
        if r.hora_ingreso and r.hora_salida:
            seg = (r.hora_salida - r.hora_ingreso).total_seconds()
            if seg > 0:
                total_horas += seg / 3600
        if r.hora_ingreso and u.hora_entrada:
            try:
                sh, sm = (int(x) for x in u.hora_entrada.split(":"))
                local_dt = r.hora_ingreso
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=timezone.utc)
                local_dt = local_dt.astimezone(PERU_TZ)
                if (local_dt.hour * 60 + local_dt.minute) - (sh * 60 + sm) > 0:
                    tardanzas += 1
            except (ValueError, AttributeError):
                pass
    asistencia = {
        "total_dias": len(marcaciones),
        "total_horas": round(total_horas, 2),
        "tardanzas": tardanzas,
        "recientes": [
            {
                "id": a.id, "fecha": a.fecha,
                "hora_ingreso": a.hora_ingreso, "hora_salida": a.hora_salida,
            }
            for a in marcaciones[:10]
        ],
    }

    # ── Pacientes tratados y en seguimiento (solo veterinarios) ──────────────
    pacientes_tratados, seguimiento = [], []
    total_historias = 0
    if u.rol == "veterinario":
        total_historias = (
            db.query(HistoriaClinica)
            .filter(HistoriaClinica.veterinario_id == usuario_id)
            .count()
        )
        # Se limita a las mas recientes para listar pacientes/seguimiento sin
        # cargar un historial potencialmente enorme en un solo perfil.
        historias = (
            db.query(HistoriaClinica)
            .options(joinedload(HistoriaClinica.paciente).joinedload(Paciente.cliente))
            .filter(HistoriaClinica.veterinario_id == usuario_id)
            .order_by(HistoriaClinica.creado_en.desc())
            .limit(500)
            .all()
        )
        vistos = set()
        for h in historias:
            if h.paciente_id in vistos:
                continue
            vistos.add(h.paciente_id)
            pacientes_tratados.append({
                "ultima_atencion": h.fecha or h.creado_en,
                **_paciente_resumen(h.paciente),
            })

        ahora = datetime.now(timezone.utc)
        vistos_seg = set()
        for h in historias:
            if h.proxima_cita and h.proxima_cita >= ahora and h.paciente_id not in vistos_seg:
                vistos_seg.add(h.paciente_id)
                seguimiento.append({"proxima_cita": h.proxima_cita, **_paciente_resumen(h.paciente)})
        seguimiento.sort(key=lambda x: x["proxima_cita"])

    return {
        "usuario": UsuarioOut.model_validate(u),
        "asistencia": asistencia,
        "pacientes_tratados": {"total": len(pacientes_tratados), "lista": pacientes_tratados},
        "total_historias": total_historias,
        "seguimiento": seguimiento,
    }
