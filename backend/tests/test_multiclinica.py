"""Aislamiento entre clínicas.

Es la garantía más importante del SaaS: ninguna clínica puede ver, modificar ni
borrar datos de otra, ni siquiera sabiendo el id exacto. Se prueba contra la
API real con dos clínicas (la 1, que es la de las demás pruebas, y una creada
aquí) y también contra la sesión de base de datos directamente.

    cd backend
    python -m pytest tests/test_multiclinica.py -v
"""
import asyncio
import uuid

import pytest
from sqlalchemy import text

import main
from database import (
    Base, ReferenciaInvalida, SessionLocal, nueva_sesion,
)
import models
from models import Cliente, Clinica, Paciente, Producto, TenantMixin


@pytest.fixture(autouse=True)
def _sin_tope_de_altas(monkeypatch):
    """El tope de altas por IP frenaría a las propias pruebas (todas vienen de la misma)."""
    from routers import registro
    monkeypatch.setattr(registro, "ALTAS_MAX_POR_HORA", 10_000)


def _dni():
    return f"7{uuid.uuid4().int % 10_000_000:07d}"


def _borrar_clinica(clinica_id: int):
    """Limpia TODO lo de una clínica de prueba, en orden de dependencias."""
    db = SessionLocal()
    try:
        for tabla in reversed(Base.metadata.sorted_tables):
            if "clinica_id" in tabla.c and tabla.name != "clinicas":
                db.execute(text(f'DELETE FROM "{tabla.name}" WHERE clinica_id = :c'), {"c": clinica_id})
        db.execute(text("DELETE FROM sse_events WHERE clinica_id = :c"), {"c": clinica_id})
        db.execute(text("DELETE FROM clinicas WHERE id = :c"), {"c": clinica_id})
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def clinica_b(client):
    """Una segunda clínica, creada por el registro público."""
    usuario = f"b{uuid.uuid4().hex[:10]}"
    r = client.post("/api/registro/", json={
        "clinica": "Clínica B de Prueba", "nombre": "Admin B",
        "usuario": usuario, "password": "contraseña-segura"})
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['token']}"}
    db = SessionLocal()
    try:
        cid = db.execute(text("SELECT clinica_id FROM usuarios WHERE usuario = :u"),
                         {"u": usuario}).scalar()
    finally:
        db.close()
    assert cid and cid != 1
    yield {"h": headers, "id": cid, "usuario": usuario}
    main._CACHE_CUENTAS.clear()
    _borrar_clinica(cid)


@pytest.fixture()
def datos_a(client, admin):
    """Un cliente con su mascota en la clínica 1."""
    cli = client.post("/api/clientes/", headers=admin,
                      json={"nombre": "Dueña de A", "dni": _dni(), "telefono": "987654321"}).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=admin,
                      json={"nombre": "Mascota de A", "especie": "Canino"}).json()
    yield {"cliente": cli, "paciente": pac}
    client.delete(f"/api/clientes/{cli['id']}", headers=admin)


# ── Alta de clínicas ─────────────────────────────────────────────────────────

def test_registro_crea_clinica_y_administradora(client, clinica_b):
    me = client.get("/api/configuracion/", headers=clinica_b["h"]).json()
    assert me["nombre"] == "Clínica B de Prueba"
    # sin sesión: valores genéricos del producto, no los de ninguna clínica
    anonimo = client.get("/api/configuracion/").json()
    assert anonimo["nombre"] != "Clínica B de Prueba"
    # inicia sesión con sus credenciales
    r = client.post("/api/auth/login", json={"usuario": clinica_b["usuario"], "password": "contraseña-segura"})
    assert r.status_code == 200 and r.json()["rol"] == "recepcionista"


def test_registro_rechaza_usuario_repetido_y_contrasena_debil(client, clinica_b):
    base = {"clinica": "Otra", "nombre": "Otro admin", "usuario": clinica_b["usuario"],
            "password": "contraseña-segura"}
    assert client.post("/api/registro/", json=base).status_code == 409
    assert client.post("/api/registro/", json=base | {"usuario": "nuevo-usuario-x", "password": "corta"}).status_code == 422
    assert client.post("/api/registro/", json=base | {"usuario": "no válido!"}).status_code == 422


