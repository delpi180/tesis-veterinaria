from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite local — el archivo veterinaria.db se crea junto a este módulo
DATABASE_URL = "sqlite:///./veterinaria.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # requerido por SQLite con FastAPI
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependencia de FastAPI: abre sesión por request y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
