"""Respaldo descargable de los datos de la clínica.

Lo que se protege acá es que la dueña pueda tener sus datos en la mano sin
depender de nadie: si el ZIP sale vacío, corrupto o sin las historias, el
respaldo da una falsa sensación de seguridad, que es peor que no tenerlo.

    cd backend
    python -m pytest tests/test_respaldo.py -v
"""
import csv
import io
import zipfile


def _descargar(client, headers):
    r = client.get("/api/respaldo/", headers=headers)
    assert r.status_code == 200, r.text
    return r


def test_el_respaldo_trae_un_csv_por_tabla(client, admin):
    r = _descargar(client, admin)
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers["content-disposition"]

    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.testzip() is None, "el ZIP salió corrupto"

    esperados = {
        "clientes.csv", "mascotas.csv", "historias_clinicas.csv", "recetas.csv",
        "inventario.csv", "servicios.csv", "ventas.csv", "LEEME.txt",
    }
    assert esperados <= set(z.namelist())


def test_los_datos_reales_estan_dentro(client, admin):
    """Un ZIP con las cabeceras pero sin filas sería inútil."""
    cuantos = len(client.get("/api/clientes/?limit=1000", headers=admin).json())
    if cuantos == 0:
        return  # base vacía: nada que comprobar

    z = zipfile.ZipFile(io.BytesIO(_descargar(client, admin).content))
    texto = z.read("clientes.csv").decode("utf-8-sig")
    filas = list(csv.reader(io.StringIO(texto)))

    assert filas[0] == ["ID", "DNI", "Nombre", "Teléfono", "Dirección"]
    assert len(filas) > 1, "el CSV de clientes salió sin datos"


def test_el_csv_abre_bien_en_excel(client, admin):
    """Sin BOM, Excel en Windows rompe los acentos de los nombres."""
    z = zipfile.ZipFile(io.BytesIO(_descargar(client, admin).content))
    crudo = z.read("clientes.csv")
    assert crudo.startswith(b"\xef\xbb\xbf"), "falta el BOM UTF-8"


def test_no_quedan_none_ni_objetos_crudos(client, admin):
    """Los campos vacíos deben verse vacíos, no como 'None'; y los items de
    receta son JSON, que sin aplanar volcarían sintaxis de Python en la celda."""
    z = zipfile.ZipFile(io.BytesIO(_descargar(client, admin).content))
    for archivo in ("clientes.csv", "mascotas.csv", "recetas.csv"):
        texto = z.read(archivo).decode("utf-8-sig")
        assert ",None," not in texto and not texto.endswith("None"), f"{archivo} tiene 'None'"
        assert "{'" not in texto, f"{archivo} tiene un dict de Python sin aplanar"


def test_el_respaldo_es_solo_de_la_administradora(client, doctor):
    """Se lleva la base entera de clientes: no es algo que baje cualquiera."""
    assert client.get("/api/respaldo/", headers=doctor).status_code == 403
