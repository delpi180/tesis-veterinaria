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

from models import Paciente, Producto, TerminoGlosario

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
# Un caché POR CLÍNICA: el vocabulario sale del inventario y de las razas de cada
# una, y compartirlo mezclaría los medicamentos de una veterinaria en el dictado
# de otra.
_cache: dict[int | None, tuple[float, list[str]]] = {}


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


def _del_glosario(db: Session) -> list[str]:
    return [t for (t,) in db.query(TerminoGlosario.termino)
                            .filter(TerminoGlosario.activo.is_(True)).all()]


def _de_la_base(db: Session) -> list[str]:
    # Lo que la administradora escribió a mano manda: va primero.
    terminos: list[str] = _del_glosario(db)

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
    ahora = time.time()
    clave = db.info.get("clinica_id") if db is not None else None
    hit = _cache.get(clave)
    if hit and (ahora - hit[0]) < _TTL_SEGUNDOS:
        return hit[1]

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

    _cache[clave] = (ahora, final)
    return final


def invalidar_cache() -> None:
    """Para las pruebas y para cuando se recarga el inventario de golpe."""
    _cache.clear()
    _cache_catalogo.clear()


# ── Catálogo de medicamentos para la extracción ──────────────────────────────
#
# El vocabulario de arriba ayuda a Deepgram a OÍR bien la marca. Esto es para
# el paso siguiente: si igual salió mal escrita, GPT puede reconocerla si sabe
# qué medicamentos existen en esta clínica. Sin catálogo, "melo si vet" se
# copia tal cual al tratamiento y a la receta.
_cache_catalogo: dict[int | None, tuple[float, list[str]]] = {}


def catalogo_medicamentos(db: Session | None) -> list[str]:
    """Nombres completos de los medicamentos activos, como están cargados.

    A diferencia del vocabulario de refuerzo, acá NO se limpia la dosis: lo
    que se busca es que el tratamiento quede escrito igual que el producto,
    para poder cobrarlo después sin volver a tipearlo.
    """
    ahora = time.time()
    clave = db.info.get("clinica_id") if db is not None else None
    hit = _cache_catalogo.get(clave)
    if hit and (ahora - hit[0]) < _TTL_SEGUNDOS:
        return hit[1]

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

    _cache_catalogo[clave] = (ahora, nombres)
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


# ── Variantes mal oídas del glosario ─────────────────────────────────────────

def variantes_glosario(db: Session | None) -> list[tuple[str, str]]:
    """[(como_suena, como_se_escribe)] de los términos activos con variantes."""
    if db is None:
        return []
    try:
        filas = (db.query(TerminoGlosario.termino, TerminoGlosario.suena_como)
                   .filter(TerminoGlosario.activo.is_(True),
                           TerminoGlosario.suena_como.isnot(None)).all())
    except Exception:
        return []
    pares = []
    for termino, suena in filas:
        for v in (suena or "").split(","):
            v = " ".join(v.split())
            if v:
                pares.append((v, termino))
    return pares


def aplicar_variantes(texto: str, pares: list[tuple[str, str]]) -> str:
    """Cambia en la transcripción lo que se oyó mal por como se escribe bien.

    Palabra completa y sin distinguir mayúsculas ("melo si vet" no toca
    "melo si vetusto"). Las variantes más largas se aplican primero para que
    una frase no quede partida por otra más corta.
    """
    for suena, correcto in sorted(pares, key=lambda p: -len(p[0])):
        texto = re.sub(rf"(?<!\w){re.escape(suena)}(?!\w)", correcto, texto,
                       flags=re.IGNORECASE)
    return texto


def bloque_glosario(db: Session | None) -> str:
    """Términos propios para el prompt: el modelo debe respetar su escritura."""
    if db is None:
        return ""
    try:
        terminos = _del_glosario(db)
    except Exception:
        return ""
    if not terminos:
        return ""
    return ("\n\nTÉRMINOS PROPIOS DE ESTA CLÍNICA (escríbelos exactamente así si "
            "aparecen): " + "; ".join(terminos[:80]))
