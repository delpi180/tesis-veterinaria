# Veterinaria Los Pinos — Documentación del Proyecto

> Sistema de gestión clínica veterinaria con asistencia de IA para el llenado de historias clínicas.
> Doble propósito: **producto comercial** para una clínica + **proyecto de tesis** (medición de IA aplicada a documentación clínica).

---

## 1. Resumen y propósito

**Veterinaria Los Pinos** es una aplicación web (SPA + API REST) para administrar una clínica veterinaria. Cubre dos objetivos:

1. **Comercial:** gestión integral — clientes y mascotas, historias clínicas, agenda de turnos, inventario (kardex), servicios, ventas con métodos de pago, caja, usuarios, asistencia del personal y bitácora de auditoría.
2. **Tesis:** evaluar el impacto de la **IA en la documentación clínica**. El veterinario dicta la consulta por voz (o pega texto); el sistema transcribe y **extrae automáticamente** los campos estructurados de la historia. Se mide el beneficio con métricas estandarizadas (SUS, TAM), tiempo de registro y exactitud frente a una referencia.

---

## 2. Arquitectura general

```
┌──────────────────────────┐        HTTPS/JSON        ┌───────────────────────────┐
│   Frontend (SPA)         │  ───────────────────────▶│   Backend (API REST)      │
│   React + Vite + Tailwind│                          │   FastAPI (Python)        │
│   Vercel                 │◀───────────────────────  │   Render                  │
└──────────────────────────┘                          └─────────────┬─────────────┘
                                                                     │ SQLAlchemy 2.0
                                       ┌─────────────────────────────┼───────────────────────────┐
                                       │                             │                           │
                                ┌──────▼──────┐            ┌─────────▼────────┐        ┌──────────▼─────────┐
                                │ PostgreSQL  │            │  OpenAI API      │        │  Deepgram API      │
                                │ (Render)    │            │ (extracción SOAP)│        │ (voz → texto)      │
                                └─────────────┘            └──────────────────┘        └────────────────────┘
```

- **Patrón:** SPA desacoplada que consume una API REST. Estado de sesión en el cliente (localStorage).
- **Persistencia:** PostgreSQL (relacional) con campos **JSONB** para estructuras flexibles (examen particular, tratamientos, vacunas, datos de IA).
- **Migraciones:** Alembic, con un script `prestart.py` que reconcilia el esquema antes de arrancar en la nube.
- **IA:** dos servicios externos (Deepgram para transcripción, OpenAI para extracción estructurada) usados solo en el flujo de historia clínica.

---

## 3. Stack tecnológico

### Backend (`/backend`)
| Componente | Tecnología | Versión |
|---|---|---|
| Framework | FastAPI | 0.136 |
| Servidor ASGI | Uvicorn | 0.47 |
| ORM | SQLAlchemy | 2.0 |
| Migraciones | Alembic | 1.16 |
| Driver BD | psycopg (v3, binary) | 3.3 |
| Validación | Pydantic / pydantic-settings | 2.13 |
| Transcripción | deepgram-sdk (nova-3) | 7.3 |
| LLM | openai (structured outputs) | 2.41 |
| Tests | pytest + httpx | 9.0 / 0.28 |

> **Sin dependencias pesadas de estadística:** Cronbach's α, prueba t de Welch y Cohen's d están implementados a mano en Python puro (sin scipy/numpy).

### Frontend (`/frontend`)
- **React + Vite** (build) + **Tailwind CSS v4** (estilos).
- **recharts** (gráficos del dashboard), **jsPDF + jspdf-autotable** (PDFs de historias), **lucide-react** (iconos).
- Modo claro (el modo oscuro se retiró por consistencia visual).

### Seguridad / Auth
- Contraseñas: **PBKDF2-SHA256** (stdlib, 200k iteraciones, salt por usuario).
- Tokens de sesión: **HMAC-SHA256** firmados (sin librerías JWT externas), con expiración configurable.

### Infraestructura
- **Render:** backend (web service) + PostgreSQL gestionado. Despliegue declarado en `render.yaml`.
- **Vercel:** frontend estático.

---

## 4. Estructura de carpetas

