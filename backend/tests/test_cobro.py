"""Planes con límites y cobro.

Cada límite se prueba EN EL BORDE: el último que cabe pasa, el siguiente se
rechaza. Los límites los hace cumplir el servidor; el frontend solo los muestra.

    cd backend
    python -m pytest tests/test_cobro.py -v
"""
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from sqlalchemy import text

import main
from core import limites
from database import SessionLocal
from services import cobro
from tests.test_multiclinica import _dni
from tests.test_plataforma import _sin_tope_de_altas, clinica_b, operador   # noqa: F401  (fixtures)


# ── Utilidades ───────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _la_clinica_1_no_se_toca():
    """Las demás pruebas usan la clínica 1 como 'fundadora' sin límites: aquí
    ninguna debe dejarla en otro plan, con otro vencimiento ni con pagos."""
    yield
    _sql("UPDATE clinicas SET plan='fundadora', vence_en=NULL, estado='activa' WHERE id=1")
    _sql("DELETE FROM pagos WHERE clinica_id=1")
    _sql("DELETE FROM solicitudes_plan WHERE clinica_id=1")
    main._CACHE_CUENTAS.clear()


def _sql(consulta: str, **params):
    db = SessionLocal()
    try:
        r = db.execute(text(consulta), params)
        db.commit()
        return r
    finally:
        db.close()


@pytest.fixture()
def plan_chico():
    """Fábrica de un plan de prueba con topes a medida (no toca los planes reales)."""
    codigo = f"qa_{uuid.uuid4().hex[:8]}"

    def crear(**topes):
        valores = dict(max_usuarios=None, max_mascotas=None, max_almacenamiento_mb=None, max_ia_mes=None,
                       incluye_planilla=True, incluye_contactos=True)
        valores.update(topes)
        _sql("""INSERT INTO planes (codigo, nombre, precio_mensual, max_usuarios, max_mascotas,
                    max_almacenamiento_mb, max_ia_mes, incluye_planilla, incluye_contactos, publico, orden)
                VALUES (:c, 'Plan QA', 10, :u, :m, :a, :i, :p, :ct, false, 50)
                ON CONFLICT (codigo) DO UPDATE SET max_usuarios=:u, max_mascotas=:m,
                    max_almacenamiento_mb=:a, max_ia_mes=:i, incluye_planilla=:p, incluye_contactos=:ct""",
             c=codigo, u=valores["max_usuarios"], m=valores["max_mascotas"], a=valores["max_almacenamiento_mb"],
             i=valores["max_ia_mes"], p=valores["incluye_planilla"], ct=valores["incluye_contactos"])
        return codigo

    yield crear
    _sql("UPDATE clinicas SET plan='prueba' WHERE plan = :c", c=codigo)
    _sql("DELETE FROM pagos WHERE plan = :c", c=codigo)
    _sql("DELETE FROM planes WHERE codigo = :c", c=codigo)


@pytest.fixture()
def clinica_c(client):
    """Otra clínica, para probar que los pagos de una no aparecen en otra."""
    from tests.test_multiclinica import _borrar_clinica
    usuario = f"c{uuid.uuid4().hex[:10]}"
    r = client.post("/api/registro/", json={"clinica": "Clínica C QA", "nombre": "Admin C",
                                            "usuario": usuario, "password": "contraseña-segura"})
    assert r.status_code == 201, r.text
    cid = _sql("SELECT clinica_id FROM usuarios WHERE usuario = :u", u=usuario).scalar()
    yield {"id": cid, "h": {"Authorization": f"Bearer {r.json()['token']}"}}
    _borrar_clinica(cid)


def _asignar(clinica_id: int, plan: str):
    _sql("UPDATE clinicas SET plan = :p WHERE id = :c", p=plan, c=clinica_id)
    main._CACHE_CUENTAS.clear()


def _nuevo_usuario(client, h, activo=True):
    return client.post("/api/usuarios/", headers=h, json={
        "usuario": f"qa_lim_{uuid.uuid4().hex[:8]}", "nombre": "QA Límite",
        "password": "clave-segura-12", "rol": "veterinario", "activo": activo})


# ── Límite de usuarios ───────────────────────────────────────────────────────

