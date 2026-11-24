"""Banco de casos con respuesta conocida (gold standard) para medir la extracción de la IA.

Los casos vienen de fallos reportados por los veterinarios de la clínica: dosis mal
leídas, vacunas que caen en tratamientos y medicamentos repetidos cuando el doctor se
corrige a mitad del dictado. Cada caso dice qué DEBE salir; `comprobar` devuelve qué
salió mal. Lo usan el script `scripts/evaluar_extraccion_ia.py` y la pantalla de
Mediciones (que guarda cada corrida con fecha y modelo para poder compararlas).

Para agregar un caso: sumar un dict a CASOS_HISTORIA o CASOS_RECETA con `nombre`,
`texto` y `espera`. No hace falta tocar nada más.
"""
import time

from core.config import settings

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
    {
        # El veterinario dicta la marca y la transcripción la parte en trozos.
        # Sin el catálogo de la clínica en el prompt, "melo si vet" se copiaba
        # tal cual a la receta y nadie sabía qué medicamento era.
        #
        # Se salta si el inventario no tiene medicamentos cargados: sin
        # catálogo no hay nada contra qué reconocer.
        "nombre": "reconoce una marca del inventario mal transcrita",
        "texto": "Le doy melo si vet un cuarto de tableta cada 24 horas por 5 días.",
        "necesita_catalogo": True,
        "espera": {
            "items": [{"medicamento_contiene": "meloxivet",
                       "frecuencia_contiene": "24"}],
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

comprobar = _comprobar


def ic95_wilson(aciertos: int, n: int) -> tuple[float | None, float | None]:
    """Intervalo de confianza 95 % de una proporción (Wilson): sirve con pocos casos."""
    if n <= 0:
        return None, None
    z = 1.96
    p = aciertos / n
    denom = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / denom
    margen = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
    return max(0.0, centro - margen), min(1.0, centro + margen)


def casos_de(tipo: str) -> list[tuple[str, dict]]:
    """Lista (tipo, caso) según 'historia', 'receta' o 'todos'."""
    out: list[tuple[str, dict]] = []
    if tipo in ("historia", "todos"):
        out += [("historia", c) for c in CASOS_HISTORIA]
    if tipo in ("receta", "todos"):
        out += [("receta", c) for c in CASOS_RECETA]
    return out


def correr_banco(db, tipo: str = "todos", hay_catalogo: bool | None = None) -> dict:
    """Pasa cada caso por la IA y compara con lo esperado.

    Devuelve el resumen listo para guardar en `corridas_evaluacion`. Cuesta una
    llamada a OpenAI por caso (unos centavos en total). Si se llega al tope diario de
    gasto, para y deja el resto como no evaluado.
    """
    from services import historia_extractor, receta_extractor, uso_ia
    from services.vocabulario import catalogo_medicamentos

    if hay_catalogo is None:
        try:
            hay_catalogo = bool(catalogo_medicamentos(db))
        except Exception:
            hay_catalogo = False

    detalle: list[dict] = []
    ok = saltados = 0
    gasto_antes = uso_ia.gasto_hoy(db)
    for t, caso in casos_de(tipo):
        base = {"tipo": t, "nombre": caso["nombre"]}
        if caso.get("necesita_catalogo") and not hay_catalogo:
            detalle.append({**base, "estado": "saltado", "fallos": ["inventario sin medicamentos"]})
            saltados += 1
            continue
        try:
            uso_ia.exigir_cupo(db)
        except uso_ia.TopeGastoExcedido as exc:
            detalle.append({**base, "estado": "saltado", "fallos": [str(exc)]})
            saltados += 1
            continue
        t0 = time.perf_counter()
        try:
            if t == "historia":
                datos = historia_extractor.extraer_historia(caso["texto"], db=db, operacion="evaluacion")["datos"]
            else:
                datos = receta_extractor.extraer_receta(caso["texto"], db=db, operacion="evaluacion")
        except Exception as exc:
            detalle.append({**base, "estado": "error", "fallos": [str(exc)[:200]],
                            "ms": round((time.perf_counter() - t0) * 1000)})
            continue
        ms = round((time.perf_counter() - t0) * 1000)
        fallos = _comprobar(datos, caso["espera"])
        if not fallos:
            ok += 1
        detalle.append({**base, "estado": "ok" if not fallos else "falla", "fallos": fallos, "ms": ms})

    evaluados = sum(1 for d in detalle if d["estado"] in ("ok", "falla", "error"))
    inf, sup = ic95_wilson(ok, evaluados)
    tiempos = [d["ms"] for d in detalle if d.get("ms")]
    return {
        "modelo": settings.llm_model,
        "casos": evaluados,
        "correctos": ok,
        "saltados": saltados,
        "exactitud": round(ok / evaluados, 4) if evaluados else None,
        "ic95_inf": round(inf, 4) if inf is not None else None,
        "ic95_sup": round(sup, 4) if sup is not None else None,
        "latencia_media_ms": round(sum(tiempos) / len(tiempos)) if tiempos else None,
        "costo_usd": round(uso_ia.gasto_hoy(db) - gasto_antes, 5),
        "detalle": detalle,
    }
