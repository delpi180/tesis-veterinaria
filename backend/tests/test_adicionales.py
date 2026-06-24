"""
Tests adicionales para el sistema Veterinaria Los Pinos.
Cubre la búsqueda global, encuestas (SUS/TAM), CRUD de citas y restricciones de inventario/servicios.
"""
import pytest
from sqlalchemy import text

from database import SessionLocal


# ── Búsqueda Global ──────────────────────────────────────────────────────────

def test_busqueda_global_flujo(client, admin):
    cli_id = None
    pac_id = None
    cita_id = None
    
    try:
        # Crear cliente, mascota y cita temporales
        cli = client.post("/api/clientes/", json={"nombre": "BusquedaUnica Propietario", "dni": "98989898"}, headers=admin).json()
        cli_id = cli["id"]
        
        pac = client.post(f"/api/clientes/{cli_id}/pacientes/", json={"nombre": "BusquedaUnica Paciente", "especie": "Exótico"}, headers=admin).json()
        pac_id = pac["id"]
        
        cita = client.post("/api/citas/", json={
            "paciente_id": pac_id,
            "fecha_hora": "2026-07-20T10:00:00",
            "motivo": "BusquedaUnica Motivo",
            "estado": "pendiente"
        }, headers=admin).json()
        cita_id = cita["id"]

        # Buscar el término único
        r = client.get("/api/busqueda/?q=BusquedaUnica", headers=admin)
        assert r.status_code == 200
        res = r.json()
        assert "clientes" in res
        assert "pacientes" in res
        assert "citas" in res
        
        # Debe haber al menos un resultado en cada categoría
        assert len(res["clientes"]) >= 1
        assert res["clientes"][0]["nombre"] == "BusquedaUnica Propietario"
        
        assert len(res["pacientes"]) >= 1
        assert res["pacientes"][0]["nombre"] == "BusquedaUnica Paciente"
        
        assert len(res["citas"]) >= 1
        assert res["citas"][0]["motivo"] == "BusquedaUnica Motivo"

    finally:
        db = SessionLocal()
        if cita_id:
            db.execute(text("DELETE FROM citas WHERE id=:id"), {"id": cita_id})
        if pac_id:
            db.execute(text("DELETE FROM pacientes WHERE id=:id"), {"id": pac_id})
        if cli_id:
            db.execute(text("DELETE FROM clientes WHERE id=:id"), {"id": cli_id})
        db.commit()
        db.close()


# ── Evaluadores y Encuestas (SUS & TAM) ───────────────────────────────────────

