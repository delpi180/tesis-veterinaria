"""Respaldo descargable de los datos de la clínica.

Railway conserva copias continuas de la base, pero eso protege contra una
falla de infraestructura, no le sirve a la dueña: no puede abrirlas, no puede
llevárselas y no puede consultarlas si un día decide dejar de usar el sistema.
Sus clientes y las historias de sus pacientes son suyos.

Esto entrega un ZIP con un CSV por tabla, legible en Excel sin necesidad de
nada más. No reemplaza al respaldo técnico (que sirve para restaurar el
sistema completo); resuelve la otra mitad: tener los datos en la mano.
"""
import csv
import io
import zipfile
from datetime import date, datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from core.deps import solo_admin
from database import get_db
from models import (
    Cliente, HistoriaClinica, Paciente, Producto, Receta, Servicio, Venta,
)

router = APIRouter(prefix="/api/respaldo", tags=["Respaldo"])


def _texto(valor) -> str:
    """Valores planos y legibles en Excel: sin 'None' ni objetos crudos."""
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "sí" if valor else "no"
    if isinstance(valor, datetime):
        return valor.strftime("%Y-%m-%d %H:%M")
    if isinstance(valor, date):
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, (list, dict)):
        # Los items de receta/tratamiento son JSON; se aplanan a algo leíble
        # en vez de volcar la sintaxis de Python en una celda.
        if isinstance(valor, list):
            return " | ".join(_texto(v) for v in valor)
        return "; ".join(f"{k}: {_texto(v)}" for k, v in valor.items() if v)
    return str(valor)


def _csv(columnas: list[str], filas) -> bytes:
    """CSV con BOM: sin él, Excel en Windows rompe los acentos."""
    buffer = io.StringIO(newline="")
    escritor = csv.writer(buffer)
    escritor.writerow(columnas)
    for fila in filas:
        escritor.writerow([_texto(c) for c in fila])
    return ("﻿" + buffer.getvalue()).encode("utf-8")


