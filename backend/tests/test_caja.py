"""Anulación de ventas y cierre de caja (arqueo).

Lo que se protege acá es plata e inventario, así que todo se ejercita contra
los endpoints reales: que el stock vuelva, que los totales dejen de contar lo
anulado y que el cierre no se pueda tocar dos veces.

    cd backend
    python -m pytest tests/test_caja.py -v
"""
from datetime import date, timedelta

from sqlalchemy import text

from database import SessionLocal


def _limpiar_cierre(dia: date):
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM cierres_caja WHERE fecha = :f"), {"f": dia})
        db.commit()
    finally:
        db.close()


def _producto_con_stock(client, admin, minimo=5):
    productos = client.get("/api/productos/?limit=50", headers=admin).json()
    disponibles = [p for p in productos if p["stock"] > minimo]
    assert disponibles, "se necesita un producto con stock para esta prueba"
    return disponibles[0]


def _crear_venta(client, admin, producto, cantidad=2, metodo="efectivo"):
    cliente = client.get("/api/clientes/?limit=1", headers=admin).json()[0]
    r = client.post("/api/ventas/", json={
        "cliente_id": cliente["id"], "metodo_pago": metodo,
        "items": [{"producto_id": producto["id"], "cantidad": cantidad}],
    }, headers=admin)
    assert r.status_code == 201, f"no se pudo crear la venta: {r.text}"
    return r.json()


# ── Anulación ────────────────────────────────────────────────────────────────

def test_anular_venta_devuelve_el_stock(client, admin):
    """Anular tiene que revertir el descuento de inventario.

    Al vender se descuenta stock; sin esta reversión, un error de cobro se
    convertiría además en un error de inventario.
    """
    p = _producto_con_stock(client, admin)
    stock_inicial = p["stock"]

    venta = _crear_venta(client, admin, p, cantidad=2)
    tras_vender = client.get(f"/api/productos/{p['id']}", headers=admin).json()["stock"]
    assert tras_vender == stock_inicial - 2

    r = client.post(f"/api/ventas/{venta['id']}/anular",
                    json={"motivo": "Cobro duplicado por error"}, headers=admin)
    assert r.status_code == 200
    assert r.json()["anulada"] is True

    tras_anular = client.get(f"/api/productos/{p['id']}", headers=admin).json()["stock"]
    assert tras_anular == stock_inicial, "el stock no volvió a su valor original"


def test_anular_no_borra_la_venta(client, admin):
    """La venta anulada sigue existiendo: el comprobante ya se entregó y su
    número tiene que poder rastrearse."""
    p = _producto_con_stock(client, admin)
    venta = _crear_venta(client, admin, p, cantidad=1)
    client.post(f"/api/ventas/{venta['id']}/anular",
                json={"motivo": "Cliente devolvió el producto"}, headers=admin)

    r = client.get(f"/api/ventas/{venta['id']}", headers=admin)
    assert r.status_code == 200, "la venta anulada debe seguir siendo consultable"
    d = r.json()
    assert d["anulada"] is True
    assert d["motivo_anulacion"] == "Cliente devolvió el producto"
    assert d["anulada_por"] == "qa_admin"


def test_anular_exige_motivo_y_no_se_repite(client, admin):
    p = _producto_con_stock(client, admin)
    venta = _crear_venta(client, admin, p, cantidad=1)

    # Un motivo vacío o de una letra no sirve como constancia
    assert client.post(f"/api/ventas/{venta['id']}/anular",
                       json={"motivo": "x"}, headers=admin).status_code == 422

    assert client.post(f"/api/ventas/{venta['id']}/anular",
                       json={"motivo": "Motivo válido de prueba"}, headers=admin).status_code == 200
    # Anular dos veces devolvería el stock dos veces
    assert client.post(f"/api/ventas/{venta['id']}/anular",
                       json={"motivo": "Otra vez"}, headers=admin).status_code == 409


def test_anular_es_solo_de_la_administradora(client, admin, doctor):
    """Mueve dinero e inventario: no es una acción del veterinario."""
    p = _producto_con_stock(client, admin)
    venta = _crear_venta(client, admin, p, cantidad=1)
    try:
        r = client.post(f"/api/ventas/{venta['id']}/anular",
                        json={"motivo": "Intento del veterinario"}, headers=doctor)
        assert r.status_code == 403
        # y sigue sin anularse
        assert client.get(f"/api/ventas/{venta['id']}", headers=admin).json()["anulada"] is False
    finally:
        # La prueba deja una venta real: si no se anula, queda sumando en los
        # totales del día y en el stock descontado.
        client.post(f"/api/ventas/{venta['id']}/anular",
                    json={"motivo": "Limpieza de prueba automatizada"}, headers=admin)


