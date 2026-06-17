"""
Inicialización previa al arranque (usada por Render antes de levantar uvicorn).

Reconcilia el estado de Alembic con la base de datos real para evitar el error
"relation already exists" cuando la BD fue creada en su día por
Base.metadata.create_all() sin control de migraciones:

- Si la BD ya está gestionada por Alembic (existe la tabla alembic_version),
  se aplica el flujo normal: upgrade head.
- Si la BD tiene tablas pero NO está bajo control de Alembic (esquema legado
  creado por create_all), se reconstruye limpio para que coincida 100% con el
  código y queda registrado en Alembic.
- Si la BD está vacía, se aplican todas las migraciones desde cero.
"""
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from database import Base, engine
import models  # noqa: F401  (registra todos los modelos en Base.metadata)


def main() -> None:
    inspector = inspect(engine)
    tablas = set(inspector.get_table_names())
    cfg = Config("alembic.ini")

    if "alembic_version" in tablas:
        print("[prestart] BD gestionada por Alembic -> upgrade head")
        command.upgrade(cfg, "head")
    elif tablas:
        print(
            "[prestart] Esquema legado sin control de Alembic "
            f"({len(tablas)} tablas) -> reconstruyendo limpio"
        )
        Base.metadata.drop_all(bind=engine)
        command.upgrade(cfg, "head")
    else:
        print("[prestart] BD vacía -> upgrade head")
        command.upgrade(cfg, "head")

    print("[prestart] Esquema sincronizado correctamente.")


if __name__ == "__main__":
    main()
