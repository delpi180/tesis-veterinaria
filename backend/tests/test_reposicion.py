"""
Reposición sugerida: qué pedir según lo que de verdad se consume.

    cd backend
    DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo python -m pytest tests/test_reposicion.py -v
"""
import uuid


def _producto(client, admin, stock):
    r = client.post("/api/productos/", json={
        "nombre": f"QA Reposicion {uuid.uuid4().hex[:8]}", "categoria": "medicamento",
        "precio": 10.0, "stock": stock, "stock_minimo": 1,
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _vender(client, admin, producto, cantidad):
    cliente = client.get("/api/clientes/?limit=1", headers=admin).json()[0]
    r = client.post("/api/ventas/", json={
        "cliente_id": cliente["id"], "metodo_pago": "efectivo",
        "items": [{"producto_id": producto["id"], "cantidad": cantidad}],
    }, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _borrar(client, admin, p):
    if client.delete(f"/api/productos/{p['id']}", headers=admin).status_code != 204:
        client.put(f"/api/productos/{p['id']}", json={"activo": False}, headers=admin)


def _sugeridos(client, admin):
    return {x["id"]: x for x in client.get("/api/productos/reposicion", headers=admin).json()}


def test_lo_que_se_vende_rapido_se_sugiere_pedir(client, admin):
    p = _producto(client, admin, stock=20)
    try:
        _vender(client, admin, p, 15)           # quedan 5, se vendieron 15 en el mes
        s = _sugeridos(client, admin)[p["id"]]
        assert s["consumo_diario"] == 0.5
        assert s["dias_restantes"] == 10.0       # 5 de stock a 0.5 por día
        assert s["sugerido"] == 10               # para 30 días hacen falta 15, hay 5
        assert s["urgente"] is False
    finally:
        _borrar(client, admin, p)


def test_lo_que_casi_no_se_vende_no_aparece(client, admin):
    p = _producto(client, admin, stock=100)
    try:
        _vender(client, admin, p, 3)
        assert p["id"] not in _sugeridos(client, admin)
    finally:
        _borrar(client, admin, p)


def test_sin_ventas_no_hay_nada_que_predecir(client, admin):
    p = _producto(client, admin, stock=0)        # agotado, pero nunca se vendió
    try:
        assert p["id"] not in _sugeridos(client, admin)
    finally:
        _borrar(client, admin, p)


def test_una_venta_anulada_no_cuenta_como_consumo(client, admin):
    p = _producto(client, admin, stock=20)
    try:
        v = _vender(client, admin, p, 15)
        client.post(f"/api/ventas/{v['id']}/anular", json={"motivo": "Cobro duplicado por error"}, headers=admin)
        assert p["id"] not in _sugeridos(client, admin)
    finally:
        _borrar(client, admin, p)


def test_comprar_mas_stock_no_se_confunde_con_consumo(client, admin):
    p = _producto(client, admin, stock=20)
    try:
        client.post(f"/api/productos/{p['id']}/ajuste-stock", json={"cantidad": 50, "motivo": "Compra al proveedor"}, headers=admin)
        assert p["id"] not in _sugeridos(client, admin)
    finally:
        _borrar(client, admin, p)
