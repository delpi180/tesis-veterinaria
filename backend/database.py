from sqlalchemy import create_engine, event, inspect as sa_inspect, select
from sqlalchemy.orm import (
    DeclarativeBase, Session, sessionmaker, with_loader_criteria,
)

from starlette.requests import Request

from core.config import settings


def _normalizar_url(url: str) -> str:
    """
    Railway (o cualquier Postgres) entrega la URL como 'postgres://' o
    'postgresql://', pero este backend usa el driver psycopg (v3), que requiere
    el esquema 'postgresql+psycopg://'.
    Si ya viene con un driver explícito (p. ej. +psycopg), se deja igual.
    """
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


# Pool de conexiones afinado para un Postgres gestionado en la nube (Railway).
#
#  - pool_pre_ping: antes de usar una conexión del pool, la prueba con un ping.
#    Es LA protección clave en la nube: el proveedor cierra conexiones ociosas
#    sin avisar, y sin esto la petición del usuario falla con
#    "server closed the connection unexpectedly". Con el ping, SQLAlchemy
#    descarta la conexión muerta y abre otra sin que el usuario lo note.
#  - pool_recycle: renueva conexiones que llevan más de 5 min abiertas, antes
#    de que el proveedor las corte por su cuenta.
#  - pool_size/max_overflow: 10 + 20 = hasta 30 conexiones simultáneas. El
#    default de SQLAlchemy (5 + 10 = 15) era la causa del agotamiento del pool
#    detectado en la prueba de concurrencia con 30 usuarios.
#  - pool_timeout: si el pool está lleno, esperar 10 s y fallar rápido en vez
#    de dejar al usuario colgado 30 s (el default).
engine = create_engine(
    _normalizar_url(settings.database_url),
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,
    max_overflow=20,
    pool_timeout=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── Aislamiento entre clínicas ───────────────────────────────────────────────
#
# Este SaaS guarda a todas las clínicas en la misma base de datos. Lo que las
# separa es el `clinica_id` de cada fila, y lo que impide mezclarlas es esta
# sección, no la disciplina de quien escribe cada consulta:
#
#   · LEER  — toda consulta ORM sobre una tabla con TenantMixin se filtra sola
#             por la clínica de la sesión. Un `db.query(Cliente)` en cualquier
#             router, sin que nadie escriba el filtro, solo devuelve los de la
#             clínica de quien hace la petición.
#   · ESCRIBIR — toda fila nueva queda con la clínica de la sesión, y si algo
#             intenta guardarla en otra se rechaza.
#   · ENLAZAR — una fila no puede apuntar a un registro de otra clínica (una
#             cita con la mascota de otra veterinaria): se verifica al guardar,
#             porque la clave foránea de la base de datos no lo impide.
#
# La clínica vive en `session.info["clinica_id"]`. La pone `get_db` para las
# peticiones autenticadas. Una sesión SIN clínica no se filtra: es la sesión
# de sistema (arranque, scripts, inicio de sesión) y por eso se abre solo a
# propósito, con `SessionLocal()`, nunca desde una petición.


class ReferenciaInvalida(Exception):
    """Se intentó enlazar un registro con otro que no es de la misma clínica."""


@event.listens_for(Session, "do_orm_execute")
def _filtrar_por_clinica(estado):
    clinica_id = estado.session.info.get("clinica_id")
    if clinica_id is None:
        return
    if estado.is_select or estado.is_update or estado.is_delete:
        from models import TenantMixin   # import tardío: models importa este módulo
        estado.statement = estado.statement.options(
            with_loader_criteria(
                TenantMixin,
                lambda cls: cls.clinica_id == clinica_id,
                include_aliases=True,
            )
        )


_CLASE_POR_TABLA: dict | None = None


def _clases_de_clinica() -> dict:
    """tabla → clase, solo de las tablas que pertenecen a una clínica."""
    global _CLASE_POR_TABLA
    if _CLASE_POR_TABLA is None:
        from models import TenantMixin
        _CLASE_POR_TABLA = {
            m.class_.__table__.name: m.class_
            for m in Base.registry.mappers
            if issubclass(m.class_, TenantMixin)
        }
    return _CLASE_POR_TABLA


def _verificar_referencias(session: Session, clinica_id: int) -> None:
    clases = _clases_de_clinica()
    pendientes: dict[type, set] = {}
    objetos = list(session.new) + [o for o in session.dirty if session.is_modified(o)]
    for obj in objetos:
        estado = sa_inspect(obj)
        for attr in estado.mapper.column_attrs:
            columna = attr.columns[0]
            if columna.key == "clinica_id" or not columna.foreign_keys:
                continue
            valor = getattr(obj, attr.key)
            if valor is None:
                continue
            if obj not in session.new and not estado.attrs[attr.key].history.has_changes():
                continue
            for fk in columna.foreign_keys:
                destino = clases.get(fk.column.table.name)
                if destino is not None:
                    pendientes.setdefault(destino, set()).add((fk.column.key, valor))
    for destino, pares in pendientes.items():
        for clave in {c for c, _ in pares}:
            ids = {v for c, v in pares if c == clave}
            columna = getattr(destino, clave)
            existen = set(session.execute(select(columna).where(columna.in_(ids))).scalars())
            if ids - existen:
                raise ReferenciaInvalida(
                    f"Se referencia un registro de {destino.__tablename__} "
                    f"que no existe en esta clínica."
                )


@event.listens_for(Session, "before_flush")
def _asignar_clinica(session, contexto, instancias):
    clinica_id = session.info.get("clinica_id")
    if clinica_id is None:
        return
    from models import TenantMixin
    for obj in session.new:
        if isinstance(obj, TenantMixin):
            if obj.clinica_id is None:
                obj.clinica_id = clinica_id
            elif obj.clinica_id != clinica_id:
                raise ReferenciaInvalida("No se puede guardar un registro en otra clínica.")
    _verificar_referencias(session, clinica_id)


def nueva_sesion(clinica_id: int | None = None) -> Session:
    """Sesión para código que corre fuera de una petición (tareas, IA en hilo).

    Con `clinica_id` queda acotada a esa clínica, igual que la de una petición.
    """
    db = SessionLocal()
    if clinica_id is not None:
        db.info["clinica_id"] = clinica_id
    return db


def get_db(request: Request):
    """Sesión de una petición, acotada a la clínica de quien la hace."""
    db = SessionLocal()
    clinica_id = getattr(request.state, "clinica_id", None)
    if clinica_id is not None:
        db.info["clinica_id"] = clinica_id
    try:
        yield db
    finally:
        db.close()
