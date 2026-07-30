from datetime import datetime, date, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Asistencia, CierreCaja, Cita, Cliente, HistoriaClinica, Paciente, Producto,
    Venta, VentaItem, Usuario, VacunaAvisada,
)
from core.deps import usuario_actual, solo_admin

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _avisos_existentes(db: Session) -> set[tuple[int, str, str]]:
    """Claves (paciente_id, vacuna en minúscula, próxima_dosis) ya avisadas."""
    return {
        (a.paciente_id, a.vacuna.lower(), a.proxima_dosis)
        for a in db.query(VacunaAvisada).all()
    }

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
            "telefono": c.paciente.cliente.telefono if c.paciente and c.paciente.cliente else None,
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

    # ── Todas las asistencias de hoy (para la tabla de marcación del dashboard) ──
    asistencias_hoy_rows = (
        db.query(Asistencia)
        .options(joinedload(Asistencia.usuario))
        .filter(Asistencia.fecha == hoy)
        .order_by(Asistencia.hora_ingreso)
        .all()
    )
    asistencias_hoy = [
        {
            "id": a.id,
            "usuario_id": a.usuario_id,
            "nombre": a.usuario.nombre if a.usuario else None,
            "hora_ingreso": a.hora_ingreso.isoformat() if a.hora_ingreso else None,
            "hora_salida": a.hora_salida.isoformat() if a.hora_salida else None,
            "tardanza_min": a.tardanza_min,
        }
        for a in asistencias_hoy_rows
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
    # Las anuladas quedan fuera de TODOS los totales: si siguieran sumando,
    # anularlas no serviría de nada y la caja nunca cuadraría.
    ingresos_dia = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= hoy_ini, Venta.fecha < hoy_fin, Venta.anulada.is_(False))
        .scalar()
    )
    ingresos_mes = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= mes_ini, Venta.anulada.is_(False))
        .scalar()
    )
    ventas_mes = (
        db.query(func.count(Venta.id))
        .filter(Venta.fecha >= mes_ini, Venta.anulada.is_(False))
        .scalar()
    )

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

    # ── Inventario: vencidos y por vencer ─────────────────────────────────────
    # 30 días alcanza para devolver al proveedor o rematar antes de perderlo.
    # Sin stock no hay nada que retirar, así que no se avisa.
    limite_venc = hoy + timedelta(days=30)
    por_vencer = (
        db.query(Producto)
        .filter(
            Producto.activo.is_(True),
            Producto.fecha_vencimiento.isnot(None),
            Producto.fecha_vencimiento <= limite_venc,
            Producto.stock > 0,
        )
        .order_by(Producto.fecha_vencimiento)
        .all()
    )
    por_vencer_out = [
        {
            "id": p.id, "codigo": p.codigo, "nombre": p.nombre, "stock": p.stock,
            "lote": p.lote,
            "fecha_vencimiento": p.fecha_vencimiento.isoformat(),
            "dias": (p.fecha_vencimiento - hoy).days,
            "vencido": p.fecha_vencimiento < hoy,
        }
        for p in por_vencer
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
    # Antes esto hacía una consulta por cada día: siete viajes a la base solo
    # para dibujar el gráfico de la portada. Ahora se traen las ventas de la
    # semana de una vez y se reparten por día acá. Se agrupa en Python (y no con
    # un GROUP BY por fecha) para no tener que convertir zonas horarias en SQL:
    # el corte de día tiene que ser el mismo que usa el resto del panel.
    ingresos_semana_data: dict[int, float] = {i: 0.0 for i in range(7)}
    sem_fin = _rango_local(lunes + timedelta(days=6))[1]
    ventas_semana = (
        db.query(Venta.fecha, Venta.total)
        .filter(Venta.fecha >= sem_ini, Venta.fecha < sem_fin, Venta.anulada.is_(False))
        .all()
    )
    limites = [_rango_local(lunes + timedelta(days=i)) for i in range(7)]
    for fecha_venta, total in ventas_semana:
        for i, (ini, fin) in enumerate(limites):
            if ini <= fecha_venta < fin:
                ingresos_semana_data[i] += float(total or 0)
                break
    ingresos_semana = [
        {"dia": DIAS[i], "total": ingresos_semana_data[i]} for i in range(7)
    ]

    # ── Métodos de pago del mes ───────────────────────────────────────────────
    metodos_rows = (
        db.query(Venta.metodo_pago, func.count(Venta.id), func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= mes_ini, Venta.anulada.is_(False))
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
    avisadas = _avisos_existentes(db)
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
            # Este es el panel de "por hacer" de la recepción: una vez avisado
            # el dueño, desaparece de aquí (Vacunación conserva el historial
            # completo, avisadas incluidas).
            if (h.paciente_id, nombre_vac.lower(), prox) in avisadas:
                continue
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
        "por_vencer": por_vencer_out,
        "total_clientes": int(total_clientes),
        "total_pacientes": int(total_pacientes),
        "vacunas_proximas": vacunas,
        "especies_distribucion": especies_distribucion,
        "ingresos_semana": ingresos_semana,
        "metodos_pago": metodos_pago,
        "asistencias_hoy": asistencias_hoy,
    }


@router.get("/cierre-caja")
def cierre_caja(
    fecha: Optional[date] = Query(None, description="Día a cerrar (por defecto hoy)"),
    db: Session = Depends(get_db),
):
    """Arqueo del día: lo cobrado por método de pago y el estado del cierre.

    Las anuladas no suman a los totales, pero se listan igual: si desaparecieran
    de la vista, quien revisa la caja no entendería por qué falta un número de
    comprobante.
    """
    dia = fecha or date.today()
    ini, fin = _rango_local(dia)

    todas = (
        db.query(Venta)
        .options(joinedload(Venta.cliente))
        .filter(Venta.fecha >= ini, Venta.fecha < fin)
        .order_by(Venta.fecha)
        .all()
    )
    ventas = [v for v in todas if not v.anulada]

    por_metodo = {m: {"total": 0.0, "cantidad": 0} for m in METODOS_PAGO}
    total = 0.0
    for v in ventas:
        m = v.metodo_pago if v.metodo_pago in por_metodo else "efectivo"
        por_metodo[m]["total"] += float(v.total)
        por_metodo[m]["cantidad"] += 1
        total += float(v.total)

    # Solo el efectivo se cuenta a mano: lo cobrado por tarjeta/Yape/Plin no
    # pasa por el cajón.
    efectivo_esperado = round(por_metodo["efectivo"]["total"], 2)

    cierre = db.query(CierreCaja).filter(CierreCaja.fecha == dia).first()

    return {
        "fecha": dia.isoformat(),
        "total": round(total, 2),
        "num_ventas": len(ventas),
        "efectivo_esperado": efectivo_esperado,
        "num_anuladas": len(todas) - len(ventas),
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
                "anulada": bool(v.anulada),
                "motivo_anulacion": v.motivo_anulacion,
            }
            for v in todas
        ],
        "cierre": None if not cierre else {
            "efectivo_contado": float(cierre.efectivo_contado),
            "efectivo_esperado": float(cierre.efectivo_esperado),
            "diferencia": float(cierre.diferencia),
            "notas": cierre.notas,
            "cerrado_por": cierre.cerrado_por,
            "cerrado_en": cierre.cerrado_en,
        },
    }


