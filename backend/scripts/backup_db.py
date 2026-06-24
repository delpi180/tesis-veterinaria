"""Respaldo de la base de datos con pg_dump.

Uso:
    cd backend
    venv/Scripts/python.exe scripts/backup_db.py

Requisitos:
- Tener instalado el cliente de PostgreSQL (provee `pg_dump`) y que esté en el PATH.
- DATABASE_URL definido en el .env (o en el entorno).

Genera un archivo comprimido en backend/backups/backup_YYYYMMDD_HHMMSS.dump

Para RESTAURAR ese respaldo en una base (¡reemplaza su contenido!):
    pg_restore --clean --no-owner -d "<DATABASE_URL>" backend/backups/backup_XXXX.dump
"""
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.config import settings  # noqa: E402


def _url_libpq(url: str) -> str:
    """pg_dump usa libpq (esquema postgresql://), no el driver +psycopg."""
    return (
        url.replace("postgresql+psycopg://", "postgresql://")
           .replace("postgres://", "postgresql://")
    )


def main() -> None:
    destino = Path(__file__).resolve().parents[1] / "backups"
    destino.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    archivo = destino / f"backup_{ts}.dump"
    url = _url_libpq(settings.database_url)

    print(f"[backup] Generando respaldo -> {archivo}")
    try:
        subprocess.run(["pg_dump", url, "-F", "c", "-f", str(archivo)], check=True)
    except FileNotFoundError:
        print("ERROR: no se encontró 'pg_dump'. Instala el cliente de PostgreSQL "
              "y asegúrate de que esté en el PATH.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: pg_dump terminó con código {e.returncode}.")
        sys.exit(1)

    print(f"[backup] OK. Respaldo creado: {archivo}")
    print("[backup] Para restaurar:")
    print(f'  pg_restore --clean --no-owner -d "<DATABASE_URL>" "{archivo}"')


if __name__ == "__main__":
    main()
