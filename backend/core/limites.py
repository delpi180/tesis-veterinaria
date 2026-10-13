"""Límites de cada plan, hechos cumplir en el servidor.

Qué incluye cada plan vive en la tabla `planes` (se edita desde el panel del
operador); aquí está el código que lo consulta y decide. El frontend solo
MUESTRA el uso: quien impide pasarse es el servidor, porque el frontend se puede
saltar.

Reglas de diseño:

  · **Bloquear lo nuevo, nunca borrar lo existente.** Si una clínica baja de plan
    y ya tiene más usuarios o mascotas que el tope, no pierde nada: simplemente no
    puede agregar más hasta volver a caber.
  · **Se corta antes de gastar.** La IA cuesta dinero cada vez que se llama, así
    que el cupo se descuenta ANTES de llamar al proveedor.
  · **Un plan desconocido no bloquea.** Si a una clínica le falta su plan en la
    tabla, se registra el aviso y se la deja trabajar: una configuración
    equivocada nuestra no debe dejar sin sistema a un cliente.
  · Código 402 (pago requerido) con un mensaje que dice qué plan tiene, cuál es
    el tope y qué hacer.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from database import SessionLocal, get_db

logger = logging.getLogger("vetlospinos")

# recurso → (columna del plan, cómo se nombra en el mensaje)
RECURSOS = {
    "usuarios":       ("max_usuarios", "usuarios activos"),
    "mascotas":       ("max_mascotas", "mascotas"),
    "almacenamiento": ("max_almacenamiento_mb", "MB de documentos"),
    "ia":             ("max_ia_mes", "usos de IA por mes"),
}
FUNCIONES = {
    "planilla":  ("incluye_planilla", "La planilla del personal"),
    "contactos": ("incluye_contactos", "El contacto con clientes"),
}

_MB = 1024 * 1024


def periodo_actual() -> str:
    return datetime.now(ZoneInfo("America/Lima")).strftime("%Y-%m")


def plan_de(db: Session):
    """El plan de la clínica de esta sesión (o None si no se puede saber)."""
    from models import Clinica, Plan   # import tardío: models importa database
    clinica_id = db.info.get("clinica_id")
    if clinica_id is None:
        return None
    clinica = db.get(Clinica, clinica_id)
    plan = db.get(Plan, clinica.plan) if clinica else None
    if plan is None:
        logger.warning("La clínica %s tiene un plan que no existe en la tabla de planes: %r",
                       clinica_id, clinica.plan if clinica else None)
    return plan


def uso(db: Session) -> dict:
    """Lo que la clínica de esta sesión está usando hoy."""
    from models import DocumentoPaciente, Paciente, UsoMensual, Usuario
    clinica_id = db.info.get("clinica_id")
    ia = (db.query(UsoMensual.ia_usos)
            .filter(UsoMensual.periodo == periodo_actual()).scalar()) if clinica_id else 0
    return {
        "usuarios": db.query(func.count(Usuario.id))
                      .filter(Usuario.activo.is_(True), Usuario.rol != "plataforma").scalar() or 0,
        "mascotas": db.query(func.count(Paciente.id)).scalar() or 0,
        "almacenamiento": (db.query(func.coalesce(func.sum(DocumentoPaciente.tamano_bytes), 0)).scalar() or 0),
        "ia": ia or 0,
    }


def limite_de(plan, recurso: str):
    """Tope del recurso en ese plan, en la unidad de uso(): None = ilimitado."""
    if plan is None:
        return None
    valor = getattr(plan, RECURSOS[recurso][0])
    if valor is None:
        return None
    return valor * _MB if recurso == "almacenamiento" else valor


def _mensaje(plan, recurso: str, limite: int, usado: int) -> str:
    nombre = RECURSOS[recurso][1]
    if recurso == "almacenamiento":
        return (f"Tu plan {plan.nombre} incluye {limite // _MB} MB de documentos y ya usas "
                f"{usado // _MB} MB. Pasa a un plan mayor para seguir subiendo archivos.")
    if recurso == "ia":
        return (f"Llegaste al tope de {limite} usos de IA de este mes en tu plan {plan.nombre}. "
                f"Se renueva el mes que viene, o pasa a un plan mayor.")
    return (f"Tu plan {plan.nombre} permite hasta {limite} {nombre}. "
            f"Pasa a un plan mayor para agregar más.")


def exigir_cupo(db: Session, recurso: str, cantidad: int = 1) -> None:
    """Rechaza (402) si agregar `cantidad` pasaría el tope del plan."""
    plan = plan_de(db)
    limite = limite_de(plan, recurso)
    if limite is None:
        return
    usado = uso(db)[recurso]
    if usado + cantidad > limite:
        raise HTTPException(status_code=402, detail=_mensaje(plan, recurso, limite, usado))


def consumir_ia(clinica_id: int | None) -> None:
    """Descuenta un uso de IA del mes ANTES de llamar al proveedor, o rechaza (402).

    Es atómico: el conteo y la comparación con el tope se hacen en una sola
    sentencia, así que dos peticiones simultáneas no pueden pasarse del tope.
    Usa su propia sesión y confirma al instante: el uso queda contado aunque la
    petición posterior falle (el proveedor cobra el intento igual).
    """
    from models import Clinica, Plan, UsoMensual
    if clinica_id is None:
        return
    db = SessionLocal()
    try:
        clinica = db.get(Clinica, clinica_id)
        plan = db.get(Plan, clinica.plan) if clinica else None
        limite = limite_de(plan, "ia")
        periodo = periodo_actual()

        if limite is not None and limite < 1:
            raise HTTPException(402, _mensaje(plan, "ia", limite, 0))

        insertar = pg_insert(UsoMensual).values(clinica_id=clinica_id, periodo=periodo, ia_usos=1)
        actualizar = {"set_": {"ia_usos": UsoMensual.ia_usos + 1}}
        if limite is not None:
            actualizar["where"] = UsoMensual.ia_usos < limite       # solo suma si aún hay cupo
        sentencia = insertar.on_conflict_do_update(constraint="uq_uso_clinica_periodo", **actualizar)
        filas = db.execute(sentencia.returning(UsoMensual.ia_usos)).all()
        if not filas:
            raise HTTPException(402, _mensaje(plan, "ia", limite, limite))
        db.commit()
    finally:
        db.close()


def exigir_funcion(db: Session, funcion: str) -> None:
    plan = plan_de(db)
    if plan is None:
        return
    columna, nombre = FUNCIONES[funcion]
    if not getattr(plan, columna):
        raise HTTPException(
            status_code=402,
            detail=f"{nombre} no está incluido en tu plan {plan.nombre}. Pasa a un plan que lo incluya.",
        )


def requiere_funcion(funcion: str):
    """Dependencia de FastAPI: bloquea todo un router si el plan no incluye la función."""
    def _dependencia(request: Request, db: Session = Depends(get_db)):
        exigir_funcion(db, funcion)
    return _dependencia
