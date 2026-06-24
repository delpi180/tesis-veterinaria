from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Cliente, Paciente
from schemas import (
    ClienteCreate, ClienteOut,
    PacienteCreate, PacienteOut, PacienteSummary,
)

router = APIRouter(prefix="/api/clientes", tags=["Clientes"])


# ── Clientes ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(payload: ClienteCreate, db: Session = Depends(get_db)):
    if payload.dni and db.query(Cliente).filter(Cliente.dni == payload.dni).first():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un cliente registrado con el DNI {payload.dni}",
        )
    cliente = Cliente(**payload.model_dump())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.get("/", response_model=list[ClienteOut])
def listar_clientes(
    q: Optional[str] = Query(None, description="Busca por nombre o DNI"),
    skip: int = 0,
    limit: int = Query(300, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(Cliente).options(joinedload(Cliente.pacientes))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Cliente.nombre.ilike(like), Cliente.dni.ilike(like)))
    return query.order_by(Cliente.nombre).offset(skip).limit(limit).all()


@router.get("/contar")
def contar_clientes(q: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Total de clientes (con filtro opcional), para la paginación."""
    query = db.query(func.count(Cliente.id))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Cliente.nombre.ilike(like), Cliente.dni.ilike(like)))
    return {"total": query.scalar()}


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


@router.put("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int, payload: ClienteCreate, db: Session = Depends(get_db)
):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(cliente, campo, valor)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    db.delete(cliente)
    db.commit()


# ── Pacientes de un cliente ───────────────────────────────────────────────────

@router.post(
    "/{cliente_id}/pacientes/",
    response_model=PacienteOut,
    status_code=status.HTTP_201_CREATED,
)
def agregar_paciente(
    cliente_id: int, payload: PacienteCreate, db: Session = Depends(get_db)
):
    if not db.get(Cliente, cliente_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    paciente = Paciente(**payload.model_dump(), cliente_id=cliente_id)
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


@router.get("/{cliente_id}/pacientes/", response_model=list[PacienteSummary])
def listar_pacientes(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        return []
    return cliente.pacientes
