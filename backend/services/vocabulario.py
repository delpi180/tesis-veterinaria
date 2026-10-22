"""Vocabulario que se le pasa a Deepgram para que no lo transcriba mal.

El "keyterm boosting" le dice al reconocedor qué palabras esperar. La lista
base cubre fármacos y términos clínicos genéricos, pero cada clínica compra
marcas distintas: la que aquí se usa tiene productos como MELOXIVET, HEPATINE
o HISTAPROV, que no están en ningún diccionario y salen destrozados al dictar.

Esos nombres ya están en el sistema —son el inventario— así que el vocabulario
se arma con ellos en vez de mantener una lista a mano que envejece sola. Lo
mismo con las razas: "Shih Tzu" y "Schnauzer" se dictan a diario acá.

Lo que esto NO arregla: los números. Que "cuatro" se oiga como "dos" es un
problema acústico y el boosting no interviene ahí; para eso está el fragmento
de audio que se muestra junto a cada campo, para que el doctor lo compare.
"""
import re
import time
import unicodedata

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Paciente, Producto

# Vocabulario veterinario general: sirve en cualquier clínica. La terminología
# clínica amplia (fármacos, diagnósticos, procedimientos) vive en
# vocabulario_clinico.py; acá quedan las marcas y algunos fármacos de uso diario.
KEYTERMS_BASE = [
    # Vacunas y marcas comerciales
    "Nobivac", "Vanguard", "Eurican", "Defensor", "Rabisin", "Bravecto",
    "Quíntuple", "Séxtuple", "Antirrábica", "Triple felina", "Cerenia", "Apoquel",
    # Fármacos de uso diario
    "Amoxicilina", "Metronidazol", "Meloxicam", "Carprofeno", "Enrofloxacina",
    "Ivermectina", "Cefalexina", "Dexametasona", "Prednisona", "Omeprazol",
    "Furosemida", "Doxiciclina",
    # Términos clínicos
    "mucosas", "ictéricas", "cianóticas", "linfonódulos", "condición corporal",
]

# LÍMITE REAL de Deepgram (nova-3): ~500 tokens de keyterms por pedido, no un
# número de términos. Se midió con llamadas reales: 90 términos técnicos en
# español (996 caracteres) pasan; 100 (1168 caracteres) devuelven "Keyterm limit
# exceeded", y el reintento sin keyterms deja el dictado SIN refuerzo en
# silencio. Por eso se presupuesta por caracteres, con margen, y no por cantidad.
# La documentación oficial recomienda además 20 a 50 términos clave.
MAX_CARACTERES_KEYTERMS = 850
MAX_KEYTERMS = 120   # tope duro de cantidad; en la práctica manda el presupuesto

# Reparto del presupuesto: lo propio de la clínica (marcas que ningún
# diccionario conoce) pesa más que la lista general, pero no puede comérselo todo.
CUOTA_MEDICAMENTOS_CLINICA = 300
CUOTA_RAZAS = 80

# El inventario cambia poco; consultarlo en cada dictado sería una consulta de
# más por consulta médica. Se recuerda un rato: cargar un producto nuevo tarda
# a lo sumo esto en reflejarse en el dictado.
_TTL_SEGUNDOS = 600
_cache: tuple[float, list[str]] | None = None


# Una dosis o presentación: "4MG", "10", "0.5ml", "500". Se descarta.
# Ojo con no pasarse: "B12" o "K3" son parte del nombre del producto, no una
# dosis. Por eso se exige que el token EMPIECE con dígito, en vez de descartar
# cualquier palabra que contenga uno.
_DOSIS = re.compile(r"^\d+([.,]\d+)?(mg|ml|g|gr|kg|mcg|ui|cc|%)?$", re.IGNORECASE)

# Razas que no conviene reforzar. Son palabras corrientes del español que
# Deepgram ya transcribe bien, y empujarlas es contraproducente: el refuerzo
# sesga al modelo, así que podría oír "otro" donde el doctor dijo otra cosa.
# El boosting sirve para lo que NO está en el diccionario.
_RAZAS_GENERICAS = {
    "mestizo", "otro", "otra", "criollo", "criolla", "común europeo",
    "desconocido", "desconocida", "ninguna", "ninguno", "sin raza",
}

