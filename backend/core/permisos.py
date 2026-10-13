"""Quién puede llamar a qué: la tabla de permisos por rol, en un solo lugar.

Por qué existe
--------------
El menú del frontend esconde a cada rol lo que no le toca, pero esconder un
botón no es seguridad: cualquiera con su token puede escribir la URL. Hasta
ahora solo algunas rutas se protegían dentro de su endpoint (33 de 139), y el
resto confiaba en el menú: un veterinario podía, con su propio token, listar las
ventas, borrar un cliente con todo su historial o cambiar el stock.

Esta tabla lo corrige de forma central:

  · Es la ÚNICA fuente de verdad. Revisar la seguridad es leer este archivo.
  · NIEGA POR DEFECTO. Una ruta que no esté aquí responde 403 a todos los
    roles; si alguien agrega un endpoint y olvida declararlo, queda cerrado en
    vez de abierto. Además `tests/test_permisos.py` falla hasta que se declare.
  · La aplica el middleware (main.py) antes de llegar al endpoint, así que no
    depende de que cada función se acuerde de llamar a `solo_admin`. Esas
    llamadas se conservan como segunda barrera.

Roles: `recepcionista` es la administradora de la clínica; `veterinario` atiende.
Las rutas públicas (acceso, alta de clínicas, salud) se resuelven antes y no
pasan por aquí.

Cómo se lee una regla: (métodos, ruta, quién)
  · `{x}` en la ruta es un segmento cualquiera (un id).
  · `*` al final es "esta ruta y todo lo que cuelga de ella".
  · Gana la PRIMERA regla que coincide: las específicas van antes.
"""
import re

ADMIN = "recepcionista"
VET = "veterinario"
PLATAFORMA = "plataforma"        # operador del SaaS: ve clínicas, nunca sus datos
AMBOS = frozenset({ADMIN, VET})
SOLO_ADMIN = frozenset({ADMIN})
SOLO_VET = frozenset({VET})
SOLO_PLATAFORMA = frozenset({PLATAFORMA})

GET, POST, PUT, DELETE = "GET", "POST", "PUT", "DELETE"
TODOS = ("GET", "POST", "PUT", "DELETE", "PATCH")

