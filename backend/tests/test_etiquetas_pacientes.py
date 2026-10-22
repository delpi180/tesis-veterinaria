"""Etiquetas de clientes, cambio de responsable, listado de pacientes y borrado seguro de clientes.

Todo lo que se crea lleva el prefijo «QA » y se borra al final de cada prueba.
"""
import pytest
from sqlalchemy import text

from database import SessionLocal


def _borrar_cliente_sql(cid: int) -> None:
    """Limpieza directa (el endpoint se niega si el cliente tiene historias)."""
    db = SessionLocal()
    try:
        pids = [r[0] for r in db.execute(text("SELECT id FROM pacientes WHERE cliente_id=:c"), {"c": cid})]
        for pid in pids:
            for tabla in ("historias_clinicas", "citas", "registros_clinicos", "recetas"):
                db.execute(text(f"DELETE FROM {tabla} WHERE paciente_id=:p"), {"p": pid})
        db.execute(text("DELETE FROM pacientes WHERE cliente_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM cliente_etiquetas WHERE cliente_id=:c"), {"c": cid})
        db.execute(text("DELETE FROM clientes WHERE id=:c"), {"c": cid})
        db.commit()
    finally:
        db.close()


@pytest.fixture
def cliente(client, admin):
    r = client.post("/api/clientes/", json={"dni": "91000001", "nombre": "QA Etiquetas Dueño"}, headers=admin)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    yield cid
    _borrar_cliente_sql(cid)


@pytest.fixture
def otro_cliente(client, admin):
    r = client.post("/api/clientes/", json={"dni": "91000002", "nombre": "QA Etiquetas Otro"}, headers=admin)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    yield cid
    _borrar_cliente_sql(cid)