def test_evaluadores_y_encuestas_flujo(client, admin):
    # 1. Crear evaluador
    r = client.post("/api/evaluadores/", json={
        "nombre": "Evaluador QA",
        "rol": "veterinario"
    }, headers=admin)
    assert r.status_code == 201
    evaluador = r.json()
    ev_id = evaluador["id"]
    assert evaluador["nombre"] == "Evaluador QA"

    sus_id = None
    tam_id = None
    try:
        # 2. Listar evaluadores
        r = client.get("/api/evaluadores/", headers=admin)
        assert r.status_code == 200
        assert any(e["id"] == ev_id for e in r.json())

        # 3. Obtener evaluador individual
        r = client.get(f"/api/evaluadores/{ev_id}", headers=admin)
        assert r.status_code == 200
        assert r.json()["nombre"] == "Evaluador QA"

        # 4. Crear encuesta SUS
        # El puntaje se calcula como: sum(impares - 1) + sum(5 - pares) * 2.5
        # Hagamos un set de respuestas:
        # Impares: p1=5 (4), p3=5 (4), p5=5 (4), p7=5 (4), p9=5 (4) -> sum = 20
        # Pares: p2=1 (4), p4=1 (4), p6=1 (4), p8=1 (4), p10=1 (4) -> sum = 20
        # Total = 40 * 2.5 = 100
        sus_payload = {
            "evaluador_id": ev_id,
            "p1": 5, "p2": 1, "p3": 5, "p4": 1, "p5": 5,
            "p6": 1, "p7": 5, "p8": 1, "p9": 5, "p10": 1
        }
        r = client.post("/api/sus/", json=sus_payload, headers=admin)
        assert r.status_code == 201
        sus = r.json()
        sus_id = sus["id"]
        assert sus["puntaje"] == 100

        # 5. Obtener SUS y listar SUS
        r = client.get(f"/api/sus/{sus_id}", headers=admin)
        assert r.status_code == 200
        assert r.json()["puntaje"] == 100

        r = client.get("/api/sus/", headers=admin)
        assert r.status_code == 200
        assert any(s["id"] == sus_id for s in r.json())

        # 6. Crear encuesta TAM
        # Las dimensiones son:
        # util: p1-p5 (promedio de 5)
        # facilidad: p6-p9 (promedio de 4)
        # intencion: p10-p12 (promedio de 3)
        # Vamos a poner p1-p5 a 5 (promedio 5.0), p6-p9 a 4 (promedio 4.0), p10-p12 a 3 (promedio 3.0)
        tam_payload = {
            "evaluador_id": ev_id,
            "p1": 5, "p2": 5, "p3": 5, "p4": 5, "p5": 5,
            "p6": 4, "p7": 4, "p8": 4, "p9": 4,
            "p10": 3, "p11": 3, "p12": 3
        }
        r = client.post("/api/tam/", json=tam_payload, headers=admin)
        assert r.status_code == 201
        tam = r.json()
        tam_id = tam["id"]
        assert tam["util_percibida"] == 5.0
        assert tam["facilidad_uso"] == 4.0
        assert tam["intencion_uso"] == 3.0

        # 7. Obtener TAM y listar TAM
        r = client.get(f"/api/tam/{tam_id}", headers=admin)
        assert r.status_code == 200
        assert r.json()["util_percibida"] == 5.0

        r = client.get("/api/tam/", headers=admin)
        assert r.status_code == 200
        assert any(t["id"] == tam_id for t in r.json())

        # 8. Errores con evaluador inexistente
        r = client.post("/api/sus/", json={**sus_payload, "evaluador_id": 99999}, headers=admin)
        assert r.status_code == 404

        r = client.post("/api/tam/", json={**tam_payload, "evaluador_id": 99999}, headers=admin)
        assert r.status_code == 404

    finally:
        db = SessionLocal()
        if sus_id:
            db.execute(text("DELETE FROM respuestas_sus WHERE id=:id"), {"id": sus_id})
        if tam_id:
            db.execute(text("DELETE FROM respuestas_tam WHERE id=:id"), {"id": tam_id})
        db.execute(text("DELETE FROM evaluadores WHERE id=:id"), {"id": ev_id})
        db.commit()
        db.close()


# ── CRUD Citas Completo ───────────────────────────────────────────────────────

def test_citas_crud_completo(client, admin):
    cli_id = None
    pac_id = None
    cita_id = None
    try:
        # 1. Crear un cliente y mascota (paciente) temporales
        cli = client.post("/api/clientes/", json={"nombre": "Cita Test Propietario", "dni": "12121212"}, headers=admin).json()
        cli_id = cli["id"]
        
        pac = client.post(f"/api/clientes/{cli_id}/pacientes/", json={"nombre": "Cita Test Paciente", "especie": "Felino"}, headers=admin).json()
        pac_id = pac["id"]
        
        # 2. Crear cita para el paciente
        r = client.post("/api/citas/", json={
            "paciente_id": pac_id,
            "fecha_hora": "2026-07-15T15:30:00",
            "motivo": "Control rutinario",
            "estado": "pendiente"
        }, headers=admin)
        assert r.status_code == 201
        cita = r.json()
        cita_id = cita["id"]
        assert cita["motivo"] == "Control rutinario"
        assert cita["paciente_id"] == pac_id

        # 3. Intentar crear cita para un paciente inexistente (espera 404)
        r_error = client.post("/api/citas/", json={
            "paciente_id": 99999,
            "fecha_hora": "2026-07-15T15:30:00",
            "motivo": "Error",
            "estado": "pendiente"
        }, headers=admin)
        assert r_error.status_code == 404

        # 4. Obtener cita individual
        r = client.get(f"/api/citas/{cita_id}", headers=admin)
        assert r.status_code == 200
        assert r.json()["motivo"] == "Control rutinario"

        # 5. Listar citas con filtros
        r = client.get(f"/api/citas/?paciente_id={pac_id}", headers=admin)
        assert r.status_code == 200
        assert len(r.json()) >= 1
        assert r.json()[0]["id"] == cita_id

        # 6. Actualizar cita
        r = client.put(f"/api/citas/{cita_id}", json={
            "motivo": "Control post-operatorio",
            "estado": "confirmada"
        }, headers=admin)
        assert r.status_code == 200
        assert r.json()["motivo"] == "Control post-operatorio"
        assert r.json()["estado"] == "confirmada"

        # 7. Eliminar cita
        r = client.delete(f"/api/citas/{cita_id}", headers=admin)
        assert r.status_code == 204
        
        # 8. Verificar que ya no existe (espera 404)
        r = client.get(f"/api/citas/{cita_id}", headers=admin)
        assert r.status_code == 404
        cita_id = None

    finally:
        # Limpieza manual en BD
        db = SessionLocal()
        if cita_id:
            db.execute(text("DELETE FROM citas WHERE id=:id"), {"id": cita_id})
        if pac_id:
            db.execute(text("DELETE FROM pacientes WHERE id=:id"), {"id": pac_id})
        if cli_id:
            db.execute(text("DELETE FROM clientes WHERE id=:id"), {"id": cli_id})
        db.commit()
        db.close()