# ── Lectura, edición y borrado cruzados ──────────────────────────────────────

def test_una_clinica_no_ve_los_clientes_de_otra(client, clinica_b, datos_a):
    cid = datos_a["cliente"]["id"]
    lista = client.get("/api/clientes/", headers=clinica_b["h"]).json()
    assert all(c["id"] != cid for c in lista)
    assert client.get("/api/clientes/contar", headers=clinica_b["h"]).json()["total"] == 0
    # ni sabiendo el id exacto
    assert client.get(f"/api/clientes/{cid}", headers=clinica_b["h"]).status_code == 404
    assert client.get(f"/api/pacientes/{datos_a['paciente']['id']}", headers=clinica_b["h"]).status_code == 404


def test_una_clinica_no_edita_ni_borra_lo_de_otra(client, admin, clinica_b, datos_a):
    cid = datos_a["cliente"]["id"]
    h = clinica_b["h"]
    assert client.put(f"/api/clientes/{cid}", headers=h,
                      json={"nombre": "Hackeado", "dni": datos_a["cliente"]["dni"]}).status_code == 404
    assert client.delete(f"/api/clientes/{cid}", headers=h).status_code == 404
    assert client.delete(f"/api/pacientes/{datos_a['paciente']['id']}", headers=h).status_code == 404
    # sigue intacto en su clínica
    assert client.get(f"/api/clientes/{cid}", headers=admin).json()["nombre"] == "Dueña de A"


def test_no_se_pueden_crear_registros_sobre_datos_de_otra_clinica(client, clinica_b, datos_a):
    h = clinica_b["h"]
    pid = datos_a["paciente"]["id"]
    # historia clínica sobre la mascota de A
    r = client.post(f"/api/pacientes/{pid}/historias/", headers=h,
                    json={"motivo_consulta": "intruso", "veterinario_id": 1})
    assert r.status_code in (404, 422)
    # turno para la mascota de A
    r = client.post("/api/citas/", headers=h, json={
        "paciente_id": pid, "fecha_hora": "2031-01-01T15:00:00Z", "motivo": "x"})
    assert r.status_code in (404, 422)
    # registrar un contacto sobre un cliente de A
    r = client.post("/api/contactos/", headers=h, json={
        "cliente_id": datos_a["cliente"]["id"], "motivo": "otro", "canal": "llamada", "resultado": "contesto"})
    assert r.status_code == 404


def test_cada_clinica_tiene_sus_propios_usuarios(client, admin, clinica_b):
    mios = client.get("/api/usuarios/", headers=clinica_b["h"]).json()
    assert [u["usuario"] for u in mios] == [clinica_b["usuario"]]
    # la clínica 1 no ve a la administradora de B
    todos_a = [u["usuario"] for u in client.get("/api/usuarios/", headers=admin).json()]
    assert clinica_b["usuario"] not in todos_a
    # y B no puede desactivar ni borrar a nadie de A
    uid_a = next(u["id"] for u in client.get("/api/usuarios/", headers=admin).json() if u["usuario"] == "qa_doc")
    assert client.delete(f"/api/usuarios/{uid_a}", headers=clinica_b["h"]).status_code == 404


# ── Claves únicas por clínica ────────────────────────────────────────────────

def test_el_mismo_dni_puede_existir_en_dos_clinicas_pero_no_dos_veces_en_una(client, admin, clinica_b):
    dni = _dni()
    a = client.post("/api/clientes/", headers=admin, json={"nombre": "Cliente A", "dni": dni})
    b = client.post("/api/clientes/", headers=clinica_b["h"], json={"nombre": "Cliente B", "dni": dni})
    try:
        assert a.status_code == 201 and b.status_code == 201
        repetido = client.post("/api/clientes/", headers=clinica_b["h"], json={"nombre": "Otra vez", "dni": dni})
        assert repetido.status_code in (400, 409, 422)
    finally:
        client.delete(f"/api/clientes/{a.json()['id']}", headers=admin)


