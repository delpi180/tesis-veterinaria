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


# ── Casos de historia clínica ────────────────────────────────────────────────
# `espera` describe qué comprobar. Para listas se comprueba por medicamento.

CASOS_HISTORIA = [
    {
        "nombre": "dosis en mg con número hablado",
        "texto": (
            "Paciente canino de cuatro años, viene por vómitos desde hace dos días. "
            "Temperatura treinta y nueve punto dos, peso ocho kilos. "
            "Le mando amoxicilina cuatro miligramos por kilo cada doce horas por siete días."
        ),
        "espera": {
            "temperatura_c": 39.2,
            "peso_kg": 8,
            "tratamiento_items": [
                {"medicamento_contiene": "amoxicilina", "dosis_contiene": "4"},
            ],
        },
    },
    {
        "nombre": "dosis en cifras (el vet dicta números, no palabras)",
        "texto": (
            "Perro mestizo, control. Peso 12 kilos, temperatura 38.5. "
            "Meloxicam 0.1 mg por kilo cada 24 horas por 3 días. "
            "Además omeprazol 4 mg vía oral en ayunas."
        ),
        "espera": {
            "peso_kg": 12,
            "temperatura_c": 38.5,
            "tratamiento_items": [
                {"medicamento_contiene": "meloxicam", "dosis_contiene": "0.1"},
                {"medicamento_contiene": "omeprazol", "dosis_contiene": "4"},
            ],
        },
    },
    {
        "nombre": "vacuna NO debe caer en tratamientos",
        "texto": (
            "Cachorro de tres meses, viene para vacunación. Está alerta, mucosas rosadas. "
            "Le aplico la quíntuple, lote A four five two. Próxima dosis en veintiún días."
        ),
        "espera": {
            "tipo_consulta": "vacunacion",
            "vacunas_items": [{"vacuna_contiene": "quintuple"}],
            "tratamiento_items_vacio": True,
        },
    },
    {
        "nombre": "vacuna y tratamiento en el mismo dictado",
        "texto": (
            "Gato de dos años. Le pongo la triple felina, próxima dosis en un año. "
            "Y por la otitis le doy enrofloxacina 5 mg por kilo cada 24 horas por 10 días."
        ),
        "espera": {
            "vacunas_items": [{"vacuna_contiene": "triple"}],
            "tratamiento_items": [
                {"medicamento_contiene": "enrofloxacina", "dosis_contiene": "5"},
            ],
        },
    },
    {
        "nombre": "el veterinario se corrige a mitad del dictado",
        "texto": (
            "Le doy metronidazol 15 mg por kilo cada 12 horas... "
            "no, perdón, mejor cada 8 horas, metronidazol 15 mg por kilo cada 8 horas por 5 días."
        ),
        "espera": {
            "tratamiento_items": [
                {"medicamento_contiene": "metronidazol", "frecuencia_contiene": "8"},
            ],
            "tratamiento_items_exactamente": 1,
        },
    },
    {
        "nombre": "antiparasitario NO es vacuna, aunque se apliquen juntos",
        "texto": (
            "Control de rutina. Le puse la antirrábica y le administré praziquantel "
            "5 mg por kilo vía oral dosis única."
        ),
        "espera": {
            "vacunas_items": [{"vacuna_contiene": "antirrabica"}],
            "tratamiento_items": [
                {"medicamento_contiene": "praziquantel", "dosis_contiene": "5"},
            ],
            "tratamiento_items_exactamente": 1,
        },
    },
    {
        "nombre": "dos pautas del mismo fármaco NO se colapsan",
        "texto": (
            "Fenobarbital 5 mg por kilo dosis de carga hoy, después fenobarbital "
            "2.5 mg por kilo cada 12 horas de forma permanente."
        ),
        "espera": {"tratamiento_items_exactamente": 2},
    },
    {
        "nombre": "números seguidos que se pueden confundir entre sí",
        "texto": (
            "Frecuencia cardíaca 120, frecuencia respiratoria 24, temperatura 39, "
            "peso 4 kilos. Condición corporal 5 de 9."
        ),
        "espera": {
            "frecuencia_cardiaca": 120,
            "frecuencia_respiratoria": 24,
            "temperatura_c": 39,
            "peso_kg": 4,
            "condicion_corporal": 5,
        },
    },
]


# ── Casos de receta ──────────────────────────────────────────────────────────

