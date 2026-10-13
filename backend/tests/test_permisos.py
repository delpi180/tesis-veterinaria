"""Seguridad por rol en el servidor.

El menú esconde opciones, pero esconder un botón no protege nada: quien tiene
un token puede escribir la URL. Aquí se prueba lo que responde el servidor.

Tres capas:
  1. COBERTURA — toda ruta existente tiene sus permisos declarados. Si alguien
     agrega un endpoint y no lo declara en core/permisos.py, esta prueba falla.
  2. MATRIZ — en cada ruta, cada rol que NO debe entrar recibe 403. Es seguro
     ejecutarlo contra todas: el middleware corta antes de llegar al endpoint.
  3. REGLAS DE NEGOCIO — los casos que importan, con nombre y explicación.

    cd backend
    python -m pytest tests/test_permisos.py -v
"""
import re

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import main
from core import permisos
from core.permisos import ADMIN, AMBOS, SOLO_ADMIN, SOLO_VET, VET

MENSAJE = "No tienes permiso para esta acción."


def _rutas():
    """(método, ruta concreta) de todas las rutas de la API que exigen sesión."""
    salida = []
    for r in main.app.routes:
        if not isinstance(r, APIRoute) or not r.path.startswith("/api/"):
            continue
        concreta = re.sub(r"\{[^}]+\}", "1", r.path)
        for metodo in sorted(r.methods - {"HEAD", "OPTIONS"}):
            if _es_publica(metodo, r.path):
                continue
            salida.append((metodo, concreta))
    return sorted(set(salida))


def _es_publica(metodo: str, ruta: str) -> bool:
    return (
        ruta in main.RUTAS_PUBLICAS
        or (metodo == "GET" and ruta in main.RUTAS_PUBLICAS_LECTURA)
        or (metodo == "POST" and ruta in main.RUTAS_PUBLICAS_ESCRITURA)
    )


# ── 1. Cobertura ─────────────────────────────────────────────────────────────

def test_toda_ruta_tiene_sus_permisos_declarados():
    """Una ruta sin declarar queda cerrada para todos; aquí se exige declararla."""
    sin_declarar = [f"{m} {p}" for m, p in _rutas() if permisos.regla_para(m, p) is None]
    assert not sin_declarar, (
        "Estas rutas no tienen permisos en core/permisos.py (hoy nadie puede llamarlas):\n  "
        + "\n  ".join(sin_declarar)
    )


def test_hay_rutas_que_probar():
    assert len(_rutas()) > 100


# ── 2. Matriz ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def navegador():
    # Sin re-lanzar excepciones: se comporta como un navegador real.
    return TestClient(main.app, raise_server_exceptions=False)


def test_cada_rol_recibe_403_en_lo_que_no_le_toca(navegador, admin, doctor):
    """Para cada ruta, el rol no autorizado es rechazado por el servidor.

    Se ejecuta contra TODAS las rutas, incluidas las que borran: es seguro
    porque el rechazo ocurre en el middleware, antes de llegar al endpoint.
    """
    por_rol = {ADMIN: admin, VET: doctor}
    fallos = []
    for metodo, ruta in _rutas():
        permitidos = permisos.roles_permitidos(metodo, ruta)
        for rol, cabeceras in por_rol.items():
            if rol in permitidos:
                continue
            r = navegador.request(metodo, ruta, headers=cabeceras)
            if r.status_code != 403:
                fallos.append(f"{rol} {metodo} {ruta} → {r.status_code} (debía ser 403)")
    assert not fallos, "Rutas abiertas a un rol que no debería entrar:\n  " + "\n  ".join(fallos)


def test_lo_permitido_no_se_bloquea_por_error(navegador, admin, doctor):
    """El otro sentido: un rol autorizado no debe recibir el 403 del middleware.

    Solo se ejecutan las lecturas (GET); las escrituras reales están cubiertas
    por las pruebas de cada módulo.
    """
    por_rol = {ADMIN: admin, VET: doctor}
    bloqueados = []
    for metodo, ruta in _rutas():
        if metodo != "GET" or "stream" in ruta:        # el stream no termina nunca
            continue
        for rol, cabeceras in por_rol.items():
            if rol not in permisos.roles_permitidos(metodo, ruta):
                continue
            r = navegador.get(ruta, headers=cabeceras)
            if r.status_code == 403 and r.json().get("detail") == MENSAJE:
                bloqueados.append(f"{rol} GET {ruta}")
    assert not bloqueados, "Bloqueado por la tabla siendo un rol autorizado:\n  " + "\n  ".join(bloqueados)


