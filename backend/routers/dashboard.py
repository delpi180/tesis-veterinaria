from datetime import datetime, date, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Asistencia, Cita, Cliente, HistoriaClinica, Paciente, Producto, Venta

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

METODOS_PAGO = ["efectivo", "tarjeta", "yape", "plin"]

DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def _parse_fecha_libre(s: str | None) -> date | None:
    """Intenta interpretar la 'próxima dosis' como fecha (es texto libre en el form)."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _rango_local(d: date) -> tuple[datetime, datetime]:
    """Inicio/fin de un día calendario local, como datetimes con tz (para comparar con la BD)."""
    tz = datetime.now().astimezone().tzinfo
    inicio = datetime.combine(d, time.min).replace(tzinfo=tz)
    return inicio, inicio + timedelta(days=1)


@router.get("/resumen")
def resumen_dashboard(db: Session = Depends(get_db)):
    hoy = date.today()
    hoy_ini, hoy_fin = _rango_local(hoy)
    mes_ini, _ = _rango_local(hoy.replace(day=1))

    # ── Citas de hoy (con paciente y propietario) ─────────────────────────────
    citas_hoy = (
        db.query(Cita)
        .options(
            joinedload(Cita.paciente).joinedload(Paciente.cliente),
            joinedload(Cita.veterinario),
        )
        .filter(Cita.fecha_hora >= hoy_ini, Cita.fecha_hora < hoy_fin)
        .order_by(Cita.fecha_hora)
        .all()
    )
    citas_hoy_out = [
        {
            "id": c.id,
            "fecha_hora": c.fecha_hora.isoformat(),
            "motivo": c.motivo,
            "estado": c.estado,
            "paciente_id": c.paciente_id,
            "paciente": c.paciente.nombre if c.paciente else None,
            "especie": c.paciente.especie if c.paciente else None,
            "cliente_id": c.paciente.cliente_id if c.paciente else None,
            "propietario": c.paciente.cliente.nombre if c.paciente and c.paciente.cliente else None,
            "veterinario": c.veterinario.nombre if c.veterinario else None,
        }
        for c in citas_hoy
    ]

    # ── Doctores en turno ahora (asistencia de hoy sin salida) ────────────────
    presentes_rows = (
        db.query(Asistencia)
        .options(joinedload(Asistencia.usuario))
        .filter(Asistencia.fecha == hoy, Asistencia.hora_salida.is_(None))
        .order_by(Asistencia.hora_ingreso)
        .all()
    )
    presentes = [
        {
            "usuario_id": a.usuario_id,
            "nombre": a.usuario.nombre if a.usuario else None,
            "hora_ingreso": a.hora_ingreso.isoformat() if a.hora_ingreso else None,
        }
        for a in presentes_rows
    ]

    # ── Consultas por día de la semana actual ─────────────────────────────────
    lunes = hoy - timedelta(days=hoy.weekday())
    sem_ini, _ = _rango_local(lunes)
    _, sem_fin = _rango_local(lunes + timedelta(days=6))
    historias_semana = (
        db.query(HistoriaClinica.fecha)
        .filter(HistoriaClinica.fecha >= sem_ini, HistoriaClinica.fecha < sem_fin)
        .all()
    )
    conteo = [0] * 7
    for (f,) in historias_semana:
        if f is not None:
            conteo[f.astimezone().weekday()] += 1
    consultas_semana = [{"dia": DIAS[i], "consultas": conteo[i]} for i in range(7)]
    consultas_hoy = conteo[hoy.weekday()]

    # ── Ventas: ingresos del día y del mes ────────────────────────────────────
    ingresos_dia = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= hoy_ini, Venta.fecha < hoy_fin)
        .scalar()
    )
    ingresos_mes = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= mes_ini)
        .scalar()
    )
    ventas_mes = db.query(func.count(Venta.id)).filter(Venta.fecha >= mes_ini).scalar()

    # ── Inventario: stock bajo ────────────────────────────────────────────────
    stock_bajo = (
        db.query(Producto)
        .filter(Producto.activo.is_(True), Producto.stock <= Producto.stock_minimo)
        .order_by(Producto.stock)
        .all()
    )
    stock_bajo_out = [
        {"id": p.id, "codigo": p.codigo, "nombre": p.nombre, "stock": p.stock, "stock_minimo": p.stock_minimo}
        for p in stock_bajo
    ]

    # ── Totales generales ─────────────────────────────────────────────────────
    total_clientes = db.query(func.count(Cliente.id)).scalar()
    total_pacientes = db.query(func.count(Paciente.id)).scalar()

    # ── Distribución por especie ──────────────────────────────────────────────
    especies_rows = (
        db.query(Paciente.especie, func.count(Paciente.id))
        .group_by(Paciente.especie)
        .all()
    )
    especies_distribucion = [
        {"especie": especie or "Sin especificar", "cantidad": int(cant)}
        for especie, cant in especies_rows
    ]

    # ── Ingresos de la semana (últimos 7 días, por día) ───────────────────────
    ingresos_semana_data: dict[int, float] = {i: 0.0 for i in range(7)}
    for i in range(7):
        dia = lunes + timedelta(days=i)
        dia_ini, dia_fin = _rango_local(dia)
        total_dia = (
            db.query(func.coalesce(func.sum(Venta.total), 0))
            .filter(Venta.fecha >= dia_ini, Venta.fecha < dia_fin)
            .scalar()
        )
        ingresos_semana_data[i] = float(total_dia)
    ingresos_semana = [
        {"dia": DIAS[i], "total": ingresos_semana_data[i]} for i in range(7)
    ]

    # ── Métodos de pago del mes ───────────────────────────────────────────────
    metodos_rows = (
        db.query(Venta.metodo_pago, func.count(Venta.id), func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= mes_ini)
        .group_by(Venta.metodo_pago)
        .all()
    )
    metodos_pago = [
        {"metodo": metodo or "efectivo", "cantidad": int(cant), "total": float(total)}
        for metodo, cant, total in metodos_rows
    ]

    # ── Vacunas con próxima dosis (recordatorios) ─────────────────────────────
    historias_vacunas = (
        db.query(HistoriaClinica)
        .options(joinedload(HistoriaClinica.paciente).joinedload(Paciente.cliente))
        .filter(HistoriaClinica.vacunas_items.isnot(None))
        .order_by(HistoriaClinica.fecha.desc())
        .all()
    )
    vacunas: list[dict] = []
    vistos: set[tuple[int, str]] = set()  # (paciente_id, vacuna) — solo el registro más reciente
    for h in historias_vacunas:
        for item in (h.vacunas_items or []):
            nombre_vac = (item.get("vacuna") or "").strip()
            prox = item.get("proxima_dosis")
            if not nombre_vac or not prox:
                continue
            clave = (h.paciente_id, nombre_vac.lower())
            if clave in vistos:
                continue
            vistos.add(clave)
            fecha = _parse_fecha_libre(prox)
            pac = h.paciente
            vacunas.append({
                "paciente_id": h.paciente_id,
                "paciente": pac.nombre if pac else None,
                "especie": pac.especie if pac else None,
                "cliente_id": pac.cliente_id if pac else None,
                "propietario": pac.cliente.nombre if pac and pac.cliente else None,
                "telefono": pac.cliente.telefono if pac and pac.cliente else None,
                "vacuna": nombre_vac,
                "proxima_dosis": prox,
                "fecha": fecha.isoformat() if fecha else None,
                "vencida": bool(fecha and fecha < hoy),
            })
    # Primero las que tienen fecha (más urgentes), luego las de texto libre
    vacunas.sort(key=lambda v: (v["fecha"] is None, v["fecha"] or ""))

    return {
        "citas_hoy": citas_hoy_out,
        "presentes": presentes,
        "consultas_semana": consultas_semana,
        "consultas_hoy": consultas_hoy,
        "ingresos_dia": float(ingresos_dia),
        "ingresos_mes": float(ingresos_mes),
        "ventas_mes": int(ventas_mes),
        "stock_bajo": stock_bajo_out,
        "total_clientes": int(total_clientes),
        "total_pacientes": int(total_pacientes),
        "vacunas_proximas": vacunas,
        "especies_distribucion": especies_distribucion,
        "ingresos_semana": ingresos_semana,
        "metodos_pago": metodos_pago,
    }


@router.get("/cierre-caja")
def cierre_caja(
    fecha: Optional[date] = Query(None, description="Día a cerrar (por defecto hoy)"),
    db: Session = Depends(get_db),
):
    """Arqueo del día: total e importes desglosados por método de pago."""
    dia = fecha or date.today()
    ini, fin = _rango_local(dia)

    ventas = (
        db.query(Venta)
        .options(joinedload(Venta.cliente))
        .filter(Venta.fecha >= ini, Venta.fecha < fin)
        .order_by(Venta.fecha)
        .all()
    )

    por_metodo = {m: {"total": 0.0, "cantidad": 0} for m in METODOS_PAGO}
    total = 0.0
    for v in ventas:
        m = v.metodo_pago if v.metodo_pago in por_metodo else "efectivo"
        por_metodo[m]["total"] += float(v.total)
        por_metodo[m]["cantidad"] += 1
        total += float(v.total)

    return {
        "fecha": dia.isoformat(),
        "total": round(total, 2),
        "num_ventas": len(ventas),
        "por_metodo": [
            {"metodo": m, "total": round(por_metodo[m]["total"], 2), "cantidad": por_metodo[m]["cantidad"]}
            for m in METODOS_PAGO
        ],
        "ventas": [
            {
                "id": v.id,
                "hora": v.fecha.isoformat(),
                "cliente": v.cliente.nombre if v.cliente else f"Cliente #{v.cliente_id}",
                "metodo_pago": v.metodo_pago,
                "total": float(v.total),
            }
            for v in ventas
        ],
    }