def test_el_limite_de_usuarios_se_hace_cumplir_en_el_borde(client, clinica_b, plan_chico):
    _asignar(clinica_b["id"], plan_chico(max_usuarios=3))      # ya hay 1 (la administradora)
    h = clinica_b["h"]
    assert _nuevo_usuario(client, h).status_code == 201         # 2 de 3
    ultimo = _nuevo_usuario(client, h)
    assert ultimo.status_code == 201                            # 3 de 3: el último que cabe pasa
    r = _nuevo_usuario(client, h)                               # el 4.º
    assert r.status_code == 402
    assert "3 usuarios" in r.json()["detail"] and "Plan QA" in r.json()["detail"]

    # desactivar a uno libera un lugar; reactivarlo cuando ya no cabe se rechaza
    uid = ultimo.json()["id"]
    assert client.put(f"/api/usuarios/{uid}", headers=h, json={"activo": False}).status_code == 200
    assert _nuevo_usuario(client, h).status_code == 201
    assert client.put(f"/api/usuarios/{uid}", headers=h, json={"activo": True}).status_code == 402
    # crear a alguien ya inactivo no ocupa lugar
    assert _nuevo_usuario(client, h, activo=False).status_code == 201


def test_bajar_de_plan_no_borra_nada_solo_impide_agregar(client, clinica_b, plan_chico):
    h = clinica_b["h"]
    _asignar(clinica_b["id"], plan_chico(max_usuarios=10))
    for _ in range(3):
        assert _nuevo_usuario(client, h).status_code == 201
    assert len(client.get("/api/usuarios/", headers=h).json()) == 4
    _asignar(clinica_b["id"], plan_chico(max_usuarios=2))       # baja a un plan más chico
    assert len(client.get("/api/usuarios/", headers=h).json()) == 4     # nadie desaparece
    assert _nuevo_usuario(client, h).status_code == 402


# ── Límite de mascotas ───────────────────────────────────────────────────────

def test_el_limite_de_mascotas(client, clinica_b, plan_chico):
    _asignar(clinica_b["id"], plan_chico(max_mascotas=2))
    h = clinica_b["h"]
    cli = client.post("/api/clientes/", headers=h, json={"nombre": "Dueño límite", "dni": _dni()}).json()
    for i in range(2):
        assert client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=h,
                           json={"nombre": f"M{i}", "especie": "Canino"}).status_code == 201
    r = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=h, json={"nombre": "M3", "especie": "Canino"})
    assert r.status_code == 402 and "2 mascotas" in r.json()["detail"]
    # los CLIENTES no cuentan: solo las mascotas
    assert client.post("/api/clientes/", headers=h, json={"nombre": "Otro dueño", "dni": _dni()}).status_code == 201


# ── Límite de almacenamiento ─────────────────────────────────────────────────

def test_el_limite_de_almacenamiento(client, clinica_b, plan_chico):
    _asignar(clinica_b["id"], plan_chico(max_almacenamiento_mb=1))
    h = clinica_b["h"]
    cli = client.post("/api/clientes/", headers=h, json={"nombre": "Dueño archivos", "dni": _dni()}).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=h,
                      json={"nombre": "Archivo", "especie": "Canino"}).json()
    url = f"/api/pacientes/{pac['id']}/documentos/"
    medio_mb = b"0" * (600 * 1024)

    primero = client.post(url, headers=h, files={"archivo": ("a.pdf", medio_mb, "application/pdf")})
    assert primero.status_code == 201, primero.text                   # 0,6 de 1 MB
    r = client.post(url, headers=h, files={"archivo": ("b.pdf", medio_mb, "application/pdf")})
    assert r.status_code == 402 and "1 MB" in r.json()["detail"]      # 1,2 > 1 MB
    # uno que sí cabe
    assert client.post(url, headers=h, files={"archivo": ("c.pdf", b"0" * 1000, "application/pdf")}).status_code == 201
    # borrar libera espacio
    assert client.delete(f"{url}{primero.json()['id']}", headers=h).status_code == 204
    assert client.post(url, headers=h, files={"archivo": ("d.pdf", medio_mb, "application/pdf")}).status_code == 201


# ── Límite de IA ─────────────────────────────────────────────────────────────

