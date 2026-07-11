# Plan y evidencia de pruebas — Sistema Veterinaria Los Pinos

Documento preparado para la evaluación del docente. Cubre 5 de las 6 categorías de prueba solicitadas: **caja negra, integración, unitarias, disponibilidad y concurrencia**. La sexta categoría, **end-to-end con Selenium**, se entrega en una siguiente entrega (pendiente, ver sección final).

Sistema evaluado:
- **Frontend**: React + Vite, desplegado en **Vercel** — `https://tesis-veterinaria.vercel.app`
- **Backend**: FastAPI (Python), desplegado en **Railway** — `https://tesis-veterinaria-backend-production.up.railway.app`
- **Base de datos**: PostgreSQL (Railway)

Fecha de la corrida de evidencia registrada en este documento: **2026-07-11**.

---

## 1. Pruebas unitarias

**Herramienta**: `pytest` (backend), `vitest` (frontend).

**Ubicación**: [`backend/tests/`](../../backend/tests/) (8 archivos), [`frontend/src/utils/citas.test.js`](../../frontend/src/utils/citas.test.js).

**Qué cubren**: lógica pura sin dependencias externas — normalización y matching de nombres de productos ([`test_inventario.py`](../../backend/tests/test_inventario.py)), extracción de historias clínicas desde texto/voz ([`test_extractor.py`](../../backend/tests/test_extractor.py)), funciones estadísticas (t de Student, alpha de Cronbach — [`test_estadistica.py`](../../backend/tests/test_estadistica.py)), formato de estados y mensajes de citas en el frontend (`citas.test.js`).

**Cómo correrlas**:
```bash
cd backend && pytest -q -m "not prod"
cd frontend && npm run test -- --run
```

**Automatización**: ambas suites corren en **cada push/PR** vía [`ci.yml`](../../.github/workflows/ci.yml) (antes de este trabajo, el test de frontend no se ejecutaba en CI — se agregó el paso `npm run test -- --run`).

**Resultado**: suite backend con cobertura amplia de casos borde (acentos, plurales, nombres vacíos, rangos de fecha). Suite frontend cubre las funciones puras de presentación de citas. Todas pasan en CI.

---

## 2. Pruebas de integración (Vercel ↔ Railway)

**Herramienta**: `httpx` sobre `pytest`, apuntando directo a las URLs de producción.

**Ubicación**: [`backend/tests/test_integracion_prod.py`](../../backend/tests/test_integracion_prod.py) (marcadas `@pytest.mark.prod`, no corren en el CI normal — le pegan a producción real).

**Qué verifican**: que los módulos del backend real (Railway) están conectados entre sí (cliente → paciente → cita → doctor) y que el frontend real (Vercel) puede efectivamente comunicarse con ese backend (CORS).

**Resultado real de la corrida (2026-07-11, contra producción)**:

| Caso | Resultado |
|---|---|
| `test_health_publico_sin_token` | ✅ `GET /api/health` responde 200 sin autenticación |
| `test_cors_permite_origen_del_frontend_vercel` | ✅ el backend responde con `Access-Control-Allow-Origin` permitiendo `https://tesis-veterinaria.vercel.app` |
| `test_login_incorrecto_rechazado` | ✅ credenciales inválidas → 401 |
| `test_flujo_cliente_paciente_cita_conectado` | ✅ cliente creado (id real 2502) → paciente ligado correctamente → cita creada y asignada al doctor → todo verificado vía la propia API de Railway, y limpiado al final (`DELETE` de cliente, servicio y producto de prueba) |

**4/4 pasaron.** Nota: el primer intento falló porque `GET /api/clientes/` pagina a 300 resultados por defecto y el sistema ya tiene más de 2500 clientes reales — se corrigió filtrando por nombre (`?q=`), no era un bug del sistema sino del caso de prueba.

**Cómo correrlas** (requiere la contraseña real del admin, nunca commiteada — ver `backend/.env.pruebas-prod`, ignorado por git):
```bash
cd backend
set PROD_ADMIN_PASSWORD=xxxxx
pytest -m prod tests/test_integracion_prod.py -v
```

---

## 3. Pruebas de disponibilidad

**Herramienta**: `httpx` + medición de latencia sobre `pytest`.

**Ubicación**: [`backend/tests/test_disponibilidad.py`](../../backend/tests/test_disponibilidad.py) (marcadas `@pytest.mark.prod`).

**Qué verifican**: 10 pings consecutivos a `GET /api/health` (Railway) y a la raíz del frontend (Vercel), exigiendo 100% de respuestas 200 y latencia máxima razonable.