```
tesis-veterinaria/
├── backend/
│   ├── main.py                 # App FastAPI, middleware de auth + bitácora, endpoints de IA/métricas
│   ├── database.py             # Engine SQLAlchemy + normalización de URL (psycopg)
│   ├── models.py               # Modelos ORM (todas las tablas)
│   ├── schemas.py              # Esquemas Pydantic (entrada/salida)
│   ├── prestart.py             # Reconcilia Alembic con la BD antes de arrancar (Render)
│   ├── requirements.txt
│   ├── core/
│   │   ├── config.py           # Settings (.env): claves de IA, auth, BD
│   │   ├── security.py         # Hash de contraseñas + tokens HMAC
│   │   └── deps.py             # Dependencias: usuario_actual(), solo_admin()
│   ├── routers/                # Endpoints por dominio (ver sección 9)
│   ├── services/
│   │   ├── transcription.py    # Deepgram (voz → texto, vocabulario veterinario)
│   │   ├── historia_extractor.py  # OpenAI: texto → JSON estructurado (SOAP)
│   │   ├── soap_processor.py   # Extractor por reglas/léxico (comparativa de tesis)
│   │   ├── inventario_extractor.py # OpenAI: dictado → ítems de inventario
│   │   └── estadistica.py      # Descriptivos, IC 95%, Cronbach α, t de Welch, Cohen's d
│   ├── alembic/versions/       # Migraciones
│   └── tests/                  # pytest (46 pruebas)
├── frontend/
│   └── src/
│       ├── App.jsx             # Rutas + guards de rol (SoloVet / SoloAdmin)
│       ├── components/         # Sidebar, Toast, GlobalSearch, AudioRecorder…
│       ├── pages/              # Una página por vista (ver sección 10)
│       ├── services/api.js     # Cliente HTTP + manejo de sesión
│       └── utils/              # Helpers (citas, export, etc.)
└── render.yaml                 # Infra como código (Render)
```

---

## 5. Modelo de datos

### 5.1 Diagrama de relaciones (resumen)

```
Cliente 1───N Paciente 1───N HistoriaClinica N───1 Usuario(veterinario)
                  │
                  └───N Cita N───1 Usuario(veterinario)

Usuario 1───N Asistencia
Usuario 1───N Actividad (bitácora)

Cliente 1───N Venta 1───N VentaItem N───1 Producto / Servicio
Producto 1───N MovimientoInventario (kardex)

Evaluador 1───N RespuestaSUS
Evaluador 1───N RespuestaTAM
```

### 5.2 Entidades

#### `Usuario` — personal del sistema
| Campo | Tipo | Notas |
|---|---|---|
| id | int (PK) | |
| usuario | str(50) único | login |
| nombre | str(100) | |
| password_hash | str(255) | PBKDF2 |
| rol | str(20) | `veterinario` \| `recepcionista` |
| activo | bool | |
| hora_entrada | str(5) | "HH:MM" — horario laboral del doctor |
| dias_laborales | str(40) | CSV "lun,mar,…" |
| creado_en | datetime tz | |

> **Modelo de roles:** `recepcionista` = **administradora** (gestiona todo salvo lo clínico). `veterinario` = **doctor** (atiende y firma historias).

#### `Cliente` — propietario
`id`, `dni` (8 dígitos, validado), `nombre`, `telefono`, `direccion`. → relación 1:N con `Paciente`.

#### `Paciente` — mascota
`id`, `nombre`, `especie`, `raza`, `edad`, `cliente_id` (FK). Ficha ampliada: `sexo`, `esterilizado`, `fecha_nacimiento`, `microchip`, `color`, `alergias`, `condiciones_cronicas`, `foto_url` (Base64).

#### `HistoriaClinica` — consulta clínica (entidad central)
Organizada por bloques del examen clínico veterinario:
- **Anamnesis:** `motivo_consulta`, `tiempo_evolucion`, `derivado_por`, `detalle`, `alimentacion_tipo`, `alimentacion_cantidad_gr`, `antecedentes`, `tipo_consulta`.
- **Examen Objetivo General (EOG):** `temperatura_c`, `peso_kg`, `frecuencia_cardiaca`, `frecuencia_respiratoria`, `condicion_corporal` (1–9), `mucosas`, `tllc`, `estado_sensorio`, `hidratacion`, `pulso`, `linfonodulos`.
- **Examen Objetivo Particular (EOP):** `examen_particular` (**JSONB**, 11 sistemas).
- **Diagnóstico:** `diagnostico_presuntivo`, `diagnosticos_diferenciales`, `diagnostico_definitivo`.
- **Plan:** `examenes_solicitados`, `tratamiento_items` (JSONB), `vacunas_items` (JSONB), `indicaciones`, `pronostico`, `proxima_cita`.
- **IA / auditoría:** `transcripcion`, `datos_ia` (JSONB).
- **Métricas de tesis:** `segundos_registro`, `metodo_registro` (`manual` \| `ia`).
- **Autoría:** `veterinario_id` (FK) + `creado_en` → **qué doctor la llenó y cuándo** (firma).