def test_lo_anulado_no_suma_en_los_totales(client, admin):
    """Si lo anulado siguiera sumando, anular no serviría de nada.

    Se comprueba en el arqueo Y en el panel de inicio: son cálculos distintos
    y hay que excluirlo en los dos.
    """
    p = _producto_con_stock(client, admin)
    antes_caja = client.get("/api/dashboard/cierre-caja", headers=admin).json()

    venta = _crear_venta(client, admin, p, cantidad=2, metodo="efectivo")
    con_venta = client.get("/api/dashboard/cierre-caja", headers=admin).json()
    assert con_venta["total"] > antes_caja["total"]

    client.post(f"/api/ventas/{venta['id']}/anular",
                json={"motivo": "Prueba de exclusión en totales"}, headers=admin)

    despues = client.get("/api/dashboard/cierre-caja", headers=admin).json()
    assert despues["total"] == antes_caja["total"], "el total del día debe volver a su valor previo"
    assert despues["num_ventas"] == antes_caja["num_ventas"]
    assert despues["efectivo_esperado"] == antes_caja["efectivo_esperado"]

    # Pero sigue visible como constancia, no desaparece del listado
    anuladas = [v for v in despues["ventas"] if v["anulada"]]
    assert any(v["id"] == venta["id"] for v in anuladas)

    # El panel de inicio usa otro cálculo: también tiene que excluirla
    resumen = client.get("/api/dashboard/resumen", headers=admin).json()
    assert resumen["ingresos_dia"] == despues["total"]


# ── Cierre de caja (arqueo) ──────────────────────────────────────────────────

def test_cierre_de_caja_registra_la_diferencia(client, admin):
    """El arqueo compara lo contado contra lo esperado y guarda la diferencia."""
    ayer = date.today() - timedelta(days=1)
    _limpiar_cierre(ayer)
    try:
        r = client.post("/api/dashboard/cierre-caja", json={
            "fecha": ayer.isoformat(), "efectivo_contado": 0,
            "notas": "Prueba automatizada",
        }, headers=admin)
        assert r.status_code == 201
        d = r.json()
        assert d["diferencia"] == d["efectivo_contado"] - d["efectivo_esperado"]
        assert d["cerrado_por"] == "qa_admin"

        # El arqueo queda visible al consultar ese día
        consulta = client.get(f"/api/dashboard/cierre-caja?fecha={ayer.isoformat()}", headers=admin).json()
        assert consulta["cierre"] is not None
        assert consulta["cierre"]["notas"] == "Prueba automatizada"
    finally:
        _limpiar_cierre(ayer)


def test_la_caja_se_cierra_una_sola_vez(client, admin):
    """Si se pudiera cerrar dos veces dejaría de ser una constancia."""
    ayer = date.today() - timedelta(days=1)
    _limpiar_cierre(ayer)
    try:
        assert client.post("/api/dashboard/cierre-caja",
                           json={"fecha": ayer.isoformat(), "efectivo_contado": 10},
                           headers=admin).status_code == 201
        assert client.post("/api/dashboard/cierre-caja",
                           json={"fecha": ayer.isoformat(), "efectivo_contado": 999},
                           headers=admin).status_code == 409
    finally:
        _limpiar_cierre(ayer)


def test_cerrar_caja_es_solo_de_la_administradora(client, doctor):
    assert client.post("/api/dashboard/cierre-caja",
                       json={"efectivo_contado": 10}, headers=doctor).status_code == 403


def test_no_se_anula_una_venta_de_un_dia_ya_cerrado(client, admin):
    """Anular después del cierre cambiaría un arqueo ya firmado."""
    hoy = date.today()
    _limpiar_cierre(hoy)
    p = _producto_con_stock(client, admin)
    venta = _crear_venta(client, admin, p, cantidad=1)
    try:
        assert client.post("/api/dashboard/cierre-caja",
                           json={"efectivo_contado": 0}, headers=admin).status_code == 201
        r = client.post(f"/api/ventas/{venta['id']}/anular",
                        json={"motivo": "Después del cierre"}, headers=admin)
        assert r.status_code == 409
        assert "cerrada" in r.json()["detail"].lower()
    finally:
        _limpiar_cierre(hoy)
        # dejar la venta anulada para no ensuciar los totales del día
        client.post(f"/api/ventas/{venta['id']}/anular",
                    json={"motivo": "Limpieza de prueba automatizada"}, headers=admin)