REGLAS: list[tuple[tuple[str, ...], str, frozenset]] = [
    # ── Datos de la clínica ───────────────────────────────────────────────────
    ((GET,),    "/api/configuracion/",                    AMBOS),
    ((PUT,),    "/api/configuracion/",                    SOLO_ADMIN),
    ((GET,),    "/api/busqueda/",                         AMBOS),
    ((GET,),    "/api/catalogos/*",                       AMBOS),

    # ── Agenda: la recepción agenda, el veterinario atiende ──────────────────
    (TODOS,     "/api/citas/*",                           AMBOS),

    # ── Clientes y mascotas ──────────────────────────────────────────────────
    # Borrar un cliente o una mascota arrastra todo su historial clínico: es
    # de la administradora. El veterinario puede verlos y corregir sus datos.
    ((DELETE,), "/api/clientes/{id}",                     SOLO_ADMIN),
    ((DELETE,), "/api/pacientes/{id}",                    SOLO_ADMIN),
    (TODOS,     "/api/clientes/*",                        AMBOS),

    # ── Historia clínica ─────────────────────────────────────────────────────
    # La recepción puede llenarla (el doctor dicta y sigue atendiendo), pero
    # firmar, corregir una firmada y borrar son actos del veterinario.
    ((POST,),   "/api/pacientes/{id}/historias/{id}/firmar",   SOLO_VET),
    ((POST,),   "/api/pacientes/{id}/historias/{id}/addendum", SOLO_VET),
    ((DELETE,), "/api/pacientes/{id}/historias/{id}",          SOLO_VET),
    # La receta es un documento firmado por un colegiado: solo el veterinario.
    ((GET,),    "/api/pacientes/{id}/recetas/*",          AMBOS),   # reimprimir y reenviar
    (TODOS,     "/api/pacientes/{id}/recetas/*",          SOLO_VET),
    (TODOS,     "/api/pacientes/*",                       AMBOS),
    ((POST,),   "/api/procesar-receta",                   SOLO_VET),
    ((POST,),   "/api/procesar-historia",                 AMBOS),
    ((POST,),   "/api/transcribe",                        AMBOS),
    (TODOS,     "/api/tratamientos/*",                    AMBOS),
    ((GET,),    "/api/mi-panel/",                         SOLO_VET),

    # ── Equipo ───────────────────────────────────────────────────────────────
    ((GET,),    "/api/usuarios/doctores",                 AMBOS),
    # El propio usuario puede verse; el endpoint comprueba que sea el suyo.
    ((GET,),    "/api/usuarios/{id}/perfil",              AMBOS),
    (TODOS,     "/api/usuarios/*",                        SOLO_ADMIN),
    (TODOS,     "/api/asistencia/*",                      SOLO_ADMIN),
    (TODOS,     "/api/planilla/*",                        SOLO_ADMIN),

    # ── Inventario: el veterinario solo lee el catálogo para recetar ─────────
    ((GET,),    "/api/productos/",                        AMBOS),
    (TODOS,     "/api/productos/*",                       SOLO_ADMIN),
    (TODOS,     "/api/inventario/*",                      SOLO_ADMIN),
    (TODOS,     "/api/servicios/*",                       SOLO_ADMIN),

    # ── Dinero ───────────────────────────────────────────────────────────────
    (TODOS,     "/api/ventas/*",                          SOLO_ADMIN),
    (TODOS,     "/api/dashboard/*",                       SOLO_ADMIN),

    # ── Contacto con los dueños ──────────────────────────────────────────────
    (TODOS,     "/api/contactos/*",                       SOLO_ADMIN),
    (TODOS,     "/api/glosario/*",                        SOLO_ADMIN),

    # ── Administración del sistema ───────────────────────────────────────────
    (TODOS,     "/api/actividad/*",                       SOLO_ADMIN),
    (TODOS,     "/api/respaldo/*",                        SOLO_ADMIN),
    # Reportar un error es público (se resuelve antes); verlos es de la administradora.
    (TODOS,     "/api/errores/*",                         SOLO_ADMIN),

    # ── Operación del SaaS ───────────────────────────────────────────────────
    # El operador gestiona clínicas (estado, plan, vencimiento) y NADA más: no
    # figura en ninguna otra regla, así que no puede abrir datos de una clínica.
    (TODOS,     "/api/plataforma/*",                      SOLO_PLATAFORMA),

    # ── Módulos de tesis (apagados por defecto; ver core.config) ─────────────
    (TODOS,     "/api/sus/*",                             AMBOS),
    (TODOS,     "/api/tam/*",                             AMBOS),
    (TODOS,     "/api/evaluadores/*",                     AMBOS),
    (TODOS,     "/api/encuestas/*",                       SOLO_ADMIN),
    (TODOS,     "/api/comparar-exactitud",                SOLO_ADMIN),
    (TODOS,     "/api/comparar-extraccion",               SOLO_ADMIN),
]


def _compilar(plantilla: str) -> re.Pattern:
    """'/api/x/{id}/y/*' → expresión regular."""
    prefijo = plantilla.endswith("*")
    base = plantilla[:-1] if prefijo else plantilla
    # Una ruta con barra final y la misma sin ella son la misma ruta.
    base = base.rstrip("/")
    cuerpo = re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(base))
    return re.compile(rf"^{cuerpo}(?:/.*)?/?$" if prefijo else rf"^{cuerpo}/?$")


_COMPILADAS = [(set(m), _compilar(p), roles, p) for m, p, roles in REGLAS]


def regla_para(metodo: str, ruta: str):
    """La primera regla que cubre esa petición, o None si no hay ninguna."""
    for metodos, patron, roles, plantilla in _COMPILADAS:
        if metodo in metodos and patron.match(ruta):
            return roles, plantilla
    return None


def roles_permitidos(metodo: str, ruta: str) -> frozenset:
    """Roles que pueden hacer esta petición. Vacío = nadie (ruta sin declarar)."""
    encontrada = regla_para(metodo, ruta)
    return encontrada[0] if encontrada else frozenset()


def permitido(metodo: str, ruta: str, rol: str | None) -> bool:
    return rol in roles_permitidos(metodo, ruta)