def test_el_tope_de_ia_se_descuenta_antes_de_llamar_al_proveedor(client, clinica_b, plan_chico, monkeypatch):
    _asignar(clinica_b["id"], plan_chico(max_ia_mes=1))
    llamadas = []

    def falso(texto, db=None):
        llamadas.append(texto)
        return {"datos": {}, "inferencias": {}, "alertas_rango": {}, "transcripcion": texto}

    monkeypatch.setattr(main, "extraer_historia", falso)
    h = clinica_b["h"]
    assert client.post("/api/procesar-historia", headers=h, json={"texto": "Perro con tos"}).status_code == 200
    r = client.post("/api/procesar-historia", headers=h, json={"texto": "Otro perro"})
    assert r.status_code == 402 and "IA" in r.json()["detail"]
    assert llamadas == ["Perro con tos"], "no debe llamar al proveedor cuando ya no hay cupo"


def test_el_tope_de_ia_es_atomico_con_peticiones_simultaneas(clinica_b, plan_chico):
    """Veinte llamadas a la vez contra un tope de 5: pasan exactamente 5."""
    _asignar(clinica_b["id"], plan_chico(max_ia_mes=5))

    def intento(_):
        try:
            limites.consumir_ia(clinica_b["id"])
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=10) as pool:
        resultados = list(pool.map(intento, range(20)))
    assert sum(resultados) == 5
    usado = _sql("SELECT ia_usos FROM uso_mensual WHERE clinica_id = :c AND periodo = :p",
                 c=clinica_b["id"], p=limites.periodo_actual()).scalar()
    assert usado == 5


def test_un_plan_sin_ia_la_bloquea_del_todo(clinica_b, plan_chico):
    _asignar(clinica_b["id"], plan_chico(max_ia_mes=0))
    with pytest.raises(Exception) as e:
        limites.consumir_ia(clinica_b["id"])
    assert getattr(e.value, "status_code", None) == 402


def test_el_uso_de_ia_es_por_mes_y_por_clinica():
    from datetime import datetime
    assert limites.periodo_actual() == datetime.now(__import__("zoneinfo").ZoneInfo("America/Lima")).strftime("%Y-%m")


# ── Funciones por plan ───────────────────────────────────────────────────────

def test_las_funciones_incluidas_en_el_plan(client, clinica_b, plan_chico):
    h = clinica_b["h"]
    _asignar(clinica_b["id"], plan_chico(incluye_planilla=False, incluye_contactos=False))
    r = client.get("/api/planilla/", headers=h)
    assert r.status_code == 402 and "planilla" in r.json()["detail"].lower() and "Plan QA" in r.json()["detail"]
    assert client.get("/api/contactos/pendientes", headers=h).status_code == 402
    assert client.get("/api/clientes/", headers=h).status_code == 200          # lo demás sigue

    _asignar(clinica_b["id"], plan_chico(incluye_planilla=True, incluye_contactos=True))
    assert client.get("/api/planilla/", headers=h).status_code == 200
    assert client.get("/api/contactos/pendientes", headers=h).status_code == 200


def test_la_clinica_fundadora_no_tiene_limites(client, admin):
    datos = cobro.datos_suscripcion(1)
    assert all(v["limite"] is None for v in datos["limites"].values())
    assert datos["funciones"] == {"planilla": True, "contactos": True}


# ── Cálculo de fechas ────────────────────────────────────────────────────────

