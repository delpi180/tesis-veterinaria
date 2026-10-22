"""Vocabulario clínico de refuerzo y red de seguridad «sin ubicar».

Deepgram (nova-3) rechaza el pedido si los keyterms pasan de ~500 tokens, y el
reintento sin keyterms deja el dictado sin refuerzo en silencio. Medido con
llamadas reales: 90 términos técnicos (996 caracteres) pasan, 100 (1168) no.
Por eso el vocabulario se presupuesta por caracteres.

    cd backend
    python -m pytest tests/test_vocabulario_clinico.py -v
"""
import unicodedata

from services import vocabulario
from services.historia_extractor import terminos_sin_ubicar


def _clave(t):
    base = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in base if not unicodedata.combining(c))


# ── Vocabulario ──────────────────────────────────────────────────────────────

def test_el_vocabulario_cabe_en_el_limite_de_deepgram():
    vocabulario.invalidar_cache()
    try:
        terminos = vocabulario.keyterms(None)
    finally:
        vocabulario.invalidar_cache()
    gastado = sum(len(t) + 1 for t in terminos)
    assert gastado <= vocabulario.MAX_CARACTERES_KEYTERMS
    # margen real bajo el punto medido donde Deepgram falla (≈1000 caracteres)
    assert vocabulario.MAX_CARACTERES_KEYTERMS <= 900


def test_incluye_terminologia_de_todas_las_categorias():
    """La mezcla en ronda hace que al cortar queden términos de cada categoría,
    no solo de la primera."""
    from services import vocabulario_clinico as vc
    vocabulario.invalidar_cache()
    try:
        terminos = {_clave(t) for t in vocabulario.keyterms(None)}
    finally:
        vocabulario.invalidar_cache()
    for nombre in ("FARMACOS", "DIAGNOSTICOS", "PROCEDIMIENTOS", "SEMIOLOGIA"):
        categoria = {_clave(t) for t in getattr(vc, nombre)}
        assert terminos & categoria, f"ninguna palabra de {nombre} llegó al vocabulario"


def test_sin_repetidos_ni_por_tildes():
    vocabulario.invalidar_cache()
    try:
        terminos = vocabulario.keyterms(None)
    finally:
        vocabulario.invalidar_cache()
    claves = [_clave(t) for t in terminos]
    assert len(claves) == len(set(claves))


def test_un_inventario_enorme_no_desborda_el_presupuesto():
    """Una clínica con cientos de medicamentos no puede sacar el vocabulario de
    los límites de Deepgram: mandan las cuotas, no el tamaño del inventario."""
    meds = [f"Medicamentoextenso{i:03d}" for i in range(400)]
    razas = [f"RazaRaraNombreLargo{i}" for i in range(50)]
    terminos = vocabulario._armar(meds, razas)
    assert sum(len(t) + 1 for t in terminos) <= vocabulario.MAX_CARACTERES_KEYTERMS
    assert len(terminos) <= vocabulario.MAX_KEYTERMS
    # lo propio de la clínica entra primero, pero no se come todo el presupuesto
    propios = [t for t in terminos if t.startswith(("Medicamentoextenso", "RazaRara"))]
    assert propios, "los medicamentos de la clínica no entraron"
    assert sum(len(t) + 1 for t in propios) <= (
        vocabulario.CUOTA_MEDICAMENTOS_CLINICA + vocabulario.CUOTA_RAZAS)
    assert len(terminos) > len(propios), "no quedó lugar para la terminología general"


def test_las_marcas_de_la_clinica_van_antes_que_el_vocabulario_general():
    terminos = vocabulario._armar(["MELOXIVET", "HEPATINE"], ["Shih Tzu"])
    assert terminos[:3] == ["MELOXIVET", "HEPATINE", "Shih Tzu"]


# ── Red de seguridad «sin ubicar» ────────────────────────────────────────────

TEXTO = ("Paciente canino de 2 años. Motivo de consulta: prurito severo en zona "
         "lumbosacra. Diagnóstico: dermatitis alérgica, DAPP. Tratamiento e "
         "indicaciones: control de pulgas con isoxazolinas y ceruminolítico.")


def test_devuelve_lo_dictado_que_no_quedo_en_ningun_campo():
    datos = {
        "motivo_consulta": "Prurito severo en zona lumbosacra",
        "diagnostico_definitivo": "Dermatitis alérgica (DAPP)",
        "tratamiento_items": [{"medicamento": "isoxazolinas"}],
        "indicaciones": "Control de pulgas",
    }
    assert terminos_sin_ubicar(TEXTO, datos) == ["ceruminolítico"]


def test_no_marca_lo_que_si_quedo_aunque_cambie_el_plural_o_la_tilde():
    datos = {"motivo_consulta": "prurito severo zona lumbosacra",
             "diagnostico_definitivo": "dermatitis alergica DAPP",
             "indicaciones": "control pulga isoxazolina ceruminolitico"}
    assert terminos_sin_ubicar(TEXTO, datos) == []


def test_ignora_el_guion_del_dictado_y_las_palabras_comunes():
    texto = "Paciente felino de 4 años. Motivo de consulta: además tiene decaimiento. Diagnóstico: PIF."
    datos = {"motivo_consulta": "decaimiento", "diagnostico_definitivo": "PIF"}
    assert terminos_sin_ubicar(texto, datos) == []


def test_las_siglas_cortas_cuentan_y_no_se_repiten():
    datos = {"motivo_consulta": "algo"}
    r = terminos_sin_ubicar("Se indica AINEs y luego AINEs otra vez, además PIF.", datos)
    assert r == ["AINEs", "PIF"]


def test_el_resultado_siempre_es_lista_y_tolera_vacios():
    assert terminos_sin_ubicar("", {}) == []
    assert terminos_sin_ubicar(None, None) == []
    r = terminos_sin_ubicar("hipertiroidismo, metimazol, " * 30, {})
    assert len(r) <= 12


# ── Consulta nueva con el formulario de Volki (solo_volki) ───────────────────

def test_solo_volki_no_da_por_ubicado_lo_que_solo_vive_en_datos_internos():
    """`dicho` es lo que oyó la IA y el doctor no lo ve en ninguna casilla: una palabra
    que solo está ahí no debe darse por ubicada."""
    datos = {"motivo_consulta": "otitis",
             "tratamiento_items": [{"medicamento": "Gotas", "dicho": "gotas con ceruminolítico"}]}
    texto = "Otitis. Gotas con ceruminolítico."
    assert terminos_sin_ubicar(texto, datos) == []                          # modo normal: cuenta `dicho`
    assert terminos_sin_ubicar(texto, datos, solo_volki=True) == ["ceruminolítico"]


def test_solo_volki_sigue_contando_lo_que_el_formulario_conserva_redirigido():
    """Diagnóstico presuntivo, FC o vacunas no existen en Volki pero el frontend los pasa
    a Diagnóstico u Observaciones: siguen contando como ubicados."""
    datos = {"diagnostico_presuntivo": "piometra", "frecuencia_cardiaca": 130,
             "vacunas_items": [{"vacuna": "antirrábica", "dicho": "antirrábica"}]}
    texto = "Piometra, antirrábica y taquicardia."
    assert terminos_sin_ubicar(texto, datos, solo_volki=True) == ["taquicardia"]
