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

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Paciente, Producto

# Vocabulario veterinario general: sirve en cualquier clínica.
KEYTERMS_BASE = [
    # Vacunas
    "Nobivac", "Vanguard", "Eurican", "Defensor", "Rabisin", "Bravecto",
    "Quíntuple", "Séxtuple", "Antirrábica", "Triple felina", "Puppy",
    # Fármacos
    "Amoxicilina", "Metronidazol", "Meloxicam", "Carprofeno", "Enrofloxacina",
    "Ivermectina", "Cefalexina", "Dexametasona", "Prednisona", "Tramadol",
    "Maropitant", "Cerenia", "Omeprazol", "Ranitidina", "Furosemida",
    "Doxiciclina", "Gabapentina", "Apoquel",
    # Términos clínicos
    "mucosas", "ictéricas", "cianóticas", "linfonódulos", "taquicardia",
    "deshidratado", "hematuria", "anorexia", "condición corporal",
]

# Tope de términos. Deepgram admite más, pero una lista enorme diluye el
# refuerzo (todo "importante" es nada importante) y encarece la llamada. Se
# prioriza: primero los medicamentos de la clínica, después las razas que
# realmente atiende, y al final el vocabulario general.
MAX_KEYTERMS = 120

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


def _de_la_base(db: Session) -> list[str]:
    terminos: list[str] = []

    # Medicamentos primero: son los que más se dictan y los que peor se oyen.
    for (nombre,) in (db.query(Producto.nombre)
                        .filter(Producto.activo.is_(True),
                                Producto.categoria == "medicamento")
                        .all()):
        limpio = _limpiar(nombre)
        if len(limpio) >= 4:
            terminos.append(limpio)

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
            terminos.append(limpia)

    return terminos


def keyterms(db: Session | None = None) -> list[str]:
    """Vocabulario final, sin repetidos y acotado.

    Si la base no responde se devuelve la lista base: un dictado no puede
    fallar porque el vocabulario no se pudo armar.
    """
    global _cache
    ahora = time.time()
    if _cache and (ahora - _cache[0]) < _TTL_SEGUNDOS:
        return _cache[1]

    propios: list[str] = []
    if db is not None:
        try:
            propios = _de_la_base(db)
        except Exception:
            propios = []

    vistos: set[str] = set()
    final: list[str] = []
    for t in propios + KEYTERMS_BASE:
        clave = t.lower()
        if clave in vistos:
            continue
        vistos.add(clave)
        final.append(t)
        if len(final) >= MAX_KEYTERMS:
            break

    _cache = (ahora, final)
    return final


def invalidar_cache() -> None:
    """Para las pruebas y para cuando se recarga el inventario de golpe."""
    global _cache
    _cache = None
