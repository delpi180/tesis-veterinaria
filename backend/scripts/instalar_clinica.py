"""Deja el sistema listo para una veterinaria nueva.

Por qué existe
──────────────
Poner el sistema en otra clínica eran pasos sueltos que había que recordar:
crear la base, correr migraciones, entrar a cambiar el nombre de la clínica,
crear la primera cuenta, revisar que no quedara la contraseña de ejemplo. Si
uno se salta el último, la clínica queda con la contraseña que está escrita en
el repositorio.

Esto lo hace en un solo paso y comprueba lo que no se puede olvidar.

Uso
───
    cd backend
    .venv/Scripts/python.exe scripts/instalar_clinica.py \\
        --url "postgresql+psycopg://usuario:clave@host:puerto/base" \\
        --clinica "Veterinaria San Roque" \\
        --admin-usuario recepcion \\
        --ruc 20601234567 --direccion "Av. Grau 120" --telefono "(01) 555-0110"

La contraseña NO se pasa por parámetro: queda en el historial de la terminal.
El script la pide al vuelo, o la toma de CLINICA_ADMIN_PASSWORD si está
definida (útil para automatizar un despliegue).

Qué hace
────────
  1. Comprueba que la base responde y que está vacía (no pisa una instalación).
  2. Aplica todas las migraciones.
  3. Guarda los datos de la clínica (nombre, RUC, dirección…) que salen en las
     boletas y en la pantalla de acceso.
  4. Crea la primera cuenta de administración.
  5. Avisa de lo que falta configurar para que funcione del todo.
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

CLAVE_DE_EJEMPLO = "vetlospinos"
SECRETO_DE_EJEMPLO = "vet-los-pinos-secreto-dev"


def _normalizar_url(url: str) -> str:
    """Fuerza el driver psycopg3, que es el que trae el proyecto.

    Los proveedores (Railway, Neon, Supabase…) entregan la URL como
    `postgresql://…`, y con esa forma SQLAlchemy busca psycopg2, que no está
    instalado. La aplicación ya hace esta corrección al arrancar; el
    instalador tiene que hacerla también o falla en el primer paso con un
    "No module named 'psycopg2'" que no le dice nada a quien instala.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def _pedir_password() -> str:
    """La contraseña se pide, no se pasa por argumento.

    Un `--password` queda guardado en el historial de la terminal y en la
    lista de procesos: cualquiera con acceso a la máquina la ve.
    """
    desde_entorno = os.environ.get("CLINICA_ADMIN_PASSWORD")
    if desde_entorno:
        return desde_entorno

    while True:
        p1 = getpass.getpass("Contraseña para la cuenta de administración: ")
        if len(p1) < 8:
            print("  Muy corta: al menos 8 caracteres.")
            continue
        if p1 == CLAVE_DE_EJEMPLO:
            print("  Esa es la contraseña de ejemplo del repositorio. Elige otra.")
            continue
        p2 = getpass.getpass("Repítela: ")
        if p1 != p2:
            print("  No coinciden.")
            continue
        return p1