#### `Cita` — turno de agenda
`id`, `paciente_id`, `fecha_hora`, `motivo`, `estado` (`pendiente`/`confirmada`/`atendida`/`cancelada`), `notas`, `veterinario_id` (FK, **doctor asignado**), `creado_en`.

#### `Asistencia` — marcaciones del personal
`id`, `usuario_id` (FK), `fecha`, `hora_ingreso`, `hora_salida` (null = en turno), `registrado_por`, `notas`. Propiedades calculadas: **horas trabajadas** y **tardanza** (vs `hora_entrada` del perfil).

#### `Actividad` — bitácora de auditoría
`id`, `usuario`, `rol`, `accion` (legible), `detalle` (a qué entidad), `metodo`, `ruta`, `estado` (HTTP), `fecha`. Se llena **automáticamente** desde el middleware en cada POST/PUT/DELETE exitoso.

#### Inventario y ventas
- `Producto`: `codigo` (SKU autogenerado MED-/COM-/…), `nombre`, `categoria`, `proveedor`, `unidad`, `precio`, `stock`, `stock_minimo`, `activo`. Calculados: `stock_bajo`, `valor_stock`.
- `Servicio`: `nombre`, `precio`, `precio_variable` (monto al momento de la venta).
- `Venta`: `cliente_id`, `fecha`, `total`, `metodo_pago` (`efectivo`/`tarjeta`/`yape`/`plin`). → `VentaItem` (producto **o** servicio, cantidad, precio_unitario).
- `MovimientoInventario` (**kardex**): `tipo` (entrada/salida/ajuste), `cantidad` (con signo), `stock_resultante`, `motivo`, `referencia`.

#### Tesis (encuestas)
- `Evaluador`: `nombre`, `rol`.
- `RespuestaSUS`: 10 ítems (escala 1–5) + `puntaje` (0–100).
- `RespuestaTAM`: 12 ítems (escala 1–7) + `util_percibida`, `facilidad_uso`, `intencion_uso`.

---

## 6. Roles y seguridad

### Autenticación
1. `POST /api/auth/login` valida credenciales (PBKDF2) y devuelve un **token HMAC** firmado: `base64(usuario|rol|exp).firma`.
2. El frontend lo guarda en `localStorage` y lo envía en `Authorization: Bearer <token>`.
3. **Middleware** en `main.py`:
   - Rutas públicas: `/api/auth/login`, `/api/health`.
   - Toda otra ruta `/api/*` exige token válido; si no → **401**.
   - **Control de rol:** la recepcionista no accede a rutas clínicas (historias, transcripción, IA) → **403**.
   - Inyecta `request.state.usuario` y `request.state.rol`.
   - Tras cada acción que modifica datos, registra en la **bitácora**.

### Autorización por rol
| Recurso | Veterinario (doctor) | Recepcionista (admin) |
|---|---|---|
| Historias clínicas (CRUD) | ✅ | ❌ (403) |
| "Mi panel" personal | ✅ | ❌ |
| Clientes / mascotas / turnos | ✅ (ver) | ✅ |
| Inventario / servicios / ventas / caja | ✅ | ✅ |
| Gestión de usuarios | ❌ (403) | ✅ |
| Asistencia (marcaciones) | ❌ | ✅ |
| Bitácora de actividad | ❌ | ✅ |

> Los doctores **ven todas** las historias y turnos (consulta), pero cada historia queda **firmada con su nombre y hora**.

---

## 7. Pipeline de IA (núcleo de la tesis)

```
   Voz (o texto pegado)
        │  POST /api/transcribe   (UploadFile)
        ▼
   Deepgram nova-3  ──► transcripción (keyterms: vocabulario veterinario)
        │  POST /api/procesar-historia { texto }
        ▼
   OpenAI structured outputs (JSON Schema strict)
        │  → campos SOAP estructurados + inferencias + validación de rangos fisiológicos
        ▼
   Formulario de historia autocompletado (el doctor revisa/corrige y guarda)
```

- **Transcripción** (`services/transcription.py`): Deepgram con *keyterm boosting* de términos veterinarios para mejorar la precisión.
- **Extracción** (`services/historia_extractor.py`): OpenAI con `response_format` de **JSON Schema estricto** → salida determinista y validable. Incluye validación de rangos fisiológicos (p. ej. temperatura, FC).
- **Comparativa (tesis)** (`services/soap_processor.py`): un extractor **por reglas/léxico** que sirve de línea base para comparar IA vs método tradicional.
- Endpoints `POST /api/comparar-exactitud` y `POST /api/comparar-extraccion` cuantifican la coincidencia campo a campo contra una referencia.