_RELLENO = {
    "x", "tab", "tabs", "tableta", "tabletas", "mg", "ml", "gr", "kg", "cc",
    "caja", "frasco", "unidad", "und", "sobre", "ampolla", "jeringa",
    "de", "del", "la", "el", "los", "las", "para", "con", "por",
}


def _limpiar(nombre: str) -> str:
    """Deja el nombre en algo pronunciable.

    Un producto se llama "MELOXIVET 4MG x 10 TAB": como keyterm solo sirve la
    marca. La dosis y la presentación son ruido — y peor, meterían números al
    vocabulario, que es justo lo que no conviene reforzar.
    """
    palabras = []
    for palabra in (nombre or "").split():
        limpia = palabra.strip(".,;:()[]").strip()
        if not limpia or _DOSIS.match(limpia) or limpia.lower() in _RELLENO:
            continue
        palabras.append(limpia)
    return " ".join(palabras[:3]).strip()


def _de_la_base(db: Session) -> tuple[list[str], list[str]]:
    meds: list[str] = []
    razas_out: list[str] = []

    # Medicamentos primero: son los que más se dictan y los que peor se oyen.
    for (nombre,) in (db.query(Producto.nombre)
                        .filter(Producto.activo.is_(True),
                                Producto.categoria == "medicamento")
                        .all()):
        limpio = _limpiar(nombre)
        if len(limpio) >= 4:
            meds.append(limpio)

    # Razas que la clínica atiende de verdad, por frecuencia. "Mestizo" domina
    # la lista pero no necesita refuerzo; las que importan son las de nombre
    # extranjero, que son justo las que se transcriben mal.
    razas = (db.query(Paciente.raza, func.count(Paciente.id).label("n"))
               .filter(Paciente.raza.isnot(None), Paciente.raza != "")
               .group_by(Paciente.raza)
               .order_by(func.count(Paciente.id).desc())
               .limit(25)
               .all())
    for raza, _n in razas:
        limpia = (raza or "").strip()
        if len(limpia) >= 4 and limpia.lower() not in _RAZAS_GENERICAS:
            razas_out.append(limpia)

    return meds, razas_out


def _clave_unica(t: str) -> str:
    """Para no repetir un término por tildes o mayúsculas."""
    base = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in base if not unicodedata.combining(c)).strip()


def _armar(propios_meds: list[str], propias_razas: list[str]) -> list[str]:
    """Lista final respetando el presupuesto de caracteres de Deepgram.

    Orden de prioridad: medicamentos de la clínica (hasta su cuota), razas
    (hasta la suya) y luego la terminología clínica general mezclada en ronda
    por categoría, para que al cortar queden términos de todas y no solo de la
    primera.
    """
    from itertools import zip_longest
    from services.vocabulario_clinico import CATEGORIAS

    vistos: set[str] = set()
    final: list[str] = []
    gastado = 0

    def agregar(t: str, tope: int) -> bool:
        nonlocal gastado
        clave = _clave_unica(t)
        if not clave or clave in vistos:
            return True            # repetido: se salta, se sigue
        costo = len(t) + 1
        if gastado + costo > tope or len(final) >= MAX_KEYTERMS:
            return False
        vistos.add(clave)
        final.append(t)
        gastado += costo
        return True

    for t in propios_meds:
        agregar(t, CUOTA_MEDICAMENTOS_CLINICA)   # uno largo no cabe: se prueba con el siguiente
    tope_razas = gastado + CUOTA_RAZAS
    for t in propias_razas:
        agregar(t, tope_razas)

    general = [t for tupla in zip_longest(KEYTERMS_BASE[:12], *CATEGORIAS)
               for t in tupla if t]
    general += KEYTERMS_BASE[12:]
    for t in general:
        agregar(t, MAX_CARACTERES_KEYTERMS)      # un largo no cabe, uno corto más adelante sí
    return final