def instalar(args, password: str) -> int:
    url = _normalizar_url(args.url)
    os.environ["DATABASE_URL"] = url

    from sqlalchemy import create_engine, inspect, text

    # ── 1. La base responde y está vacía ────────────────────────────────────
    print("→ Comprobando la base de datos…")
    try:
        motor = create_engine(url, pool_pre_ping=True)
        with motor.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception as e:
        print(f"\nERROR: no se pudo conectar.\n  {e}")
        return 1

    tablas = set(inspect(motor).get_table_names())
    if "usuarios" in tablas and not args.forzar:
        with motor.connect() as c:
            cuantos = c.execute(text("SELECT count(*) FROM usuarios")).scalar()
        if cuantos:
            print(f"\nERROR: esta base ya tiene {cuantos} usuario(s): parece una "
                  "instalación en uso.\n"
                  "       Este script es para clínicas nuevas. Si de verdad "
                  "quieres seguir, usa --forzar\n"
                  "       (no borra nada, pero puede duplicar la configuración).")
            return 1

    # ── 2. Migraciones ──────────────────────────────────────────────────────
    from alembic import command
    from alembic.config import Config

    raiz = Path(__file__).resolve().parents[1]
    cfg = Config(str(raiz / "alembic.ini"))
    cfg.set_main_option("script_location", str(raiz / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    print("→ Aplicando migraciones…")
    command.upgrade(cfg, "head")

    # ── 3 y 4. Clínica y primera cuenta ─────────────────────────────────────
    from core.security import hash_password
    from database import SessionLocal
    from models import ConfiguracionClinica, Usuario

    db = SessionLocal()
    try:
        print("→ Guardando los datos de la clínica…")
        cfg_clinica = db.get(ConfiguracionClinica, 1)
        if cfg_clinica is None:
            cfg_clinica = ConfiguracionClinica(id=1)
            db.add(cfg_clinica)
        cfg_clinica.nombre = args.clinica
        cfg_clinica.ruc = args.ruc
        cfg_clinica.direccion = args.direccion
        cfg_clinica.telefono = args.telefono
        cfg_clinica.email = args.email
        cfg_clinica.actualizado_por = "instalación"

        print("→ Creando la cuenta de administración…")
        existente = db.query(Usuario).filter(Usuario.usuario == args.admin_usuario).first()
        if existente:
            existente.password_hash = hash_password(password)
            existente.rol = "recepcionista"
            existente.activo = True
            print(f"   (ya existía '{args.admin_usuario}': se le puso la contraseña nueva)")
        else:
            db.add(Usuario(
                usuario=args.admin_usuario,
                nombre=args.admin_nombre or "Administración",
                password_hash=hash_password(password),
                rol="recepcionista",
                activo=True,
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # ── 5. Lo que falta ─────────────────────────────────────────────────────
    print(f"\n✔ {args.clinica} quedó instalada.")
    print(f"   Acceso:  {args.admin_usuario}  (con la contraseña que acabas de poner)")

    pendientes = []
    if os.environ.get("AUTH_SECRET", SECRETO_DE_EJEMPLO) == SECRETO_DE_EJEMPLO:
        pendientes.append(
            "AUTH_SECRET sigue con el valor de ejemplo. Con ese valor, cualquiera\n"
            "     que vea el repositorio puede falsificar una sesión. Genera uno:\n"
            "       python -c \"import secrets; print(secrets.token_urlsafe(48))\"")
    if not os.environ.get("DEEPGRAM_API_KEY"):
        pendientes.append("DEEPGRAM_API_KEY sin definir: el dictado por voz no va a funcionar.")
    if not os.environ.get("OPENAI_API_KEY"):
        pendientes.append("OPENAI_API_KEY sin definir: no se llenarán las historias por IA.")
    if os.environ.get("CORS_ORIGINS", "*") == "*":
        pendientes.append("CORS_ORIGINS está en '*'. En producción, ponlo en el dominio del frontend.")

    if pendientes:
        print("\n  Falta configurar en las variables de entorno del servidor:")
        for p in pendientes:
            print(f"   • {p}")

    print("\n  Primeros pasos dentro del sistema:")
    print("   1. Servicios → cargar consulta, vacunación, baño… con sus precios")
    print("   2. Inventario → cargar los productos (habilita el dictado de marcas)")
    print("   3. Usuarios → dar de alta a los veterinarios")
    print("   4. Usuarios → Copia de tus datos: enseñarle a la dueña a descargarla")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Instala el sistema para una veterinaria nueva.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--url", required=True, help="URL de la base de datos de esa clínica")
    ap.add_argument("--clinica", required=True, help="Nombre de la veterinaria")
    ap.add_argument("--admin-usuario", default="recepcion", help="Usuario de la cuenta de administración")
    ap.add_argument("--admin-nombre", help="Nombre de la persona a cargo")
    ap.add_argument("--ruc")
    ap.add_argument("--direccion")
    ap.add_argument("--telefono")
    ap.add_argument("--email")
    ap.add_argument("--forzar", action="store_true",
                    help="seguir aunque la base ya tenga usuarios")
    args = ap.parse_args()

    print(f"\nInstalación de «{args.clinica}»\n" + "─" * 46)
    password = _pedir_password()
    return instalar(args, password)


if __name__ == "__main__":
    sys.exit(main())