def test_sin_sesion_nada_responde(navegador):
    for metodo, ruta in _rutas():
        if "stream" in ruta:
            continue
        assert navegador.request(metodo, ruta).status_code == 401, f"{metodo} {ruta}"


# ── 3. La tabla misma ────────────────────────────────────────────────────────

def test_lo_que_no_esta_declarado_se_niega_a_todos():
    for rol in (ADMIN, VET, None, "otro"):
        assert permisos.permitido("GET", "/api/ruta-que-no-existe", rol) is False
    assert permisos.roles_permitidos("PATCH", "/api/ventas/") == SOLO_ADMIN   # método no listado en otra regla


def test_la_barra_final_no_cambia_el_permiso():
    assert permisos.roles_permitidos("GET", "/api/productos/") == AMBOS
    assert permisos.roles_permitidos("GET", "/api/productos") == AMBOS


def test_gana_la_regla_mas_especifica():
    # Las recetas se leen entre los dos roles, pero solo las escribe el veterinario
    assert permisos.roles_permitidos("GET", "/api/pacientes/5/recetas/") == AMBOS
    assert permisos.roles_permitidos("POST", "/api/pacientes/5/recetas/") == SOLO_VET
    assert permisos.roles_permitidos("PUT", "/api/pacientes/5/recetas/9") == SOLO_VET
    # Una consulta la llena cualquiera, pero borrarla o firmarla es del veterinario
    assert permisos.roles_permitidos("POST", "/api/pacientes/5/historias/") == AMBOS
    assert permisos.roles_permitidos("DELETE", "/api/pacientes/5/historias/9") == SOLO_VET
    assert permisos.roles_permitidos("POST", "/api/pacientes/5/historias/9/firmar") == SOLO_VET


def test_ningun_rol_desconocido_pasa():
    assert permisos.permitido("GET", "/api/clientes/", "superusuario") is False
    assert permisos.permitido("GET", "/api/clientes/", None) is False


# ── 4. Reglas de negocio, con nombre ─────────────────────────────────────────

def test_el_veterinario_no_ve_ni_toca_el_dinero(client, doctor):
    """Ventas, caja y reportes son de la administradora."""
    for metodo, ruta in [
        ("GET", "/api/ventas/"), ("POST", "/api/ventas/"), ("GET", "/api/ventas/cliente/1"),
        ("GET", "/api/dashboard/resumen"), ("GET", "/api/dashboard/cierre-caja"),
        ("GET", "/api/dashboard/reportes"),
    ]:
        assert client.request(metodo, ruta, headers=doctor).status_code == 403, f"{metodo} {ruta}"


def test_el_veterinario_no_modifica_el_inventario_pero_si_lo_lee(client, doctor):
    """Lee el catálogo para recetar; no cambia precios ni stock."""
    assert client.get("/api/productos/", headers=doctor).status_code == 200
    for metodo, ruta in [
        ("POST", "/api/productos/"), ("PUT", "/api/productos/1"), ("DELETE", "/api/productos/1"),
        ("POST", "/api/productos/1/ajuste-stock"), ("GET", "/api/productos/1/movimientos"),
        ("GET", "/api/productos/stock-bajo"), ("POST", "/api/inventario/aplicar"),
        ("POST", "/api/servicios/"), ("PUT", "/api/servicios/1"),
    ]:
        assert client.request(metodo, ruta, headers=doctor).status_code == 403, f"{metodo} {ruta}"


def test_el_veterinario_no_administra_al_equipo_ni_el_sistema(client, doctor):
    for metodo, ruta in [
        ("GET", "/api/usuarios/"), ("POST", "/api/usuarios/"), ("PUT", "/api/usuarios/1"),
        ("DELETE", "/api/usuarios/1"), ("GET", "/api/planilla/"), ("GET", "/api/planilla/personal"),
        ("GET", "/api/asistencia/"), ("GET", "/api/actividad/"), ("GET", "/api/respaldo/"),
        ("GET", "/api/errores/"), ("PUT", "/api/configuracion/"), ("GET", "/api/contactos/pendientes"),
        ("GET", "/api/glosario/"),
    ]:
        assert client.request(metodo, ruta, headers=doctor).status_code == 403, f"{metodo} {ruta}"


