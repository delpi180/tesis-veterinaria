"""Panel de plataforma: lo que necesita quien opera el SaaS.

Reglas que NO se negocian:

  · El operador ve CLÍNICAS, no pacientes. Todo lo que devuelve esta API son
    metadatos (nombre, estado, plan, cuántos usuarios y cuántos registros hay);
    nunca nombres de clientes, mascotas, historias ni ventas. Para dar soporte
    no hace falta leer los datos clínicos de nadie.
  · Cada acción queda en `acciones_plataforma` con quién la hizo. La clínica
    afectada no la ve (es de la plataforma), pero queda para auditar.
  · Esta API corre SIN filtro de clínica (el operador ve todas), por eso solo
    la alcanza un rol `plataforma`, que ninguna pantalla pública puede otorgar.
"""
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core import cuentas
from core.security import hash_password
from database import get_db
from models import (
    AccionPlataforma, Actividad, Cliente, Clinica, ConfiguracionClinica,
    HistoriaClinica, Paciente, Usuario,
)
from services.plataforma import PLAN_INTERNO

router = APIRouter(prefix="/api/plataforma", tags=["Plataforma"])

PLANES = ("prueba", "basico", "profesional", "fundadora")


def _exigir_operador(request: Request) -> str:
    """Segunda barrera tras la tabla de permisos: devuelve el nombre del operador."""
    if getattr(request.state, "rol", None) != cuentas.ROL_PLATAFORMA:
        raise HTTPException(403, "No tienes permiso para esta acción.")
    return request.state.usuario


def _registrar(db: Session, operador: str, clinica: Clinica | None, accion: str, detalle: str | None = None):
    db.add(AccionPlataforma(
        operador=operador, clinica_id=clinica.id if clinica else None,
        clinica_nombre=clinica.nombre if clinica else None,
        accion=accion, detalle=(detalle or "")[:300] or None,
    ))


def _clinica(db: Session, clinica_id: int) -> Clinica:
    c = db.get(Clinica, clinica_id)
    if not c or c.plan == PLAN_INTERNO:
        raise HTTPException(404, "Clínica no encontrada")
    return c


# ── Métricas (solo conteos) ──────────────────────────────────────────────────

def _conteos(db: Session) -> dict:
    def por_clinica(consulta) -> dict[int, int]:
        return {cid: n for cid, n in db.execute(consulta)}

    hace_30 = datetime.now(timezone.utc) - timedelta(days=30)
    return {
        "usuarios": por_clinica(select(Usuario.clinica_id, func.count()).where(Usuario.activo.is_(True))
                                .group_by(Usuario.clinica_id)),
        "clientes": por_clinica(select(Cliente.clinica_id, func.count()).group_by(Cliente.clinica_id)),
        "pacientes": por_clinica(select(Paciente.clinica_id, func.count()).group_by(Paciente.clinica_id)),
        "consultas_30d": por_clinica(select(HistoriaClinica.clinica_id, func.count())
                                     .where(HistoriaClinica.fecha >= hace_30).group_by(HistoriaClinica.clinica_id)),
        "ultima_actividad": por_clinica(select(Actividad.clinica_id, func.max(Actividad.fecha))
                                        .group_by(Actividad.clinica_id)),
    }


def _estado_efectivo(c: Clinica) -> str:
    bloqueo = cuentas.bloqueo_de(c.estado, c.vence_en)
    if bloqueo is None:
        return "activa"
    return "suspendida" if c.estado != "activa" else "vencida"


def _administradora(db: Session, clinica_id: int) -> Usuario | None:
    return (db.query(Usuario)
              .filter(Usuario.clinica_id == clinica_id, Usuario.rol == "recepcionista",
                      Usuario.activo.is_(True))
              .order_by(Usuario.id).first())


def _item(c: Clinica, conteos: dict, admin: Usuario | None = None) -> dict:
    return {
        "id": c.id, "nombre": c.nombre, "plan": c.plan,
        "estado": _estado_efectivo(c), "estado_guardado": c.estado,
        "creado_en": c.creado_en, "vence_en": c.vence_en,
        "usuarios": conteos["usuarios"].get(c.id, 0),
        "clientes": conteos["clientes"].get(c.id, 0),
        "pacientes": conteos["pacientes"].get(c.id, 0),
        "consultas_30d": conteos["consultas_30d"].get(c.id, 0),
        "ultima_actividad": conteos["ultima_actividad"].get(c.id),
        "administradora": ({"usuario": admin.usuario, "nombre": admin.nombre, "telefono": admin.telefono}
                           if admin else None),
    }


