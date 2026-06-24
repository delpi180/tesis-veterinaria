"""
Importa clientes y pacientes del sistema anterior (CSV exportado) a este sistema.

CSV esperados (delimitador ';'):
  migracion/clientes.csv  : Id, Apellido, Nombre, Numero de documento, Direccion,
                            Ciudad, Telefono, WhatsApp, Correo, Observaciones
  migracion/pacientes.csv : Id, Estado, Ficha, Nombre, Especie, Raza, Tamano,
                            Pelaje, Color, Sexo, Grupo, Esterilizado, Fecha nac,
                            Chip, Caracter, Observaciones, Id cliente, Nombre cliente

Uso:
  cd backend
  venv/Scripts/python.exe scripts/importar_legacy.py --dry-run   # solo muestra, no escribe
  venv/Scripts/python.exe scripts/importar_legacy.py             # importa de verdad

La base a la que escribe es la de DATABASE_URL del .env (apúntala a Railway para
cargar en producción).
"""
import csv
import os
import sys
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
csv.field_size_limit(10_000_000)   # algunas observaciones son muy largas

CARPETA = Path(r"C:\dev\tesis-veterinaria\migracion")

# Si existe migracion/db_url.txt, se usa esa base (p. ej. Railway) sin tocar el .env
_DBFILE = CARPETA / "db_url.txt"
if _DBFILE.exists():
    os.environ["DATABASE_URL"] = _DBFILE.read_text(encoding="utf-8").strip()
    print(f"[import] Usando la base de {_DBFILE.name} (no el .env)")
ENC = "utf-8-sig"   # el CSV exportado viene en UTF-8 con BOM
DELIM = ";"

DRY = "--dry-run" in sys.argv


def _leer(nombre):
    path = CARPETA / f"{nombre}.csv"
    with open(path, encoding=ENC, newline="") as f:
        return list(csv.DictReader(f, delimiter=DELIM))


def _limpiar_dni(s):
    s = (s or "").strip()
    digitos = "".join(c for c in s if c.isdigit())
    return digitos if 8 <= len(digitos) <= 15 else None


def _limpiar_tel(*vals):
    for v in vals:
        v = (v or "").strip()
        dig = "".join(c for c in v if c.isdigit())
        if len(dig) >= 6:
            return dig[:20]
    return None


def _nombre_cliente(row):
    ap = (row.get("Apellido") or "").strip().strip(".-").strip()
    no = (row.get("Nombre") or "").strip().strip(".-").strip()
    nombre = " ".join(p for p in [no, ap] if p)
    return nombre or None


def _sexo(s):
    s = (s or "").strip().lower()
    if s.startswith("m"): return "macho"
    if s.startswith("h"): return "hembra"
    return None


def _bool(s):
    return (s or "").strip().lower() in {"si", "sí", "true", "1", "x"}


def _fecha(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _col(row, *posibles):
    """Busca una columna por varios nombres posibles (tolerante a acentos rotos)."""
    for k in row:
        kl = k.lower()
        for p in posibles:
            if p in kl:
                return row[k]
    return ""


def main():
    clientes = _leer("clientes")
    pacientes = _leer("pacientes")
    print(f"Leídos: {len(clientes)} clientes, {len(pacientes)} pacientes\n")

    # ── Preparar clientes ────────────────────────────────────────────────────
    dnis_vistos = set()
    cli_prep = []           # (old_id, dict_cliente)
    sin_nombre = 0
    for row in clientes:
        old_id = (row.get("Id") or "").strip()
        nombre = _nombre_cliente(row)
        if not nombre:
            sin_nombre += 1
            continue
        dni = _limpiar_dni(_col(row, "documento"))
        if dni and dni in dnis_vistos:
            dni = None   # evita choque de DNI único
        if dni:
            dnis_vistos.add(dni)
        direccion = (_col(row, "direcc") or "").strip()
        ciudad = (_col(row, "ciudad") or "").strip()
        if ciudad and ciudad.lower() not in direccion.lower():
            direccion = f"{direccion}, {ciudad}".strip(", ")
        cli_prep.append((old_id, {
            "nombre": nombre[:100],
            "dni": dni,
            "telefono": _limpiar_tel(_col(row, "teléfono", "telefono"), _col(row, "whatsapp")),
            "direccion": (direccion or None) and direccion[:200],
        }))

    # ── Preparar pacientes ───────────────────────────────────────────────────
    pac_prep = []           # (old_cliente_id, dict_paciente)
    for row in pacientes:
        nombre = (row.get("Nombre") or "").strip() or "(sin nombre)"
        fnac = _fecha(_col(row, "nacimiento"))
        edad = None
        if fnac:
            edad = max(0, (date.today() - fnac).days // 365)
        pac_prep.append(((_col(row, "id cliente") or "").strip(), {
            "nombre": nombre[:100],
            "especie": (row.get("Especie") or "").strip()[:50] or "Sin especificar",
            "raza": (row.get("Raza") or "").strip()[:100] or None,
            "color": (row.get("Color") or "").strip()[:60] or None,
            "sexo": _sexo(row.get("Sexo")),
            "esterilizado": _bool(_col(row, "esteril")),
            "fecha_nacimiento": fnac,
            "edad": edad,
            "microchip": (_col(row, "chip") or "").strip()[:50] or None,
        }))

    print(f"Clientes a importar: {len(cli_prep)}  (descartados sin nombre: {sin_nombre})")
    print(f"  con DNI: {sum(1 for _, c in cli_prep if c['dni'])}  |  con teléfono: {sum(1 for _, c in cli_prep if c['telefono'])}")
    print("  Ejemplos:")
    for _, c in cli_prep[:3]:
        print("   ", c)
    print(f"\nPacientes a importar: {len(pac_prep)}")
    print("  Ejemplos:")
    for oc, p in pac_prep[:3]:
        print("   ", {**p, "old_cliente_id": oc})

    if DRY:
        print("\n[DRY-RUN] No se escribió nada en la base. Quita --dry-run para importar.")
        return

    # ── Escribir en la base ──────────────────────────────────────────────────
    from database import SessionLocal
    from models import Cliente, Paciente
    db = SessionLocal()
    try:
        # DNIs ya existentes en la base -> evita violar el único
        existentes = {d for (d,) in db.query(Cliente.dni).filter(Cliente.dni.isnot(None)).all()}
        mapa = {}   # old_cliente_id -> nuevo Cliente.id
        for old_id, c in cli_prep:
            if c["dni"] and c["dni"] in existentes:
                c["dni"] = None
            elif c["dni"]:
                existentes.add(c["dni"])
            obj = Cliente(**c)
            db.add(obj)
            db.flush()
            if old_id:
                mapa[old_id] = obj.id
        huérfanos = 0
        for old_cli, p in pac_prep:
            cid = mapa.get(old_cli)
            if not cid:
                huérfanos += 1
                continue
            db.add(Paciente(cliente_id=cid, **p))
        db.commit()
        print(f"\n[OK] Importados {len(cli_prep)} clientes y {len(pac_prep) - huérfanos} pacientes.")
        if huérfanos:
            print(f"  ({huérfanos} pacientes sin cliente coincidente — omitidos)")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
