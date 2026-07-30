"""Vencimiento y lote de productos.

Lo que importa acá no es el inventario sino la seguridad del paciente: vender
un medicamento caducado no se arregla con una nota de crédito. Por eso el
bloqueo se prueba contra el endpoint real de ventas.

    cd backend
    python -m pytest tests/test_vencimientos.py -v
"""
import uuid
from datetime import date, timedelta


def _crear_producto(client, admin, **extra):
    payload = {
        "nombre": f"QA Vencimiento {uuid.uuid4().hex[:8]}",
        "categoria": "medicamento",
        "precio": 25.0,
        "stock": 10,
        "stock_minimo": 1,
        **extra,
    }
    r = client.post("/api/productos/", json=payload, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def _borrar(client, admin, producto_id):
    """Borra el producto de prueba; si ya se vendió el backend lo impide (a
    propósito), así que al menos se desactiva para que no siga alertando."""
    if client.delete(f"/api/productos/{producto_id}", headers=admin).status_code != 204:
        client.put(f"/api/productos/{producto_id}", json={"activo": False}, headers=admin)


def test_producto_sin_fecha_no_reporta_vencimiento(client, admin):
    """NULL significa "no aplica" (un collar, un plato), nunca "vencido".

    Si esto fallara, todo el inventario histórico empezaría a dar alertas.
    """
    p = _crear_producto(client, admin)
    try:
        assert p["fecha_vencimiento"] is None
        assert p["estado_vencimiento"] is None
        assert p["dias_para_vencer"] is None
    finally:
        _borrar(client, admin, p["id"])


def test_estado_distingue_vigente_por_vencer_y_vencido(client, admin):
    casos = [
        (date.today() + timedelta(days=200), "vigente"),
        (date.today() + timedelta(days=10),  "por_vencer"),
        (date.today() - timedelta(days=1),   "vencido"),
    ]
    for fecha, esperado in casos:
        p = _crear_producto(client, admin, fecha_vencimiento=fecha.isoformat(), lote="L-QA")
        try:
            assert p["estado_vencimiento"] == esperado, f"{fecha} debería ser {esperado}"
            assert p["lote"] == "L-QA"
        finally:
            _borrar(client, admin, p["id"])


def test_no_se_puede_vender_un_producto_vencido(client, admin):
    """El caso que motiva toda la funcionalidad."""
    p = _crear_producto(client, admin, fecha_vencimiento=(date.today() - timedelta(days=3)).isoformat())
    try:
        cliente = client.get("/api/clientes/?limit=1", headers=admin).json()[0]
        r = client.post("/api/ventas/", json={
            "cliente_id": cliente["id"], "metodo_pago": "efectivo",
            "items": [{"producto_id": p["id"], "cantidad": 1}],
        }, headers=admin)
        assert r.status_code == 422
        detalle = r.json()["detail"]
        assert "vencido" in detalle.lower()
        # El mensaje tiene que decir cómo salir del paso si la fecha está mal
        assert "Inventario" in detalle

        # Y el stock no se movió
        assert client.get(f"/api/productos/{p['id']}", headers=admin).json()["stock"] == 10
    finally:
        _borrar(client, admin, p["id"])


def test_uno_vencido_bloquea_la_venta_completa(client, admin):
    """Media venta cobrada sería peor que ninguna: es todo o nada."""
    bueno = _crear_producto(client, admin)
    malo  = _crear_producto(client, admin, fecha_vencimiento=(date.today() - timedelta(days=1)).isoformat())
    try:
        cliente = client.get("/api/clientes/?limit=1", headers=admin).json()[0]
        r = client.post("/api/ventas/", json={
            "cliente_id": cliente["id"], "metodo_pago": "efectivo",
            "items": [{"producto_id": bueno["id"], "cantidad": 1},
                      {"producto_id": malo["id"],  "cantidad": 1}],
        }, headers=admin)
        assert r.status_code == 422
        assert client.get(f"/api/productos/{bueno['id']}", headers=admin).json()["stock"] == 10
    finally:
        _borrar(client, admin, bueno["id"])
        _borrar(client, admin, malo["id"])


def test_vender_lo_que_esta_por_vencer_sigue_permitido(client, admin):
    """Avisar no es prohibir: lo que vence en tres semanas se vende igual, y de
    hecho conviene sacarlo antes."""
    p = _crear_producto(client, admin, fecha_vencimiento=(date.today() + timedelta(days=20)).isoformat())
    venta = None
    try:
        cliente = client.get("/api/clientes/?limit=1", headers=admin).json()[0]
        r = client.post("/api/ventas/", json={
            "cliente_id": cliente["id"], "metodo_pago": "efectivo",
            "items": [{"producto_id": p["id"], "cantidad": 1}],
        }, headers=admin)
        assert r.status_code == 201, r.text
        venta = r.json()
    finally:
        if venta:
            client.post(f"/api/ventas/{venta['id']}/anular",
                        json={"motivo": "Limpieza de prueba automatizada"}, headers=admin)
        _borrar(client, admin, p["id"])


def test_listado_por_vencer_solo_trae_lo_accionable(client, admin):
    """Sin stock no hay nada que retirar; sin fecha no hay nada que avisar."""
    vence   = _crear_producto(client, admin, fecha_vencimiento=(date.today() + timedelta(days=5)).isoformat())
    agotado = _crear_producto(client, admin, stock=0,
                              fecha_vencimiento=(date.today() + timedelta(days=5)).isoformat())
    lejano  = _crear_producto(client, admin, fecha_vencimiento=(date.today() + timedelta(days=300)).isoformat())
    sin_fecha = _crear_producto(client, admin)
    try:
        ids = {p["id"] for p in client.get("/api/productos/por-vencer", headers=admin).json()}
        assert vence["id"] in ids
        assert agotado["id"]   not in ids, "sin stock no hay nada que retirar"
        assert lejano["id"]    not in ids, "300 días no es una alerta"
        assert sin_fecha["id"] not in ids, "sin fecha no se avisa"
    finally:
        for p in (vence, agotado, lejano, sin_fecha):
            _borrar(client, admin, p["id"])


def test_el_panel_de_inicio_avisa_lo_que_esta_por_vencer(client, admin):
    p = _crear_producto(client, admin, fecha_vencimiento=(date.today() + timedelta(days=7)).isoformat(),
                        lote="L-PANEL")
    try:
        resumen = client.get("/api/dashboard/resumen", headers=admin).json()
        fila = next((x for x in resumen["por_vencer"] if x["id"] == p["id"]), None)
        assert fila is not None, "el producto por vencer no aparece en el panel"
        assert fila["dias"] == 7
        assert fila["vencido"] is False
        assert fila["lote"] == "L-PANEL"
    finally:
        _borrar(client, admin, p["id"])