def keyterms(db: Session | None = None) -> list[str]:
    """Vocabulario final, sin repetidos y dentro del límite de Deepgram.

    Si la base no responde se devuelve la lista general: un dictado no puede
    fallar porque el vocabulario no se pudo armar.
    """
    global _cache
    ahora = time.time()
    if _cache and (ahora - _cache[0]) < _TTL_SEGUNDOS:
        return _cache[1]

    meds: list[str] = []
    razas: list[str] = []
    if db is not None:
        try:
            meds, razas = _de_la_base(db)
        except Exception:
            meds, razas = [], []

    final = _armar(meds, razas)
    _cache = (ahora, final)
    return final


def invalidar_cache() -> None:
    """Para las pruebas y para cuando se recarga el inventario de golpe."""
    global _cache
    _cache = None


# ── Catálogo de medicamentos para la extracción ──────────────────────────────
#
# El vocabulario de arriba ayuda a Deepgram a OÍR bien la marca. Esto es para
# el paso siguiente: si igual salió mal escrita, GPT puede reconocerla si sabe
# qué medicamentos existen en esta clínica. Sin catálogo, "melo si vet" se
# copia tal cual al tratamiento y a la receta.
_cache_catalogo: tuple[float, list[str]] | None = None


def catalogo_medicamentos(db: Session | None) -> list[str]:
    """Nombres completos de los medicamentos activos, como están cargados.

    A diferencia del vocabulario de refuerzo, acá NO se limpia la dosis: lo
    que se busca es que el tratamiento quede escrito igual que el producto,
    para poder cobrarlo después sin volver a tipearlo.
    """
    global _cache_catalogo
    ahora = time.time()
    if _cache_catalogo and (ahora - _cache_catalogo[0]) < _TTL_SEGUNDOS:
        return _cache_catalogo[1]

    nombres: list[str] = []
    if db is not None:
        try:
            nombres = [
                n for (n,) in db.query(Producto.nombre)
                                .filter(Producto.activo.is_(True),
                                        Producto.categoria == "medicamento")
                                .order_by(Producto.nombre)
                                .limit(300)
                                .all()
                if (n or "").strip()
            ]
        except Exception:
            nombres = []

    _cache_catalogo = (ahora, nombres)
    return nombres


def _clave(texto: str) -> str:
    """Compara sin tildes, sin mayúsculas y sin la dosis pegada al nombre."""
    base = unicodedata.normalize("NFKD", (texto or "").lower())
    base = "".join(c for c in base if not unicodedata.combining(c))
    return " ".join(_limpiar(base).split())


def coincide_con_catalogo(nombre: str, catalogo: list[str]) -> bool:
    """¿Este medicamento existe en el inventario de la clínica?

    Se usa para avisar en pantalla cuando NO coincide. Con el catálogo vacío
    devuelve True siempre: marcar todo como desconocido cuando la clínica
    todavía no cargó su inventario sería puro ruido.
    """
    if not catalogo:
        return True
    clave = _clave(nombre)
    if not clave:
        return False
    for producto in catalogo:
        cp = _clave(producto)
        if not cp:
            continue
        # Contención en ambos sentidos: el doctor dice "meloxivet" y el
        # producto es "MELOXIVET 4MG", o al revés si cargaron solo la marca.
        if clave == cp or clave in cp or cp in clave:
            return True
    return False


def bloque_catalogo(catalogo: list[str]) -> str:
    """Trozo de prompt que le dice al modelo qué medicamentos hay acá.

    Sin esto una marca mal transcrita se copia tal cual: "melo si vet" queda
    en el tratamiento y nadie sabe qué es. Con el catálogo el modelo puede
    reconocerla y escribirla como está en el inventario — lo que además deja
    el nombre listo para cobrarlo sin volver a tipearlo.

    Se le dice explícitamente que NO invente: un medicamento que la clínica no
    tiene en stock es perfectamente válido en una receta.
    """
    if not catalogo:
        return ""
    lista = "\n".join(f"- {n}" for n in catalogo[:150])
    return (
        "\n\nMEDICAMENTOS DE ESTA CLÍNICA:\n" + lista +
        "\n\nSi lo dictado se parece a uno de esta lista (aunque la "
        "transcripción lo haya escrito mal, por ejemplo 'melo si vet' por "
        "'MELOXIVET'), usa el nombre EXACTO de la lista. Si no se parece a "
        "ninguno, escribe lo que se dictó sin inventar: puede ser un "
        "medicamento que la clínica no tiene en stock, y eso es válido."
    )
