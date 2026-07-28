"""Desactiva las cuentas de prueba (QA) que quedaron activas en producción.

Durante el desarrollo se crearon usuarios de prueba con acceso completo. En una
clínica real esas cuentas son una puerta abierta: varias tienen rol de
recepcionista, es decir acceso a usuarios, ventas, caja e inventario.

NO borra nada: solo pone activo = false. Así el personal deja de poder entrar
con ellas, pero se conserva la trazabilidad (quién registró qué historia, quién
marcó qué asistencia). Borrar los usuarios dejaría esas referencias huérfanas.

Uso:
    cd backend
    .venv/Scripts/python.exe scripts/desactivar_cuentas_qa.py            # solo muestra
    .venv/Scripts/python.exe scripts/desactivar_cuentas_qa.py --ejecutar # aplica

Para reactivar una cuenta puntual: Usuarios → editar → Activo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select                      # noqa: E402
from database import SessionLocal                  # noqa: E402
from models import Usuario                         # noqa: E402

# Prefijos por los que se reconoce una cuenta de prueba. Se listan explícitos en
# vez de usar un LIKE amplio para no desactivar por accidente a alguien real
# cuyo usuario contenga "qa" (por ejemplo "aquastore" o un apellido).
PREFIJOS_QA = ("qa_",)

# Cuentas reales que NUNCA deben tocarse, aunque el patrón llegara a coincidir.
PROTEGIDAS = {"admin", "doctor", "drmarco"}


def main() -> None:
    ejecutar = "--ejecutar" in sys.argv
    db = SessionLocal()
    try:
        candidatos = [
            u for u in db.scalars(select(Usuario).order_by(Usuario.id))
            if u.usuario.lower().startswith(PREFIJOS_QA)
            and u.usuario.lower() not in PROTEGIDAS
        ]

        if not candidatos:
            print("No hay cuentas de prueba activas. Nada que hacer.")
            return

        print(f"Cuentas de prueba encontradas ({len(candidatos)}):\n")
        for u in candidatos:
            estado = "ACTIVA" if u.activo else "ya inactiva"
            print(f"  #{u.id:<4} {u.usuario:<18} {u.nombre:<26} {u.rol:<14} {estado}")

        pendientes = [u for u in candidatos if u.activo]
        print()
        if not pendientes:
            print("Todas ya estaban desactivadas. Nada que cambiar.")
            return

        if not ejecutar:
            print(f"MODO REVISIÓN: no se cambió nada. {len(pendientes)} cuenta(s) se desactivarían.")
            print("Para aplicarlo, volvé a correrlo con  --ejecutar")
            return

        for u in pendientes:
            u.activo = False
        db.commit()
        print(f"Listo: {len(pendientes)} cuenta(s) desactivada(s). No se borró ningún dato.")
        print("El acceso se corta en menos de un minuto (la sesión abierta deja de valer).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
