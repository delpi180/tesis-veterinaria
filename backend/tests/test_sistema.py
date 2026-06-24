"""
Tests de los flujos críticos del sistema Veterinaria Los Pinos.
Se ejecutan contra la base de datos configurada en .env. Limpian sus propios datos.

    cd backend
    ./venv/Scripts/python.exe -m pytest tests/ -v
"""
import pytest
from sqlalchemy import text

from database import SessionLocal

# Los fixtures client / admin (recepcionista) / doctor (veterinario) viven en conftest.py


# ── Autenticación ────────────────────────────────────────────────────────────

def test_login_correcto(admin):
    assert "Authorization" in admin


def test_login_incorrecto(client):
    r = client.post("/api/auth/login", json={"usuario": "admin", "password": "malo"})
    assert r.status_code == 401


def test_sin_token_rechazado(client):
    assert client.get("/api/clientes/").status_code == 401


def test_token_invalido_rechazado(client):
    r = client.get("/api/clientes/", headers={"Authorization": "Bearer abc.def"})
    assert r.status_code == 401


# ── Roles ────────────────────────────────────────────────────────────────────

def test_roles(client, admin, doctor):
    # la recepcionista es la administradora: ve clientes y gestiona usuarios
    assert client.get("/api/clientes/", headers=admin).status_code == 200
    assert client.get("/api/usuarios/", headers=admin).status_code == 200
    # el doctor NO gestiona usuarios (función de la administradora)
    assert client.get("/api/usuarios/", headers=doctor).status_code == 403
    # historias clínicas: el doctor sí; la recepcionista no
    cli = client.get("/api/clientes/", headers=admin).json()
    if cli and cli[0]["pacientes"]:
        pid = cli[0]["pacientes"][0]["id"]
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=admin).status_code == 403
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=doctor).status_code == 200


def test_admin_es_recepcionista_no_ve_historias(client, admin):
    """La administradora del sistema es recepcionista: no accede a lo clínico."""
    cli = client.get("/api/clientes/", headers=admin).json()
    if cli and cli[0]["pacientes"]:
        pid = cli[0]["pacientes"][0]["id"]
        assert client.get(f"/api/pacientes/{pid}/historias/", headers=admin).status_code == 403


def test_listar_doctores(client, admin, doctor):
    """El selector de turnos lista doctores activos (accesible a cualquier sesión)."""
    r = client.get("/api/usuarios/doctores", headers=admin)
    assert r.status_code == 200
    nombres = {d["nombre"] for d in r.json()}
    assert "QA Doctor" in nombres


# ── Validaciones ─────────────────────────────────────────────────────────────

def test_dni_invalido(client, admin):
    r = client.post("/api/clientes/", json={"nombre": "X", "dni": "123"}, headers=admin)
    assert r.status_code == 422


def test_telefono_invalido(client, admin):
    r = client.post("/api/clientes/", json={"nombre": "X", "dni": "99887766", "telefono": "1"}, headers=admin)
    assert r.status_code == 422


# ── Ventas, pagos y kardex ───────────────────────────────────────────────────

