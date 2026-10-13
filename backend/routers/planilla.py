"""Planilla del personal. Todo es de la administradora (recepcionista)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from core.deps import solo_admin
from core import limites
from database import get_db
from models import Planilla, PlanillaLinea, Usuario
from services import planilla as svc

router = APIRouter(prefix="/api/planilla", tags=["Planilla"], dependencies=[Depends(limites.requiere_funcion("planilla"))])
_LIMA = ZoneInfo("America/Lima")


def _hoy():
    return datetime.now(_LIMA).date()


def _f(v) -> float:
    return float(v)


def _linea_out(l: PlanillaLinea, p: Planilla) -> dict:
    m = svc.calcular_linea(l.sueldo_base, l.minutos_tardanza, l.faltas, l.bonos,
                           l.adelantos, l.otros_descuentos, p.dias_mes, p.horas_dia)
    return {
        "id": l.id, "usuario_id": l.usuario_id, "nombre": l.nombre, "rol": l.rol,
        "sueldo_base": _f(l.sueldo_base),
        "minutos_auto": l.minutos_auto, "faltas_auto": l.faltas_auto,
        "minutos_tardanza": l.minutos_tardanza, "faltas": l.faltas,
        "sin_horario": l.sin_horario,
        "bonos": _f(l.bonos), "adelantos": _f(l.adelantos),
        "otros_descuentos": _f(l.otros_descuentos), "nota": l.nota,
        **{k: _f(v) for k, v in m.items()},
    }


def _planilla_out(p: Planilla, db: Session) -> dict:
    lineas = [_linea_out(l, p) for l in p.lineas]
    # Personal activo que no entró porque no tiene sueldo cargado
    en_planilla = {l.usuario_id for l in p.lineas}
    sin_sueldo = [
        {"id": u.id, "nombre": u.nombre}
        for u in db.query(Usuario).filter(Usuario.activo.is_(True)).order_by(Usuario.nombre)
        if u.id not in en_planilla and u.sueldo_base is None
    ]
    return {
        "periodo": p.periodo, "estado": p.estado,
        "tolerancia_min": p.tolerancia_min, "dias_mes": p.dias_mes, "horas_dia": p.horas_dia,
        "creado_por": p.creado_por, "cerrada_en": p.cerrada_en, "cerrada_por": p.cerrada_por,
        "lineas": lineas,
        "totales": {
            "sueldos": round(sum(l["sueldo_base"] for l in lineas), 2),
            "descuentos": round(sum(l["total_descuentos"] for l in lineas), 2),
            "neto": round(sum(l["neto"] for l in lineas), 2),
        },
        "sin_sueldo": sin_sueldo,
    }


def _obtener(db: Session, periodo: str) -> Planilla:
    p = db.query(Planilla).filter(Planilla.periodo == periodo).first()
    if not p:
        raise HTTPException(404, "No hay planilla de ese mes.")
    return p


def _exigir_borrador(p: Planilla) -> None:
    if p.estado != "borrador":
        raise HTTPException(409, "La planilla ya está cerrada y no se puede modificar.")


def _validar_periodo(periodo: str) -> None:
    try:
        svc.rango_del_mes(periodo)
    except (ValueError, AttributeError):
        raise HTTPException(422, "El mes debe tener la forma AAAA-MM, por ejemplo 2026-10.")


# ── Sueldos del personal ─────────────────────────────────────────────────────

@router.get("/personal")
def personal(request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    return [
        {"id": u.id, "nombre": u.nombre, "rol": u.rol,
         "sueldo_base": _f(u.sueldo_base) if u.sueldo_base is not None else None,
         "hora_entrada": u.hora_entrada, "dias_laborales": u.dias_laborales}
        for u in db.query(Usuario).filter(Usuario.activo.is_(True)).order_by(Usuario.nombre)
    ]


class SueldoIn(BaseModel):
    sueldo_base: Optional[float] = Field(None, ge=0, le=1_000_000)


@router.put("/personal/{usuario_id}")
def fijar_sueldo(usuario_id: int, payload: SueldoIn, request: Request,
                 db: Session = Depends(get_db)):
    solo_admin(request)
    u = db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    u.sueldo_base = Decimal(str(payload.sueldo_base)) if payload.sueldo_base is not None else None
    db.commit()
    request.state.actividad_detalle = u.nombre
    return {"id": u.id, "sueldo_base": payload.sueldo_base}


# ── Planillas ────────────────────────────────────────────────────────────────

@router.get("/")
def listar(request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    return [{"periodo": p.periodo, "estado": p.estado, "cerrada_en": p.cerrada_en,
             "trabajadores": len(p.lineas)}
            for p in db.query(Planilla).order_by(Planilla.periodo.desc()).limit(36)]


class PlanillaIn(BaseModel):
    periodo: str
    tolerancia_min: int = Field(0, ge=0, le=120)


@router.post("/", status_code=201)
def generar(payload: PlanillaIn, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    _validar_periodo(payload.periodo)
    if db.query(Planilla).filter(Planilla.periodo == payload.periodo).first():
        raise HTTPException(409, "Ya existe la planilla de ese mes.")
    personal = (db.query(Usuario)
                  .filter(Usuario.activo.is_(True), Usuario.sueldo_base.isnot(None))
                  .order_by(Usuario.nombre).all())
    if not personal:
        raise HTTPException(422, "Primero registra el sueldo de al menos un trabajador.")

    p = Planilla(periodo=payload.periodo, tolerancia_min=payload.tolerancia_min,
                 creado_por=getattr(request.state, "usuario", None))
    db.add(p)
    hoy = _hoy()
    for u in personal:
        d = svc.datos_de_asistencia(db, u, payload.periodo, hoy, payload.tolerancia_min)
        p.lineas.append(PlanillaLinea(
            usuario_id=u.id, nombre=u.nombre, rol=u.rol, sueldo_base=u.sueldo_base,
            minutos_auto=d["minutos_tardanza"], faltas_auto=d["faltas"],
            minutos_tardanza=d["minutos_tardanza"], faltas=d["faltas"],
            sin_horario=d["sin_horario"]))
    db.commit()
    db.refresh(p)
    request.state.actividad_detalle = p.periodo
    return _planilla_out(p, db)


@router.get("/{periodo}")
def obtener(periodo: str, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    return _planilla_out(_obtener(db, periodo), db)


class LineaIn(BaseModel):
    minutos_tardanza: Optional[int] = Field(None, ge=0, le=100_000)
    faltas: Optional[int] = Field(None, ge=0, le=31)
    bonos: Optional[float] = Field(None, ge=0, le=1_000_000)
    adelantos: Optional[float] = Field(None, ge=0, le=1_000_000)
    otros_descuentos: Optional[float] = Field(None, ge=0, le=1_000_000)
    nota: Optional[str] = None

    @field_validator("nota")
    @classmethod
    def _nota(cls, v):
        return (v or "").strip()[:200] or None


@router.put("/{periodo}/lineas/{linea_id}")
def editar_linea(periodo: str, linea_id: int, payload: LineaIn, request: Request,
                 db: Session = Depends(get_db)):
    solo_admin(request)
    p = _obtener(db, periodo)
    _exigir_borrador(p)
    l = db.get(PlanillaLinea, linea_id)
    if not l or l.planilla_id != p.id:
        raise HTTPException(404, "Línea no encontrada")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        if campo in ("bonos", "adelantos", "otros_descuentos") and valor is not None:
            valor = Decimal(str(valor))
        if valor is None and campo != "nota":
            continue
        setattr(l, campo, valor)
    db.commit()
    request.state.actividad_detalle = f"{p.periodo} · {l.nombre}"
    return _planilla_out(p, db)


@router.post("/{periodo}/actualizar-asistencia")
def actualizar_desde_asistencia(periodo: str, request: Request, db: Session = Depends(get_db)):
    """Vuelve a leer la asistencia. Lo que la administradora ya corrigió a mano
    no se pisa: solo se actualizan los valores que seguían iguales al cálculo."""
    solo_admin(request)
    p = _obtener(db, periodo)
    _exigir_borrador(p)
    hoy = _hoy()
    for l in p.lineas:
        u = db.get(Usuario, l.usuario_id) if l.usuario_id else None
        if not u:
            continue
        d = svc.datos_de_asistencia(db, u, p.periodo, hoy, p.tolerancia_min)
        if l.minutos_tardanza == l.minutos_auto:
            l.minutos_tardanza = d["minutos_tardanza"]
        if l.faltas == l.faltas_auto:
            l.faltas = d["faltas"]
        l.minutos_auto, l.faltas_auto, l.sin_horario = d["minutos_tardanza"], d["faltas"], d["sin_horario"]
    db.commit()
    request.state.actividad_detalle = p.periodo
    return _planilla_out(p, db)


@router.post("/{periodo}/cerrar")
def cerrar(periodo: str, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    p = _obtener(db, periodo)
    _exigir_borrador(p)
    p.estado = "cerrada"
    p.cerrada_en = datetime.now(timezone.utc)
    p.cerrada_por = getattr(request.state, "usuario", None)
    db.commit()
    request.state.actividad_detalle = p.periodo
    return _planilla_out(p, db)


@router.delete("/{periodo}", status_code=204)
def eliminar_borrador(periodo: str, request: Request, db: Session = Depends(get_db)):
    """Solo un borrador se puede descartar; una planilla cerrada es un registro."""
    solo_admin(request)
    p = _obtener(db, periodo)
    _exigir_borrador(p)
    request.state.actividad_detalle = p.periodo
    db.delete(p)
    db.commit()
