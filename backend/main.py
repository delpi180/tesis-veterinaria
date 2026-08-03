import logging
import os
import re
import time

from fastapi import FastAPI, Request, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("vetlospinos")

from database import SessionLocal, engine
import models  # registra todos los modelos en Base.metadata
from routers import (
    auth, usuarios, clientes, pacientes, citas, dashboard,
    evaluadores, sus, tam, encuestas, productos, servicios, ventas,
    busqueda, inventario, asistencia, mi_panel, actividad, configuracion, errores,
    respaldo,
)
from core import ratelimit
from core.config import settings
from core.security import verificar_token, hash_password
from services.transcription import transcribe_audio
from services.historia_extractor import extraer_historia
from services.receta_extractor import extraer_receta
from services.soap_processor import process_soap  # léxico, para comparativa de tesis

app = FastAPI(title="Veterinaria Los Pinos API")

# Rutas accesibles sin token
RUTAS_PUBLICAS = {"/api/auth/login", "/api/health"}

# Rutas donde solo el ENVÍO (POST) es público, pero leerlas exige sesión.
# Reportar un error del navegador no puede depender de tener sesión: si la app
# se rompe en la pantalla de acceso, ese es justamente el error que hay que
# poder ver. Consultarlos sigue siendo exclusivo de la administradora.
RUTAS_PUBLICAS_ESCRITURA = {"/api/errores/"}

# Rutas cuya LECTURA es pública, pero que siguen exigiendo sesión para escribir.
# La pantalla de acceso muestra el nombre de la clínica antes de que nadie haya
# entrado; modificar esos datos sigue siendo exclusivo de la administradora.
RUTAS_PUBLICAS_LECTURA = {"/api/configuracion/"}

# Identificador de la versión desplegada. Railway expone el SHA del commit;
# antes esto era una cadena fija escrita a mano ("redeploy-2026-06-27"), que
# quedaba desactualizada y hacía inútil el "confirmar qué versión está viva".
_BUILD = (
    os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:7]
    or os.environ.get("BUILD_ID", "")
    or "dev"
)


