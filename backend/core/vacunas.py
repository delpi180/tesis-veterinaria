"""Catálogo de vacunas y antiparasitarios de la clínica.

Por qué existe
--------------
La vacuna se identificaba por el nombre tal como lo escribía quien llenaba la
historia. En la base real hay siete dosis registradas con siete nombres
distintos —entre ellos "vacuna para desparasitar" y "vacuna contra las
pulgas", que ni siquiera son vacunas—, así que la consolidación "última dosis
de cada vacuna" no agrupaba absolutamente nada: "Triple felina" y "triple" son
dos vacunas diferentes para el sistema, y la pregunta "¿está al día esta
mascota?" no tenía respuesta posible.

Acá está la lista canónica, con el intervalo hasta la dosis siguiente, que es
lo que permite proponer la próxima fecha sola en vez de pedir que alguien la
escriba (y la escriba en un formato que el recordatorio entienda).

`normalizar()` mapea lo ya guardado a su forma canónica, para que el historial
viejo se agrupe con el nuevo sin tener que tocar los datos.
"""
from typing import Optional

# especie: 'canino' | 'felino' | None (aplica a ambas)
# intervalo_dias: hasta la dosis siguiente según el uso habitual de la clínica.
CATALOGO_VACUNAS = [
    # ── Caninos ──────────────────────────────────────────────────────────────
    {"nombre": "Quíntuple canina",   "especie": "canino", "intervalo_dias": 21,
     "nota": "Cachorros: 3 dosis cada 21 días; luego refuerzo anual."},
    {"nombre": "Séxtuple canina",    "especie": "canino", "intervalo_dias": 21,
     "nota": "Cachorros: 3 dosis cada 21 días; luego refuerzo anual."},
    {"nombre": "Antirrábica",        "especie": None,     "intervalo_dias": 365,
     "nota": "Refuerzo anual."},
    {"nombre": "Tos de perrera (KC)", "especie": "canino", "intervalo_dias": 365,
     "nota": "Refuerzo anual."},
    {"nombre": "Parvovirus",         "especie": "canino", "intervalo_dias": 21},
    {"nombre": "Moquillo",           "especie": "canino", "intervalo_dias": 21},

    # ── Felinos ──────────────────────────────────────────────────────────────
    {"nombre": "Triple felina",      "especie": "felino", "intervalo_dias": 21,
     "nota": "Dos dosis cada 21 días; luego refuerzo anual."},
    {"nombre": "Leucemia felina",    "especie": "felino", "intervalo_dias": 21,
     "nota": "Dos dosis cada 21 días; luego refuerzo anual."},
]

# Escrituras que ya están en la base (o que la gente usa al dictar) y a qué
# vacuna del catálogo corresponden. Todo en minúsculas.
ALIAS = {
    "triple": "Triple felina",
    "triple felina": "Triple felina",
    "trivalente": "Triple felina",
    "antirrabica": "Antirrábica",
    "antirrábica": "Antirrábica",
    "rabia": "Antirrábica",
    "quintuple": "Quíntuple canina",
    "quíntuple": "Quíntuple canina",
    "sextuple": "Séxtuple canina",
    "séxtuple": "Séxtuple canina",
    "puppy": "Parvovirus",
    "parvo": "Parvovirus",
    "parvovirus": "Parvovirus",
    "moquillo": "Moquillo",
    "distemper": "Moquillo",
    "tos de perrera": "Tos de perrera (KC)",
    "bordetella": "Tos de perrera (KC)",
    "kc": "Tos de perrera (KC)",
    "leucemia": "Leucemia felina",
    "leucemia felina": "Leucemia felina",
}

_POR_NOMBRE = {v["nombre"].lower(): v for v in CATALOGO_VACUNAS}


def normalizar(nombre: Optional[str]) -> Optional[str]:
    """Nombre canónico de una vacuna, o el original si no está en el catálogo.

    Nunca descarta lo escrito: si la clínica usa una vacuna que no está en la
    lista, se conserva tal cual. Lo que hace es que las variantes conocidas
    dejen de contarse como vacunas distintas.
    """
    if not nombre:
        return nombre
    limpio = " ".join(nombre.strip().split())
    clave = limpio.lower()
    if clave in _POR_NOMBRE:
        return _POR_NOMBRE[clave]["nombre"]
    return ALIAS.get(clave, limpio)


def intervalo_dias(nombre: Optional[str]) -> Optional[int]:
    """Días hasta la dosis siguiente, si la vacuna está en el catálogo."""
    canonico = normalizar(nombre)
    if not canonico:
        return None
    entrada = _POR_NOMBRE.get(canonico.lower())
    return entrada["intervalo_dias"] if entrada else None


# ── Antiparasitarios ─────────────────────────────────────────────────────────
# No son vacunas, pero se siguen igual: lo que importa es cuándo toca la
# próxima. El intervalo es el de uso habitual de cada presentación.
CATALOGO_ANTIPARASITARIOS = [
    {"nombre": "Desparasitación interna", "intervalo_dias": 90,
     "nota": "Cada 3 meses en adultos; en cachorros, según pauta."},
    {"nombre": "Desparasitación externa (pipeta)", "intervalo_dias": 30},
    {"nombre": "Antipulgas oral (1 mes)", "intervalo_dias": 30},
    {"nombre": "Antipulgas oral (3 meses)", "intervalo_dias": 90},
    {"nombre": "Collar antiparasitario", "intervalo_dias": 240},
]
