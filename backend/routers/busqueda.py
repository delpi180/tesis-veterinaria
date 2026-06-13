from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Cliente, Paciente, Cita

router = APIRouter(prefix="/api/busqueda", tags=["Búsqueda"])


@router.get("/")
def busqueda_global(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    Búsqueda global: busca en clientes, pacientes y citas.
    Devuelve hasta 5 resultados por categoría.
    """
    patron = f"%{q}%"

    # ── Clientes (nombre, dni) ────────────────────────────────────────────────
    clientes_rows = (
        db.query(Cliente)
        .filter(Cliente.nombre.ilike(patron) | Cliente.dni.ilike(patron))
        .limit(5)
        .all()
    )
    clientes = [
        {
            "id": c.id,
            "nombre": c.nombre,
            "dni": c.dni,
            "telefono": c.telefono,
        }
        for c in clientes_rows
    ]

    # ── Pacientes (nombre, especie, raza) — incluye propietario ───────────────
    pacientes_rows = (
        db.query(Paciente)
        .options(joinedload(Paciente.cliente))
        .filter(
            Paciente.nombre.ilike(patron)
            | Paciente.especie.ilike(patron)
            | Paciente.raza.ilike(patron)
        )
        .limit(5)
        .all()
    )
    pacientes = [
        {
            "id": p.id,
            "nombre": p.nombre,
            "especie": p.especie,
            "raza": p.raza,
            "cliente_id": p.cliente_id,
            "propietario": p.cliente.nombre if p.cliente else None,
        }
        for p in pacientes_rows
    ]

    # ── Citas (motivo) — incluye nombre del paciente ──────────────────────────
    citas_rows = (
        db.query(Cita)
        .options(joinedload(Cita.paciente))
        .filter(Cita.motivo.ilike(patron))
        .limit(5)
        .all()
    )
    citas = [
        {
            "id": c.id,
            "fecha_hora": c.fecha_hora.isoformat() if c.fecha_hora else None,
            "motivo": c.motivo,
            "estado": c.estado,
            "paciente_id": c.paciente_id,
            "paciente": c.paciente.nombre if c.paciente else None,
        }
        for c in citas_rows
    ]

    return {"clientes": clientes, "pacientes": pacientes, "citas": citas}