---

## 8. Métricas de tesis

Se miden en `routers/encuestas.py` + `services/estadistica.py`:

1. **SUS (System Usability Scale):** 10 ítems → puntaje 0–100 e interpretación cualitativa.
2. **TAM (Technology Acceptance Model):** 12 ítems → utilidad percibida, facilidad de uso, intención de uso.
3. **Tiempo de registro:** `segundos_registro` + `metodo_registro` por historia → compara **manual vs IA** y calcula el **% de ahorro**.
4. **Exactitud:** coincidencia de la extracción de IA vs referencia (campo a campo, con normalización de acentos y solapamiento de texto).

**Estadística (Python puro, sin scipy):**
- Descriptivos + **intervalo de confianza al 95%**.
- **Cronbach's α** (fiabilidad de las escalas).
- **Prueba t de Welch** (vía función beta incompleta regularizada — Numerical Recipes) + **Cohen's d** (tamaño del efecto) para comparar tiempos.

---

## 9. API REST (endpoints principales)

| Router | Prefijo | Endpoints clave |
|---|---|---|
| auth | `/api/auth` | `POST /login` |
| usuarios | `/api/usuarios` | `GET /doctores` (público logueado), CRUD (solo admin) |
| clientes | `/api/clientes` | CRUD + búsqueda |
| pacientes | `/api/pacientes` | CRUD mascota + **historias** (`/{id}/historias/`) |
| citas | `/api/citas` | CRUD turnos, filtro por `veterinario_id`/estado |
| dashboard | `/api/dashboard` | `/resumen` (centro de control), `/cierre-caja` |
| mi-panel | `/api/mi-panel` | panel personal del doctor (solo veterinario) |
| asistencia | `/api/asistencia` | `/ingreso`, `/{id}/salida`, `/resumen`, listado (solo admin) |
| actividad | `/api/actividad` | bitácora con filtros (solo admin) |
| productos | `/api/productos` | CRUD + `/ajuste-stock` + `/movimientos` (kardex) |
| servicios | `/api/servicios` | CRUD |
| ventas | `/api/ventas` | registrar venta (descuenta stock + kardex) |
| inventario | `/api/inventario` | `/interpretar`, `/interpretar-audio`, `/aplicar` (IA) |
| busqueda | `/api/busqueda` | búsqueda global |
| encuestas/sus/tam | `/api/...` | métricas de tesis |
| (main) | `/api` | `/health`, `/transcribe`, `/procesar-historia`, `/comparar-*` |

---

## 10. Frontend (páginas)

| Página | Ruta | Acceso |
|---|---|---|
| Login | `/login` | público |
| Inicio (dashboard) | `/` | todos |
| Mi panel | `/mi-panel` | doctor |
| Clientes / Detalle | `/clientes`, `/clientes/:id` | todos |
| Historias clínicas | `/consultas/:pacienteId` | doctor |
| Historial del paciente (PDF) | `/pacientes/:id/historial` | doctor |
| Turnos / Agenda | `/turnos` | todos |
| Inventario | `/inventario` | todos |
| Servicios | `/servicios` | todos |
| Ventas | `/ventas` | todos |
| Caja | `/caja` | todos |
| Asistencia | `/asistencia` | admin |
| Actividad (bitácora) | `/actividad` | admin |
| Usuarios | `/usuarios` | admin |
| Mediciones (tesis) | `/mediciones` | todos |

- **Auto-actualización:** Mi panel, Turnos, Asistencia y Actividad refrescan datos cada ~15–20 s + botón "Actualizar".
- **PDF:** historial completo y ficha de consulta individual con firma del doctor.

---

## 11. Despliegue

- **`render.yaml`** declara: base PostgreSQL + web service. `startCommand: python prestart.py && uvicorn …`.
- **`prestart.py`** reconcilia el estado de Alembic con la BD (maneja esquemas creados por `create_all` heredado) y aplica migraciones antes de arrancar.
- **`database.py`** normaliza la URL de Render (`postgres://` → `postgresql+psycopg://`).
- **Variables de entorno (Render):** `DATABASE_URL`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `AUTH_PASSWORD`, `AUTH_SECRET`.
- **Frontend (Vercel):** `VITE_API_URL` debe apuntar a la URL real del backend (`https://tesis-veterinaria-backend.onrender.com`).
- **Seed inicial:** al arrancar con BD vacía se crean `admin` (recepcionista) y `doctor` (veterinario).

---

## 12. Historias de usuario

> Formato: *Como [rol], quiero [acción] para [beneficio].*

