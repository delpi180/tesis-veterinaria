"""Contacto con los dueños: a quién llamar hoy y qué pasó cuando se intentó."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.deps import solo_admin, usuario_actual
from database import get_db
from models import Cliente, ContactoCliente, Paciente, PlantillaContacto, Usuario, VacunaAvisada
from services import contactos as svc

router = APIRouter(prefix="/api/contactos", tags=["Contactos"])


class ContactoIn(BaseModel):
    cliente_id: int
    paciente_id: Optional[int] = None
    motivo: str
    clave: Optional[str] = None
    canal: str
    resultado: str
    nota: Optional[str] = None
    mensaje: Optional[str] = None
    # Solo vacunas/desparasitaciones: para dejar el pendiente marcado como
    # avisado también en las pantallas que ya existían.
    vacuna: Optional[str] = None
    proxima_dosis: Optional[str] = None

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, v):
        if v not in svc.MOTIVOS and v != "otro":
            raise ValueError("Motivo no válido")
        return v

    @field_validator("canal")
    @classmethod
    def _canal(cls, v):
        if v not in svc.CANALES:
            raise ValueError("Canal no válido")
        return v

    @field_validator("resultado")
    @classmethod
    def _resultado(cls, v):
        if v not in svc.RESULTADOS:
            raise ValueError("Resultado no válido")
        return v

    @field_validator("nota", "mensaje")
    @classmethod
    def _recortar(cls, v):
        return (v or "").strip()[:2000] or None


class PlantillaIn(BaseModel):
    texto: str

    @field_validator("texto")
    @classmethod
    def _texto(cls, v):
        v = (v or "").strip()
        if len(v) < 10:
            raise ValueError("El mensaje es demasiado corto")
        return v[:1000]


@router.get("/pendientes")
def pendientes(
    vencidas_dias: int = Query(120, ge=1, le=730,
                               description="Cuánto atrás se muestran las vacunas vencidas"),
    proximas_dias: int = Query(15, ge=1, le=90,
                               description="Cuánto adelante se avisan las próximas"),
    db: Session = Depends(get_db),
):
    items = svc.pendientes(db, vencidas_dias, proximas_dias)
    return {
        "items": items,
        "resumen": svc.resumen(items),
        "motivos": svc.MOTIVOS,
    }


@router.post("/", status_code=201)
def registrar(
    payload: ContactoIn,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    cliente = db.get(Cliente, payload.cliente_id)
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    if payload.paciente_id:
        pac = db.get(Paciente, payload.paciente_id)
        if not pac or pac.cliente_id != cliente.id:
            raise HTTPException(422, "La mascota no es de este cliente.")

    c = ContactoCliente(**payload.model_dump(exclude={"vacuna", "proxima_dosis"}),
                        creado_por=usuario.usuario if usuario else None)
    db.add(c)

    # Una vacuna avisada sale también de los paneles de Vacunación y Recepción.
    if (payload.motivo in ("vacuna", "antiparasitario") and payload.resultado in svc.CIERRAN
            and payload.paciente_id and payload.vacuna and payload.proxima_dosis):
        ya = db.query(VacunaAvisada).filter_by(
            paciente_id=payload.paciente_id, vacuna=payload.vacuna.strip(),
            proxima_dosis=payload.proxima_dosis, tipo=payload.motivo
            if payload.motivo == "antiparasitario" else "vacuna").first()
        if not ya:
            db.add(VacunaAvisada(
                paciente_id=payload.paciente_id, vacuna=payload.vacuna.strip(),
                proxima_dosis=payload.proxima_dosis,
                tipo="antiparasitario" if payload.motivo == "antiparasitario" else "vacuna",
                avisado_por=usuario.usuario if usuario else None))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "No se pudo registrar el contacto.")
    db.refresh(c)
    request.state.actividad_detalle = cliente.nombre

    intentos = 1
    cierra = payload.resultado in svc.CIERRAN
    if payload.clave:
        previos = db.query(ContactoCliente).filter(ContactoCliente.clave == payload.clave).all()
        intentos = len(previos)
        cierra = any(p.resultado in svc.CIERRAN for p in previos)
    return {"contacto": svc.ultimo_a_dict(c), "intentos": intentos, "contactado": cierra}


@router.get("/cliente/{cliente_id}")
def historial_cliente(cliente_id: int, db: Session = Depends(get_db)):
    if not db.get(Cliente, cliente_id):
        raise HTTPException(404, "Cliente no encontrado")
    filas = (db.query(ContactoCliente)
               .filter(ContactoCliente.cliente_id == cliente_id)
               .order_by(ContactoCliente.creado_en.desc()).limit(50).all())
    pacientes = {p.id: p.nombre for p in db.query(Paciente).filter(Paciente.cliente_id == cliente_id)}
    return [
        svc.ultimo_a_dict(c) | {
            "motivo": c.motivo, "etiqueta": svc.MOTIVOS.get(c.motivo, "Otro"),
            "paciente": pacientes.get(c.paciente_id),
        }
        for c in filas
    ]


@router.get("/plantillas")
def listar_plantillas(db: Session = Depends(get_db)):
    return {"plantillas": list(svc.plantillas(db).values()),
            "marcadores": ["{dueno}", "{mascota}", "{detalle}", "{cuando}", "{clinica}"]}


@router.put("/plantillas/{motivo}")
def guardar_plantilla(motivo: str, payload: PlantillaIn, request: Request,
                      db: Session = Depends(get_db)):
    solo_admin(request)
    if motivo not in svc.MOTIVOS:
        raise HTTPException(404, "Motivo no encontrado")
    p = db.query(PlantillaContacto).filter(PlantillaContacto.motivo == motivo).first()
    quien = getattr(request.state, "usuario", None)
    if p:
        p.texto, p.actualizado_por = payload.texto, quien
        p.actualizado_en = datetime.now(timezone.utc)
    else:
        db.add(PlantillaContacto(motivo=motivo, texto=payload.texto, actualizado_por=quien))
    db.commit()
    request.state.actividad_detalle = svc.MOTIVOS[motivo]
    return svc.plantillas(db)[motivo]


@router.delete("/plantillas/{motivo}", status_code=204)
def restaurar_plantilla(motivo: str, request: Request, db: Session = Depends(get_db)):
    solo_admin(request)
    p = db.query(PlantillaContacto).filter(PlantillaContacto.motivo == motivo).first()
    if p:
        db.delete(p)
        db.commit()
