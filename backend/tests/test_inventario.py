"""Tests del matching difuso del inventario conversacional (lógica pura, sin BD)."""
from routers.inventario import _norm, _match_producto


class _P:
    def __init__(self, nombre, pid=1, codigo="X"):
        self.nombre, self.id, self.codigo = nombre, pid, codigo
        self.categoria, self.stock = "medicamento", 10


PRODUCTOS = [
    _P("Amoxicilina 250 mg x 20 caps", 1, "MED-0001"),
    _P("Bravecto antipulgas", 2, "MED-0002"),
    _P("Alimento Royal Canin 3kg", 3, "COM-0001"),
]


def test_norm_quita_acentos_y_mayusculas():
    assert _norm("Amoxicilína") == "amoxicilina"
    assert _norm("  ROYAL  ") == "royal"


def test_match_directo_por_subcadena():
    assert _match_producto("amoxicilina", PRODUCTOS).id == 1
    assert _match_producto("bravecto", PRODUCTOS).id == 2
    assert _match_producto("royal canin", PRODUCTOS).id == 3


def test_match_con_detalle_extra():
    assert _match_producto("amoxicilina 250", PRODUCTOS).id == 1


def test_sin_match_devuelve_none():
    assert _match_producto("metronidazol", PRODUCTOS) is None
    assert _match_producto("collar isabelino", PRODUCTOS) is None


def test_nombre_vacio():
    assert _match_producto("", PRODUCTOS) is None
