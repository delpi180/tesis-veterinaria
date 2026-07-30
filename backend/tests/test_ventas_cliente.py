"""El nombre del cliente va embebido en la venta.

Antes VentaOut solo traía cliente_id; el frontend resolvía el nombre pidiendo
el catálogo COMPLETO de clientes y buscando ahí. Con la clínica en producción
(miles de clientes) ese catálogo se pide con un límite, así que cualquier
venta de un cliente fuera de ese límite mostraba "Cliente #123" en la lista,
el reporte y la boleta que se le entrega. La prueba usa un nombre que
ordena al final del alfabeto para simular justamente ese caso: un cliente
que NUNCA estaría entre los primeros de una lista paginada por nombre.

    cd backend
    python -m pytest tests/test_ventas_cliente.py -v
"""
import uuid

from database import SessionLocal
from sqlalchemy import text


def _cliente_al_final_del_alfabeto(client, admin):
    """DNI único + nombre 'ZZZ…' para no colisionar y para ordenar último."""
    r = client.post("/api/clientes/", json={
        "nombre": f"ZZZ QA Cliente Final {uuid.uuid4().hex[:6]}",
        "dni": str(uuid.uuid4().int)[:8],
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _producto_con_stock(client, admin):
    r = client.post("/api/productos/", json={
        "nombre": f"QA Producto Venta {uuid.uuid4().hex[:6]}",
        "categoria": "accesorio", "precio": 15.0, "stock": 20, "stock_minimo": 1,
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _limpiar(cliente_id=None, producto_id=None, venta_id=None):
    db = SessionLocal()
    try:
        if venta_id:
            db.execute(text("DELETE FROM venta_items WHERE venta_id = :v"), {"v": venta_id})
            db.execute(text("DELETE FROM ventas WHERE id = :v"), {"v": venta_id})
        if producto_id:
            db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id = :p"), {"p": producto_id})
            db.execute(text("DELETE FROM productos WHERE id = :p"), {"p": producto_id})
        if cliente_id:
            db.execute(text("DELETE FROM clientes WHERE id = :c"), {"c": cliente_id})
        db.commit()
    finally:
        db.close()


def test_la_venta_trae_el_nombre_del_cliente_sin_pedir_el_catalogo(client, admin):
    cli = _cliente_al_final_del_alfabeto(client, admin)
    prod = _producto_con_stock(client, admin)
    venta_id = None
    try:
        r = client.post("/api/ventas/", json={
            "cliente_id": cli["id"], "metodo_pago": "efectivo",
            "items": [{"producto_id": prod["id"], "cantidad": 1}],
        }, headers=admin)
        assert r.status_code == 201, r.text
        venta = r.json()
        venta_id = venta["id"]

        assert venta["cliente_nombre"] == cli["nombre"]
        assert venta["cliente_dni"] == cli["dni"]

        # Y también al listarla, no solo al crearla
        listado = client.get("/api/ventas/", headers=admin).json()
        fila = next(v for v in listado if v["id"] == venta_id)
        assert fila["cliente_nombre"] == cli["nombre"]

        detalle = client.get(f"/api/ventas/{venta_id}", headers=admin).json()
        assert detalle["cliente_nombre"] == cli["nombre"]
    finally:
        if venta_id:
            client.post(f"/api/ventas/{venta_id}/anular",
                        json={"motivo": "Limpieza de prueba automatizada"}, headers=admin)
        _limpiar(cliente_id=cli["id"], producto_id=prod["id"], venta_id=venta_id)


def test_anular_tambien_trae_el_nombre_del_cliente(client, admin):
    """El diálogo de anulación en el frontend depende de esto para mostrar a
    quién pertenece la venta que se va a anular."""
    cli = _cliente_al_final_del_alfabeto(client, admin)
    prod = _producto_con_stock(client, admin)
    venta_id = None
    try:
        venta = client.post("/api/ventas/", json={
            "cliente_id": cli["id"], "metodo_pago": "efectivo",
            "items": [{"producto_id": prod["id"], "cantidad": 1}],
        }, headers=admin).json()
        venta_id = venta["id"]

        anulada = client.post(f"/api/ventas/{venta_id}/anular",
                              json={"motivo": "Prueba de nombre en anulación"}, headers=admin)
        assert anulada.status_code == 200
        assert anulada.json()["cliente_nombre"] == cli["nombre"]
    finally:
        _limpiar(cliente_id=cli["id"], producto_id=prod["id"], venta_id=venta_id)


def test_listar_productos_respeta_limit_y_skip(client, admin):
    """Único listado del sistema que no tenía ningún tope; ahora sí lo tiene."""
    r = client.get("/api/productos/?limit=1", headers=admin)
    assert r.status_code == 200
    assert len(r.json()) <= 1

    todos = client.get("/api/productos/?limit=5000&solo_activos=false", headers=admin).json()
    if len(todos) >= 2:
        pagina = client.get("/api/productos/?limit=1&skip=1&solo_activos=false", headers=admin).json()
        assert pagina[0]["id"] == todos[1]["id"]
