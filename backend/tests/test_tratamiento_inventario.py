"""El tratamiento, atado al inventario y a la entrega real.

El medicamento indicado era un texto suelto: 36 nombres distintos escritos a
mano para 39 ítems, ninguno atado al producto que la clínica vende. Así no se
puede avisar de un vencimiento al recetar ni saber si el dueño llegó a
llevarse lo indicado.

La entrega se detecta desde la VENTA, que es donde el producto sale del
estante de verdad. No se inventa un segundo camino que descuente stock por su
cuenta y termine descuadrando el inventario contra la caja.

    cd backend
    python -m pytest tests/test_tratamiento_inventario.py -v
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from database import SessionLocal


@pytest.fixture(scope="module")
def escenario(client, admin):
    """Un dueño con su mascota y un medicamento en el inventario."""
    c = client.post("/api/clientes/", json={
        "dni": "90000011", "nombre": "QA Dueño Inventario", "telefono": "555222",
    }, headers=admin)
    assert c.status_code == 201, c.text
    cliente_id = c.json()["id"]

    p = client.post(f"/api/clientes/{cliente_id}/pacientes/", json={
        "nombre": "QAInventario", "especie": "Canino",
    }, headers=admin)
    assert p.status_code == 201, p.text
    paciente_id = p.json()["id"]

    prod = client.post("/api/productos/", json={
        "nombre": "QA Amoxicilina 500", "categoria": "medicamento",
        "precio": 25.0, "stock": 10, "unidad": "caja",
    }, headers=admin)
    assert prod.status_code == 201, prod.text
    producto_id = prod.json()["id"]

    yield {"cliente_id": cliente_id, "paciente_id": paciente_id, "producto_id": producto_id}

    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM venta_items WHERE producto_id = :p"), {"p": producto_id})
        db.execute(text("DELETE FROM ventas WHERE cliente_id = :c"), {"c": cliente_id})
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id = :p"), {"p": producto_id})
        for tabla in ("tratamientos", "historias_clinicas", "citas"):
            db.execute(text(f"DELETE FROM {tabla} WHERE paciente_id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM pacientes WHERE id = :p"), {"p": paciente_id})
        db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.execute(text("DELETE FROM productos WHERE id = :p"), {"p": producto_id})
        db.commit()
    finally:
        db.close()


def _tratamiento(client, admin, paciente_id):
    return client.get(f"/api/tratamientos/?paciente_id={paciente_id}", headers=admin).json()[0]


def test_recetar_desde_el_inventario_deja_el_producto_enlazado(client, admin, escenario):
    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    r = client.post(f"/api/pacientes/{escenario['paciente_id']}/historias/", json={
        "veterinario_id": vet,
        "tratamiento_items": [{
            "medicamento": "QA Amoxicilina 500",
            "producto_id": escenario["producto_id"],
            "duracion_dias": 7,
        }],
    }, headers=admin)
    assert r.status_code == 201, r.text

    t = _tratamiento(client, admin, escenario["paciente_id"])
    assert t["producto_id"] == escenario["producto_id"]
    assert t["stock"] == 10, "la pantalla muestra si hay con qué cumplir lo indicado"
    assert t["vencido"] is False
    assert t["entregado"] is False, "todavía nadie pasó a recogerlo"


def test_la_venta_al_dueno_marca_el_tratamiento_como_entregado(client, admin, escenario):
    r = client.post("/api/ventas/", json={
        "cliente_id": escenario["cliente_id"],
        "paciente_id": escenario["paciente_id"],
        "metodo_pago": "efectivo",
        "items": [{"producto_id": escenario["producto_id"], "cantidad": 1}],
    }, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["paciente_id"] == escenario["paciente_id"]
    assert r.json()["paciente_nombre"] == "QAInventario"

    t = _tratamiento(client, admin, escenario["paciente_id"])
    assert t["entregado"] is True
    # Y el stock se descontó por el camino de siempre, el de la venta.
    assert t["stock"] == 9


def test_la_venta_no_acepta_una_mascota_de_otro_dueno(client, admin, escenario):
    """Atarla al animal equivocado es peor que no atarla a ninguno."""
    otro = client.post("/api/clientes/", json={
        "dni": "90000012", "nombre": "QA Otro Dueño",
    }, headers=admin)
    assert otro.status_code == 201, otro.text
    otro_id = otro.json()["id"]
    try:
        r = client.post("/api/ventas/", json={
            "cliente_id": otro_id,
            "paciente_id": escenario["paciente_id"],       # mascota del primero
            "metodo_pago": "efectivo",
            "items": [{"producto_id": escenario["producto_id"], "cantidad": 1}],
        }, headers=admin)
        assert r.status_code == 422, r.text
        assert "no pertenece" in r.json()["detail"].lower()
    finally:
        client.delete(f"/api/clientes/{otro_id}", headers=admin)


def test_un_medicamento_fuera_del_inventario_sigue_pudiendo_recetarse(client, admin, escenario):
    """El veterinario receta lo que el animal necesita, no solo lo del estante."""
    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    r = client.post(f"/api/pacientes/{escenario['paciente_id']}/historias/", json={
        "veterinario_id": vet,
        "tratamiento_items": [{"medicamento": "Medicamento que no vendemos", "duracion_dias": 3}],
    }, headers=admin)
    assert r.status_code == 201, r.text

    t = next(x for x in client.get(
        f"/api/tratamientos/?paciente_id={escenario['paciente_id']}", headers=admin).json()
        if x["medicamento"] == "Medicamento que no vendemos")
    assert t["producto_id"] is None
    assert t["stock"] is None
    assert t["entregado"] is False


def test_una_venta_vieja_no_cuenta_como_entrega_del_tratamiento_de_hoy(client, admin, escenario):
    """Lo que el dueño compró el mes pasado no cubre lo que se indicó hoy.

    Sin esta comparación de fechas bastaría "alguna vez compró este
    medicamento" para dar por entregado un tratamiento nuevo, y la recepción
    dejaría de llamar a quien sí tiene que pasar por la clínica.
    """
    # Se envejece la venta ya hecha para simular la compra anterior.
    db = SessionLocal()
    try:
        db.execute(
            text("UPDATE ventas SET fecha = :f WHERE cliente_id = :c"),
            {"f": f"{(date.today() - timedelta(days=30)).isoformat()} 10:00:00+00",
             "c": escenario["cliente_id"]},
        )
        db.commit()
    finally:
        db.close()

    vet = client.get("/api/usuarios/doctores", headers=admin).json()[0]["id"]
    r = client.post(f"/api/pacientes/{escenario['paciente_id']}/historias/", json={
        "veterinario_id": vet,
        "tratamiento_items": [{
            "medicamento": "QA Amoxicilina 500",
            "producto_id": escenario["producto_id"],
            "duracion_dias": 5,
        }],
    }, headers=admin)
    assert r.status_code == 201, r.text

    nuevos = [x for x in client.get(
        f"/api/tratamientos/?paciente_id={escenario['paciente_id']}", headers=admin).json()
        if x["producto_id"] == escenario["producto_id"]]
    assert nuevos, "el tratamiento nuevo tiene que estar"
    assert all(x["entregado"] is False for x in nuevos), (
        "una compra de hace un mes no puede dar por entregado lo indicado hoy")
