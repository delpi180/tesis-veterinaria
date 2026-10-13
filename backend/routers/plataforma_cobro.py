"""Panel de plataforma, parte de cobro: planes, pagos y solicitudes de cambio.

Mismas reglas que el resto del panel: solo el operador, solo metadatos, y cada
acción queda en su bitácora (`acciones_plataforma`).
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from core import cuentas
from database import get_db
from models import Clinica, Pago, Plan, SolicitudPlan
from routers.plataforma import _clinica, _exigir_operador, _registrar
from services import cobro
from services.plataforma import PLAN_INTERNO

router = APIRouter(prefix="/api/plataforma", tags=["Plataforma · Cobro"])


def _plan_dict(p: Plan) -> dict:
    return {
        "codigo": p.codigo, "nombre": p.nombre, "descripcion": p.descripcion,
        "precio_mensual": float(p.precio_mensual), "moneda": p.moneda,
        "max_usuarios": p.max_usuarios, "max_mascotas": p.max_mascotas,
        "max_almacenamiento_mb": p.max_almacenamiento_mb, "max_ia_mes": p.max_ia_mes,
        "incluye_planilla": p.incluye_planilla, "incluye_contactos": p.incluye_contactos,
        "publico": p.publico, "orden": p.orden,
    }


# ── Planes ───────────────────────────────────────────────────────────────────

@router.get("/planes")
def listar_planes(request: Request, db: Session = Depends(get_db)):
    _exigir_operador(request)
    return [_plan_dict(p) for p in db.query(Plan).filter(Plan.codigo != PLAN_INTERNO).order_by(Plan.orden)]


class CambioPlan(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=60)
    descripcion: Optional[str] = Field(None, max_length=200)
    precio_mensual: Optional[Decimal] = Field(None, ge=0, le=100000)
    # Para los topes, null EXPLÍCITO = ilimitado; no enviar el campo = no tocarlo.
    max_usuarios: Optional[int] = Field(None, ge=0, le=100000)
    max_mascotas: Optional[int] = Field(None, ge=0, le=10000000)
    max_almacenamiento_mb: Optional[int] = Field(None, ge=0, le=10000000)
    max_ia_mes: Optional[int] = Field(None, ge=0, le=10000000)
    incluye_planilla: Optional[bool] = None
    incluye_contactos: Optional[bool] = None
    publico: Optional[bool] = None
    orden: Optional[int] = Field(None, ge=0, le=100)


_TOPES = ("max_usuarios", "max_mascotas", "max_almacenamiento_mb", "max_ia_mes")


@router.put("/planes/{codigo}")
def editar_plan(codigo: str, payload: CambioPlan, request: Request, db: Session = Depends(get_db)):
    operador = _exigir_operador(request)
    plan = db.get(Plan, codigo)
    if not plan or codigo == PLAN_INTERNO:
        raise HTTPException(404, "Plan no encontrado")
    cambios = []
    for campo in payload.model_fields_set:
        valor = getattr(payload, campo)
        if valor is None and campo not in _TOPES:
            continue                      # solo los topes admiten null (= ilimitado)
        if getattr(plan, campo) != valor:
            cambios.append(f"{campo}: {getattr(plan, campo)} → {valor}")
            setattr(plan, campo, valor)
    if cambios:
        _registrar(db, operador, None, "plan_edicion", f"{codigo} · " + "; ".join(cambios))
        db.commit()
    return _plan_dict(plan)


# ── Suscripción de una clínica ───────────────────────────────────────────────

def _solicitud_dict(s: SolicitudPlan, nombre_clinica: str | None = None) -> dict:
    return {"id": s.id, "clinica_id": s.clinica_id, "clinica": nombre_clinica, "plan": s.plan,
            "mensaje": s.mensaje, "estado": s.estado, "creada_por": s.creada_por,
            "creada_en": s.creada_en, "atendida_por": s.atendida_por, "atendida_en": s.atendida_en}


@router.get("/clinicas/{clinica_id}/suscripcion")
def suscripcion_de_clinica(clinica_id: int, request: Request, db: Session = Depends(get_db)):
    _exigir_operador(request)
    c = _clinica(db, clinica_id)
    pagos = (db.query(Pago).filter(Pago.clinica_id == c.id)
               .order_by(Pago.creado_en.desc()).limit(36).all())
    solicitudes = (db.query(SolicitudPlan).filter(SolicitudPlan.clinica_id == c.id)
                     .order_by(SolicitudPlan.creada_en.desc()).limit(10).all())
    return {
        **cobro.datos_suscripcion(c.id),
        "pagos": [cobro.pago_a_dict(p, cobro.nombres_de_planes(db)) for p in pagos],
        "solicitudes": [_solicitud_dict(s, c.nombre) for s in solicitudes],
    }


class PagoIn(BaseModel):
    plan: str
    meses: int = Field(1, ge=1, le=24)
    monto: Optional[Decimal] = Field(None, ge=0, le=1000000)     # por defecto: precio del plan × meses
    metodo: str
    referencia: Optional[str] = Field(None, max_length=100)
    nota: Optional[str] = Field(None, max_length=300)
    reactivar: bool = False

    @field_validator("referencia", "nota")
    @classmethod
    def _vacio(cls, v):
        return (v or "").strip() or None


@router.post("/clinicas/{clinica_id}/pagos", status_code=201)
def registrar_pago(clinica_id: int, payload: PagoIn, request: Request, db: Session = Depends(get_db)):
    """Confirma un pago (Yape, transferencia…): extiende el vencimiento y fija el plan."""
    operador = _exigir_operador(request)
    c = _clinica(db, clinica_id)
    try:
        pago, creado = cobro.registrar_pago(
            db, c, plan=payload.plan, meses=payload.meses, monto=payload.monto, metodo=payload.metodo,
            referencia=payload.referencia, nota=payload.nota, operador=operador, reactivar=payload.reactivar)
    except cobro.PagoInvalido as e:
        raise HTTPException(422, str(e))
    if creado:
        _registrar(db, operador, c, "pago",
                   f"{payload.plan} · {payload.meses} mes(es) · S/ {pago.monto} · {payload.metodo}"
                   f"{' · ' + payload.referencia if payload.referencia else ''}")
        # Si la clínica tenía una solicitud pendiente de ese plan, queda atendida.
        pendiente = (db.query(SolicitudPlan)
                       .filter(SolicitudPlan.clinica_id == c.id, SolicitudPlan.estado == "pendiente",
                               SolicitudPlan.plan == payload.plan).first())
        if pendiente:
            pendiente.estado, pendiente.atendida_por = "atendida", operador
            pendiente.atendida_en = datetime.now(timezone.utc)
    db.commit()
    cuentas.invalidar()          # el desbloqueo por renovación rige ya
    return {"creado": creado, "pago": cobro.pago_a_dict(pago, cobro.nombres_de_planes(db)), **cobro.datos_suscripcion(c.id)}


@router.get("/pagos")
def pagos_recientes(request: Request, limite: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    _exigir_operador(request)
    nombres = {c.id: c.nombre for c in db.query(Clinica)}
    planes = cobro.nombres_de_planes(db)
    return [{**cobro.pago_a_dict(p, planes), "clinica_id": p.clinica_id, "clinica": nombres.get(p.clinica_id)}
            for p in db.query(Pago).order_by(Pago.creado_en.desc()).limit(limite)]


# ── Solicitudes de cambio de plan ────────────────────────────────────────────

@router.get("/solicitudes")
def listar_solicitudes(request: Request, estado: str = Query("pendiente", pattern="^(pendiente|atendida|todas)$"),
                       db: Session = Depends(get_db)):
    _exigir_operador(request)
    q = db.query(SolicitudPlan)
    if estado != "todas":
        q = q.filter(SolicitudPlan.estado == estado)
    nombres = {c.id: c.nombre for c in db.query(Clinica)}
    return [_solicitud_dict(s, nombres.get(s.clinica_id)) for s in q.order_by(SolicitudPlan.creada_en.desc()).limit(100)]


@router.post("/solicitudes/{solicitud_id}/atender")
def atender_solicitud(solicitud_id: int, request: Request, db: Session = Depends(get_db)):
    """Marca la solicitud como atendida (p. ej. tras hablar con la clínica)."""
    operador = _exigir_operador(request)
    s = db.get(SolicitudPlan, solicitud_id)
    if not s:
        raise HTTPException(404, "Solicitud no encontrada")
    if s.estado == "pendiente":
        s.estado, s.atendida_por, s.atendida_en = "atendida", operador, datetime.now(timezone.utc)
        c = db.get(Clinica, s.clinica_id)
        _registrar(db, operador, c, "solicitud", f"Atendió la solicitud del plan {s.plan}")
        db.commit()
    return _solicitud_dict(s)