**Resultado real de la corrida (2026-07-11)**:

| Objetivo | Éxito | Latencia media | Latencia máxima |
|---|---|---|---|
| Backend `/api/health` (Railway) | 10/10 (100%) | 0.213 s | 0.409 s |
| Frontend raíz (Vercel) | 10/10 (100%) | 0.292 s | — |

**2/2 pasaron.** El sistema respondió consistentemente por debajo del umbral de 3 s en ambos extremos.

**Cómo correrlas** (no requiere credenciales):
```bash
cd backend
pytest -m prod tests/test_disponibilidad.py -v -s
```

---

## 4. Pruebas de concurrencia

**Herramienta**: `concurrent.futures.ThreadPoolExecutor` + `httpx` sobre `pytest`.

**Ubicación**: [`backend/tests/test_concurrencia.py`](../../backend/tests/test_concurrencia.py) (marcadas `@pytest.mark.prod`).

**Escenario**: 30 tareas concurrentes contra el backend real en Railway, mezclando al azar dos acciones: `POST /api/auth/login` y `GET /api/citas/` (autenticado). Solo lecturas y logins — no crea ni modifica datos, segura de repetir contra producción.

**Resultado real de la corrida (2026-07-11)**:

| Métrica | Valor |
|---|---|
| Peticiones exitosas | 30/30 (100%) |
| Errores 5xx | 0 |
| `login`: peticiones / latencia media / máxima | 16 / 3.506 s / 4.560 s |
| `listar_citas`: peticiones / latencia media / máxima | 14 / 3.049 s / 4.520 s |

**1/1 pasó** (tasa de éxito exigida ≥95%, se logró 100%). **Hallazgo a documentar en la tesis**: la latencia bajo concurrencia (~3-4.5 s) es notablemente mayor que en condiciones normales (~0.2 s en la prueba de disponibilidad); esto es consistente con el plan gratuito de Railway, que limita recursos concurrentes, y con que `GET /api/citas/` no pagina (devuelve la tabla completa, que ya tiene miles de registros). Es una oportunidad de mejora a mencionar en el informe, no un fallo funcional.

**Cómo correrlas**:
```bash
cd backend
set PROD_ADMIN_PASSWORD=xxxxx
pytest -m prod tests/test_concurrencia.py -v -s
```

---

## 5. Pruebas de caja negra

**Formato**: documento con tabla de casos (entrada / resultado esperado / resultado obtenido / estado).

**Ubicación**: [`docs/pruebas/casos_caja_negra.md`](casos_caja_negra.md) — 25 casos cubriendo autenticación y roles, clientes/pacientes, citas, ventas y caja, inventario con IA (incluye el caso documentado del bug de duplicados ya corregido), asistencia, historias clínicas, encuestas y búsqueda global, más el caso de integración CORS.

**Resultado**: 25/25 casos pasan, con evidencia de ejecución real (contra producción) o referencia a la prueba automatizada correspondiente.

---

## 6. Pendiente: End-to-end con Selenium

Por decisión explícita, esta categoría se deja para una entrega posterior. Se hará con **Selenium** en Python, contra el frontend real en Vercel (`https://tesis-veterinaria.vercel.app`), cubriendo como mínimo: carga de la pantalla de login, login exitoso y fallido, navegación al módulo de Inventario, y verificación en vivo (vía interfaz, no API) de que la "Entrada por voz/texto" reconoce productos existentes en vez de duplicarlos.

---

## Cómo se corre todo junto

- **En cada push/PR** (automático, GitHub Actions, [`ci.yml`](../../.github/workflows/ci.yml)): unitarias + integración local del backend (contra Postgres de prueba) + build y tests del frontend. No toca producción.
- **Bajo demanda** (manual, GitHub Actions, [`pruebas-prod.yml`](../../.github/workflows/pruebas-prod.yml), botón "Run workflow"): integración, disponibilidad y concurrencia contra Railway/Vercel real. Requiere el secret de repositorio `PROD_ADMIN_PASSWORD` (Settings → Secrets and variables → Actions).
- **Localmente**: ver el bloque "Cómo correrlas" de cada sección arriba.

## Seguridad

Ninguna contraseña real está commiteada en el repositorio. Las pruebas contra producción leen `PROD_ADMIN_PASSWORD` de una variable de entorno (o de `backend/.env.pruebas-prod`, que está en `.gitignore`) y se saltan automáticamente si no está presente.