# ── Lo que se guarda queda en la clínica correcta ────────────────────────────

def test_lo_creado_por_una_clinica_queda_con_su_clinica_id(client, clinica_b):
    r = client.post("/api/clientes/", headers=clinica_b["h"], json={"nombre": "De B", "dni": _dni()})
    assert r.status_code == 201
    db = SessionLocal()
    try:
        fila = db.execute(text("SELECT clinica_id FROM clientes WHERE id = :i"),
                          {"i": r.json()["id"]}).scalar()
    finally:
        db.close()
    assert fila == clinica_b["id"], "no debe caer en la clínica 1 por el valor por defecto"


def test_inventario_y_codigos_de_producto_son_por_clinica(client, admin, clinica_b):
    datos = {"nombre": f"ZZZ Prod {uuid.uuid4().hex[:6]}", "categoria": "medicamento",
             "precio": 10, "stock": 5}
    a = client.post("/api/productos/", headers=admin, json=datos)
    b = client.post("/api/productos/", headers=clinica_b["h"], json=datos)
    try:
        assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
        # cada clínica numera lo suyo: ambas empiezan su serie (MED-xxxx) sin chocar
        assert a.json()["codigo"].startswith("MED-") and b.json()["codigo"].startswith("MED-")
        assert all(p["id"] != a.json()["id"] for p in client.get("/api/productos/", headers=clinica_b["h"]).json())
    finally:
        client.delete(f"/api/productos/{a.json()['id']}", headers=admin)


# ── Suspensión ───────────────────────────────────────────────────────────────

def test_una_clinica_suspendida_pierde_el_acceso(client, clinica_b):
    h = clinica_b["h"]
    assert client.get("/api/clientes/", headers=h).status_code == 200
    db = SessionLocal()
    try:
        db.execute(text("UPDATE clinicas SET estado='suspendida' WHERE id=:c"), {"c": clinica_b["id"]})
        db.commit()
    finally:
        db.close()
    main._CACHE_CUENTAS.clear()
    r = client.get("/api/clientes/", headers=h)
    assert r.status_code == 403 and "suspendida" in r.json()["detail"]
    # y tampoco puede iniciar una sesión nueva
    r = client.post("/api/auth/login", json={"usuario": clinica_b["usuario"], "password": "contraseña-segura"})
    assert r.status_code == 403
    # Las demás clínicas no se enteran
    db = SessionLocal()
    try:
        db.execute(text("UPDATE clinicas SET estado='activa' WHERE id=:c"), {"c": clinica_b["id"]})
        db.commit()
    finally:
        db.close()
    main._CACHE_CUENTAS.clear()
    assert client.get("/api/clientes/", headers=h).status_code == 200


# ── Caches y canales compartidos ─────────────────────────────────────────────

def test_el_vocabulario_del_dictado_no_se_mezcla_entre_clinicas(client, admin, clinica_b):
    from services import vocabulario
    marca = f"ZZZMarca{uuid.uuid4().hex[:6]}"
    a = client.post("/api/productos/", headers=admin, json={
        "nombre": marca, "categoria": "medicamento", "precio": 5, "stock": 1})
    assert a.status_code == 201, a.text
    vocabulario.invalidar_cache()
    try:
        da, db_b = nueva_sesion(1), nueva_sesion(clinica_b["id"])
        try:
            assert marca in vocabulario.keyterms(da)          # llena el caché de A
            assert marca not in vocabulario.keyterms(db_b)    # B no lo hereda
            assert marca not in vocabulario.catalogo_medicamentos(db_b)
        finally:
            da.close(); db_b.close()
    finally:
        client.delete(f"/api/productos/{a.json()['id']}", headers=admin)
        vocabulario.invalidar_cache()


