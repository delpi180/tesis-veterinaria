from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
