"""Vocabulario de refuerzo para el dictado.

Deepgram no inventa marcas: si "MELOXIVET" no está en el vocabulario, sale
como "melosivet" o "melo si vet". Lo que se prueba acá es que la lista se arme
con lo que la clínica realmente usa y que un fallo al construirla nunca deje
sin transcribir una consulta.

    cd backend
    python -m pytest tests/test_vocabulario.py -v
"""
import uuid

from sqlalchemy import text

from database import SessionLocal
from services import vocabulario


def _limpiar_producto(pid):
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id = :p"), {"p": pid})
        db.execute(text("DELETE FROM productos WHERE id = :p"), {"p": pid})
        db.commit()
    finally:
        db.close()


def test_limpia_dosis_y_presentacion_del_nombre():
    """Un producto se llama "MELOXIVET 4MG x 10 TAB". Como término de refuerzo
    solo sirve la marca: el resto es ruido, y los números son peor que ruido
    porque reforzarían cifras que no queremos fijar."""
    assert vocabulario._limpiar("MELOXIVET 4MG x 10 TAB") == "MELOXIVET"
    assert vocabulario._limpiar("HEPATINE frasco 30 ml") == "HEPATINE"
    assert vocabulario._limpiar("Alimento para gato") == "Alimento gato"


def test_no_se_come_las_marcas_con_numero():
    """Descartar toda palabra con un dígito era pasarse: "B12" y "K3" son
    parte del nombre del producto, no una dosis."""
    assert vocabulario._limpiar("Complejo B12 inyectable") == "Complejo B12 inyectable"
    assert vocabulario._limpiar("Vitamina K3 2ML") == "Vitamina K3"


def test_incluye_los_medicamentos_de_la_clinica(client, admin):
    """El caso que motiva todo esto: una marca que no está en ningún
    diccionario pero que en esta clínica se dicta a diario."""
    # Sufijo en letras: un nombre comercial real no lleva un hash pegado
    marca = "Vetraxil" + "".join(
        chr(ord("a") + int(c, 16) % 26) for c in uuid.uuid4().hex[:5])
    r = client.post("/api/productos/", json={
        "nombre": f"{marca} 50MG x 20 TAB", "categoria": "medicamento",
        "precio": 20.0, "stock": 5, "stock_minimo": 1,
    }, headers=admin)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    try:
        vocabulario.invalidar_cache()
        db = SessionLocal()
        try:
            terminos = vocabulario.keyterms(db)
        finally:
            db.close()
        assert marca in terminos, "el medicamento de la clínica no llegó al vocabulario"
    finally:
        _limpiar_producto(pid)
        vocabulario.invalidar_cache()


def test_incluye_las_razas_que_se_atienden():
    """"Shih Tzu" y "Schnauzer" son las que peor salen dictadas y son las que
    esta clínica ve todos los días."""
    vocabulario.invalidar_cache()
    db = SessionLocal()
    try:
        terminos = [t.lower() for t in vocabulario.keyterms(db)]
    finally:
        db.close()
        vocabulario.invalidar_cache()
    # Al menos alguna raza real de la base tiene que haber entrado
    assert any(r in terminos for r in ("shih tzu", "schnauzer", "french poodle")), \
        f"no entró ninguna raza; se obtuvo: {terminos[:15]}"


def test_no_refuerza_palabras_corrientes():
    """"Mestizo" y "Otro" son la mayoría de las fichas, pero Deepgram ya las
    transcribe bien. Reforzarlas sesga al modelo hacia esas palabras: el
    boosting es para lo que NO está en el diccionario."""
    vocabulario.invalidar_cache()
    db = SessionLocal()
    try:
        terminos = [t.lower() for t in vocabulario.keyterms(db)]
    finally:
        db.close()
        vocabulario.invalidar_cache()
    assert "mestizo" not in terminos
    assert "otro" not in terminos


def test_conserva_el_vocabulario_general():
    vocabulario.invalidar_cache()
    db = SessionLocal()
    try:
        terminos = vocabulario.keyterms(db)
    finally:
        db.close()
        vocabulario.invalidar_cache()
    assert "Amoxicilina" in terminos
    assert "mucosas" in terminos


def test_sin_base_de_datos_igual_devuelve_el_vocabulario_base():
    """Un dictado no puede fallar porque no se pudo leer el inventario."""
    vocabulario.invalidar_cache()
    try:
        terminos = vocabulario.keyterms(None)
        assert "Amoxicilina" in terminos
    finally:
        vocabulario.invalidar_cache()


def test_no_repite_terminos_ni_se_pasa_del_tope():
    """Una lista enorme diluye el refuerzo: si todo es importante, nada lo es."""
    vocabulario.invalidar_cache()
    db = SessionLocal()
    try:
        terminos = vocabulario.keyterms(db)
    finally:
        db.close()
        vocabulario.invalidar_cache()
    minusculas = [t.lower() for t in terminos]
    assert len(minusculas) == len(set(minusculas)), "hay términos repetidos"
    assert len(terminos) <= vocabulario.MAX_KEYTERMS


# ── Reconocer una marca contra el catálogo ───────────────────────────────────

CATALOGO = ["MELOXIVET 4MG x 10 TAB", "HEPATINE frasco 30 ml", "Complejo B12"]


def test_reconoce_la_marca_aunque_venga_con_la_dosis():
    """El doctor dicta "meloxivet" y el producto está cargado con su
    presentación: son el mismo medicamento."""
    assert vocabulario.coincide_con_catalogo("Meloxivet", CATALOGO)
    assert vocabulario.coincide_con_catalogo("MELOXIVET 4MG", CATALOGO)


def test_ignora_tildes_y_mayusculas():
    assert vocabulario.coincide_con_catalogo("hepatine", CATALOGO)
    assert vocabulario.coincide_con_catalogo("Complejo b12", CATALOGO)


def test_marca_lo_que_no_esta_en_el_inventario():
    """Un medicamento que la clínica no tiene es válido en una receta, pero el
    veterinario debería verlo señalado por si la IA lo entendió mal."""
    assert not vocabulario.coincide_con_catalogo("Melosivet", CATALOGO)
    assert not vocabulario.coincide_con_catalogo("Amoxicilina", CATALOGO)


def test_sin_inventario_cargado_no_marca_nada():
    """Con el catálogo vacío, señalar todo como desconocido sería puro ruido:
    es el estado de una clínica que todavía no cargó sus productos."""
    assert vocabulario.coincide_con_catalogo("Cualquier cosa", [])


def test_el_bloque_de_prompt_lista_los_medicamentos():
    texto = vocabulario.bloque_catalogo(CATALOGO)
    assert "MELOXIVET 4MG x 10 TAB" in texto
    assert "nombre EXACTO" in texto
    # Y le dice que no invente: recetar algo fuera de stock es legítimo
    assert "sin inventar" in texto


def test_sin_catalogo_no_se_agrega_nada_al_prompt():
    """Un prompt con una sección vacía de medicamentos solo gasta tokens y
    confunde al modelo."""
    assert vocabulario.bloque_catalogo([]) == ""
