from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from core.config import settings


def _normalizar_url(url: str) -> str:
    """
    Render entrega la URL como 'postgres://' o 'postgresql://', pero este backend
    usa el driver psycopg (v3), que requiere el esquema 'postgresql+psycopg://'.
    Si ya viene con un driver explícito (p. ej. +psycopg), se deja igual.
    """
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


engine = create_engine(_normalizar_url(settings.database_url))

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
