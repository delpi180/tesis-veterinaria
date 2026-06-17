import sys
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

# Agrega backend/ al path para que los imports funcionen
# sin importar desde qué directorio se ejecute alembic.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # lee DATABASE_URL desde .env
from database import Base, _normalizar_url  # misma normalización que la app
import models  # registra todos los modelos en Base.metadata

DB_URL = _normalizar_url(settings.database_url)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DB_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DB_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
