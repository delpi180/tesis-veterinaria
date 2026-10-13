"""Suscripción vista desde la clínica: su plan, su uso y cómo pagar.

Solo la administradora. Muestra y permite PEDIR un cambio de plan; el cambio lo
confirma el operador cuando recibe el pago (no hay autoservicio de cobro).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from core.config import settings
from core.cuentas import bloqueo_de
from database import get_db
from models import Clinica, Pago, Plan, SolicitudPlan
from services import cobro

router = APIRouter(prefix="/api/suscripcion", tags=["Suscripción"])


def _plan_publico(p: Plan) -> dict:
    return {
        "codigo": p.codigo, "nombre": p.nombre, "descripcion": p.descripcion,
        "precio_mensual": float(p.precio_mensual), "moneda": p.moneda,
        "max_usuarios": p.max_usuarios, "max_mascotas": p.max_mascotas,
        "max_almacenamiento_mb": p.max_almacenamiento_mb, "max_ia_mes": p.max_ia_mes,
        "incluye_planilla": p.incluye_planilla, "incluye_contactos": p.incluye_contactos,
    }


@router.get("/")
def mi_suscripcion(request: Request, db: Session = Depends(get_db)):
    clinica_id = request.state.clinica_id
    pagos = db.query(Pago).order_by(Pago.creado_en.desc()).limit(24).all()      # solo los suyos: la sesión lo filtra
    pendiente = db.query(SolicitudPlan).filter(SolicitudPlan.estado == "pendiente").first()
    planes = db.query(Plan).filter(Plan.publico.is_(True)).order_by(Plan.orden).all()
    return {
        **cobro.datos_suscripcion(clinica_id),
        "planes": [_plan_publico(p) for p in planes],
        "pagos": [cobro.pago_a_dict(p, cobro.nombres_de_planes(db)) for p in pagos],
        "solicitud_pendiente": ({"plan": pendiente.plan, "creada_en": pendiente.creada_en}
                                if pendiente else None),
        "instrucciones_pago": settings.instrucciones_pago or None,
    }


class Solicitud(BaseModel):
    plan: str
    mensaje: Optional[str] = None

    @field_validator("mensaje")
    @classmethod
    def _mensaje(cls, v):
        return (v or "").strip()[:500] or None


@router.post("/solicitar", status_code=201)
def solicitar_cambio(payload: Solicitud, request: Request, db: Session = Depends(get_db)):
    plan = db.get(Plan, payload.plan)
    if not plan or not plan.publico:
        raise HTTPException(404, "Ese plan no está disponible.")
    clinica = db.get(Clinica, request.state.clinica_id)
    bloqueada = bloqueo_de(clinica.estado, clinica.vence_en) is not None
    # Pedir el MISMO plan solo tiene sentido para renovar uno vencido
    if clinica.plan == plan.codigo and not bloqueada:
        raise HTTPException(409, "Ya estás en ese plan.")
    if db.query(SolicitudPlan).filter(SolicitudPlan.estado == "pendiente").first():
        raise HTTPException(409, "Ya tienes una solicitud pendiente. Te contactaremos pronto.")
    db.add(SolicitudPlan(plan=plan.codigo, mensaje=payload.mensaje, creada_por=request.state.usuario))
    request.state.actividad_detalle = plan.nombre
    db.commit()
    return {"ok": True}