def test_venta_kardex_y_pago(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli:
        pytest.skip("No hay clientes en la BD para probar ventas")

    prod = client.post("/api/productos/", json={
        "nombre": "PyTestProd", "categoria": "comida", "precio": 10, "stock": 20,
    }, headers=admin).json()
    venta = None
    try:
        # venta con método de pago
        r = client.post("/api/ventas/", json={
            "cliente_id": cli[0]["id"], "metodo_pago": "yape",
            "items": [{"producto_id": prod["id"], "cantidad": 3}],
        }, headers=admin)
        assert r.status_code == 201
        venta = r.json()
        assert venta["metodo_pago"] == "yape"
        assert venta["total"] == 30.0

        # stock descontado
        assert client.get(f"/api/productos/{prod['id']}", headers=admin).json()["stock"] == 17

        # kardex: entrada inicial + salida por venta
        movs = client.get(f"/api/productos/{prod['id']}/movimientos", headers=admin).json()
        tipos = {m["tipo"] for m in movs}
        assert "entrada" in tipos and "salida" in tipos

        # ajuste manual de stock
        aj = client.post(f"/api/productos/{prod['id']}/ajuste-stock",
                         json={"cantidad": 5, "motivo": "compra"}, headers=admin)
        assert aj.status_code == 200 and aj.json()["stock"] == 22

        # ajuste que dejaría stock negativo → 422
        bad = client.post(f"/api/productos/{prod['id']}/ajuste-stock",
                          json={"cantidad": -999}, headers=admin)
        assert bad.status_code == 422
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM movimientos_inventario WHERE producto_id=:p"), {"p": prod["id"]})
        if venta:
            db.execute(text("DELETE FROM venta_items WHERE venta_id=:v"), {"v": venta["id"]})
            db.execute(text("DELETE FROM ventas WHERE id=:v"), {"v": venta["id"]})
        db.execute(text("DELETE FROM productos WHERE id=:p"), {"p": prod["id"]})
        db.commit(); db.close()


def test_cierre_caja(client, admin):
    r = client.get("/api/dashboard/cierre-caja", headers=admin)
    assert r.status_code == 200
    data = r.json()
    assert "total" in data and "por_metodo" in data
    assert {m["metodo"] for m in data["por_metodo"]} == {"efectivo", "tarjeta", "yape", "plin"}


# ── Ficha de mascota ─────────────────────────────────────────────────────────

def test_mascota_campos_ampliados(client, admin):
    cli = client.get("/api/clientes/", headers=admin).json()
    if not cli:
        pytest.skip("No hay clientes en la BD")
    nuevo = client.post(f"/api/clientes/{cli[0]['id']}/pacientes/", json={
        "nombre": "PyTestMascota", "especie": "Canino", "sexo": "macho",
        "esterilizado": True, "alergias": "Penicilina", "color": "Negro",
    }, headers=admin).json()
    try:
        assert nuevo["sexo"] == "macho"
        assert nuevo["esterilizado"] is True
        assert nuevo["alergias"] == "Penicilina"
    finally:
        client.delete(f"/api/pacientes/{nuevo['id']}", headers=admin)


# ── Dashboard ────────────────────────────────────────────────────────────────

def test_dashboard_resumen(client, admin):
    r = client.get("/api/dashboard/resumen", headers=admin)
    assert r.status_code == 200
    for clave in ("citas_hoy", "consultas_semana", "stock_bajo", "vacunas_proximas"):
        assert clave in r.json()


# ── Autoría de la historia clínica (firma del doctor) ────────────────────────

def test_historia_firma_del_doctor(client, admin, doctor):
    # cliente + paciente (los crea la recepcionista)
    cli = client.post("/api/clientes/", json={"nombre": "QA Dueño", "dni": "55667788"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": "QA Firulais", "especie": "Canino"}, headers=admin).json()
    try:
        # el doctor llena la historia → debe quedar firmada con su nombre
        r = client.post(f"/api/pacientes/{pac['id']}/historias/",
                        json={"motivo_consulta": "Control"}, headers=doctor)
        assert r.status_code == 201
        h = r.json()
        assert h["veterinario_nombre"] == "QA Doctor"
        assert h["veterinario_id"] is not None
    finally:
        client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit(); db.close()


# ── Control de asistencia (marcaciones) ──────────────────────────────────────

def _id_doctor(client, admin, nombre="QA Doctor"):
    docs = client.get("/api/usuarios/doctores", headers=admin).json()
    return next(d["id"] for d in docs if d["nombre"] == nombre)


def _limpiar_asistencia(doc_id):
    """Borra marcaciones previas del doctor para aislar el test."""
    db = SessionLocal()
    db.execute(text("DELETE FROM asistencias WHERE usuario_id=:u"), {"u": doc_id})
    db.commit(); db.close()


def test_asistencia_ingreso_salida(client, admin, doctor):
    doc_id = _id_doctor(client, admin)
    _limpiar_asistencia(doc_id)
    reg = None
    try:
        # ingreso
        r = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin)
        assert r.status_code == 201
        reg = r.json()
        assert reg["hora_ingreso"] is not None
        assert reg["hora_salida"] is None

        # segundo ingreso abierto el mismo día → 409
        dup = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin)
        assert dup.status_code == 409

        # salida → calcula horas trabajadas
        s = client.post(f"/api/asistencia/{reg['id']}/salida", headers=admin)
        assert s.status_code == 200
        assert s.json()["hora_salida"] is not None
        assert s.json()["horas_trabajadas"] is not None
    finally:
        if reg:
            client.delete(f"/api/asistencia/{reg['id']}", headers=admin)


def test_asistencia_resumen_y_tardanza(client, admin):
    doc_id = _id_doctor(client, admin)
    _limpiar_asistencia(doc_id)
    # asigna un horario temprano para forzar tardanza (la marcación es "ahora")
    client.put(f"/api/usuarios/{doc_id}",
               json={"hora_entrada": "00:01", "dias_laborales": "lun,mar,mie,jue,vie,sab,dom"}, headers=admin)
    reg = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin).json()
    try:
        # la marcación expone el horario pactado y los minutos de tardanza
        assert reg["hora_entrada_perfil"] == "00:01"
        assert reg["tardanza_min"] is not None and reg["tardanza_min"] > 0
        # el resumen agrega por doctor
        r = client.get("/api/asistencia/resumen", headers=admin)
        assert r.status_code == 200
        fila = next((x for x in r.json() if x["usuario_id"] == doc_id), None)
        assert fila and fila["dias"] >= 1 and fila["tardanzas"] >= 1
    finally:
        client.delete(f"/api/asistencia/{reg['id']}", headers=admin)