def _clave_cliente(request: Request) -> str:
    """IP del cliente para el rate-limit (respeta el proxy de Railway/Vercel)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


def _es_ruta_clinica(path: str) -> bool:
    """Rutas reservadas al rol veterinario para escribir.

    La receta es lo único que queda cerrado: es un documento que va firmado por
    un colegiado y con su número de colegiatura, no algo que se pueda delegar.

    Las historias clínicas sí las puede llenar la recepcionista. En consulta
    cargada el doctor dicta y sigue atendiendo, y la alternativa real no es
    "que la llene el doctor después" sino que la consulta quede sin registrar.
    Queda constancia de quién la escribió (bitácora de actividad) y hay que
    indicar qué veterinario atendió, así que la firma clínica no se falsea.
    """
    return (
        "/recetas" in path
        or path == "/api/procesar-receta"
    )


# ── Bitácora de actividad (auditoría) ────────────────────────────────────────

_ACCIONES = {
    ("POST", "/api/citas"): "Creó un turno",
    ("PUT", "/api/citas/{id}"): "Editó un turno",
    ("DELETE", "/api/citas/{id}"): "Eliminó un turno",
    ("POST", "/api/clientes"): "Registró un cliente",
    ("PUT", "/api/clientes/{id}"): "Editó un cliente",
    ("DELETE", "/api/clientes/{id}"): "Eliminó un cliente",
    ("POST", "/api/clientes/{id}/pacientes"): "Registró una mascota",
    ("PUT", "/api/pacientes/{id}"): "Editó una mascota",
    ("DELETE", "/api/pacientes/{id}"): "Eliminó una mascota",
    ("POST", "/api/pacientes/{id}/historias"): "Registró una historia clínica",
    ("PUT", "/api/pacientes/{id}/historias/{id}"): "Editó una historia clínica",
    ("POST", "/api/pacientes/{id}/recetas"): "Emitió una receta",
    ("PUT", "/api/pacientes/{id}/recetas/{id}"): "Editó una receta",
    ("DELETE", "/api/pacientes/{id}/recetas/{id}"): "Eliminó una receta",
    ("POST", "/api/asistencia/ingreso"): "Marcó ingreso de asistencia",
    ("POST", "/api/asistencia/{id}/salida"): "Marcó salida de asistencia",
    ("PUT", "/api/asistencia/{id}"): "Corrigió una marcación de asistencia",
    ("DELETE", "/api/asistencia/{id}"): "Eliminó una marcación",
    ("POST", "/api/ventas"): "Registró una venta",
    ("POST", "/api/ventas/{id}/anular"): "Anuló una venta",
    ("POST", "/api/dashboard/cierre-caja"): "Cerró la caja del día",
    ("POST", "/api/usuarios"): "Creó un usuario",
    ("PUT", "/api/usuarios/{id}"): "Editó un usuario",
    ("DELETE", "/api/usuarios/{id}"): "Eliminó un usuario",
    ("POST", "/api/productos"): "Creó un producto",
    ("PUT", "/api/productos/{id}"): "Editó un producto",
    ("DELETE", "/api/productos/{id}"): "Eliminó un producto",
    ("POST", "/api/productos/{id}/ajuste-stock"): "Ajustó stock de un producto",
    ("POST", "/api/servicios"): "Creó un servicio",
    ("PUT", "/api/servicios/{id}"): "Editó un servicio",
    ("DELETE", "/api/servicios/{id}"): "Eliminó un servicio",
    ("POST", "/api/inventario/aplicar"): "Actualizó inventario por dictado",
    ("PUT", "/api/configuracion"): "Actualizó los datos de la clínica",
}


def _describir_accion(metodo: str, path: str) -> str:
    p = re.sub(r"/\d+", "/{id}", path).rstrip("/")
    return _ACCIONES.get((metodo, p), f"{metodo} {p}")


# ── Vigencia de la cuenta ────────────────────────────────────────────────────
#
# Comprobar en la BD si el usuario sigue activo en CADA petición sería una
# consulta extra por request. Se cachea el resultado unos segundos: así
# desactivar a alguien le corta el acceso en ~30 s (antes: hasta 12 h, lo que
# durara su token) sin castigar el rendimiento. Sin Redis ni servicios pagos.
_CACHE_CUENTAS: dict[str, tuple[float, bool]] = {}
_CACHE_TTL_SEG = 30


def _cuenta_habilitada(usuario: str) -> bool:
    ahora = time.time()
    entrada = _CACHE_CUENTAS.get(usuario)
    if entrada and (ahora - entrada[0]) < _CACHE_TTL_SEG:
        return entrada[1]

    db = None
    try:
        db = SessionLocal()
        activo = (
            db.query(models.Usuario.activo)
            .filter(models.Usuario.usuario == usuario)
            .scalar()
        )
        habilitada = bool(activo)
    except Exception as e:
        # Si la BD falla, no dejamos a todo el mundo fuera por un blip: se
        # confía en la firma del token (que ya se validó) y se registra.
        logger.warning("No se pudo verificar la cuenta '%s': %s", usuario, e)
        return True
    finally:
        if db is not None:
            db.close()

    _CACHE_CUENTAS[usuario] = (ahora, habilitada)
    return habilitada


def _registrar_actividad(usuario, rol, metodo, ruta, estado, detalle=None):
    """Guarda una entrada en la bitácora (no rompe la petición si falla)."""
    db = None
    try:
        db = SessionLocal()
        db.add(models.Actividad(
            usuario=usuario, rol=rol,
            accion=_describir_accion(metodo, ruta),
            detalle=detalle,
            metodo=metodo, ruta=ruta, estado=estado,
        ))
        db.commit()
    except Exception as e:
        logger.warning("No se pudo registrar la actividad: %s", e)
    finally:
        if db is not None:
            db.close()


# Auth middleware: se registra ANTES que CORS para que CORS quede por fuera
# y las respuestas 401/403 lleguen al navegador con cabeceras CORS.
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    es_lectura_publica = request.method == "GET" and path in RUTAS_PUBLICAS_LECTURA
    es_reporte_publico = request.method == "POST" and path in RUTAS_PUBLICAS_ESCRITURA
    if (
        path.startswith("/api/")
        and path not in RUTAS_PUBLICAS
        and not es_lectura_publica
        and not es_reporte_publico
        and request.method != "OPTIONS"
    ):
        header = request.headers.get("Authorization", "")
        token = header.removeprefix("Bearer ").strip()
        if not token:
            token = request.query_params.get("token", "").strip()
        sesion = verificar_token(token) if token else None
        if not sesion:
            return JSONResponse(
                status_code=401,
                content={"detail": "No autorizado. Inicia sesión para continuar."},
            )
        # El token es válido por firma, pero además la cuenta debe seguir
        # existiendo y activa: al desactivar a alguien (p. ej. personal que ya
        # no trabaja aquí) su sesión debe cortarse de inmediato, no seguir
        # abierta hasta que el token expire por su cuenta.
        if not _cuenta_habilitada(sesion["usuario"]):
            return JSONResponse(
                status_code=401,
                content={"detail": "Tu cuenta fue desactivada. Contacta a la administradora."},
            )
        # Control de rol: la recepcionista puede leer la ficha completa del
        # paciente y llenar historias clínicas; emitir recetas no (ver
        # `_es_ruta_clinica`). Leer una receta ya emitida sí, para reimprimirla
        # o reenviarla al cliente.
        lectura_recetas = request.method == "GET" and "/recetas" in path
        if (
            sesion["rol"] != "veterinario"
            and _es_ruta_clinica(path)
            and not lectura_recetas
        ):
            return JSONResponse(
                status_code=403,
                content={"detail": "Acceso restringido al personal veterinario."},
            )
        request.state.usuario = sesion["usuario"]
        request.state.rol = sesion["rol"]

    response = await call_next(request)

    # Bitácora: registra acciones que modifican datos (POST/PUT/DELETE con éxito)
    if (
        request.method in ("POST", "PUT", "DELETE")
        and path.startswith("/api/")
        and path not in RUTAS_PUBLICAS
        and not path.startswith("/api/actividad")
        and getattr(request.state, "usuario", None)
        and response.status_code < 400
    ):
        _registrar_actividad(
            request.state.usuario, getattr(request.state, "rol", None),
            request.method, path, response.status_code,
            detalle=getattr(request.state, "actividad_detalle", None),
        )

    return response


# CORS: "*" en dev; en prod se restringe al/los dominio(s) de settings.cors_origins
_cors = settings.cors_origins.strip()
_origins = ["*"] if _cors == "*" else [o.strip() for o in _cors.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def _error_no_controlado(request: Request, exc: Exception):
    """Cualquier error NO controlado: lo registramos del lado servidor (con
    traceback) y devolvemos un 500 limpio, sin filtrar detalles internos al
    cliente. Las HTTPException (401/404/422, etc.) siguen su flujo normal."""
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)

    # Además del log, se guarda en la base: los logs de Railway hay que ir a
    # buscarlos y rotan, así que un fallo de hace una semana ya no está cuando
    # el cliente llama para reportarlo.
    try:
        import traceback
        from routers.errores import registrar_error
        db = SessionLocal()
        try:
            registrar_error(
                db,
                origen="backend",
                mensaje=f"{type(exc).__name__}: {exc}",
                detalle=traceback.format_exc(),
                ruta=f"{request.method} {request.url.path}",
                usuario=getattr(request.state, "usuario", None),
                rol=getattr(request.state, "rol", None),
            )
        finally:
            db.close()
    except Exception:
        logger.warning("No se pudo guardar el error en la bitácora de errores.")

    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor. Vuelve a intentarlo."},
    )


app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(dashboard.router)
app.include_router(clientes.router)
app.include_router(pacientes.router)
app.include_router(citas.router)
# Módulos de tesis: si están apagados ni siquiera se montan, así que sus rutas
# devuelven 404. Ocultarlos solo en el menú dejaría los endpoints abiertos a
# cualquiera que escriba la URL.
if settings.modulos_tesis:
    app.include_router(evaluadores.router)
    app.include_router(sus.router)
    app.include_router(tam.router)
    app.include_router(encuestas.router)
app.include_router(productos.router)
app.include_router(servicios.router)
app.include_router(ventas.router)
app.include_router(inventario.router)
app.include_router(busqueda.router)
app.include_router(asistencia.router)
app.include_router(mi_panel.router)
app.include_router(actividad.router)
app.include_router(configuracion.router)
app.include_router(errores.router)
app.include_router(respaldo.router)


_SECRETO_POR_DEFECTO = "vet-los-pinos-secreto-dev"
_PASSWORD_POR_DEFECTO = "vetlospinos"


def _avisar_secretos_por_defecto():
    """Avisa fuerte si el sistema quedó con las claves de ejemplo.

    AUTH_SECRET firma los tokens de sesión: si queda el valor por defecto (que
    está en el repositorio, a la vista de cualquiera), alguien podría fabricar
    un token de administradora válido. Es la diferencia entre un proyecto de
    plantilla y uno listo para atender a una clínica real.
    """
    problemas = []
    if settings.auth_secret == _SECRETO_POR_DEFECTO:
        problemas.append("AUTH_SECRET tiene el valor de ejemplo del repositorio")
    if settings.auth_password == _PASSWORD_POR_DEFECTO:
        problemas.append("AUTH_PASSWORD tiene la contraseña de ejemplo")
    if not problemas:
        return

    for p in problemas:
        logger.critical("SEGURIDAD: %s. Cámbialo en las variables de entorno.", p)
    logger.critical(
        "SEGURIDAD: con estos valores por defecto cualquiera que vea el código "
        "puede entrar como administradora. No uses esta configuración con datos reales."
    )


@app.on_event("startup")
async def startup():
    # El esquema lo gestiona Alembic (ver prestart.py / Procfile). No usamos
    # create_all para evitar que la BD quede sin control de migraciones.
    _avisar_secretos_por_defecto()
    _seed_admin()

    from routers.citas import poll_sse_events
    import asyncio
    asyncio.create_task(poll_sse_events())



def _seed_admin():
    """Siembra los usuarios iniciales si la tabla está vacía:
    - la administradora (recepcionista), que gestiona todo salvo lo clínico;
    - un doctor de arranque, para poder llenar historias de inmediato.
    """
    db = SessionLocal()
    try:
        if db.query(models.Usuario).count() == 0:
            db.add(models.Usuario(
                usuario=settings.auth_usuario,
                nombre="Recepción (Administradora)",
                password_hash=hash_password(settings.auth_password),
                rol="recepcionista",
                activo=True,
            ))
            db.add(models.Usuario(
                usuario="doctor",
                nombre="Dr. Veterinario",
                password_hash=hash_password(settings.auth_password),
                rol="veterinario",
                activo=True,
            ))
            db.commit()
            logger.info(
                "Usuarios iniciales creados: '%s' (recepcionista) y 'doctor' (veterinario). "
                "Cambia ambas contraseñas antes de usar el sistema con datos reales.",
                settings.auth_usuario,
            )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Schemas de entrada/salida
# ---------------------------------------------------------------------------

class TranscribeResponse(BaseModel):
    transcripcion: str


class ProcessHistoriaRequest(BaseModel):
    texto: str


class ProcessHistoriaResponse(BaseModel):
    datos:         dict
    inferencias:   dict
    alertas_rango: dict = {}
    transcripcion: str


class ProcesarRecetaRequest(BaseModel):
    texto: str


class ProcesarRecetaResponse(BaseModel):
    diagnostico:   str | None = None
    indicaciones:  str | None = None
    items:         list[dict] = []
    transcripcion: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    """Healthcheck que Railway usa para decidir si promueve un deploy.

    Verifica de verdad la conexión a la base de datos: antes respondía "ok"
    aunque la BD estuviera caída o mal configurada, así que un deploy roto
    igual entraba a producción. Si la BD no responde, devuelve 503 y Railway
    mantiene la versión anterior (que sí funciona).
    """
    from sqlalchemy import text
    try:
        with engine.connect() as cx:
            cx.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("Healthcheck: la base de datos no responde: %s", e)
        return JSONResponse(
            status_code=503,
            content={
                "status": "degradado",
                "message": "La base de datos no responde.",
                "build": _BUILD,
            },
        )
    return {
        "status": "ok",
        "message": "Veterinaria Los Pinos API funcionando",
        "build": _BUILD,
    }


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe_endpoint(request: Request, audio: UploadFile = File(...)):
    """
    Recibe un archivo de audio (wav, mp3, m4a, webm…) y devuelve la
    transcripción en texto plano usando Deepgram Nova-3.
    """
    clave = _clave_cliente(request)
    if not ratelimit.permitido(f"ia_{clave}", maximo=15, ventana=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones de IA. Espera unos minutos.",
        )
    ratelimit.registrar_fallo(f"ia_{clave}")

    allowed = {".wav", ".mp3", ".mp4", ".m4a", ".webm", ".ogg", ".flac"}
    import os
    ext = os.path.splitext(audio.filename or "")[-1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Formato de audio no soportado: '{ext}'. "
                   f"Usa uno de: {', '.join(allowed)}",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío.")

    # Tope de tamaño: evita que un audio enorme agote la memoria del proceso.
    # Con opus a ~32 kbps (lo que graba el frontend), 25 MB dan para ~108 min,
    # con margen sobre el tope de 90 min del grabador: una consulta larga nunca
    # debería rebotar aquí.
    MAX_AUDIO_MB = 25
    if len(audio_bytes) > MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"El audio pesa {len(audio_bytes) / 1024 / 1024:.1f} MB y supera el "
                   f"límite de {MAX_AUDIO_MB} MB. Graba la consulta en tramos más cortos.",
        )

    # El vocabulario de refuerzo se arma con los medicamentos y razas de esta
    # clínica, así que hace falta una sesión. Se abre y cierra acá porque la
    # transcripción corre en otro hilo y puede tardar minutos: sostener una
    # conexión del pool todo ese rato sería desperdiciarla.
    db_vocab = SessionLocal()
    try:
        import asyncio
        texto = await asyncio.to_thread(
            transcribe_audio, audio_bytes,
            filename=audio.filename or "audio.wav", db=db_vocab,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")
    finally:
        db_vocab.close()

    return TranscribeResponse(transcripcion=texto)



@app.post("/api/procesar-historia", response_model=ProcessHistoriaResponse)
def procesar_historia_endpoint(body: ProcessHistoriaRequest, request: Request):
    """
    Recibe la transcripción de una consulta veterinaria y devuelve los campos
    de la historia clínica estructurados por GPT-4o-mini.

    Respuesta: { "datos": { ...campos clínicos... }, "transcripcion": "..." }
    """
    clave = _clave_cliente(request)
    if not ratelimit.permitido(f"ia_{clave}", maximo=15, ventana=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones de IA. Espera unos minutos.",
        )
    ratelimit.registrar_fallo(f"ia_{clave}")

    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El campo 'texto' no puede estar vacío.")

    # El catálogo de medicamentos de la clínica va al prompt: permite
    # reconocer una marca mal transcrita en vez de copiarla rota.
    db_cat = SessionLocal()
    try:
        resultado = extraer_historia(body.texto, db=db_cat)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en extracción IA: {str(e)}")
    finally:
        db_cat.close()

    return resultado


@app.post("/api/procesar-receta", response_model=ProcesarRecetaResponse)
def procesar_receta_endpoint(body: ProcesarRecetaRequest, request: Request):
    """
    Recibe la transcripción de una receta dictada por el veterinario y
    devuelve diagnóstico, indicaciones y la lista de medicamentos
    estructurados por IA (mismo pipeline que /api/procesar-historia, mismo
    cupo compartido de 15 peticiones de IA / 5 min por IP).
    """
    clave = _clave_cliente(request)
    if not ratelimit.permitido(f"ia_{clave}", maximo=15, ventana=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones de IA. Espera unos minutos.",
        )
    ratelimit.registrar_fallo(f"ia_{clave}")

    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El campo 'texto' no puede estar vacío.")

    db_cat = SessionLocal()
    try:
        resultado = extraer_receta(body.texto, db=db_cat)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en extracción IA: {str(e)}")
    finally:
        db_cat.close()

    return resultado


# Campos clínicos que cuentan como "completados" en la comparativa
_CAMPOS_COMPARABLES = [
    "motivo_consulta", "tiempo_evolucion", "antecedentes", "tipo_consulta",
    "temperatura_c", "peso_kg", "frecuencia_cardiaca", "frecuencia_respiratoria",
    "mucosas", "hidratacion", "diagnostico_presuntivo", "diagnosticos_diferenciales",
    "examenes_solicitados", "indicaciones", "pronostico",
]


def _contar_completados(datos: dict) -> int:
    n = 0
    for k in _CAMPOS_COMPARABLES:
        v = datos.get(k)
        if v not in (None, "", [], {}):
            n += 1
    # Tratamiento y vacunas como bloques
    if datos.get("tratamiento_items"):
        n += 1
    if datos.get("vacunas_items"):
        n += 1
    return n


def _soap_a_campos(soap: dict) -> dict:
    """Aplana el SOAP léxico a un dict de campos comparables (presencia/ausencia)."""
    subj = soap.get("subjetivo", {})
    obj  = soap.get("objetivo", {})
    ana  = soap.get("analisis", {})
    plan = soap.get("plan", {})
    return {
        "motivo_consulta":        " ".join(subj.get("sintomas_reportados", [])) or None,
        "antecedentes":           " ".join(subj.get("historia", [])) or None,
        "temperatura_c":          (obj.get("signos_vitales") or [None])[0],
        "diagnostico_presuntivo": " ".join(ana.get("diagnostico_presuntivo", [])) or None,
        "diagnosticos_diferenciales": " ".join(ana.get("diagnostico_diferencial", [])) or None,
        "tratamiento_items":      plan.get("farmacos") or None,
        "examenes_solicitados":   " ".join(plan.get("procedimientos", [])) or None,
        "indicaciones":           " ".join(plan.get("seguimiento", [])) or None,
    }


class ComparativaRequest(BaseModel):
    texto: str


# ── Exactitud vs. referencia (gold-standard) ─────────────────────────────────
import unicodedata

# Campos evaluables y su tipo de comparación
_ACC_NUM    = {"temperatura_c", "peso_kg", "frecuencia_cardiaca", "frecuencia_respiratoria", "condicion_corporal"}
_ACC_CERRADO = {"tipo_consulta", "mucosas", "tllc", "estado_sensorio", "hidratacion", "pulso", "pronostico"}
_ACC_FIELDS = [
    "motivo_consulta", "tiempo_evolucion", "antecedentes", "tipo_consulta",
    "temperatura_c", "peso_kg", "frecuencia_cardiaca", "frecuencia_respiratoria",
    "mucosas", "hidratacion", "diagnostico_presuntivo", "diagnosticos_diferenciales",
    "examenes_solicitados", "indicaciones", "pronostico",
]


def _norm(s) -> str:
    s = str(s).strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return s


def _vacio(v) -> bool:
    return v in (None, "", [], {}) or (isinstance(v, str) and not v.strip())


def _coincide(campo: str, ref, ia) -> bool:
    if campo in _ACC_NUM:
        try:
            return abs(float(ref) - float(ia)) < 0.15
        except (TypeError, ValueError):
            return False
    if campo in _ACC_CERRADO:
        return _norm(ref) == _norm(ia)
    # Texto libre: solapamiento de palabras (Jaccard) o inclusión
    a, b = _norm(ref), _norm(ia)
    if a == b:
        return True
    if a in b or b in a:
        return True
    ta = {w for w in a.split() if len(w) > 2}
    tb = {w for w in b.split() if len(w) > 2}
    if not ta or not tb:
        return False
    jac = len(ta & tb) / len(ta | tb)
    return jac >= 0.4


class ExactitudRequest(BaseModel):
    texto: str
    referencia: dict = {}


# Solo con los módulos de tesis encendidos; ver core/config.py
@app.post("/api/comparar-exactitud", include_in_schema=settings.modulos_tesis)
def comparar_exactitud(body: ExactitudRequest, request: Request):
    if not settings.modulos_tesis:
        raise HTTPException(status_code=404, detail="Not Found")
    """
    Compara la extracción de la IA contra una historia de referencia
    (gold-standard) y reporta precisión, recall y F1 por campo.
    Body: { "texto": "...", "referencia": { campo: valor, ... } }
    """
    clave = _clave_cliente(request)
    if not ratelimit.permitido(f"ia_{clave}", maximo=15, ventana=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones de IA. Espera unos minutos.",
        )
    ratelimit.registrar_fallo(f"ia_{clave}")

    texto = body.texto
    referencia = body.referencia or {}

    if not texto.strip():
        raise HTTPException(status_code=400, detail="El campo 'texto' no puede estar vacío.")

    try:
        ia = extraer_historia(texto)
        ia_datos = ia.get("datos", {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en extracción IA: {str(e)}")

    tp = fp = fn = 0
    detalle = []
    for campo in _ACC_FIELDS:
        ref = referencia.get(campo)
        val = ia_datos.get(campo)
        ref_ok, ia_ok = not _vacio(ref), not _vacio(val)

        if not ref_ok and not ia_ok:
            estado = "—"          # ambos vacíos: no cuenta
        elif ref_ok and ia_ok and _coincide(campo, ref, val):
            tp += 1; estado = "correcto"
        elif ref_ok and not ia_ok:
            fn += 1; estado = "omitido"          # la IA no lo extrajo
        elif not ref_ok and ia_ok:
            fp += 1; estado = "extra"            # la IA inventó/agregó
        else:
            fp += 1; fn += 1; estado = "incorrecto"  # valor distinto

        detalle.append({
            "campo": campo, "referencia": ref, "ia": val, "estado": estado,
        })

    precision = round(tp / (tp + fp), 3) if (tp + fp) else None
    recall    = round(tp / (tp + fn), 3) if (tp + fn) else None
    f1 = round(2 * precision * recall / (precision + recall), 3) if precision and recall else None
    evaluables = sum(1 for d in detalle if d["estado"] != "—")
    exactitud = round(tp / evaluables * 100, 1) if evaluables else None

    return {
        "tp": tp, "fp": fp, "fn": fn,
        "precision": precision, "recall": recall, "f1": f1,
        "exactitud_pct": exactitud, "evaluables": evaluables,
        "detalle": detalle,
        "ia_datos": ia_datos,
    }


@app.post("/api/comparar-extraccion", include_in_schema=settings.modulos_tesis)
def comparar_extraccion(body: ComparativaRequest, request: Request):
    if not settings.modulos_tesis:
        raise HTTPException(status_code=404, detail="Not Found")
    """
    Compara el método LÉXICO (soap_processor) contra el método IA (GPT) sobre el
    mismo texto: campos completados y tiempo de procesamiento. Para evaluación de tesis.
    """
    clave = _clave_cliente(request)
    if not ratelimit.permitido(f"ia_{clave}", maximo=15, ventana=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones de IA. Espera unos minutos.",
        )
    ratelimit.registrar_fallo(f"ia_{clave}")

    import time as _time
    if not body.texto.strip():
        raise HTTPException(status_code=400, detail="El campo 'texto' no puede estar vacío.")

    # Método léxico
    t0 = _time.perf_counter()
    soap = process_soap(body.texto)
    soap_dict = soap.model_dump() if hasattr(soap, "model_dump") else dict(soap)
    lexico_campos = _soap_a_campos(soap_dict)
    t_lexico = round((_time.perf_counter() - t0) * 1000)

    # Método IA
    ia_error = None
    ia_datos = {}
    t_ia = None
    try:
        t0 = _time.perf_counter()
        ia = extraer_historia(body.texto)
        ia_datos = ia.get("datos", {})
        t_ia = round((_time.perf_counter() - t0) * 1000)
    except Exception as e:
        ia_error = str(e)

    total = len(_CAMPOS_COMPARABLES) + 2  # + tratamiento + vacunas
    return {
        "lexico": {
            "campos_completados": _contar_completados(lexico_campos),
            "total_campos": total,
            "tiempo_ms": t_lexico,
            "datos": lexico_campos,
        },
        "ia": {
            "campos_completados": _contar_completados(ia_datos) if not ia_error else 0,
            "total_campos": total,
            "tiempo_ms": t_ia,
            "datos": ia_datos,
            "error": ia_error,
        },
    }