def test_sumar_meses_respeta_el_calendario():
    assert cobro.sumar_meses(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert cobro.sumar_meses(date(2028, 1, 31), 1) == date(2028, 2, 29)     # bisiesto
    assert cobro.sumar_meses(date(2026, 12, 15), 2) == date(2027, 2, 15)
    assert cobro.sumar_meses(date(2026, 3, 10), 12) == date(2027, 3, 10)


# ── Pagos ────────────────────────────────────────────────────────────────────

def _pagar(client, op, clinica_id, **extra):
    cuerpo = {"plan": "basico", "meses": 1, "metodo": "yape"} | extra
    return client.post(f"/api/plataforma/clinicas/{clinica_id}/pagos", headers=op["h"], json=cuerpo)


def test_un_pago_extiende_el_vencimiento_y_fija_el_plan(client, operador, clinica_b):
    precios = {p["codigo"]: p["precio_mensual"] for p in client.get("/api/plataforma/planes", headers=operador["h"]).json()}
    r = _pagar(client, operador, clinica_b["id"], meses=3, referencia="OP-1")
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["creado"] is True and cuerpo["plan"]["codigo"] == "basico"
    assert cuerpo["pago"]["monto"] == pytest.approx(precios["basico"] * 3)          # por defecto: precio × meses
    esperado = cobro.sumar_meses(cobro.hoy_lima(), 3)
    assert str(cuerpo["vence_en"]) == esperado.isoformat()

    # renovar ANTES de vencer suma al final del periodo ya pagado
    r2 = _pagar(client, operador, clinica_b["id"], meses=1, referencia="OP-2")
    assert str(r2.json()["vence_en"]) == cobro.sumar_meses(esperado, 1).isoformat()


def test_el_mismo_pago_no_se_acredita_dos_veces(client, operador, clinica_b):
    ref = f"YAPE-{uuid.uuid4().hex[:8]}"
    a = _pagar(client, operador, clinica_b["id"], meses=1, referencia=ref)
    b = _pagar(client, operador, clinica_b["id"], meses=1, referencia=ref)       # la pasarela repite el aviso
    assert a.json()["creado"] is True and b.json()["creado"] is False
    assert a.json()["vence_en"] == b.json()["vence_en"]
    pagos = client.get(f"/api/plataforma/clinicas/{clinica_b['id']}/suscripcion", headers=operador["h"]).json()["pagos"]
    assert len(pagos) == 1


def test_una_referencia_no_se_reutiliza_en_otra_clinica(client, operador, clinica_b, clinica_c):
    ref = f"YAPE-{uuid.uuid4().hex[:8]}"
    assert _pagar(client, operador, clinica_b["id"], referencia=ref).status_code == 201
    assert _pagar(client, operador, clinica_c["id"], referencia=ref).status_code == 422
    # sin referencia no hay deduplicación posible: cada uno cuenta
    assert _pagar(client, operador, clinica_b["id"]).json()["creado"] is True
    assert _pagar(client, operador, clinica_b["id"]).json()["creado"] is True


def test_pagar_desbloquea_a_una_clinica_vencida_y_puede_reactivarla(client, operador, clinica_b):
    h, b, op = clinica_b["h"], clinica_b, operador
    ayer = (date.today() - timedelta(days=3)).isoformat()
    client.put(f"/api/plataforma/clinicas/{b['id']}", headers=op["h"], json={"vence_en": ayer})
    assert client.get("/api/clientes/", headers=h).status_code == 403             # vencida

    r = _pagar(client, op, b["id"], meses=1)
    assert r.status_code == 201
    # el periodo corre desde HOY (ya había vencido), no desde la fecha vieja
    assert str(r.json()["vence_en"]) == cobro.sumar_meses(cobro.hoy_lima(), 1).isoformat()
    assert client.get("/api/clientes/", headers=h).status_code == 200             # desbloqueada

    # una suspendida solo vuelve si se pide expresamente
    client.put(f"/api/plataforma/clinicas/{b['id']}", headers=op["h"], json={"estado": "suspendida", "motivo": "Abuso del servicio"})
    _pagar(client, op, b["id"])
    assert client.get("/api/clientes/", headers=h).status_code == 403
    _pagar(client, op, b["id"], reactivar=True)
    assert client.get("/api/clientes/", headers=h).status_code == 200


def test_pagos_invalidos(client, operador, clinica_b):
    assert _pagar(client, operador, clinica_b["id"], metodo="trueque").status_code == 422
    assert _pagar(client, operador, clinica_b["id"], plan="inventado").status_code == 422
    assert _pagar(client, operador, clinica_b["id"], plan="plataforma").status_code == 422
    assert _pagar(client, operador, clinica_b["id"], meses=0).status_code == 422
    assert _pagar(client, operador, clinica_b["id"], meses=25).status_code == 422
    assert _pagar(client, operador, clinica_b["id"], monto=-5).status_code == 422


def test_el_pago_queda_en_la_bitacora_del_operador(client, operador, clinica_b):
    _pagar(client, operador, clinica_b["id"], referencia="BCP-123", metodo="transferencia")
    d = client.get(f"/api/plataforma/clinicas/{clinica_b['id']}", headers=operador["h"]).json()
    pago = next(a for a in d["acciones"] if a["accion"] == "pago")
    assert "BCP-123" in pago["detalle"] and pago["operador"] == operador["usuario"]


# ── Planes editables ─────────────────────────────────────────────────────────

def test_el_operador_edita_planes_y_los_topes_se_aplican_al_instante(client, operador, clinica_b, plan_chico):
    codigo = plan_chico(max_usuarios=1)
    _asignar(clinica_b["id"], codigo)
    h = clinica_b["h"]
    assert _nuevo_usuario(client, h).status_code == 402             # 1 de 1: no cabe otro

    # (el plan de prueba es 'publico=false' y no aparece en /planes públicos, pero sí se edita por código)
    assert client.put(f"/api/plataforma/planes/{codigo}", headers=operador["h"], json={"max_usuarios": 5}).status_code == 200
    assert _nuevo_usuario(client, h).status_code == 201
    # null explícito = ilimitado
    assert client.put(f"/api/plataforma/planes/{codigo}", headers=operador["h"], json={"max_usuarios": None}).json()["max_usuarios"] is None
    # no enviar el campo = no tocarlo
    assert client.put(f"/api/plataforma/planes/{codigo}", headers=operador["h"], json={"nombre": "Otro nombre"}).json()["max_usuarios"] is None


def test_edicion_de_planes_valida(client, operador, admin):
    assert client.put("/api/plataforma/planes/basico", headers=operador["h"], json={"precio_mensual": -1}).status_code == 422
    assert client.put("/api/plataforma/planes/basico", headers=operador["h"], json={"max_usuarios": -3}).status_code == 422
    assert client.put("/api/plataforma/planes/plataforma", headers=operador["h"], json={"nombre": "Nombre"}).status_code == 404
    assert client.put("/api/plataforma/planes/nuevo", headers=operador["h"], json={"nombre": "Nombre"}).status_code == 404
    # las clínicas no editan planes
    assert client.put("/api/plataforma/planes/basico", headers=admin, json={"nombre": "Hackeado"}).status_code == 403


# ── La suscripción vista por la clínica ──────────────────────────────────────

def test_la_clinica_ve_su_plan_su_uso_y_solo_sus_pagos(client, operador, clinica_b, clinica_c):
    _pagar(client, operador, clinica_b["id"], referencia=f"V-{uuid.uuid4().hex[:6]}")
    _pagar(client, operador, clinica_c["id"], referencia=f"V-{uuid.uuid4().hex[:6]}")   # de OTRA clínica
    s = client.get("/api/suscripcion/", headers=clinica_b["h"]).json()
    assert s["plan"]["codigo"] == "basico" and s["estado"] == "activa"
    assert s["limites"]["usuarios"]["uso"] == 1 and s["limites"]["usuarios"]["limite"] == 3
    assert len(s["pagos"]) == 1, "solo debe ver sus propios pagos"
    codigos = [p["codigo"] for p in s["planes"]]
    assert codigos == ["basico", "profesional"], "no se ofrecen la prueba ni los planes internos"
    assert "dias_restantes" in s


def test_solo_la_administradora_ve_la_suscripcion(client, doctor, clinica_b):
    assert client.get("/api/suscripcion/", headers=doctor).status_code == 403
    assert client.post("/api/suscripcion/solicitar", headers=doctor, json={"plan": "basico"}).status_code == 403
    assert client.get("/api/suscripcion/", headers=clinica_b["h"]).status_code == 200


def test_pedir_un_cambio_de_plan(client, operador, clinica_b):
    h = clinica_b["h"]
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "profesional", "mensaje": "Somos 6 en el equipo"}).status_code == 201
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "basico"}).status_code == 409    # ya hay una pendiente
    assert client.get("/api/suscripcion/", headers=h).json()["solicitud_pendiente"]["plan"] == "profesional"

    pendientes = client.get("/api/plataforma/solicitudes", headers=operador["h"]).json()
    mia = next(s for s in pendientes if s["clinica_id"] == clinica_b["id"])
    assert mia["plan"] == "profesional" and mia["mensaje"] == "Somos 6 en el equipo"

    # al registrar el pago de ese plan, la solicitud queda atendida
    _pagar(client, operador, clinica_b["id"], plan="profesional")
    assert not any(s["clinica_id"] == clinica_b["id"] for s in client.get("/api/plataforma/solicitudes", headers=operador["h"]).json())
    assert client.get("/api/suscripcion/", headers=h).json()["solicitud_pendiente"] is None