def test_resumen_solo_admin(client, doctor):
    assert client.get("/api/asistencia/resumen", headers=doctor).status_code == 403


def test_asistencia_solo_admin(client, doctor, admin):
    doc_id = _id_doctor(client, admin)
    # un doctor NO puede registrar asistencia (es función de la administradora)
    r = client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=doctor)
    assert r.status_code == 403
    assert client.get("/api/asistencia/", headers=doctor).status_code == 403


# ── Panel personal del doctor ────────────────────────────────────────────────

def test_mi_panel_doctor(client, doctor):
    r = client.get("/api/mi-panel/", headers=doctor)
    assert r.status_code == 200
    d = r.json()
    for clave in ("doctor", "mis_turnos", "seguimiento", "resumen_historias", "asistencia_hoy"):
        assert clave in d
    assert d["doctor"]["nombre"] == "QA Doctor"


def test_mi_panel_no_para_recepcion(client, admin):
    # la administradora (recepcionista) no tiene panel clínico personal
    assert client.get("/api/mi-panel/", headers=admin).status_code == 403


# ── Datos compartidos entre cuentas (una sola base de datos) ─────────────────

def test_admin_se_refleja_en_doctor(client, admin, doctor):
    """Lo que hace la administradora lo ve el doctor en su cuenta."""
    doc_id = _id_doctor(client, admin)
    _limpiar_asistencia(doc_id)
    # admin configura el horario del doctor
    client.put(f"/api/usuarios/{doc_id}",
               json={"hora_entrada": "09:00", "dias_laborales": "lun,mar,mie,jue,vie"}, headers=admin)
    # admin crea cliente + paciente + turno asignado al doctor
    cli = client.post("/api/clientes/", json={"nombre": "Compartido", "dni": "44556677"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": "Shared", "especie": "Canino"}, headers=admin).json()
    cita = None
    try:
        cita = client.post("/api/citas/", json={
            "paciente_id": pac["id"], "fecha_hora": "2027-01-15T10:00:00",
            "motivo": "Control", "veterinario_id": doc_id,
        }, headers=admin).json()

        # el doctor ve el turno y su horario en SU panel
        panel = client.get("/api/mi-panel/", headers=doctor).json()
        assert any(t["id"] == cita["id"] for t in panel["mis_turnos"])
        assert panel["asistencia_hoy"]["hora_entrada_perfil"] == "09:00"

        # admin marca asistencia del doctor → el doctor la ve
        client.post("/api/asistencia/ingreso", json={"usuario_id": doc_id}, headers=admin)
        panel2 = client.get("/api/mi-panel/", headers=doctor).json()
        assert panel2["asistencia_hoy"]["marcado"] is True
    finally:
        _limpiar_asistencia(doc_id)
        if cita:
            client.delete(f"/api/citas/{cita['id']}", headers=admin)
        client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit(); db.close()


def test_actividad_se_registra(client, admin):
    """Cada acción que modifica datos queda en la bitácora."""
    cli = client.post("/api/clientes/", json={"nombre": "AuditCli", "dni": "66778899"}, headers=admin).json()
    try:
        r = client.get("/api/actividad/", headers=admin)
        assert r.status_code == 200
        assert any(a["accion"] == "Registró un cliente" and a["usuario"] == "qa_admin" for a in r.json())
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit(); db.close()


def test_actividad_solo_admin(client, doctor):
    assert client.get("/api/actividad/", headers=doctor).status_code == 403


def test_actividad_filtros(client, admin):
    """Los filtros por fecha y usuario no deben romper (regresión del 500)."""
    from datetime import date
    hoy = date.today().isoformat()
    r = client.get(f"/api/actividad/?desde={hoy}&hasta={hoy}", headers=admin)
    assert r.status_code == 200 and isinstance(r.json(), list)
    r2 = client.get("/api/actividad/?usuario=qa_admin", headers=admin)
    assert r2.status_code == 200
    assert all(a["usuario"] == "qa_admin" for a in r2.json())


def test_doctor_persiste_y_se_comparte(client, admin, doctor):
    """Lo que registra el doctor se guarda y queda disponible al volver a leer."""
    cli = client.post("/api/clientes/", json={"nombre": "PersistDueño", "dni": "33445566"}, headers=admin).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/",
                      json={"nombre": "Persist", "especie": "Felino"}, headers=admin).json()
    try:
        # el doctor crea una historia con varios campos
        h = client.post(f"/api/pacientes/{pac['id']}/historias/",
                        json={"motivo_consulta": "Vacuna antirrábica", "peso_kg": 5.2}, headers=doctor).json()

        # se relee desde la base (otra petición) y persiste con la firma del doctor
        again = client.get(f"/api/pacientes/{pac['id']}/historias/{h['id']}", headers=doctor).json()
        assert again["motivo_consulta"] == "Vacuna antirrábica"
        assert float(again["peso_kg"]) == 5.2
        assert again["veterinario_nombre"] == "QA Doctor"

        # aparece en el resumen del panel del doctor
        panel = client.get("/api/mi-panel/", headers=doctor).json()
        assert panel["resumen_historias"]["total"] >= 1
    finally:
        client.delete(f"/api/pacientes/{pac['id']}", headers=admin)
        db = SessionLocal()
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cli["id"]})
        db.commit(); db.close()