def _mascota(client, headers, cid, **extra):
    datos = {"nombre": "QA Paciente Lista", "especie": "QA Especie", "raza": "QA Raza"} | extra
    r = client.post(f"/api/clientes/{cid}/pacientes/", json=datos, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── Etiquetas ─────────────────────────────────────────────────────────────────

def test_etiquetas_crear_editar_borrar_y_permisos(client, admin, doctor):
    ids = []
    try:
        # Solo recepción administra las etiquetas
        assert client.post("/api/etiquetas/", json={"nombre": "QA Vip"}, headers=doctor).status_code == 403

        r = client.post("/api/etiquetas/", json={"nombre": "  QA   Vip  ", "color": "#2f6b4f"}, headers=admin)
        assert r.status_code == 201, r.text
        et = r.json()
        ids.append(et["id"])
        assert et["nombre"] == "QA Vip" and et["color"] == "#2f6b4f"

        # Nombre repetido (sin importar mayúsculas) → 409
        assert client.post("/api/etiquetas/", json={"nombre": "qa vip"}, headers=admin).status_code == 409

        # Cualquier usuario las puede ver
        lista = client.get("/api/etiquetas/", headers=doctor).json()
        assert any(e["id"] == et["id"] and e["clientes"] == 0 for e in lista)

        r = client.put(f"/api/etiquetas/{et['id']}", json={"nombre": "QA Vip 2"}, headers=admin)
        assert r.status_code == 200 and r.json()["nombre"] == "QA Vip 2"
        assert client.put("/api/etiquetas/999999", json={"nombre": "QA X"}, headers=admin).status_code == 404
        assert client.put(f"/api/etiquetas/{et['id']}", json={"nombre": "QA Vip 2"}, headers=doctor).status_code == 403

        assert client.delete(f"/api/etiquetas/{et['id']}", headers=doctor).status_code == 403
        assert client.delete(f"/api/etiquetas/{et['id']}", headers=admin).status_code == 204
        ids.clear()
        assert client.delete(f"/api/etiquetas/{et['id']}", headers=admin).status_code == 404
    finally:
        for i in ids:
            client.delete(f"/api/etiquetas/{i}", headers=admin)


def test_etiquetas_en_clientes_filtro_y_borrado(client, admin, doctor, cliente, otro_cliente):
    ids = []
    try:
        a = client.post("/api/etiquetas/", json={"nombre": "QA Etq A"}, headers=admin).json()
        b = client.post("/api/etiquetas/", json={"nombre": "QA Etq B"}, headers=admin).json()
        ids += [a["id"], b["id"]]

        # Asignar (la recepcionista y el doctor pueden: a veces llenan la hoja por el otro)
        r = client.post(f"/api/clientes/{cliente}/etiquetas/{a['id']}", headers=doctor)
        assert r.status_code == 200 and [e["nombre"] for e in r.json()["etiquetas"]] == ["QA Etq A"]
        # Repetir no duplica
        r = client.post(f"/api/clientes/{cliente}/etiquetas/{a['id']}", headers=admin)
        assert len(r.json()["etiquetas"]) == 1
        client.post(f"/api/clientes/{otro_cliente}/etiquetas/{b['id']}", headers=admin)

        # Las etiquetas salen en el listado y en el detalle del cliente
        assert [e["id"] for e in client.get(f"/api/clientes/{cliente}", headers=admin).json()["etiquetas"]] == [a["id"]]

        # Filtro por etiqueta: listado y contador dan lo mismo
        lst = client.get(f"/api/clientes/?etiqueta_id={a['id']}", headers=admin).json()
        assert [c["id"] for c in lst] == [cliente]
        assert client.get(f"/api/clientes/contar?etiqueta_id={a['id']}", headers=admin).json()["total"] == 1
        # Con varias etiquetas basta con tener alguna
        lst2 = client.get(f"/api/clientes/?etiqueta_id={a['id']}&etiqueta_id={b['id']}", headers=admin).json()
        assert {c["id"] for c in lst2} == {cliente, otro_cliente}
        # Y se puede combinar con la búsqueda
        lst3 = client.get(f"/api/clientes/?etiqueta_id={b['id']}&q=Etiquetas Otro", headers=admin).json()
        assert [c["id"] for c in lst3] == [otro_cliente]

        # Etiquetas que no existen → 404
        assert client.post(f"/api/clientes/{cliente}/etiquetas/999999", headers=admin).status_code == 404
        assert client.put(f"/api/clientes/{cliente}/etiquetas", json={"etiqueta_ids": [999999]}, headers=admin).status_code == 404

        # Dejar exactamente un conjunto
        r = client.put(f"/api/clientes/{cliente}/etiquetas", json={"etiqueta_ids": [a["id"], b["id"]]}, headers=admin)
        assert {e["id"] for e in r.json()["etiquetas"]} == {a["id"], b["id"]}
        r = client.put(f"/api/clientes/{cliente}/etiquetas", json={"etiqueta_ids": [b["id"]]}, headers=admin)
        assert [e["id"] for e in r.json()["etiquetas"]] == [b["id"]]

        # Quitar una
        r = client.delete(f"/api/clientes/{cliente}/etiquetas/{b['id']}", headers=admin)
        assert r.json()["etiquetas"] == []

        # Borrar una etiqueta se la quita a los clientes, pero el cliente sigue ahí
        assert client.delete(f"/api/etiquetas/{b['id']}", headers=admin).status_code == 204
        ids.remove(b["id"])
        assert client.get(f"/api/clientes/{otro_cliente}", headers=admin).json()["etiquetas"] == []
    finally:
        for i in ids:
            client.delete(f"/api/etiquetas/{i}", headers=admin)


# ── Responsable y datos de registro de la mascota ─────────────────────────────

def test_cambiar_responsable(client, admin, doctor, cliente, otro_cliente):
    pac = _mascota(client, doctor, cliente)
    # Registrado por quién y cuándo (el doctor la creó)
    assert pac["registrado_por"] == "QA Doctor"
    assert pac["creado_en"] is not None
    assert pac["activo"] is True

    # El doctor puede cambiarlo (también lo hace la recepcionista)
    r = client.put(f"/api/pacientes/{pac['id']}/responsable", json={"cliente_id": otro_cliente}, headers=doctor)
    assert r.status_code == 200, r.text
    assert r.json()["cliente_id"] == otro_cliente
    assert client.get(f"/api/clientes/{otro_cliente}", headers=admin).json()["pacientes"][0]["id"] == pac["id"]
    assert client.get(f"/api/clientes/{cliente}", headers=admin).json()["pacientes"] == []

    r = client.put(f"/api/pacientes/{pac['id']}/responsable", json={"cliente_id": cliente}, headers=admin)
    assert r.status_code == 200 and r.json()["cliente_id"] == cliente

    # Mismo dueño: no pasa nada y no falla
    assert client.put(f"/api/pacientes/{pac['id']}/responsable", json={"cliente_id": cliente}, headers=admin).status_code == 200
    # Cliente que no existe / mascota que no existe
    r = client.put(f"/api/pacientes/{pac['id']}/responsable", json={"cliente_id": 999999}, headers=admin)
    assert r.status_code == 404 and "no existe" in r.json()["detail"]
    assert client.put("/api/pacientes/999999/responsable", json={"cliente_id": cliente}, headers=admin).status_code == 404


# ── Listado de pacientes ──────────────────────────────────────────────────────

def test_listado_de_pacientes_filtros_y_proximo_turno(client, admin, doctor, cliente):
    p1 = _mascota(client, admin, cliente, nombre="QA Paciente Lista Uno", microchip="QA-CHIP-77")
    p2 = _mascota(client, admin, cliente, nombre="QA Paciente Lista Dos", raza="QA Otra Raza")
    base = "/api/pacientes/?especie=QA Especie&"

    r = client.get(base + "q=QA Paciente Lista", headers=admin).json()
    assert r["total"] == 2
    assert [i["nombre"] for i in r["items"]] == ["QA Paciente Lista Dos", "QA Paciente Lista Uno"]
    fila = r["items"][1]
    assert fila["responsable"] == "QA Etiquetas Dueño" and fila["activo"] is True
    assert fila["proximo_turno"] is None

    # Busca por microchip y por el responsable
    assert client.get(base + "q=QA-CHIP-77", headers=admin).json()["total"] == 1
    assert client.get(base + "q=Etiquetas Dueño", headers=admin).json()["total"] == 2

    # Filtros de raza y paginación (el total no depende de la página)
    assert client.get(base + "raza=QA Otra Raza", headers=admin).json()["total"] == 1
    pag = client.get(base + "q=QA Paciente Lista&limit=1&skip=1", headers=admin).json()
    assert pag["total"] == 2 and len(pag["items"]) == 1

    # Estado: «activo» por defecto; una mascota inactiva solo sale con ese filtro
    assert client.put(f"/api/pacientes/{p2['id']}", json={"activo": False}, headers=admin).status_code == 200
    assert client.get(base + "q=QA Paciente Lista", headers=admin).json()["total"] == 1
    inactivos = client.get(base + "estado=inactivo", headers=admin).json()
    assert [i["id"] for i in inactivos["items"]] == [p2["id"]] and inactivos["items"][0]["activo"] is False
    assert client.get(base + "q=QA Paciente Lista&estado=todos", headers=admin).json()["total"] == 2
    assert client.get("/api/pacientes/?estado=raro", headers=admin).status_code == 422

    # Próximo turno: solo cuenta uno futuro y vigente
    cita = client.post("/api/citas/", json={
        "paciente_id": p1["id"], "fecha_hora": "2031-03-10T10:00:00", "motivo": "QA turno lista",
    }, headers=admin)
    assert cita.status_code in (200, 201), cita.text
    fila = client.get(base + "q=QA-CHIP-77", headers=admin).json()["items"][0]
    assert fila["proximo_turno"] and fila["proximo_turno"].startswith("2031-03-10")

    # Opciones de los filtros
    op = client.get("/api/pacientes/opciones", headers=admin).json()
    assert "QA Especie" in op["especies"] and op["razas"] == []
    op = client.get("/api/pacientes/opciones?especie=QA Especie", headers=admin).json()
    assert {"QA Raza", "QA Otra Raza"} <= set(op["razas"])


# ── Eliminar cliente ──────────────────────────────────────────────────────────

def test_eliminar_cliente_solo_recepcion_y_solo_sin_datos(client, admin, doctor):
    # Sin nada guardado: la recepcionista lo borra (con sus mascotas)
    r = client.post("/api/clientes/", json={"dni": "91000003", "nombre": "QA Borrar Libre"}, headers=admin)
    libre = r.json()["id"]
    try:
        _mascota(client, admin, libre)
        assert client.delete(f"/api/clientes/{libre}", headers=doctor).status_code == 403
        assert client.delete(f"/api/clientes/{libre}", headers=admin).status_code == 204
        assert client.get(f"/api/clientes/{libre}", headers=admin).status_code == 404
        assert client.delete(f"/api/clientes/{libre}", headers=admin).status_code == 404
    finally:
        _borrar_cliente_sql(libre)

    # Con una historia clínica: se niega con un mensaje claro y todo sigue ahí
    r = client.post("/api/clientes/", json={"dni": "91000004", "nombre": "QA Borrar Con Datos"}, headers=admin)
    con_datos = r.json()["id"]
    try:
        pac = _mascota(client, admin, con_datos)
        h = client.post(f"/api/pacientes/{pac['id']}/historias/", json={"motivo_consulta": "QA historia"}, headers=doctor)
        assert h.status_code == 201, h.text
        r = client.delete(f"/api/clientes/{con_datos}", headers=admin)
        assert r.status_code == 409
        assert "historias clínicas" in r.json()["detail"]
        assert client.get(f"/api/clientes/{con_datos}", headers=admin).status_code == 200
        assert client.get(f"/api/pacientes/{pac['id']}", headers=admin).status_code == 200
    finally:
        _borrar_cliente_sql(con_datos)
