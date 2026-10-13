"""Crea una cuenta de operador del SaaS.

    cd backend
    python -m scripts.crear_operador <usuario> [--nombre "Nombre Apellido"]

La contraseña se pide por teclado (no queda en el historial de la terminal).
Mínimo 12 caracteres. El operador entra por la pantalla de acceso normal y
llega a su propio panel; no ve datos de ninguna clínica.
"""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal               # noqa: E402
from services.plataforma import crear_operador  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("usuario")
    ap.add_argument("--nombre")
    args = ap.parse_args()

    clave = getpass.getpass("Contraseña (mín. 12 caracteres): ")
    if clave != getpass.getpass("Repítela: "):
        print("Las contraseñas no coinciden.")
        return 1
    db = SessionLocal()
    try:
        u = crear_operador(db, args.usuario, clave, args.nombre)
    except ValueError as e:
        print(e)
        return 1
    finally:
        db.close()
    print(f"Operador «{u.usuario}» creado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
