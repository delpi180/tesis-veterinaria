import logging
import re

from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("vetlospinos")

from database import SessionLocal
import models  # registra todos los modelos en Base.metadata
from routers import (
    auth, usuarios, clientes, pacientes, citas, dashboard,
    evaluadores, sus, tam, encuestas, productos, servicios, ventas,
    busqueda, inventario, asistencia, mi_panel, actividad,
)
from core import ratelimit
from core.config import settings
from core.security import verificar_token, hash_password
from services.transcription import transcribe_audio
from services.historia_extractor import extraer_historia
from services.soap_processor import process_soap  # léxico, para comparativa de tesis

app = FastAPI(title="Veterinaria Los Pinos API")

# Rutas accesibles sin token
RUTAS_PUBLICAS = {"/api/auth/login", "/api/health"}


def _clave_cliente(request: Request) -> str:
    """IP del cliente para el rate-limit (respeta el proxy de Railway/Vercel)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


def _es_ruta_clinica(path: str) -> bool:
    """Historias clínicas y pipeline IA: reservado al rol veterinario."""
    return (
        "/historias" in path
        or path in {"/api/procesar-historia", "/api/transcribe", "/api/process-soap"}
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
    ("POST", "/api/asistencia/ingreso"): "Marcó ingreso de asistencia",
    ("POST", "/api/asistencia/{id}/salida"): "Marcó salida de asistencia",
    ("DELETE", "/api/asistencia/{id}"): "Eliminó una marcación",
    ("POST", "/api/ventas"): "Registró una venta",
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
}


def _describir_accion(metodo: str, path: str) -> str:
    p = re.sub(r"/\d+", "/{id}", path).rstrip("/")
    return _ACCIONES.get((metodo, p), f"{metodo} {p}")


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
        print(f"[ACT] no se pudo registrar actividad: {e}")
    finally:
        if db is not None:
            db.close()


# Auth middleware: se registra ANTES que CORS para que CORS quede por fuera
# y las respuestas 401/403 lleguen al navegador con cabeceras CORS.
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if (
        path.startswith("/api/")
        and path not in RUTAS_PUBLICAS
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
        # Control de rol: la recepcionista puede LEER (GET) la historia clínica del
        # paciente (para ver su ficha completa), pero no crear/editar/eliminar
        # consultas ni usar el pipeline de IA — eso queda reservado al veterinario.
        lectura_historias = request.method == "GET" and "/historias" in path
        if (
            sesion["rol"] != "veterinario"
            and _es_ruta_clinica(path)
            and not lectura_historias
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


@app.on_event("startup")
async def startup():
    # El esquema lo gestiona Alembic (ver prestart.py / Procfile). No usamos
    # create_all para evitar que la BD quede sin control de migraciones.
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
            print(f"[SEED] Usuarios iniciales creados: admin '{settings.auth_usuario}' (recepcionista) y 'doctor' (veterinario).")
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Veterinaria Los Pinos API funcionando", "build": "redeploy-2026-06-27"}


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
    # Con opus a ~32 kbps, 25 MB equivalen a más de 1 h de grabación.
    MAX_AUDIO_MB = 25
    if len(audio_bytes) > MAX_AUDIO_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"El audio pesa {len(audio_bytes) / 1024 / 1024:.1f} MB y supera el "
                   f"límite de {MAX_AUDIO_MB} MB. Graba la consulta en tramos más cortos.",
        )

    try:
        import asyncio
        texto = await asyncio.to_thread(transcribe_audio, audio_bytes, filename=audio.filename or "audio.wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en transcripción: {str(e)}")

    return TranscribeResponse(transcripcion=texto)



@app.post("/api/procesar-historia", response_model=ProcessHistoriaResponse)
def procesar_historia_endpoint(body: ProcessHistoriaRequest, request: Request):
    """
    Recibe la transcripción de una consulta veterinaria y devuelve los campos
    de la historia clínica estructurados por GPT-4o-mini.

    Respuesta: { "datos": { ...campos clínicos... }, "transcripcion": "..." }

    NOTA: el frontend aún llama a /api/process-soap (nombre viejo).
    Actualizar la ruta en HistoriasClinicas.jsx en la fase de rediseño de frontend.
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

    try:
        resultado = extraer_historia(body.texto)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en extracción IA: {str(e)}")

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


@app.post("/api/comparar-exactitud")
def comparar_exactitud(body: ExactitudRequest, request: Request):
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


@app.post("/api/comparar-extraccion")
def comparar_extraccion(body: ComparativaRequest, request: Request):
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
