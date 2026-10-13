"""A quién hay que escribirle o llamarle hoy, y con qué mensaje.

Reúne en una sola lista lo que antes estaba repartido en tres pantallas:
vacunas y desparasitaciones por vencer, tratamientos que terminan (o que
terminaron y el dueño no volvió) y turnos de mañana por confirmar. Cada
pendiente trae su mensaje ya armado y cuándo fue la última vez que se intentó
contactar, para no escribirle dos veces al mismo dueño por lo mismo.
"""
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from models import (
    Cita, ConfiguracionClinica, ContactoCliente, Paciente, PlantillaContacto,
)

_LIMA = ZoneInfo("America/Lima")

MOTIVOS = {
    "vacuna":          "Vacunas",
    "antiparasitario": "Desparasitación",
    "tratamiento":     "Tratamientos por terminar",
    "control":         "Terminó y no volvió",
    "cita":            "Turnos de mañana",
}

# Resultados que cierran el pendiente. «No contestó» NO lo cierra: hay que
# insistir; por eso se cuentan los intentos.
RESULTADOS = ("enviado", "contesto", "no_contesto", "agendo", "no_interesa")
CIERRAN = {"enviado", "contesto", "agendo", "no_interesa"}
CANALES = ("whatsapp", "llamada")

# Placeholders: {dueno} {mascota} {detalle} {cuando} {clinica}
PLANTILLAS_DEFECTO = {
    "vacuna": ("Hola {dueno}, le recordamos que {mascota} tiene pendiente la vacuna "
               "{detalle} {cuando}. ¿Le agendamos una cita? {clinica}"),
    "antiparasitario": ("Hola {dueno}, le recordamos que {mascota} tiene pendiente la "
                        "desparasitación ({detalle}) {cuando}. ¿Le agendamos una cita? {clinica}"),
    "tratamiento": ("Hola {dueno}, ¿cómo va {mascota} con el tratamiento ({detalle})? "
                    "Le recordamos que termina {cuando}. Cualquier duda nos escribe. {clinica}"),
    "control": ("Hola {dueno}, {mascota} terminó su tratamiento ({detalle}) {cuando}. "
                "¿Cómo sigue? En {clinica} quedamos atentos para el control."),
    "cita": ("Hola {dueno}, le recordamos el turno de {mascota} {cuando}. "
             "¿Nos confirma su asistencia? {clinica}"),
}


class _Seguro(dict):
    """Deja intacto un {marcador} desconocido en vez de reventar."""
    def __missing__(self, clave):
        return "{" + clave + "}"


def armar_mensaje(texto: str, **datos) -> str:
    return " ".join(texto.format_map(_Seguro(**datos)).split())


def telefono_whatsapp(tel: str | None) -> str | None:
    """Número listo para wa.me, o None si no sirve.

    En la base migrada hay teléfonos incompletos o con texto; mandarlos a
    WhatsApp abre un chat con un número que no existe y la recepcionista cree
    que escribió. Mejor decirlo: aquí solo se aceptan celulares peruanos.
    """
    digitos = re.sub(r"\D", "", tel or "")
    if len(digitos) == 9 and digitos.startswith("9"):
        return "51" + digitos
    if len(digitos) == 11 and digitos.startswith("519"):
        return digitos
    return None


def plantillas(db: Session) -> dict[str, dict]:
    propias = {p.motivo: p for p in db.query(PlantillaContacto).all()}
    return {
        m: {"motivo": m, "etiqueta": MOTIVOS[m],
            "texto": propias[m].texto if m in propias else PLANTILLAS_DEFECTO[m],
            "personalizada": m in propias}
        for m in MOTIVOS
    }


def _cuando(fecha_iso: str | None, hoy) -> str:
    if not fecha_iso:
        return ""
    try:
        f = datetime.strptime(fecha_iso[:10], "%Y-%m-%d").date()
    except ValueError:
        return ""
    dias = (f - hoy).days
    if dias == 0:
        return "hoy"
    if dias == 1:
        return "mañana"
    if dias == -1:
        return "ayer"
    if dias < 0:
        return f"desde el {f.strftime('%d/%m/%Y')}"
    return f"el {f.strftime('%d/%m/%Y')}"


def _cita_cuando(dt_lima: datetime, hoy) -> str:
    dia = "mañana" if (dt_lima.date() - hoy).days == 1 else f"el {dt_lima.strftime('%d/%m')}"
    return f"{dia} a las {dt_lima.strftime('%H:%M')}"