def test_no_se_puede_pedir_lo_que_no_existe_o_ya_se_tiene(client, clinica_b):
    h = clinica_b["h"]
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "fundadora"}).status_code == 404   # no público
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "inventado"}).status_code == 404
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "prueba"}).status_code == 404       # no público


# ── Panel: dinero ────────────────────────────────────────────────────────────

def test_el_resumen_del_operador_incluye_ingresos_y_recurrente(client, operador, clinica_b):
    antes = client.get("/api/plataforma/resumen", headers=operador["h"]).json()
    r = _pagar(client, operador, clinica_b["id"], plan="profesional", meses=2, referencia=f"R-{uuid.uuid4().hex[:6]}")
    despues = client.get("/api/plataforma/resumen", headers=operador["h"]).json()
    assert despues["ingresos_mes"] == pytest.approx(antes["ingresos_mes"] + r.json()["pago"]["monto"])
    precio_pro = next(p for p in client.get("/api/plataforma/planes", headers=operador["h"]).json() if p["codigo"] == "profesional")
    assert despues["mrr"] == pytest.approx(antes["mrr"] + precio_pro["precio_mensual"])
    assert "solicitudes_pendientes" in despues
    pagos = client.get("/api/plataforma/pagos", headers=operador["h"]).json()
    assert pagos[0]["clinica"] == "Clínica Operada QA"