# ── Catálogo de servicios por voz (parte sin IA: aplicar) ────────────────────

def test_servicios_aplicar(client, admin):
    """El guardado de servicios (nuevo + variable) funciona y persiste."""
    r = client.post("/api/servicios/aplicar", json={"items": [
        {"nombre": "QA Consulta", "precio": 50, "precio_variable": False, "accion": "nuevo"},
        {"nombre": "QA Cirugia", "precio": None, "precio_variable": True, "accion": "nuevo"},
    ]}, headers=admin)
    assert r.status_code == 200
    assert r.json()["creados"] == ["QA Consulta", "QA Cirugia"]
    try:
        servs = client.get("/api/servicios/?solo_activos=false", headers=admin).json()
        nombres = {s["nombre"] for s in servs}
        assert {"QA Consulta", "QA Cirugia"} <= nombres
        # un servicio de precio fijo sin precio debe ser rechazado (422)
        bad = client.post("/api/servicios/aplicar", json={"items": [
            {"nombre": "QA Malo", "precio": None, "precio_variable": False, "accion": "nuevo"},
        ]}, headers=admin)
        assert bad.status_code == 422
    finally:
        db = SessionLocal()
        db.execute(text("DELETE FROM servicios WHERE nombre IN ('QA Consulta','QA Cirugia','QA Malo')"))
        db.commit(); db.close()


def test_reportes(client, admin):
    """El endpoint de reportes responde con la estructura esperada."""
    r = client.get("/api/dashboard/reportes", headers=admin)
    assert r.status_code == 200
    d = r.json()
    for clave in ("total_ventas", "ingreso_total", "top_productos", "top_servicios", "atenciones_por_doctor"):
        assert clave in d