CASOS_RECETA = [
    {
        "nombre": "dosis en mg, tres medicamentos",
        "texto": (
            "Para gastroenteritis leve: amoxicilina 4 mg por kilo cada 12 horas por 7 días, "
            "metronidazol 15 mg por kilo cada 12 horas por 5 días, "
            "y maropitant 1 mg por kilo subcutáneo dosis única. "
            "Dieta blanda por tres días y control en una semana."
        ),
        "espera": {
            "items": [
                {"medicamento_contiene": "amoxicilina", "dosis_contiene": "4"},
                {"medicamento_contiene": "metronidazol", "dosis_contiene": "15"},
                {"medicamento_contiene": "maropitant", "dosis_contiene": "1"},
            ],
            "items_exactamente": 3,
        },
    },
    {
        "nombre": "números hablados en palabras",
        "texto": (
            "Meloxicam cero punto uno miligramos por kilo cada veinticuatro horas por cuatro días, "
            "vía oral. Y gabapentina diez miligramos por kilo cada ocho horas."
        ),
        "espera": {
            "items": [
                {"medicamento_contiene": "meloxicam", "dosis_contiene": "0.1"},
                {"medicamento_contiene": "gabapentina", "dosis_contiene": "10"},
            ],
        },
    },
    {
        "nombre": "corrección del veterinario, no debe duplicar",
        "texto": (
            "Cefalexina 20 mg por kilo cada 12 horas. Ah no, cefalexina 30 mg por kilo "
            "cada 12 horas por 10 días."
        ),
        "espera": {
            "items": [{"medicamento_contiene": "cefalexina", "dosis_contiene": "30"}],
            "items_exactamente": 1,
        },
    },
    {
        "nombre": "dos pautas del mismo fármaco NO se colapsan (receta)",
        "texto": (
            "Enrofloxacina inyectable 5 mg por kilo hoy, y luego enrofloxacina "
            "tabletas 5 mg por kilo cada 24 horas por 7 días."
        ),
        "espera": {"items_exactamente": 2},
    },
    {
        "nombre": "la vía es la ruta, no la presentación",
        "texto": "Amoxicilina en jarabe 4 mg por kilo vía oral cada 12 horas por 7 días.",
        "espera": {
            "items": [{"medicamento_contiene": "amoxicilina",
                       "dosis_contiene": "4", "via_contiene": "oral"}],
        },
    },
    {
        "nombre": "las indicaciones no deben mezclarse con las dosis",
        "texto": (
            "Prednisona 0.5 mg por kilo cada 24 horas por 5 días. "
            "Que no se moje, reposo, y si vomita más de dos veces que vuelva."
        ),
        "espera": {
            "items": [{"medicamento_contiene": "prednisona", "dosis_contiene": "0.5"}],
            "indicaciones_no_contiene": "0.5",
        },
    },
]


# ── Comprobación ─────────────────────────────────────────────────────────────

def _norm(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return s.lower()


def _revisar_lista(obtenidos, esperados, clave_nombre, fallos, etiqueta):
    for esp in esperados:
        nombre = esp[f"{clave_nombre}_contiene"]
        match = next(
            (o for o in obtenidos if nombre in _norm(o.get(clave_nombre))), None
        )
        if not match:
            fallos.append(f"{etiqueta}: falta '{nombre}' (salió: "
                          f"{[o.get(clave_nombre) for o in obtenidos]})")
            continue
        for campo in ("dosis", "frecuencia", "duracion", "via"):
            req = esp.get(f"{campo}_contiene")
            if req and req not in _norm(match.get(campo)):
                fallos.append(
                    f"{etiqueta}: '{nombre}' → {campo} esperaba contener '{req}', "
                    f"salió '{match.get(campo)}'"
                )


def _comprobar(datos, espera):
    fallos = []
    for campo, valor in espera.items():
        if campo.endswith("_contiene") or campo.endswith("_exactamente") \
                or campo.endswith("_vacio") or campo.endswith("_no_contiene"):
            continue
        if campo in ("tratamiento_items", "vacunas_items", "items"):
            continue
        obtenido = datos.get(campo)
        if isinstance(valor, (int, float)) and obtenido is not None:
            if abs(float(obtenido) - float(valor)) > 0.001:
                fallos.append(f"{campo}: esperaba {valor}, salió {obtenido}")
        elif obtenido != valor:
            fallos.append(f"{campo}: esperaba {valor!r}, salió {obtenido!r}")

    if "tratamiento_items" in espera:
        _revisar_lista(datos.get("tratamiento_items") or [], espera["tratamiento_items"],
                       "medicamento", fallos, "tratamiento")
    if "vacunas_items" in espera:
        _revisar_lista(datos.get("vacunas_items") or [], espera["vacunas_items"],
                       "vacuna", fallos, "vacuna")
    if "items" in espera:
        _revisar_lista(datos.get("items") or [], espera["items"],
                       "medicamento", fallos, "receta")

    if espera.get("tratamiento_items_vacio"):
        tx = [t for t in (datos.get("tratamiento_items") or []) if t.get("medicamento")]
        if tx:
            fallos.append(f"tratamientos: debía quedar vacío, salió "
                          f"{[t.get('medicamento') for t in tx]}")
    for clave, campo in (("tratamiento_items_exactamente", "tratamiento_items"),
                         ("items_exactamente", "items")):
        if clave in espera:
            n = len([x for x in (datos.get(campo) or [])
                     if x.get("medicamento")])
            if n != espera[clave]:
                fallos.append(f"{campo}: esperaba {espera[clave]} entrada(s), salieron {n}")
    if "indicaciones_no_contiene" in espera:
        req = espera["indicaciones_no_contiene"]
        if req in _norm(datos.get("indicaciones")):
            fallos.append(f"indicaciones: no debía contener '{req}', "
                          f"salió '{datos.get('indicaciones')}'")
    return fallos


def _correr(titulo, casos, extraer, sacar_datos):
    print(f"\n{'='*70}\n{titulo}\n{'='*70}")
    ok = 0
    for caso in casos:
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
    print(f"\n  {ok}/{len(casos)} casos correctos")
    return ok, len(casos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--receta", action="store_true", help="solo casos de receta")
    ap.add_argument("--historia", action="store_true", help="solo casos de historia")
    ap.add_argument("--modelo", help="sobrescribe LLM_MODEL para esta corrida")
    args = ap.parse_args()

    if args.modelo:
        settings.llm_model = args.modelo
    print(f"Modelo: {settings.llm_model}")

    solo_uno = args.receta or args.historia
    ok = total = 0
    if not solo_uno or args.historia:
        a, b = _correr("HISTORIA CLÍNICA", CASOS_HISTORIA,
                       historia_extractor.extraer_historia, lambda r: r["datos"])
        ok += a; total += b
    if not solo_uno or args.receta:
        a, b = _correr("RECETA", CASOS_RECETA,
                       receta_extractor.extraer_receta, lambda r: r)
        ok += a; total += b

    print(f"\n{'='*70}\nTOTAL: {ok}/{total}\n")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