def test_las_clinicas_no_entran_a_los_endpoints_de_cobro_del_operador(client, admin, doctor, clinica_b):
    for h in (admin, doctor, clinica_b["h"]):
        for metodo, ruta in [("GET", "/api/plataforma/planes"), ("PUT", "/api/plataforma/planes/basico"),
                             ("POST", "/api/plataforma/clinicas/1/pagos"), ("GET", "/api/plataforma/pagos"),
                             ("GET", "/api/plataforma/solicitudes"), ("GET", "/api/plataforma/clinicas/1/suscripcion")]:
            assert client.request(metodo, ruta, headers=h).status_code == 403, f"{metodo} {ruta}"


# ── Una clínica bloqueada ────────────────────────────────────────────────────

def test_una_clinica_vencida_solo_ve_su_suscripcion_y_puede_pedir_renovar(client, operador, clinica_b):
    h, b = clinica_b["h"], clinica_b
    _asignar(b["id"], "basico")
    ayer = (date.today() - timedelta(days=2)).isoformat()
    client.put(f"/api/plataforma/clinicas/{b['id']}", headers=operador["h"], json={"vence_en": ayer})

    # todo lo de la clínica está cerrado…
    for ruta in ("/api/clientes/", "/api/citas/", "/api/usuarios/", "/api/planilla/"):
        assert client.get(ruta, headers=h).status_code == 403, ruta
    # …salvo ver por qué y cómo regularizarse
    s = client.get("/api/suscripcion/", headers=h)
    assert s.status_code == 200 and s.json()["estado"] == "vencida"
    assert s.json()["instrucciones_pago"] is None or isinstance(s.json()["instrucciones_pago"], str)
    # y pedir el mismo plan, que solo tiene sentido para renovar
    assert client.post("/api/suscripcion/solicitar", headers=h, json={"plan": "basico"}).status_code == 201

    # al renovar, vuelve todo
    assert _pagar(client, operador, b["id"], plan="basico").status_code == 201
    assert client.get("/api/clientes/", headers=h).status_code == 200


def test_una_clinica_al_dia_no_puede_pedir_su_mismo_plan(client, clinica_b):
    _asignar(clinica_b["id"], "basico")
    assert client.post("/api/suscripcion/solicitar", headers=clinica_b["h"], json={"plan": "basico"}).status_code == 409