def pendientes(db: Session, vencidas_dias: int = 120, proximas_dias: int = 15) -> list[dict]:
    # Import tardío: estos routers importan modelos y servicios, no al revés.
    from routers.dashboard import vacunas as _vacunas
    from routers.tratamientos import listar as _tratamientos

    hoy = datetime.now(_LIMA).date()
    clinica = db.query(ConfiguracionClinica).first()   # la de esta sesión
    nombre_clinica = (clinica.nombre if clinica else None) or "la clínica"
    textos = {m: p["texto"] for m, p in plantillas(db).items()}
    crudos: list[dict] = []

    def agregar(motivo, clave, *, cliente_id, propietario, telefono, paciente_id,
                paciente, detalle, fecha, cuando, urgente=False):
        if not cliente_id:
            return
        crudos.append({
            "motivo": motivo, "clave": clave,
            "cliente_id": cliente_id, "propietario": propietario,
            "telefono": telefono, "wa": telefono_whatsapp(telefono),
            "paciente_id": paciente_id, "paciente": paciente,
            "detalle": detalle, "fecha": fecha, "urgente": urgente,
            "mensaje": armar_mensaje(
                textos[motivo], dueno=propietario or "", mascota=paciente or "su mascota",
                detalle=detalle or "", cuando=cuando, clinica=nombre_clinica),
        })

    # 1. Vacunas y desparasitaciones por vencer
    desde = hoy - timedelta(days=vencidas_dias)
    hasta = hoy + timedelta(days=proximas_dias)
    for v in _vacunas(db):
        if v.get("avisado") or v.get("estado") not in ("vencida", "proxima"):
            continue
        f = v.get("fecha_proxima")
        if not f or not (desde.isoformat() <= f <= hasta.isoformat()):
            continue
        tipo = v.get("tipo") or "vacuna"
        agregar(tipo, f"{tipo}:{v['paciente_id']}:{v['vacuna'].lower()}:{v.get('proxima_dosis')}",
                cliente_id=v.get("cliente_id"), propietario=v.get("propietario"),
                telefono=v.get("telefono"), paciente_id=v["paciente_id"],
                paciente=v.get("paciente"), detalle=v["vacuna"], fecha=f,
                cuando=_cuando(f, hoy), urgente=v["estado"] == "vencida")

    # 2. Tratamientos: los que terminan hoy o mañana, y los que terminaron sin control
    for t in _tratamientos(estado=None, paciente_id=None, dias=45, db=db):
        if t.get("sin_control"):
            motivo, urgente = "control", True
        elif t["estado"] == "en_curso" and t.get("dias_restantes") is not None \
                and t["dias_restantes"] <= 1:
            motivo, urgente = "tratamiento", False
        else:
            continue
        agregar(motivo, f"{motivo}:{t['id']}",
                cliente_id=t.get("cliente_id"), propietario=t.get("propietario"),
                telefono=t.get("telefono"), paciente_id=t["paciente_id"],
                paciente=t.get("paciente"), detalle=t["medicamento"], fecha=t.get("fin"),
                cuando=_cuando(t.get("fin"), hoy), urgente=urgente)

    # 3. Turnos de mañana por confirmar
    manana = hoy + timedelta(days=1)
    ini = datetime(manana.year, manana.month, manana.day, tzinfo=_LIMA)
    citas = (db.query(Cita)
               .options(joinedload(Cita.paciente).joinedload(Paciente.cliente))
               .filter(Cita.fecha_hora >= ini, Cita.fecha_hora < ini + timedelta(days=1),
                       Cita.estado == "pendiente")
               .order_by(Cita.fecha_hora).all())
    for c in citas:
        pac = c.paciente
        cli = pac.cliente if pac else None
        if not cli:
            continue
        cuando = _cita_cuando(c.fecha_hora.astimezone(_LIMA), hoy)
        agregar("cita", f"cita:{c.id}", cliente_id=cli.id, propietario=cli.nombre,
                telefono=cli.telefono, paciente_id=pac.id, paciente=pac.nombre,
                detalle=c.motivo or "consulta", fecha=manana.isoformat(), cuando=cuando)

    # Historial de contactos de estos pendientes: un solo query
    claves = [p["clave"] for p in crudos]
    por_clave: dict[str, list[ContactoCliente]] = defaultdict(list)
    if claves:
        for c in (db.query(ContactoCliente)
                    .filter(ContactoCliente.clave.in_(claves))
                    .order_by(ContactoCliente.creado_en).all()):
            por_clave[c.clave].append(c)

    for p in crudos:
        hist = por_clave.get(p["clave"], [])
        ultimo = hist[-1] if hist else None
        p["intentos"] = len(hist)
        p["contactado"] = any(c.resultado in CIERRAN for c in hist)
        p["ultimo_contacto"] = ultimo_a_dict(ultimo) if ultimo else None

    crudos.sort(key=lambda p: (p["contactado"], not p["urgente"], p["fecha"] or "9999"))
    return crudos


def ultimo_a_dict(c: ContactoCliente) -> dict:
    return {
        "id": c.id, "canal": c.canal, "resultado": c.resultado, "nota": c.nota,
        "creado_en": c.creado_en.isoformat() if c.creado_en else None,
        "creado_por": c.creado_por,
    }


def resumen(items: list[dict]) -> dict:
    """Conteo de lo que falta por motivo (lo ya contactado no cuenta)."""
    out = {m: 0 for m in MOTIVOS}
    for p in items:
        if not p["contactado"]:
            out[p["motivo"]] += 1
    out["total"] = sum(out.values())
    return out
