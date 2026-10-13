"""Revisión determinista de lo que devuelve la IA (sin llamar a OpenAI)."""
from services.revision_historia import (
    ajustar_a_catalogo, rescatar_constantes, resumen_campos,
)


def test_rescata_constantes_con_cifras_y_palabras():
    d = {"temperatura_c": None, "peso_kg": None,
         "frecuencia_cardiaca": None, "frecuencia_respiratoria": None}
    texto = ("Temperatura treinta y nueve punto dos, peso 12,5 kilos, "
             "frecuencia cardíaca ciento veinte, frecuencia respiratoria 28")
    r = rescatar_constantes(texto, d)
    assert d["temperatura_c"] == 39.2
    assert d["peso_kg"] == 12.5
    assert d["frecuencia_respiratoria"] == 28
    assert set(r) >= {"temperatura_c", "peso_kg", "frecuencia_respiratoria"}


def test_no_pisa_lo_que_la_ia_ya_dio():
    d = {"temperatura_c": 38.5}
    assert rescatar_constantes("temperatura 40", d) == []
    assert d["temperatura_c"] == 38.5


def test_ajusta_marca_mal_oida_pero_no_inventa():
    cat = ["MELOXIVET 4MG x 10 TAB", "HEPATINE 30 TAB"]
    items = [{"medicamento": "melo si vet"}, {"medicamento": "hepatin"},
             {"medicamento": "amoxicilina"}]
    cambios = ajustar_a_catalogo(items, cat)
    assert items[0]["medicamento"] == "MELOXIVET 4MG x 10 TAB"
    assert items[2]["medicamento"] == "amoxicilina"   # no está: se deja
    assert cambios[0]["antes"] == "melo si vet"


def test_resumen_marca_faltantes_y_dudosos():
    datos = {"motivo_consulta": "vómitos", "temperatura_c": 392,
             "tratamiento_items": [{"medicamento": "X", "dosis": None,
                                    "en_catalogo": False}]}
    r = resumen_campos(datos, {"mucosas": "inferido"},
                       {"temperatura_c": "fuera de rango"})
    claves = {f["campo"] for f in r["faltantes"]}
    assert "peso_kg" in claves and "motivo_consulta" not in claves
    motivos = {d["motivo"] for d in r["dudosos"]}
    assert {"fuera_de_rango", "inferido", "fuera_de_inventario", "sin_dosis"} <= motivos
    assert 0 < r["completitud"] < 100


def test_dosis_total_y_tope_de_plausibilidad():
    from services.revision_historia import calcular_dosis_total
    r = calcular_dosis_total("4 mg/kg", 12.5)
    assert r["total"] == 50.0 and r["unidad"] == "mg"
    assert calcular_dosis_total("una tableta", 10) is None
    assert calcular_dosis_total("4 mg/kg", None) is None
    res = resumen_campos({"tratamiento_items": [
        {"medicamento": "X", "dosis": "400 mg/kg", "en_catalogo": True}]}, {}, {})
    assert any(d["motivo"] == "dosis_alta" for d in res["dudosos"])


def test_variantes_del_glosario_se_aplican_por_palabra_completa():
    from services.vocabulario import aplicar_variantes
    pares = [("melo si vet", "MELOXIVET"), ("pe cu", "PQ")]
    t = aplicar_variantes("Le receto Melo Si Vet y nada de pe cu", pares)
    assert t == "Le receto MELOXIVET y nada de PQ"
    assert aplicar_variantes("pe cualquiera", pares) == "pe cualquiera"
