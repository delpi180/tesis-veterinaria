"""Doble cobro por reintento tras un corte de red.

El caso que motiva esto no es el doble clic (el botón ya se deshabilita), sino
el reintento legítimo: la conexión se cae DESPUÉS de que el servidor grabó la
venta, la pantalla muestra un error y la recepcionista vuelve a cobrar. Sin
guarda, quedan dos ventas: stock descontado dos veces y cliente pagando el
doble.

    cd backend
    python -m pytest tests/test_venta_duplicada.py -v
"""
import uuid

from sqlalchemy import text

from database import SessionLocal


def _cliente(client, admin):
    r = client.post("/api/clientes/", json={
        "nombre": f"QA Duplicado {uuid.uuid4().hex[:6]}",
        "dni": str(uuid.uuid4().int)[:8],
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _producto(client, admin, stock=20):
    r = client.post("/api/productos/", json={
        "nombre": f"QA Dup {uuid.uuid4().hex[:6]}",
        "categoria": "accesorio", "precio": 12.0,
        "stock": stock, "stock_minimo": 1,
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _limpiar(cliente_id, producto_id, venta_ids=()):
    db = SessionLocal()
    try:
        for v in venta_ids:
            db.execute(text("DELETE FROM venta_items WHERE venta_id = :v"), {"v": v})
            db.execute(text("DELETE FROM ventas WHERE id = :v"), {"v": v})
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id = :p"), {"p": producto_id})
        db.execute(text("DELETE FROM productos WHERE id = :p"), {"p": producto_id})
        db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.commit()
    finally:
        db.close()


def test_reintentar_el_mismo_cobro_no_lo_duplica(client, admin):
    cli, prod = _cliente(client, admin), _producto(client, admin)
    cuerpo = {
        "cliente_id": cli["id"], "metodo_pago": "efectivo",
        "items": [{"producto_id": prod["id"], "cantidad": 2}],
    }
    ids = set()
    try:
        r1 = client.post("/api/ventas/", json=cuerpo, headers=admin)
        assert r1.status_code == 201, r1.text
        ids.add(r1.json()["id"])

        # El reintento devuelve la MISMA venta, no una nueva
        r2 = client.post("/api/ventas/", json=cuerpo, headers=admin)
        assert r2.status_code in (200, 201), r2.text
        ids.add(r2.json()["id"])
        assert r2.json()["id"] == r1.json()["id"], "se creó una segunda venta"

        # Y el stock se descontó una sola vez
        stock = client.get(f"/api/productos/{prod['id']}", headers=admin).json()["stock"]
        assert stock == 18, f"el stock se descontó dos veces (quedó en {stock})"
    finally:
        _limpiar(cli["id"], prod["id"], ids)


def test_una_compra_distinta_del_mismo_cliente_si_se_registra(client, admin):
    """La guarda no puede bloquear una venta legítima: si cambia la cantidad,
    el producto o el método de pago, es otra compra."""
    cli, prod = _cliente(client, admin), _producto(client, admin)
    ids = set()
    try:
        base = {"cliente_id": cli["id"], "metodo_pago": "efectivo",
                "items": [{"producto_id": prod["id"], "cantidad": 1}]}
        r1 = client.post("/api/ventas/", json=base, headers=admin)
        assert r1.status_code == 201
        ids.add(r1.json()["id"])

        # Distinta cantidad
        otra = {**base, "items": [{"producto_id": prod["id"], "cantidad": 3}]}
        r2 = client.post("/api/ventas/", json=otra, headers=admin)
        assert r2.status_code == 201
        ids.add(r2.json()["id"])
        assert r2.json()["id"] != r1.json()["id"], "se bloqueó una venta legítima"

        # Mismo carrito pero pagando con otro método
        con_tarjeta = {**base, "metodo_pago": "tarjeta"}
        r3 = client.post("/api/ventas/", json=con_tarjeta, headers=admin)
        assert r3.status_code == 201
        ids.add(r3.json()["id"])
        assert r3.json()["id"] not in {r1.json()["id"], r2.json()["id"]}
    finally:
        _limpiar(cli["id"], prod["id"], ids)


def test_la_guarda_ignora_las_ventas_anuladas(client, admin):
    """Si se anuló y se vuelve a cobrar, es un cobro nuevo a propósito: la
    guarda no debe devolver la venta anulada como si fuera la buena."""
    cli, prod = _cliente(client, admin), _producto(client, admin)
    ids = set()
    try:
        cuerpo = {"cliente_id": cli["id"], "metodo_pago": "efectivo",
                  "items": [{"producto_id": prod["id"], "cantidad": 1}]}
        r1 = client.post("/api/ventas/", json=cuerpo, headers=admin)
        ids.add(r1.json()["id"])
        client.post(f"/api/ventas/{r1.json()['id']}/anular",
                    json={"motivo": "Se cobró de más por error"}, headers=admin)

        r2 = client.post("/api/ventas/", json=cuerpo, headers=admin)
        assert r2.status_code == 201
        ids.add(r2.json()["id"])
        assert r2.json()["id"] != r1.json()["id"], "devolvió la venta anulada"
        assert r2.json()["anulada"] is False
    finally:
        _limpiar(cli["id"], prod["id"], ids)
