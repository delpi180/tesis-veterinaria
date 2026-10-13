"""Cobro: registrar un pago, renovar el vencimiento y calcular la suscripción.

`registrar_pago` es el ÚNICO camino por el que entra dinero al sistema. Hoy lo
llama el operador cuando confirma un Yape o una transferencia; el día que se
conecte una pasarela (Culqi, Stripe, Mercado Pago…) su aviso de "cobro exitoso"
debe llamar a esta misma función. Por eso es idempotente: si llega dos veces el
mismo (método, referencia) no se acredita dos veces.

No hay pasarela conectada. Hacerlo exige una cuenta de comercio y claves que no
tengo, y no se puede probar contra un cobro real desde aquí; cuando se elija una,
solo hace falta un endpoint que verifique su firma y llame a `registrar_pago`.
"""
import calendar
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from core import limites
from core.cuentas import bloqueo_de
from database import nueva_sesion
from models import Clinica, Pago, Plan

METODOS = ("yape", "plin", "transferencia", "efectivo", "tarjeta", "otro")
PLANES_COBRABLES_EXCLUIDOS = ("plataforma",)


def hoy_lima() -> date:
    return datetime.now(ZoneInfo("America/Lima")).date()


def sumar_meses(d: date, n: int) -> date:
    """Suma meses sin salirse del calendario (31 de enero + 1 mes = 28 o 29 de febrero)."""
    mes = d.month - 1 + n
    anio = d.year + mes // 12
    mes = mes % 12 + 1
    return date(anio, mes, min(d.day, calendar.monthrange(anio, mes)[1]))


class PagoInvalido(ValueError):
    pass


def registrar_pago(
    db: Session, clinica: Clinica, *, plan: str, meses: int, monto: Decimal | float | None,
    metodo: str, referencia: str | None = None, nota: str | None = None,
    operador: str | None = None, reactivar: bool = False, hoy: date | None = None,
) -> tuple[Pago, bool]:
    """Acredita un pago: extiende el vencimiento y deja la clínica en ese plan.

    Devuelve (pago, creado). Si (método, referencia) ya existe devuelve el pago
    original con creado=False y NO acredita otra vez.

    `db` debe ser una sesión sin filtro de clínica (la del operador o la de un
    proceso de plataforma): el pago se asigna a `clinica` explícitamente.
    """
    if metodo not in METODOS:
        raise PagoInvalido(f"Método de pago no válido. Usa: {', '.join(METODOS)}")
    if not 1 <= meses <= 24:
        raise PagoInvalido("Los meses deben estar entre 1 y 24.")
    plan_fila = db.get(Plan, plan)
    if plan_fila is None or plan in PLANES_COBRABLES_EXCLUIDOS:
        raise PagoInvalido("Ese plan no existe.")

    referencia = (referencia or "").strip() or None
    if referencia:
        previo = db.query(Pago).filter(Pago.metodo == metodo, Pago.referencia == referencia).first()
        if previo:
            if previo.clinica_id != clinica.id:
                raise PagoInvalido("Esa referencia ya se usó para otra clínica.")
            return previo, False

    monto = Decimal(str(monto)) if monto is not None else (plan_fila.precio_mensual * meses)
    if monto < 0:
        raise PagoInvalido("El monto no puede ser negativo.")

    hoy = hoy or hoy_lima()
    # Renovar antes de vencer suma al final del periodo vigente (no se pierde lo
    # ya pagado); si ya venció o no tenía fecha, el periodo corre desde hoy.
    desde = clinica.vence_en if (clinica.vence_en and clinica.vence_en >= hoy) else hoy
    hasta = sumar_meses(desde, meses)

    pago = Pago(
        clinica_id=clinica.id, plan=plan, monto=monto, moneda=plan_fila.moneda, meses=meses,
        periodo_desde=desde, periodo_hasta=hasta, metodo=metodo, referencia=referencia,
        nota=(nota or "").strip()[:300] or None, registrado_por=operador,
    )
    db.add(pago)
    clinica.plan = plan
    clinica.vence_en = hasta
    if reactivar and clinica.estado == "suspendida":
        clinica.estado, clinica.suspendida_motivo, clinica.suspendida_en = "activa", None, None
    return pago, True


# ── Suscripción: lo que se muestra a la clínica y al operador ────────────────

def _recurso(clave: str, usado: int, limite: int | None) -> dict:
    mb = clave == "almacenamiento"
    f = (lambda v: round(v / (1024 * 1024), 1)) if mb else (lambda v: v)
    return {
        "uso": f(usado),
        "limite": None if limite is None else f(limite),
        "porcentaje": None if not limite else min(100, round(100 * usado / limite)),
        "unidad": "MB" if mb else "",
    }


def datos_suscripcion(clinica_id: int) -> dict:
    """Plan, vencimiento y uso contra límites de una clínica.

    Calcula el uso con una sesión acotada a ESA clínica, así que sirve igual al
    llamarla desde la clínica que desde el panel del operador.
    """
    s = nueva_sesion(clinica_id)
    try:
        clinica = s.get(Clinica, clinica_id)
        plan = s.get(Plan, clinica.plan)
        usado = limites.uso(s)
        bloqueo = bloqueo_de(clinica.estado, clinica.vence_en)
        dias = (clinica.vence_en - hoy_lima()).days if clinica.vence_en else None
        return {
            "plan": ({"codigo": plan.codigo, "nombre": plan.nombre, "descripcion": plan.descripcion,
                      "precio_mensual": float(plan.precio_mensual), "moneda": plan.moneda}
                     if plan else {"codigo": clinica.plan, "nombre": clinica.plan, "descripcion": None,
                                   "precio_mensual": 0.0, "moneda": "PEN"}),
            "estado": "activa" if bloqueo is None else ("suspendida" if clinica.estado != "activa" else "vencida"),
            "vence_en": clinica.vence_en,
            "dias_restantes": dias,
            "limites": {r: _recurso(r, usado[r], limites.limite_de(plan, r)) for r in limites.RECURSOS},
            "funciones": {f: bool(getattr(plan, col)) if plan else True
                          for f, (col, _n) in limites.FUNCIONES.items()},
        }
    finally:
        s.close()


def nombres_de_planes(db: Session) -> dict[str, str]:
    return {p.codigo: p.nombre for p in db.query(Plan)}


def pago_a_dict(p: Pago, nombres: dict[str, str] | None = None) -> dict:
    return {"id": p.id, "plan": p.plan, "plan_nombre": (nombres or {}).get(p.plan, p.plan), "monto": float(p.monto), "moneda": p.moneda, "meses": p.meses,
            "desde": p.periodo_desde, "hasta": p.periodo_hasta, "metodo": p.metodo,
            "referencia": p.referencia, "nota": p.nota, "registrado_por": p.registrado_por,
            "fecha": p.creado_en}
