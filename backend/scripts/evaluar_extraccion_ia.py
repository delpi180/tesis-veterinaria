"""Banco de dictados con respuesta conocida, para medir la extracción por voz.

La calidad de la extracción no se puede juzgar "probando un rato": una dosis
mal leída no se nota hasta que alguien la administra. Este banco fija casos
reales de consulta con lo que DEBE salir, y reporta exactamente qué campo
salió mal. Sirve para comparar antes/después al tocar el prompt o el modelo.

Los casos vienen de fallos reportados por los veterinarios de la clínica:
números de dosis mal leídos, vacunas que aterrizan en tratamientos y
medicamentos repetidos cuando el doctor se corrige a mitad del dictado.

Uso:
    cd backend
    .venv/Scripts/python.exe scripts/evaluar_extraccion_ia.py            # historia + receta
    .venv/Scripts/python.exe scripts/evaluar_extraccion_ia.py --receta   # solo recetas
    .venv/Scripts/python.exe scripts/evaluar_extraccion_ia.py --modelo gpt-4o

Cuesta unos centavos por corrida (una llamada por caso).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from core.config import settings                       # noqa: E402
from services import historia_extractor, receta_extractor  # noqa: E402
from services.banco_evaluacion import (                # noqa: E402
    CASOS_HISTORIA, CASOS_RECETA, _comprobar,
)


def _catalogo_disponible() -> bool:
    """¿La clínica ya cargó medicamentos en el inventario?

    Algunos casos comprueban que una marca mal transcrita se reconozca contra
    el catálogo de la clínica. Sin inventario cargado no hay catálogo que
    consultar, así que esos casos se saltan en vez de reportar un fallo que
    no lo es.
    """
    try:
        from database import SessionLocal
        from services.vocabulario import catalogo_medicamentos
        db = SessionLocal()
        try:
            return bool(catalogo_medicamentos(db))
        finally:
            db.close()
    except Exception:
        return False


def _correr(titulo, casos, extraer, sacar_datos):
    print(f"\n{'='*70}\n{titulo}\n{'='*70}")
    hay_catalogo = _catalogo_disponible()
    ok = 0
    saltados = 0
    for caso in casos:
        if caso.get("necesita_catalogo") and not hay_catalogo:
            print(f"  ~ {caso['nombre']}: saltado (inventario sin medicamentos)")
            saltados += 1
            continue
        try:
            datos = sacar_datos(extraer(caso["texto"]))
        except Exception as exc:
            print(f"\n  ✗ {caso['nombre']}\n      ERROR: {exc}")
            continue
        fallos = _comprobar(datos, caso["espera"])
        if fallos:
            print(f"\n  ✗ {caso['nombre']}")
            for f in fallos:
                print(f"      · {f}")
        else:
            ok += 1
            print(f"  ✓ {caso['nombre']}")
    evaluados = len(casos) - saltados
    print(f"\n  {ok}/{evaluados} casos correctos"
          + (f" ({saltados} saltados)" if saltados else ""))
    return ok, evaluados


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--receta", action="store_true", help="solo casos de receta")
    ap.add_argument("--historia", action="store_true", help="solo casos de historia")
    ap.add_argument("--modelo", help="sobrescribe LLM_MODEL para esta corrida")
    args = ap.parse_args()

    if args.modelo:
        settings.llm_model = args.modelo
    print(f"Modelo: {settings.llm_model}")

    # Los extractores reciben la sesión para poder pasarle al modelo el
    # catálogo de medicamentos de la clínica: sin eso, la medición no
    # reflejaría lo que realmente pasa en producción.
    from database import SessionLocal
    db = SessionLocal()

    solo_uno = args.receta or args.historia
    ok = total = 0
    try:
        if not solo_uno or args.historia:
            a, b = _correr("HISTORIA CLÍNICA", CASOS_HISTORIA,
                           lambda t: historia_extractor.extraer_historia(t, db=db),
                           lambda r: r["datos"])
            ok += a; total += b
        if not solo_uno or args.receta:
            a, b = _correr("RECETA", CASOS_RECETA,
                           lambda t: receta_extractor.extraer_receta(t, db=db),
                           lambda r: r)
            ok += a; total += b
    finally:
        db.close()

    print(f"\n{'='*70}\nTOTAL: {ok}/{total}\n")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