# ── Resumen y lista ──────────────────────────────────────────────────────────

@router.get("/resumen")
def resumen(request: Request, db: Session = Depends(get_db)):
    _exigir_operador(request)
    clinicas = db.query(Clinica).filter(Clinica.plan != PLAN_INTERNO).all()
    estados = [_estado_efectivo(c) for c in clinicas]
    hace_30 = datetime.now(timezone.utc) - timedelta(days=30)
    conteos = _conteos(db)
    ids = {c.id for c in clinicas}
    return {
        "clinicas": len(clinicas),
        "activas": estados.count("activa"),
        "suspendidas": estados.count("suspendida"),
        "vencidas": estados.count("vencida"),
        "en_prueba": sum(1 for c, e in zip(clinicas, estados) if c.plan == "prueba" and e == "activa"),
        "nuevas_30d": sum(1 for c in clinicas if c.creado_en and c.creado_en >= hace_30),
        "usuarios_activos": sum(n for cid, n in conteos["usuarios"].items() if cid in ids),
        "consultas_30d": sum(n for cid, n in conteos["consultas_30d"].items() if cid in ids),
        "por_vencer_7d": sum(1 for c in clinicas if c.vence_en and date.today() <= c.vence_en <= date.today() + timedelta(days=7)),
    }


@router.get("/clinicas")
def listar(
    request: Request,
    q: Optional[str] = Query(None, description="Busca por nombre de clínica o de administradora"),
    estado: Optional[str] = Query(None, pattern="^(activa|suspendida|vencida)$"),
    db: Session = Depends(get_db),
):
    _exigir_operador(request)
    conteos = _conteos(db)
    clinicas = (db.query(Clinica).filter(Clinica.plan != PLAN_INTERNO)
                  .order_by(Clinica.creado_en.desc()).all())
    admins = {}
    for u in (db.query(Usuario).filter(Usuario.rol == "recepcionista", Usuario.activo.is_(True))
                .order_by(Usuario.id)):
        admins.setdefault(u.clinica_id, u)
    items = [_item(c, conteos, admins.get(c.id)) for c in clinicas]
    if estado:
        items = [i for i in items if i["estado"] == estado]
    if q:
        t = q.strip().lower()
        items = [i for i in items if t in i["nombre"].lower()
                 or (i["administradora"] and (t in (i["administradora"]["nombre"] or "").lower()
                                              or t in i["administradora"]["usuario"].lower()))]
    return items


@router.get("/clinicas/{clinica_id}")
def detalle(clinica_id: int, request: Request, db: Session = Depends(get_db)):
    _exigir_operador(request)
    c = _clinica(db, clinica_id)
    conteos = _conteos(db)
    equipo = (db.query(Usuario).filter(Usuario.clinica_id == c.id).order_by(Usuario.rol, Usuario.nombre).all())
    cfg = db.query(ConfiguracionClinica).filter(ConfiguracionClinica.clinica_id == c.id).first()
    acciones = (db.query(AccionPlataforma).filter(AccionPlataforma.clinica_id == c.id)
                  .order_by(AccionPlataforma.fecha.desc()).limit(30).all())
    return {
        **_item(c, conteos, _administradora(db, c.id)),
        "nota_interna": c.nota_interna,
        "suspendida_motivo": c.suspendida_motivo, "suspendida_en": c.suspendida_en,
        "contacto": {"email": cfg.email, "telefono": cfg.telefono} if cfg else None,
        # Solo quién es quién: nunca contraseñas ni datos clínicos
        "equipo": [{"id": u.id, "usuario": u.usuario, "nombre": u.nombre, "rol": u.rol, "activo": u.activo}
                   for u in equipo],
        "acciones": [_accion(a) for a in acciones],
    }


def _accion(a: AccionPlataforma) -> dict:
    return {"id": a.id, "operador": a.operador, "accion": a.accion, "detalle": a.detalle,
            "clinica_id": a.clinica_id, "clinica": a.clinica_nombre, "fecha": a.fecha}


# ── Cambios ──────────────────────────────────────────────────────────────────