# ── Productos, Restricciones y Stock Bajo ─────────────────────────────────────

def test_productos_restriccion_y_stock(client, admin):
    # 1. Crear producto con stock y stock_minimo
    prod = client.post("/api/productos/", json={
        "nombre": "QA Prod Restriccion",
        "categoria": "comida",
        "precio": 15.0,
        "stock": 10,
        "stock_minimo": 12,
        "activo": True
    }, headers=admin).json()
    prod_id = prod["id"]

    cli_id = None
    venta_id = None
    try:
        # 2. Ajuste stock que resulte negativo -> 422
        r = client.post(f"/api/productos/{prod_id}/ajuste-stock", json={
            "cantidad": -15,
            "motivo": "Merma"
        }, headers=admin)
        assert r.status_code == 422

        # 3. Verificar stock-bajo
        r = client.get("/api/productos/stock-bajo", headers=admin)
        assert r.status_code == 200
        assert any(p["id"] == prod_id for p in r.json())

        # 4. Crear cliente, venta y asociar el producto en venta_items
        cli = client.post("/api/clientes/", json={"nombre": "Comprador Prod", "dni": "77777777"}, headers=admin).json()
        cli_id = cli["id"]
        
        # Creamos una venta
        venta = client.post("/api/ventas/", json={
            "cliente_id": cli_id,
            "metodo_pago": "efectivo",
            "items": [{"producto_id": prod_id, "cantidad": 2}]
        }, headers=admin).json()
        venta_id = venta["id"]

        # Intento eliminar producto con ventas -> 409
        r = client.delete(f"/api/productos/{prod_id}", headers=admin)
        assert r.status_code == 409
        assert "No se puede eliminar" in r.json()["detail"]

    finally:
        db = SessionLocal()
        if venta_id:
            db.execute(text("DELETE FROM venta_items WHERE venta_id=:id"), {"id": venta_id})
            db.execute(text("DELETE FROM ventas WHERE id=:id"), {"id": venta_id})
        if cli_id:
            db.execute(text("DELETE FROM clientes WHERE id=:id"), {"id": cli_id})
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id=:id"), {"id": prod_id})
        db.execute(text("DELETE FROM productos WHERE id=:id"), {"id": prod_id})
        db.commit()
        db.close()


# ── Servicios, Restricción de Eliminación ─────────────────────────────────────

def test_servicios_restriccion_eliminacion(client, admin):
    # 1. Crear servicio
    serv = client.post("/api/servicios/", json={
        "nombre": "QA Servicio Restriccion",
        "precio": 50.0,
        "precio_variable": False,
        "activo": True
    }, headers=admin).json()
    serv_id = serv["id"]

    cli_id = None
    venta_id = None
    try:
        # 2. Crear cliente y venta asociando el servicio
        cli = client.post("/api/clientes/", json={"nombre": "Comprador Serv", "dni": "88888888"}, headers=admin).json()
        cli_id = cli["id"]
        
        venta = client.post("/api/ventas/", json={
            "cliente_id": cli_id,
            "metodo_pago": "yape",
            "items": [{"servicio_id": serv_id, "cantidad": 1}]
        }, headers=admin).json()
        venta_id = venta["id"]

        # 3. Intentar eliminar el servicio -> 409
        r = client.delete(f"/api/servicios/{serv_id}", headers=admin)
        assert r.status_code == 409
        assert "No se puede eliminar" in r.json()["detail"]

    finally:
        db = SessionLocal()
        if venta_id:
            db.execute(text("DELETE FROM venta_items WHERE venta_id=:id"), {"id": venta_id})
            db.execute(text("DELETE FROM ventas WHERE id=:id"), {"id": venta_id})
        if cli_id:
            db.execute(text("DELETE FROM clientes WHERE id=:id"), {"id": cli_id})
        db.execute(text("DELETE FROM servicios WHERE id=:id"), {"id": serv_id})
        db.commit()
        db.close()
