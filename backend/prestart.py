"""
Inicialización previa al arranque (corre antes de uvicorn, ver Procfile).

Reconcilia el estado de Alembic con la base de datos real, SIN destruir datos:

- Si la BD ya está gestionada por Alembic (existe la tabla alembic_version),
  se aplica el flujo normal: upgrade head.
- Si la BD tiene tablas pero NO está bajo control de Alembic (esquema legado
  creado por create_all), se ponen al día las tablas faltantes (create_all es
  idempotente: NUNCA borra) y se marca el esquema como actual (stamp head).
  Nota: si hubiera columnas faltantes por drift, se resuelven con una migración
  manual; jamás se borra la base automáticamente.
- Si la BD está vacía, se aplican todas las migraciones desde cero.

IMPORTANTE: este script nunca ejecuta drop_all ni borra datos en producción.
"""
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from database import Base, engine
import models  # noqa: F401  (registra todos los modelos en Base.metadata)


def _esperar_db(intentos: int = 12, espera_seg: int = 3) -> None:
    """Espera a que la base acepte conexiones antes de migrar.

    En arranques tras un deploy, el contenedor puede ganarle la carrera a la BD
    (que todavía está despertando). En vez de caerse de inmediato, reintenta:
    así un blip transitorio de red/BD no tumba el despliegue.
    """
    for i in range(1, intentos + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"[prestart] BD disponible (intento {i}/{intentos}).")
            return
        except OperationalError as e:
            print(f"[prestart] BD aún no responde (intento {i}/{intentos}): {str(e)[:120]}")
            if i == intentos:
                raise
            time.sleep(espera_seg)


def main() -> None:
    _esperar_db()
    inspector = inspect(engine)
    tablas = set(inspector.get_table_names())
    cfg = Config("alembic.ini")

    if "alembic_version" in tablas:
        print("[prestart] BD gestionada por Alembic -> upgrade head")
        command.upgrade(cfg, "head")
    elif tablas:
        # Esquema legado sin control de Alembic: NO se borra. Se agregan tablas
        # faltantes (idempotente) y se marca como actual.
        print(
            "[prestart] Esquema legado sin control de Alembic "
            f"({len(tablas)} tablas) -> create_all idempotente + stamp head"
        )
        Base.metadata.create_all(bind=engine)
        command.stamp(cfg, "head")
    else:
        print("[prestart] BD vacía -> upgrade head")
        command.upgrade(cfg, "head")

    print("[prestart] Esquema sincronizado correctamente (sin pérdida de datos).")


if __name__ == "__main__":
    main()