def _armar_zip(db: Session) -> bytes:
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as z:

        clientes = db.query(Cliente).order_by(Cliente.nombre).all()
        z.writestr("clientes.csv", _csv(
            ["ID", "DNI", "Nombre", "Teléfono", "Dirección"],
            [(c.id, c.dni, c.nombre, c.telefono, c.direccion) for c in clientes],
        ))

        pacientes = (db.query(Paciente)
                       .options(joinedload(Paciente.cliente))
                       .order_by(Paciente.nombre).all())
        z.writestr("mascotas.csv", _csv(
            ["ID", "Nombre", "Especie", "Raza", "Sexo", "Edad", "Fecha nacimiento",
             "Color", "Microchip", "Esterilizado", "Alergias", "Condiciones crónicas",
             "Dueño", "DNI del dueño"],
            [(p.id, p.nombre, p.especie, p.raza, p.sexo, p.edad, p.fecha_nacimiento,
              p.color, p.microchip, p.esterilizado, p.alergias, p.condiciones_cronicas,
              p.cliente.nombre if p.cliente else None,
              p.cliente.dni if p.cliente else None) for p in pacientes],
        ))

        historias = (db.query(HistoriaClinica)
                       .options(joinedload(HistoriaClinica.paciente)
                                .joinedload(Paciente.cliente))
                       .order_by(HistoriaClinica.fecha.desc()).all())
        z.writestr("historias_clinicas.csv", _csv(
            ["ID", "Fecha", "Mascota", "Dueño", "Veterinario", "Tipo de consulta",
             "Motivo", "Tiempo de evolución", "Antecedentes", "Temperatura (°C)",
             "Peso (kg)", "Frec. cardiaca", "Frec. respiratoria", "Mucosas",
             "Hidratación", "Diagnóstico presuntivo", "Diagnóstico definitivo",
             "Exámenes solicitados", "Tratamiento", "Vacunas", "Indicaciones",
             "Pronóstico", "Próxima cita"],
            [(h.id, h.fecha,
              h.paciente.nombre if h.paciente else None,
              h.paciente.cliente.nombre if h.paciente and h.paciente.cliente else None,
              h.veterinario_nombre, h.tipo_consulta, h.motivo_consulta,
              h.tiempo_evolucion, h.antecedentes, h.temperatura_c, h.peso_kg,
              h.frecuencia_cardiaca, h.frecuencia_respiratoria, h.mucosas,
              h.hidratacion, h.diagnostico_presuntivo, h.diagnostico_definitivo,
              h.examenes_solicitados, h.tratamiento_items, h.vacunas_items,
              h.indicaciones, h.pronostico, h.proxima_cita) for h in historias],
        ))

        recetas = (db.query(Receta)
                     .options(joinedload(Receta.paciente).joinedload(Paciente.cliente))
                     .order_by(Receta.fecha.desc()).all())
        z.writestr("recetas.csv", _csv(
            ["ID", "Fecha", "Mascota", "Dueño", "Veterinario", "Diagnóstico",
             "Medicamentos", "Indicaciones"],
            [(r.id, r.fecha,
              r.paciente.nombre if r.paciente else None,
              r.paciente.cliente.nombre if r.paciente and r.paciente.cliente else None,
              r.veterinario_nombre, r.diagnostico, r.items, r.indicaciones)
             for r in recetas],
        ))

        productos = db.query(Producto).order_by(Producto.nombre).all()
        z.writestr("inventario.csv", _csv(
            ["ID", "Código", "Nombre", "Categoría", "Proveedor", "Unidad",
             "Precio", "Stock", "Stock mínimo", "Vence", "Lote", "Activo"],
            [(p.id, p.codigo, p.nombre, p.categoria, p.proveedor, p.unidad,
              p.precio, p.stock, p.stock_minimo, p.fecha_vencimiento, p.lote,
              p.activo) for p in productos],
        ))

        servicios = db.query(Servicio).order_by(Servicio.nombre).all()
        z.writestr("servicios.csv", _csv(
            ["ID", "Nombre", "Descripción", "Precio", "Precio variable", "Activo"],
            [(s.id, s.nombre, s.descripcion, s.precio, s.precio_variable, s.activo)
             for s in servicios],
        ))

        ventas = (db.query(Venta)
                    .options(joinedload(Venta.cliente), joinedload(Venta.items))
                    .order_by(Venta.fecha.desc()).all())
        z.writestr("ventas.csv", _csv(
            ["Boleta", "Fecha", "Cliente", "Método de pago", "Detalle",
             "Descuento %", "Total", "Anulada", "Motivo de anulación"],
            [(f"B-{v.id:06d}", v.fecha, v.cliente_nombre, v.metodo_pago,
              " | ".join(f"{i.descripcion} x{i.cantidad}" for i in v.items),
              v.descuento_pct, v.total, v.anulada, v.motivo_anulacion)
             for v in ventas],
        ))

        z.writestr("LEEME.txt",
            "Respaldo de datos — generado el "
            f"{datetime.now().strftime('%d/%m/%Y a las %H:%M')}\n"
            "\n"
            "Cada archivo .csv se abre con Excel (o con Google Sheets).\n"
            "\n"
            "  clientes.csv .............. dueños registrados\n"
            "  mascotas.csv .............. pacientes, con su dueño\n"
            "  historias_clinicas.csv .... consultas atendidas\n"
            "  recetas.csv ............... recetas emitidas\n"
            "  inventario.csv ............ productos y stock\n"
            "  servicios.csv ............. catálogo de servicios\n"
            "  ventas.csv ................ ventas, incluidas las anuladas\n"
            "\n"
            "Esta copia es para consultar y guardar. Para restaurar el sistema\n"
            "completo tras una falla se usa el respaldo técnico de la base de\n"
            "datos, que es otra cosa y la maneja quien administra el servidor.\n"
        )

    memoria.seek(0)
    return memoria.getvalue()


@router.get("/")
def descargar_respaldo(request: Request, db: Session = Depends(get_db)):
    """ZIP con un CSV por tabla. Reservado a la administradora."""
    solo_admin(request)
    contenido = _armar_zip(db)
    nombre = f"respaldo_{date.today().strftime('%Y-%m-%d')}.zip"
    return StreamingResponse(
        io.BytesIO(contenido),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