class CierreCajaRequest(BaseModel):
    fecha: Optional[date] = None
    efectivo_contado: float = Field(..., ge=0, description="Lo que había en el cajón")
    notas: Optional[str] = Field(None, max_length=300)


@router.post("/cierre-caja", status_code=201)
def registrar_cierre_caja(
    payload: CierreCajaRequest,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Registra el arqueo del día: cuánto efectivo había realmente.

    Guardar esto es lo que convierte el reporte en un cierre: queda constancia
    de quién contó, cuándo y si cuadró. Con varias personas manejando efectivo,
    esa constancia protege tanto a la dueña como a quien cerró la caja.
    """
    solo_admin(request)
    dia = payload.fecha or date.today()

    if dia > date.today():
        raise HTTPException(status_code=422, detail="No se puede cerrar la caja de un día futuro.")
    if db.query(CierreCaja).filter(CierreCaja.fecha == dia).first():
        raise HTTPException(
            status_code=409,
            detail=f"La caja del {dia.isoformat()} ya fue cerrada.",
        )

    ini, fin = _rango_local(dia)
    ventas = (
        db.query(Venta)
        .filter(Venta.fecha >= ini, Venta.fecha < fin, Venta.anulada.is_(False))
        .all()
    )
    efectivo_esperado = round(
        sum(float(v.total) for v in ventas if (v.metodo_pago or "efectivo") == "efectivo"), 2
    )
    total_dia = round(sum(float(v.total) for v in ventas), 2)
    contado = round(float(payload.efectivo_contado), 2)

    cierre = CierreCaja(
        fecha=dia,
        efectivo_esperado=efectivo_esperado,
        efectivo_contado=contado,
        diferencia=round(contado - efectivo_esperado, 2),   # negativo = falta plata
        total_dia=total_dia,
        num_ventas=len(ventas),
        notas=(payload.notas or "").strip() or None,
        cerrado_por=usuario.usuario if usuario else None,
    )
    db.add(cierre)
    request.state.actividad_detalle = f"{dia.isoformat()} — diferencia S/ {cierre.diferencia}"
    db.commit()
    db.refresh(cierre)

    return {
        "fecha": dia.isoformat(),
        "efectivo_esperado": float(cierre.efectivo_esperado),
        "efectivo_contado": float(cierre.efectivo_contado),
        "diferencia": float(cierre.diferencia),
        "cerrado_por": cierre.cerrado_por,
        "cerrado_en": cierre.cerrado_en,
    }


@router.get("/reportes")
def reportes(
    desde: Optional[date] = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: Optional[date] = Query(None, description="Fecha fin YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Reportes para la administradora: top productos/servicios y atenciones por doctor."""
    hoy = date.today()
    d_desde = desde or hoy.replace(day=1)
    d_hasta = hasta or hoy
    ini, _ = _rango_local(d_desde)
    _, fin = _rango_local(d_hasta)

    def _top(filtro_col):
        rows = (
            db.query(
                VentaItem.descripcion,
                func.coalesce(func.sum(VentaItem.cantidad), 0),
                func.coalesce(func.sum(VentaItem.cantidad * VentaItem.precio_unitario), 0),
            )
            .join(Venta, VentaItem.venta_id == Venta.id)
            .filter(
                Venta.fecha >= ini, Venta.fecha < fin, filtro_col.isnot(None),
                Venta.anulada.is_(False),   # lo anulado no cuenta como vendido
            )
            .group_by(VentaItem.descripcion)
            .order_by(func.sum(VentaItem.cantidad).desc())
            .limit(15)
            .all()
        )
        return [{"nombre": n or "—", "cantidad": int(c), "monto": float(m)} for n, c, m in rows]

    top_productos = _top(VentaItem.producto_id)
    top_servicios = _top(VentaItem.servicio_id)

    doc_rows = (
        db.query(Usuario.nombre, func.count(HistoriaClinica.id))
        .join(HistoriaClinica, HistoriaClinica.veterinario_id == Usuario.id)
        .filter(HistoriaClinica.fecha >= ini, HistoriaClinica.fecha < fin)
        .group_by(Usuario.nombre)
        .order_by(func.count(HistoriaClinica.id).desc())
        .all()
    )
    atenciones_por_doctor = [{"doctor": n, "atenciones": int(c)} for n, c in doc_rows]

    total_ventas = (
        db.query(func.count(Venta.id))
        .filter(Venta.fecha >= ini, Venta.fecha < fin, Venta.anulada.is_(False))
        .scalar()
    )
    ingreso_total = (
        db.query(func.coalesce(func.sum(Venta.total), 0))
        .filter(Venta.fecha >= ini, Venta.fecha < fin, Venta.anulada.is_(False))
        .scalar()
    )

    return {
        "desde": d_desde.isoformat(),
        "hasta": d_hasta.isoformat(),
        "total_ventas": int(total_ventas),
        "ingreso_total": float(ingreso_total),
        "top_productos": top_productos,
        "top_servicios": top_servicios,
        "atenciones_por_doctor": atenciones_por_doctor,
    }


@router.get("/vacunas")
def vacunas(db: Session = Depends(get_db)):
    """Consolidado de vacunación por paciente: última de cada vacuna, con su
    próxima dosis y estado (vencida / próxima / programada)."""
    hoy = date.today()
    pronto = hoy + timedelta(days=30)
    historias = (
        db.query(HistoriaClinica)
        .options(joinedload(HistoriaClinica.paciente).joinedload(Paciente.cliente))
        .filter(HistoriaClinica.vacunas_items.isnot(None))
        .order_by(HistoriaClinica.fecha.desc())
        .limit(5000)  # tope defensivo; ya se ordena por fecha desc (las más recientes primero)
        .all()
    )
    avisadas = _avisos_existentes(db)
    out: list[dict] = []
    vistos: set[tuple[int, str]] = set()
    for h in historias:
        for item in (h.vacunas_items or []):
            nombre = (item.get("vacuna") or "").strip()
            if not nombre:
                continue
            clave = (h.paciente_id, nombre.lower())
            if clave in vistos:
                continue
            vistos.add(clave)
            prox = item.get("proxima_dosis")
            fprox = _parse_fecha_libre(prox)
            estado = None
            if fprox:
                if fprox < hoy:
                    estado = "vencida"
                elif fprox <= pronto:
                    estado = "proxima"
                else:
                    estado = "programada"
            pac = h.paciente
            out.append({
                "paciente_id": h.paciente_id,
                "paciente": pac.nombre if pac else None,
                "especie": pac.especie if pac else None,
                "cliente_id": pac.cliente_id if pac else None,
                "propietario": pac.cliente.nombre if pac and pac.cliente else None,
                "telefono": pac.cliente.telefono if pac and pac.cliente else None,
                "vacuna": nombre,
                "fecha_aplicada": h.fecha.isoformat() if h.fecha else None,
                "proxima_dosis": prox,
                "fecha_proxima": fprox.isoformat() if fprox else None,
                "estado": estado,
                "avisado": bool(prox) and (h.paciente_id, nombre.lower(), prox) in avisadas,
            })
    orden = {"vencida": 0, "proxima": 1, "programada": 2, None: 3}
    out.sort(key=lambda v: (orden.get(v["estado"], 3), v["fecha_proxima"] or "9999-99-99"))
    return out


class VacunaAvisoRequest(BaseModel):
    paciente_id: int
    vacuna: str
    proxima_dosis: str


@router.post("/vacunas/avisar", status_code=201)
def marcar_vacuna_avisada(
    payload: VacunaAvisoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_actual),
):
    """Registra que ya se contactó al dueño por esta vacuna pendiente, para que
    deje de aparecer en el panel de recordatorios de la portada."""
    if not db.get(Paciente, payload.paciente_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    aviso = VacunaAvisada(
        paciente_id=payload.paciente_id,
        vacuna=payload.vacuna.strip(),
        proxima_dosis=payload.proxima_dosis,
        avisado_por=usuario.usuario if usuario else None,
    )
    db.add(aviso)
    try:
        db.commit()
    except IntegrityError:
        # Ya estaba marcado (doble clic, dos pestañas): no es un error real.
        db.rollback()
    return {"ok": True}


@router.delete("/vacunas/avisar", status_code=204)
def deshacer_vacuna_avisada(
    paciente_id: int = Query(...),
    vacuna: str = Query(...),
    proxima_dosis: str = Query(...),
    db: Session = Depends(get_db),
):
    """Deshace el aviso, por si se marcó por error."""
    db.query(VacunaAvisada).filter(
        VacunaAvisada.paciente_id == paciente_id,
        VacunaAvisada.vacuna == vacuna.strip(),
        VacunaAvisada.proxima_dosis == proxima_dosis,
    ).delete()
    db.commit()