def test_el_veterinario_no_puede_borrar_clientes_ni_mascotas(client, admin, doctor):
    """Borrar arrastra todo el historial clínico: es de la administradora."""
    import uuid
    dni = f"6{uuid.uuid4().int % 10_000_000:07d}"
    cli = client.post("/api/clientes/", headers=admin, json={"nombre": "Cliente permisos", "dni": dni}).json()
    pac = client.post(f"/api/clientes/{cli['id']}/pacientes/", headers=admin,
                      json={"nombre": "Mascota permisos", "especie": "Canino"}).json()
    try:
        assert client.delete(f"/api/pacientes/{pac['id']}", headers=doctor).status_code == 403
        assert client.delete(f"/api/clientes/{cli['id']}", headers=doctor).status_code == 403
        # y siguen ahí
        assert client.get(f"/api/clientes/{cli['id']}", headers=doctor).status_code == 200
        # pero sí puede corregir sus datos, y verlos
        r = client.put(f"/api/clientes/{cli['id']}", headers=doctor,
                       json={"nombre": "Cliente corregido", "dni": dni})
        assert r.status_code == 200
    finally:
        client.delete(f"/api/clientes/{cli['id']}", headers=admin)


def test_el_veterinario_atiende_lo_que_le_toca(client, doctor):
    """Lo que el veterinario necesita para trabajar sigue abierto."""
    for ruta in ["/api/mi-panel/", "/api/clientes/", "/api/citas/", "/api/tratamientos/",
                 "/api/usuarios/doctores", "/api/catalogos/vacunas", "/api/busqueda/?q=ab"]:
        assert client.get(ruta, headers=doctor).status_code == 200, ruta


def test_la_recepcion_no_hace_actos_del_veterinario(client, admin):
    """Firmar, corregir lo firmado, borrar consultas y emitir recetas."""
    for metodo, ruta in [
        ("POST", "/api/pacientes/1/historias/1/firmar"),
        ("POST", "/api/pacientes/1/historias/1/addendum"),
        ("DELETE", "/api/pacientes/1/historias/1"),
        ("POST", "/api/pacientes/1/recetas/"), ("PUT", "/api/pacientes/1/recetas/1"),
        ("DELETE", "/api/pacientes/1/recetas/1"), ("POST", "/api/procesar-receta"),
        ("GET", "/api/mi-panel/"),
    ]:
        assert client.request(metodo, ruta, headers=admin).status_code == 403, f"{metodo} {ruta}"


def test_la_recepcion_si_llena_consultas_y_reenvia_recetas(client, admin):
    """Llenar la historia por el doctor, y reimprimir/reenviar una receta ya emitida."""
    assert permisos.permitido("POST", "/api/pacientes/1/historias/", ADMIN)
    assert permisos.permitido("PUT", "/api/pacientes/1/historias/1", ADMIN)
    assert permisos.permitido("POST", "/api/transcribe", ADMIN)
    assert permisos.permitido("POST", "/api/procesar-historia", ADMIN)
    assert client.get("/api/pacientes/1/recetas/", headers=admin).status_code != 403


def test_el_perfil_de_un_usuario_solo_lo_ve_el_mismo_o_la_administradora(client, admin, doctor):
    """La tabla deja pasar a los dos roles; el endpoint exige que sea el suyo."""
    mios = {u["nombre"]: u["id"] for u in client.get("/api/usuarios/doctores", headers=admin).json()}
    yo, otro = mios["QA Doctor"], next(i for n, i in mios.items() if n != "QA Doctor")
    assert client.get(f"/api/usuarios/{yo}/perfil", headers=doctor).status_code == 200
    assert client.get(f"/api/usuarios/{otro}/perfil", headers=doctor).status_code == 403
    assert client.get(f"/api/usuarios/{otro}/perfil", headers=admin).status_code == 200