### Recepcionista (Administradora)
- **HU-01** — Como recepcionista, quiero registrar clientes y sus mascotas para tener su información disponible en cada visita.
- **HU-02** — Como recepcionista, quiero agendar turnos y **asignarlos a un doctor** para organizar la atención del día.
- **HU-03** — Como recepcionista, quiero que el sistema me **avise si asigno un turno fuera del horario del doctor o a una hora ya ocupada** para evitar choques.
- **HU-04** — Como recepcionista, quiero **crear cuentas de doctores y asignar roles** para controlar el acceso.
- **HU-05** — Como recepcionista, quiero **configurar el horario laboral** (hora de ingreso y días) de cada doctor.
- **HU-06** — Como recepcionista, quiero **registrar el ingreso/salida** de los doctores y ver un **resumen de horas y tardanzas** para el control de personal.
- **HU-07** — Como recepcionista, quiero registrar ventas con distintos **métodos de pago** y que el **stock se descuente** automáticamente.
- **HU-08** — Como recepcionista, quiero hacer el **cierre de caja** del día desglosado por método de pago.
- **HU-09** — Como recepcionista, quiero gestionar el **inventario** (incluido el alta **por voz/texto**) y recibir alertas de stock bajo.
- **HU-10** — Como recepcionista, quiero una **bitácora** que muestre quién hizo qué y cuándo, con filtros y exportación, para auditar el sistema.
- **HU-11** — Como recepcionista, quiero un **panel de control** con los turnos del día, quién está en turno ahora, stock bajo y vacunas por vencer.

### Veterinario (Doctor)
- **HU-12** — Como doctor, quiero entrar con **mi propia cuenta** para que cada historia que registro quede **firmada con mi nombre y la hora**.
- **HU-13** — Como doctor, quiero **dictar la consulta por voz** y que la IA **autocomplete** la historia para registrar más rápido.
- **HU-14** — Como doctor, quiero **revisar y corregir** lo que la IA propuso antes de guardar para asegurar la calidad clínica.
- **HU-15** — Como doctor, quiero **"Mi panel"** con **solo mis** turnos, controles próximos, mis historias y mi asistencia del día.
- **HU-16** — Como doctor, quiero **"Atender" un turno en un clic** que abra la historia de esa mascota y la marque como atendida al guardar.
- **HU-17** — Como doctor, quiero **descargar la historia clínica en PDF** (completa o por consulta) con mi firma.
- **HU-18** — Como doctor, quiero **ver el historial** de cualquier paciente para dar continuidad al tratamiento.

### Investigador (Tesis)
- **HU-19** — Como investigador, quiero registrar evaluadores y sus respuestas **SUS y TAM** para medir usabilidad y aceptación.
- **HU-20** — Como investigador, quiero comparar el **tiempo de registro manual vs IA** y el **% de ahorro**.
- **HU-21** — Como investigador, quiero medir la **exactitud** de la extracción de IA frente a una referencia.
- **HU-22** — Como investigador, quiero los estadísticos (**IC 95%, Cronbach α, t de Welch, Cohen's d**) calculados por el sistema para sustentar resultados.

---

## 13. Decisiones de diseño y supuestos

- **Una sola cuenta administradora** (recepcionista); las demás cuentas son doctores, cada uno ve solo lo suyo en su panel.
- **JSONB** para estructuras clínicas variables (EOP, tratamientos, vacunas) evita tablas excesivamente normalizadas y facilita la salida de la IA.
- **Salida estructurada estricta** (JSON Schema) en OpenAI → resultados deterministas y validables, clave para medir exactitud.
- **Estadística sin scipy** → menos dependencias, despliegue más liviano y control total de las fórmulas (defendible en tesis).
- **Auditoría por middleware** → trazabilidad transversal sin tener que instrumentar cada endpoint.
- **La asistencia la registra la recepcionista** (no autoservicio) para mayor control del personal.
- **Auto-actualización por polling** (no WebSockets) → simplicidad; suficiente para una clínica pequeña.

---

## 14. Pruebas y calidad

- **46 pruebas automatizadas** (pytest) cubren: autenticación y roles, autoría de historias, asistencia (ingreso/salida, tardanzas, resumen), bitácora (registro y filtros), datos compartidos entre cuentas, ventas/kardex, cierre de caja, métricas de tiempo y exactitud, y lógica de inventario por IA.
- Verificación manual de los flujos de UI en el navegador (los servidores locales se levantan para QA).

---

*Documento generado para análisis y documentación del proyecto. Refleja el estado del código a la fecha de su creación.*