def test_los_mensajes_personalizados_son_de_cada_clinica(client, admin, clinica_b):
    r = client.put("/api/contactos/plantillas/vacuna", headers=clinica_b["h"],
                   json={"texto": "Mensaje propio de la clínica B para {mascota}"})
    assert r.status_code == 200
    en_a = next(p for p in client.get("/api/contactos/plantillas", headers=admin).json()["plantillas"]
                if p["motivo"] == "vacuna")
    assert en_a["personalizada"] is False


def test_los_avisos_de_agenda_solo_llegan_a_su_clinica():
    from routers.citas import ConnectionManager

    async def caso():
        m = ConnectionManager()
        qa, qb = await m.subscribe(1), await m.subscribe(2)
        m._local_broadcast("citas_updated", 2)
        return qa.empty(), qb.qsize()

    vacia_a, recibidos_b = asyncio.run(caso())
    assert vacia_a and recibidos_b == 1


# ── La sesión de base de datos, directamente ─────────────────────────────────

def test_la_sesion_filtra_lecturas_conteos_y_borrados_masivos(clinica_b):
    sb = nueva_sesion(clinica_b["id"])
    try:
        sb.add(Cliente(nombre="Solo de B", dni=_dni()))
        sb.commit()
        assert sb.query(Cliente).count() == 1
        from sqlalchemy import func, select
        assert sb.execute(select(func.count(Cliente.id))).scalar() == 1
        # el borrado masivo de B no toca los clientes de la clínica 1
        antes = SessionLocal().execute(text("SELECT count(*) FROM clientes WHERE clinica_id = 1")).scalar()
        sb.query(Cliente).delete()
        sb.commit()
        despues = SessionLocal().execute(text("SELECT count(*) FROM clientes WHERE clinica_id = 1")).scalar()
        assert antes == despues
        # get() por id de otra clínica no devuelve nada
        otro = SessionLocal().execute(text("SELECT id FROM clientes WHERE clinica_id = 1 LIMIT 1")).scalar()
        if otro:
            assert sb.get(Cliente, otro) is None
    finally:
        sb.close()


def test_no_se_puede_guardar_ni_enlazar_a_otra_clinica(clinica_b):
    sb = nueva_sesion(clinica_b["id"])
    try:
        # guardar una fila declarando otra clínica
        sb.add(Cliente(nombre="Intruso", dni=_dni(), clinica_id=1))
        with pytest.raises(ReferenciaInvalida):
            sb.flush()
        sb.rollback()

        # enlazar con una mascota de la clínica 1 (las claves foráneas no lo impedirían)
        db1 = SessionLocal()
        pid = db1.execute(text("SELECT id FROM pacientes WHERE clinica_id = 1 LIMIT 1")).scalar()
        db1.close()
        if pid:
            sb.add(models.Cita(paciente_id=pid, fecha_hora="2031-02-02T15:00:00Z"))
            with pytest.raises(ReferenciaInvalida):
                sb.flush()
            sb.rollback()
    finally:
        sb.close()


# ── Red de seguridad para tablas futuras ─────────────────────────────────────

# Tablas que NO pertenecen a una clínica, a propósito.
GLOBALES = {
    "clinicas", "rate_limit_hits",
    "evaluadores", "respuestas_sus", "respuestas_tam",   # módulos de tesis, apagados
}
# Con clinica_id opcional: se filtran a mano en su router.
OPCIONALES = {"errores", "sse_events"}


def test_toda_tabla_nueva_debe_declarar_a_que_clinica_pertenece():
    """Si se agrega una tabla sin pensar en esto, esta prueba falla.

    Es la forma de que el aislamiento no dependa de que alguien se acuerde: una
    tabla nueva tiene que ser de una clínica (TenantMixin), o declararse global
    aquí, con la razón.
    """
    for mapper in Base.registry.mappers:
        clase, tabla = mapper.class_, mapper.class_.__table__.name
        if tabla in GLOBALES or tabla in OPCIONALES:
            continue
        assert issubclass(clase, TenantMixin), (
            f"La tabla '{tabla}' no pertenece a ninguna clínica. Hazla TenantMixin "
            f"o decláralo en GLOBALES / OPCIONALES de esta prueba."
        )
