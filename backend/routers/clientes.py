from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload, selectinload

from core.deps import solo_admin, usuario_actual
from database import get_db
from models import (
    Cliente, DocumentoPaciente, Etiqueta, HistoriaClinica, Paciente,
    Receta, RegistroClinico, Tratamiento, Usuario, Venta,
)
from schemas import (
    ClienteCreate, ClienteEtiquetasIn, ClienteOut,
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


def _filtrar(query, q: Optional[str], etiqueta_id: Optional[list[int]]):
    """Mismo filtro para el listado y el contador: si no, la paginación no cuadra."""
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Cliente.nombre.ilike(like),
            Cliente.dni.ilike(like),
            Cliente.pacientes.any(Paciente.nombre.ilike(like)),
        ))
    if etiqueta_id:
        # Con varias etiquetas basta con tener alguna de ellas
        query = query.filter(Cliente.etiquetas.any(Etiqueta.id.in_(etiqueta_id)))
    return query


@router.get("/", response_model=list[ClienteOut])
def listar_clientes(
    q: Optional[str] = Query(None, description="Busca por nombre/DNI del dueño o nombre de mascota"),
    etiqueta_id: Optional[list[int]] = Query(None, description="Solo clientes con alguna de estas etiquetas"),
    skip: int = 0,
    limit: int = Query(300, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(Cliente).options(joinedload(Cliente.pacientes), selectinload(Cliente.etiquetas))
    query = _filtrar(query, q, etiqueta_id)
    return query.order_by(Cliente.nombre).offset(skip).limit(limit).all()


@router.get("/contar")
def contar_clientes(
    q: Optional[str] = Query(None),
    etiqueta_id: Optional[list[int]] = Query(None),
    db: Session = Depends(get_db),
):
    """Total de clientes (con filtro opcional), para la paginación."""
    return {"total": _filtrar(db.query(func.count(Cliente.id)), q, etiqueta_id).scalar()}


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


def _que_impide_borrar(db: Session, cliente_id: int) -> list[str]:
    """Lo que el cliente tiene guardado y se perdería al borrarlo."""
    ids_pac = db.query(Paciente.id).filter(Paciente.cliente_id == cliente_id).subquery()
    cuentas = [
        ("historias clínicas", db.query(HistoriaClinica.id).filter(HistoriaClinica.paciente_id.in_(ids_pac))),
        ("recetas", db.query(Receta.id).filter(Receta.paciente_id.in_(ids_pac))),
        ("registros clínicos", db.query(RegistroClinico.id).filter(RegistroClinico.paciente_id.in_(ids_pac))),
        ("tratamientos", db.query(Tratamiento.id).filter(Tratamiento.paciente_id.in_(ids_pac))),
        ("documentos", db.query(DocumentoPaciente.id).filter(DocumentoPaciente.paciente_id.in_(ids_pac))),
        ("ventas", db.query(Venta.id).filter(Venta.cliente_id == cliente_id)),
    ]
    return [nombre for nombre, q in cuentas if q.first() is not None]


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(solo_admin)])
def eliminar_cliente(cliente_id: int, request: Request, db: Session = Depends(get_db)):
    """Solo recepción, y solo si el cliente no tiene datos clínicos ni ventas.

    Borrar un cliente borra también a sus mascotas (cascade). Si tiene historias,
    recetas, documentos o ventas se rechaza con 409: esos datos no se recuperan.
    """
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    tiene = _que_impide_borrar(db, cliente_id)
    if tiene:
        raise HTTPException(
            status_code=409,
            detail=(
                "No se puede eliminar al cliente porque tiene " + ", ".join(tiene)
                + ". Se conserva para no perder datos clínicos."
            ),
        )
    request.state.actividad_detalle = cliente.nombre
    db.delete(cliente)
    db.commit()


# ── Etiquetas de un cliente ───────────────────────────────────────────────────

def _cliente_o_404(db: Session, cliente_id: int) -> Cliente:
    cliente = db.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


def _etiqueta_o_404(db: Session, etiqueta_id: int) -> Etiqueta:
    etiqueta = db.get(Etiqueta, etiqueta_id)
    if not etiqueta:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")
    return etiqueta


@router.put("/{cliente_id}/etiquetas", response_model=ClienteOut)
def fijar_etiquetas(cliente_id: int, payload: ClienteEtiquetasIn, db: Session = Depends(get_db)):
    """Deja al cliente con exactamente estas etiquetas (las demás se le quitan)."""
    cliente = _cliente_o_404(db, cliente_id)
    ids = set(payload.etiqueta_ids)
    nuevas = db.query(Etiqueta).filter(Etiqueta.id.in_(ids)).all() if ids else []
    if len(nuevas) != len(ids):
        raise HTTPException(status_code=404, detail="Alguna etiqueta no existe")
    cliente.etiquetas = nuevas
    db.commit()
    db.refresh(cliente)
    return cliente


@router.post("/{cliente_id}/etiquetas/{etiqueta_id}", response_model=ClienteOut)
def agregar_etiqueta(cliente_id: int, etiqueta_id: int, db: Session = Depends(get_db)):
    cliente = _cliente_o_404(db, cliente_id)
    etiqueta = _etiqueta_o_404(db, etiqueta_id)
    if etiqueta not in cliente.etiquetas:
        cliente.etiquetas.append(etiqueta)
        db.commit()
        db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}/etiquetas/{etiqueta_id}", response_model=ClienteOut)
def quitar_etiqueta(cliente_id: int, etiqueta_id: int, db: Session = Depends(get_db)):
    cliente = _cliente_o_404(db, cliente_id)
    etiqueta = _etiqueta_o_404(db, etiqueta_id)
    if etiqueta in cliente.etiquetas:
        cliente.etiquetas.remove(etiqueta)
        db.commit()
        db.refresh(cliente)
    return cliente


# ── Pacientes de un cliente ───────────────────────────────────────────────────

@router.post(
    "/{cliente_id}/pacientes/",
    response_model=PacienteOut,
    status_code=status.HTTP_201_CREATED,
)
def agregar_paciente(
    cliente_id: int, payload: PacienteCreate, db: Session = Depends(get_db),
    usuario: Usuario | None = Depends(usuario_actual),
):
    if not db.get(Cliente, cliente_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    paciente = Paciente(
        **payload.model_dump(), cliente_id=cliente_id,
        registrado_por=usuario.nombre if usuario else None,
    )
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