class CambioClinica(BaseModel):
    estado: Optional[str] = None
    motivo: Optional[str] = None
    plan: Optional[str] = None
    vence_en: Optional[date] = None        # explícito null = quitar el vencimiento
    nota_interna: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def _estado(cls, v):
        if v is not None and v not in ("activa", "suspendida"):
            raise ValueError("El estado debe ser 'activa' o 'suspendida'")
        return v

    @field_validator("plan")
    @classmethod
    def _plan(cls, v):
        if v is not None and v not in PLANES:
            raise ValueError(f"Plan no válido. Usa: {', '.join(PLANES)}")
        return v

    @field_validator("motivo", "nota_interna")
    @classmethod
    def _texto(cls, v):
        return (v or "").strip()[:2000] or None


@router.put("/clinicas/{clinica_id}")
def cambiar(clinica_id: int, payload: CambioClinica, request: Request, db: Session = Depends(get_db)):
    operador = _exigir_operador(request)
    c = _clinica(db, clinica_id)
    enviados = payload.model_fields_set

    if "estado" in enviados and payload.estado and payload.estado != c.estado:
        if payload.estado == "suspendida":
            if not payload.motivo or len(payload.motivo) < 5:
                raise HTTPException(422, "Indica el motivo de la suspensión (mínimo 5 letras).")
            c.estado, c.suspendida_motivo = "suspendida", payload.motivo[:200]
            c.suspendida_en = datetime.now(timezone.utc)
            _registrar(db, operador, c, "suspender", payload.motivo)
        else:
            c.estado, c.suspendida_motivo, c.suspendida_en = "activa", None, None
            _registrar(db, operador, c, "reactivar", payload.motivo)

    if "plan" in enviados and payload.plan and payload.plan != c.plan:
        _registrar(db, operador, c, "plan", f"{c.plan} → {payload.plan}")
        c.plan = payload.plan

    if "vence_en" in enviados and payload.vence_en != c.vence_en:
        antes = c.vence_en.isoformat() if c.vence_en else "sin vencimiento"
        despues = payload.vence_en.isoformat() if payload.vence_en else "sin vencimiento"
        _registrar(db, operador, c, "vencimiento", f"{antes} → {despues}")
        c.vence_en = payload.vence_en

    if "nota_interna" in enviados and payload.nota_interna != c.nota_interna:
        c.nota_interna = payload.nota_interna
        _registrar(db, operador, c, "nota", "Nota interna actualizada")

    db.commit()
    # El bloqueo rige ya: no esperar a que venza la memoria de cuentas.
    cuentas.invalidar()
    return detalle(clinica_id, request, db)


class RestablecerClave(BaseModel):
    usuario_id: Optional[int] = None       # por defecto, la administradora de la clínica


@router.post("/clinicas/{clinica_id}/restablecer-clave")
def restablecer_clave(clinica_id: int, request: Request, payload: RestablecerClave = RestablecerClave(),
                      db: Session = Depends(get_db)):
    """Asigna una contraseña temporal a la administradora (o a quien se indique).

    La contraseña se devuelve UNA vez, en esta respuesta, y no se guarda en
    ningún otro lado. Al cambiar, todas las sesiones abiertas de esa persona se
    cierran. La bitácora registra a quién, nunca la contraseña.
    """
    operador = _exigir_operador(request)
    c = _clinica(db, clinica_id)
    if payload.usuario_id:
        u = db.get(Usuario, payload.usuario_id)
        if not u or u.clinica_id != c.id:
            raise HTTPException(404, "Ese usuario no pertenece a la clínica.")
    else:
        u = _administradora(db, c.id)
        if not u:
            raise HTTPException(409, "La clínica no tiene una administradora activa.")

    temporal = secrets.token_urlsafe(9)          # 12 caracteres
    u.password_hash = hash_password(temporal)
    _registrar(db, operador, c, "restablecer_clave", f"Usuario: {u.usuario}")
    db.commit()
    cuentas.invalidar(u.usuario)
    return {"usuario": u.usuario, "nombre": u.nombre, "clave_temporal": temporal}


@router.get("/acciones")
def acciones(request: Request, limite: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    _exigir_operador(request)
    filas = db.query(AccionPlataforma).order_by(AccionPlataforma.fecha.desc()).limit(limite).all()
    return [_accion(a) for a in filas]
