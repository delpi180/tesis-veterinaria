"""
Prueba de concurrencia contra el backend real en Railway: dispara varias
peticiones simultáneas mezclando login y listado de citas, para verificar
que el sistema responde de forma estable bajo carga concurrente.

Solo hace lecturas y logins (no crea ni modifica datos), así que es segura
de correr repetidas veces contra producción.

Marcada @pytest.mark.prod, no corre en el job normal de CI. Se salta si no
está seteada PROD_ADMIN_PASSWORD.

Uso local:
    cd backend
    set PROD_ADMIN_PASSWORD=xxxxx
    python -m pytest -m prod tests/test_concurrencia.py -v -s
"""
import os
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
import pytest
from dotenv import load_dotenv

# PROD_ADMIN_PASSWORD vive en un .env aparte (nunca en el .env normal ni en el repo,
# para no chocar con el Settings estricto de pydantic ni exponer la clave real).
load_dotenv(".env.pruebas-prod")

PROD_BACKEND_URL = os.environ.get(
    "PROD_BACKEND_URL", "https://tesis-veterinaria-backend-production.up.railway.app"
)
PROD_ADMIN_USER = os.environ.get("PROD_ADMIN_USER", "admin")
PROD_ADMIN_PASSWORD = os.environ.get("PROD_ADMIN_PASSWORD")

N_TAREAS = int(os.environ.get("CONCURRENCIA_TAREAS", "30"))
TASA_EXITO_MINIMA = float(os.environ.get("CONCURRENCIA_TASA_EXITO_MIN", "0.95"))

pytestmark = pytest.mark.prod

if not PROD_ADMIN_PASSWORD:
    pytest.skip(
        "PROD_ADMIN_PASSWORD no está seteada: se salta la prueba de concurrencia contra producción.",
        allow_module_level=True,
    )


def _login() -> tuple[str, int, float]:
    inicio = time.perf_counter()
    with httpx.Client(base_url=PROD_BACKEND_URL, timeout=15) as c:
        r = c.post(
            "/api/auth/login", json={"usuario": PROD_ADMIN_USER, "password": PROD_ADMIN_PASSWORD}
        )
    return "login", r.status_code, time.perf_counter() - inicio


def _listar_citas(token: str) -> tuple[str, int, float]:
    inicio = time.perf_counter()
    with httpx.Client(base_url=PROD_BACKEND_URL, timeout=15) as c:
        r = c.get("/api/citas/", headers={"Authorization": f"Bearer {token}"})
    return "listar_citas", r.status_code, time.perf_counter() - inicio


def _tarea(token: str) -> tuple[str, int, float]:
    accion = random.choice(["login", "listar_citas"])
    if accion == "login":
        return _login()
    return _listar_citas(token)


def test_concurrencia_login_y_listar_citas(capsys):
    # Un token válido de antemano para las tareas de "listar_citas"
    with httpx.Client(base_url=PROD_BACKEND_URL, timeout=15) as c:
        r = c.post(
            "/api/auth/login", json={"usuario": PROD_ADMIN_USER, "password": PROD_ADMIN_PASSWORD}
        )
        assert r.status_code == 200, "no se pudo obtener token base para la prueba de concurrencia"
        token = r.json()["token"]

    resultados = []
    with ThreadPoolExecutor(max_workers=N_TAREAS) as pool:
        futuros = [pool.submit(_tarea, token) for _ in range(N_TAREAS)]
        for f in as_completed(futuros):
            resultados.append(f.result())

    exitosos = [r for r in resultados if r[1] == 200]
    errores_5xx = [r for r in resultados if r[1] >= 500]
    tasa_exito = len(exitosos) / len(resultados)

    por_accion: dict[str, list[float]] = {}
    for accion, _status, latencia in resultados:
        por_accion.setdefault(accion, []).append(latencia)

    with capsys.disabled():
        print(f"\n[concurrencia] {len(exitosos)}/{len(resultados)} exitosas ({tasa_exito*100:.0f}%)")
        for accion, latencias in por_accion.items():
            print(
                f"  {accion}: {len(latencias)} peticiones · "
                f"latencia media {statistics.mean(latencias):.3f}s · "
                f"máxima {max(latencias):.3f}s"
            )
        if errores_5xx:
            print("  errores 5xx:", errores_5xx)

    assert not errores_5xx, f"hubo errores 5xx bajo concurrencia: {errores_5xx}"
    assert tasa_exito >= TASA_EXITO_MINIMA, (
        f"tasa de éxito {tasa_exito*100:.0f}% por debajo del mínimo {TASA_EXITO_MINIMA*100:.0f}%"
    )
