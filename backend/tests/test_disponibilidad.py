"""
Pruebas de disponibilidad (uptime / tiempos de respuesta) contra el sistema
real desplegado: backend en Railway y frontend en Vercel.

Marcadas @pytest.mark.prod, no corren en el job normal de CI. No requieren
credenciales (solo pegan a endpoints públicos), pero sí se saltan si no hay
conexión a internet o si las URLs no responden.

Uso local:
    cd backend
    python -m pytest -m prod tests/test_disponibilidad.py -v -s
"""
import os
import statistics
import time

import httpx
import pytest

PROD_BACKEND_URL = os.environ.get(
    "PROD_BACKEND_URL", "https://tesis-veterinaria-backend-production.up.railway.app"
)
PROD_FRONTEND_URL = os.environ.get("PROD_FRONTEND_URL", "https://tesis-veterinaria.vercel.app")

INTENTOS = int(os.environ.get("DISPONIBILIDAD_INTENTOS", "10"))
LATENCIA_MAX_SEG = float(os.environ.get("DISPONIBILIDAD_LATENCIA_MAX", "3.0"))

pytestmark = pytest.mark.prod


def _medir(url: str, intentos: int) -> dict:
    latencias, exitos, errores = [], 0, []
    with httpx.Client(timeout=10) as c:
        for i in range(intentos):
            inicio = time.perf_counter()
            try:
                r = c.get(url)
                latencia = time.perf_counter() - inicio
                latencias.append(latencia)
                if r.status_code == 200:
                    exitos += 1
                else:
                    errores.append(f"intento {i+1}: HTTP {r.status_code}")
            except httpx.HTTPError as e:
                latencias.append(time.perf_counter() - inicio)
                errores.append(f"intento {i+1}: {type(e).__name__} {e}")
    return {
        "exitos": exitos,
        "total": intentos,
        "tasa_exito": exitos / intentos,
        "latencia_media": statistics.mean(latencias) if latencias else None,
        "latencia_maxima": max(latencias) if latencias else None,
        "errores": errores,
    }


def test_disponibilidad_backend_health(capsys):
    """GET /api/health en Railway debe responder 200 de forma consistente y rápida."""
    resultado = _medir(f"{PROD_BACKEND_URL}/api/health", INTENTOS)
    with capsys.disabled():
        print(
            f"\n[disponibilidad backend] {resultado['exitos']}/{resultado['total']} OK "
            f"({resultado['tasa_exito']*100:.0f}%) · "
            f"latencia media {resultado['latencia_media']:.3f}s · "
            f"máxima {resultado['latencia_maxima']:.3f}s"
        )
        if resultado["errores"]:
            print("  errores:", resultado["errores"])

    assert resultado["tasa_exito"] == 1.0, f"disponibilidad backend < 100%: {resultado}"
    assert resultado["latencia_maxima"] <= LATENCIA_MAX_SEG, (
        f"latencia máxima {resultado['latencia_maxima']:.3f}s superó el umbral de {LATENCIA_MAX_SEG}s "
        "(puede deberse a cold-start del plan gratuito de Railway)"
    )


def test_disponibilidad_frontend_vercel(capsys):
    """La raíz del frontend en Vercel debe responder 200 (SPA servida correctamente)."""
    resultado = _medir(PROD_FRONTEND_URL, INTENTOS)
    with capsys.disabled():
        print(
            f"\n[disponibilidad frontend] {resultado['exitos']}/{resultado['total']} OK "
            f"({resultado['tasa_exito']*100:.0f}%) · "
            f"latencia media {resultado['latencia_media']:.3f}s"
        )
        if resultado["errores"]:
            print("  errores:", resultado["errores"])

    assert resultado["tasa_exito"] == 1.0, f"disponibilidad frontend < 100%: {resultado}"
