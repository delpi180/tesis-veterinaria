# 🏥 Veterinaria Los Pinos — Documento de traspaso (handoff)

> Estado del proyecto para continuar el desarrollo con otro agente/desarrollador.
> Última actualización: 2026-06-26.

---

## 1. Qué es

Sistema de gestión para una clínica veterinaria ("Veterinaria Los Pinos"). Es a la vez
**producto comercial** y **tesis** (la parte de tesis mide la asistencia por IA al
registrar historias clínicas: tiempo de registro y exactitud vs. referencia, encuestas SUS/TAM).

Funciona en producción con dos roles de usuario:
- **`veterinario`** — atiende, registra historias clínicas, ve su panel personal.
- **`recepcionista`** — es la **administradora** del sistema (clientes, caja, ventas, inventario, usuarios, reportes, asistencia). En el código, `esAdmin()` ≡ rol `recepcionista`.

Moneda: **soles peruanos (S/)**. Zona horaria: **Perú (UTC-5)**.

---

## 2. Stack y despliegue

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic v2 · PostgreSQL (driver **psycopg3**) |
| Frontend | React 19 · Vite · Tailwind v4 · react-router-dom 7 · lucide-react · recharts · jsPDF + jspdf-autotable |
| IA | **Deepgram** (Nova-3, speech-to-text) · **OpenAI** (gpt-4o-mini, extracción estructurada de la historia) |
| Auth | Token Bearer propio: PBKDF2-SHA256 + HMAC (no JWT de terceros) |

**Despliegue actual:**
- **Backend + PostgreSQL → Railway.** Root Directory = `backend`. Arranca con el `Procfile`:
  `web: python prestart.py && uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Frontend → Vercel.** Variable `VITE_API_URL` apunta al backend de Railway.
- El despliegue vigente es **Railway+Vercel** (se migró desde Render, ya eliminado). La config de Railway vive en `backend/railway.json` (healthcheck + auto-restart).
- Carpeta de trabajo local: **`C:\dev\tesis-veterinaria`** (se sacó de OneDrive porque rompía el dev server).

`prestart.py` reconcilia Alembic con la BD al arrancar: si la BD ya está gestionada por Alembic
hace `upgrade head`; si tiene tablas pero sin control de versión hace `create_all` idempotente + `stamp head`;
si está vacía, `upgrade head`. **Nunca borra datos** (no hay `drop_all`).

---

## 3. Cómo correr en local

### Backend
```bash
cd backend
venv/Scripts/python.exe -m pip install -r requirements.txt   # primera vez
venv/Scripts/python.exe -m alembic upgrade head              # migrar BD
venv/Scripts/python.exe -m uvicorn main:app --reload         # http://localhost:8000
```
Tests: `venv/Scripts/python.exe -m pytest tests -q` (hoy **58 passed, 4 skipped**).
Los tests corren contra la BD de `.env` y limpian sus propios datos.

### Frontend
```bash
cd frontend
npm install        # primera vez
npm run dev        # http://localhost:5173
npm run build      # verificación de build (usado como gate antes de cada push)
npm test           # vitest
```

### Variables de entorno (`backend/.env`, **NO** versionado)
| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Cadena de Postgres. Se normaliza a `postgresql+psycopg://` en `core/config.py`. |
| `DEEPGRAM_API_KEY` | Speech-to-text. |
| `OPENAI_API_KEY` | Extracción estructurada de la historia. |
| `AUTH_USUARIO`, `AUTH_PASSWORD`, `AUTH_SECRET`, `AUTH_TOKEN_HORAS` | Auth (sobrescribir en prod). |
| `CORS_ORIGINS` | `*` en dev; en prod el/los dominio(s) de Vercel (CSV). `*` es seguro porque la auth es por Bearer, no cookies. |
| `DEEPGRAM_MODEL`, `DEEPGRAM_LANGUAGE`, `LLM_MODEL` | Opcionales (defaults: nova-3 / multi / gpt-4o-mini). |

Frontend: `VITE_API_URL` (URL del backend).

---

## 4. Arquitectura del backend

`backend/main.py` registra el middleware de auth (valida el token Bearer y deja
`request.state.usuario` y `request.state.rol`) **antes** de CORS. Rutas públicas:
`RUTAS_PUBLICAS = {"/api/auth/login", "/api/health"}`. Todo lo demás exige token.

`core/deps.py`:
- `usuario_actual(request, db)` → devuelve el `Usuario` logueado (o None).
- `solo_admin(request)` → 403 si el rol no es `recepcionista`.

`core/`: `config.py` (settings), `deps.py` (auth/roles), `security.py` (hash + tokens),
`ratelimit.py` (anti fuerza bruta, persistido en BD vía `RateLimitHit`).

### Routers (`backend/routers/`)
| Router | Prefijo | Qué hace |
|--------|---------|----------|
| `auth` | `/api/auth` | Login, emisión de token. |
| `usuarios` | `/api/usuarios` | CRUD usuarios, `/doctores`, perfil laboral (hora_entrada, días). |
| `clientes` | `/api/clientes` | CRUD clientes (búsqueda `q`, paginación, `/contar`) + sub-recurso pacientes. |
| `pacientes` | `/api/pacientes` | Ficha, historias clínicas (CRUD), **documentos complementarios** (subir/listar/descargar/eliminar). |
| `citas` | `/api/citas` | Turnos/agenda. SSE para tiempo real (`ConnectionManager` + `SseEvent`). |
| `dashboard` | `/api/dashboard` | Resumen (Inicio/Recepción), cierre de caja, reportes, vacunas. |
| `mi_panel` | `/api/mi-panel` | Panel personal del veterinario (sus turnos, seguimientos, asistencia de hoy). |
| `asistencia` | `/api/asistencia` | Marcaciones de ingreso/salida + tardanzas + resumen. |
| `actividad` | `/api/actividad` | Bitácora de auditoría. |
| `productos` / `inventario` | `/api/productos`, `/api/inventario` | Catálogo, kardex, e **ingreso de mercadería por voz/texto (IA)**. |
| `servicios` | `/api/servicios` | Servicios (precio fijo o variable). |
| `ventas` | `/api/ventas` | POS: productos + servicios, **descuento porcentual**, boleta. |
| `busqueda` | `/api/busqueda` | Búsqueda global. |
| `evaluadores`/`sus`/`tam`/`encuestas` | — | **Tesis**: encuestas de usabilidad SUS/TAM. |

Endpoints IA (en `main.py`): `/api/transcribe` (audio→texto, Deepgram, **tope 25 MB**),
`/api/procesar-historia` (texto→campos de la historia, OpenAI). Rate-limit IA: 15/5min.

### Servicios IA (`backend/services/`)
`transcription.py` (Deepgram + vocabulario veterinario `KEYTERMS_VET`, timeout 300s),
`historia_extractor.py` / `soap_processor.py` (extracción estructurada de la historia),
`inventario_extractor.py`, `servicio_extractor.py`, `estadistica.py` (métricas de tesis).

---

## 5. Modelo de datos (`backend/models.py`)

Tablas: `Usuario`, `Cliente`, `Paciente`, **`DocumentoPaciente`**, `HistoriaClinica`, `Cita`,
`Actividad`, `Asistencia`, `Evaluador`, `RespuestaSUS`, `RespuestaTAM`, `Producto`, `Servicio`,
`Venta`, `VentaItem`, `MovimientoInventario`, `RateLimitHit`, `SseEvent`.

Notas:
- **`DocumentoPaciente`** guarda el archivo como **binario en Postgres** (`LargeBinary`) — durable en
  Railway sin depender del filesystem efímero ni cuentas externas. Cascade-delete con el paciente.
- `HistoriaClinica` tiene EOG (constantes), EOP (11 sistemas en `JSONB`), tratamiento/vacunas (`JSONB`),
  diagnóstico, plan, `proxima_cita` (que auto-genera un turno) y `veterinario_id` (autoría).
- `Venta` tiene `descuento_pct` (total = subtotal × (1 − pct/100)).
- `Asistencia` calcula `tardanza_min` con `models.calcular_tardanza_min()` (fuente única, también usada por el schema).

**Migraciones:** Alembic en `backend/alembic/versions/`. Head actual: **`73a02d5817d8`** (documentos del paciente).
Generar: `venv/Scripts/python.exe -m alembic revision --autogenerate -m "..."` → revisar → `upgrade head`.

---

## 6. Frontend (`frontend/src/`)

Rutas en `App.jsx`. Guards: `<SoloVet>` (solo veterinario), `<SoloAdmin>` (solo recepcionista),
`<Home>` (Inicio para admin; al veterinario lo manda a `/mi-panel`).

| Rol | Menú visible |
|-----|--------------|
| **Veterinario** | Mi panel · Clientes · Turnos · Mediciones |
| **Recepcionista** | Inicio · Recepción · Clientes · Turnos · **Administración** (Inventario, Servicios, Ventas, Caja, Vacunación, Reportes, Asistencia, Actividad, Usuarios) · Mediciones |

> El veterinario **no** tiene acceso (ni menú ni ruta) a nada de administración. El backend
> aún acepta esas llamadas si se hicieran con su token (no hay gating por rol en esos endpoints):
> pendiente opcional de "blindaje" del lado servidor.

Páginas (`pages/`): Login, Inicio, MiPanel, PanelRecepcion, Clientes, DetalleCliente,
HistoriasClinicas, HistorialPaciente, Turnos, Inventario, Servicios, Ventas, Caja, Vacunacion,
Reportes, Asistencia, Actividad, Usuarios, Mediciones.

Componentes (`components/`): `Sidebar`, `VoiceTextProcessor` (dictado→IA), `DocumentosPaciente`
(adjuntos de la mascota), `GlobalSearch`, `Toast`, `ErrorBoundary`, `SOAPPanel`, `AudioRecorder`.
Hook clave: `hooks/useAudioRecorder.js` (graba en **opus ~32 kbps** para archivos livianos).
Utilidades: `utils/exportUtils.js` (`exportarCSV` con BOM para Excel, `exportarPDF`), `utils/pdfGenerator.js`, `utils/citas.js`.

API client: `services/api.js` exporta `api.{get,post,put,del}`, `authHeaders()`,
`esAdmin()`, `esVeterinario()`, `getNombre()`, `getRol()`, `getToken()`, `cerrarSesion()`.

---

## 7. Flujos destacados ya implementados

- **Historia clínica asistida por IA**: dictado de voz (Deepgram) o texto → OpenAI estructura los
  campos → el vet revisa/edita (merge inteligente, no sobreescribe lo escrito) → guarda. **Editar y eliminar** consultas. PDF de la historia.
- **Plantillas de consulta** (Vacunación, Control sano, Desparasitación, Emergencia): rellenan campos vacíos sin pisar lo escrito.
- **Documentos complementarios por mascota** (radiografías, análisis, PDFs): subir/ver/descargar/eliminar; accesible para vet (en consultas) y recepcionista (en detalle de cliente).
- **Audio largo robusto**: opus 32 kbps, límite 40 min, tope 25 MB con 413, botón "Reintentar/Descargar" si falla la transcripción.
- **Ventas/POS** con descuento porcentual y boleta PDF. **Caja** (apertura/cierre). **Kardex** de inventario + ingreso de mercadería por voz.
- **Turnos** con SSE (tiempo real) y manejo correcto de zona horaria (frontend envía `toISOString()`).
- **Asistencia** del personal (el doctor marca su propio ingreso/salida; la recepcionista, la de cualquiera) + tardanzas.
- **Exportar a Excel/CSV** en Clientes, Ventas, Inventario, Reportes, Caja, Actividad, Vacunación.
- **Bitácora de actividad** (auditoría) y panel de **Recepción**.
- **Tesis**: métricas de tiempo de registro, exactitud vs. referencia, encuestas SUS/TAM, comparativa IA vs. léxico.

---

## 8. Convenciones y "gotchas" (importante para el próximo agente)

- **Verificación antes de cada push**: `npm run build` (frontend) + `pytest -q` (backend). El usuario
  pidió **NO usar Claude Preview** (gasta tokens): no se levanta el navegador para verificar.
- **Shell**: la herramienta Bash es **POSIX sh**, no PowerShell. Para mensajes de commit multilínea usar
  comillas dobles o heredoc `<< 'EOF'`, **nunca** `@'...'@` (eso es PowerShell y mete un `@` literal).
- **Commits**: terminan con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push solo a `main` (repo de un solo dev).
- **Secretos**: `.env` y la carpeta `migracion/` están en `.gitignore`. `migracion/` contiene CSVs con
  **PII de clientes** y `db_url.txt` (cadena de conexión de Railway con password) — **nunca** pegar esa cadena en el chat ni commitearla.
- **Datos en producción**: ~2495 clientes + ~3247 pacientes ya migrados desde el sistema anterior
  (`backend/scripts/importar_legacy.py`). Los DNI migrados no siempre tienen 8 dígitos: el validador de DNI
  vive solo en `ClienteCreate` (entrada), no en `ClienteOut`, para no romper el listado.
- **Roles**: strings exactos `"veterinario"` y `"recepcionista"`. `esAdmin()`/`solo_admin` ≡ recepcionista.
- **Moneda** siempre en soles (`S/`).

Scripts útiles: `backend/scripts/` (`importar_legacy.py`, `qa_integracion.py`, `backup_db.py`).

---

## 9. Pendientes / ideas (no implementadas)

De `mejoras_propuestas.md` y conversaciones recientes:
- **Mejoras del veterinario**: calculadora de dosis por peso (mg/kg), "Mi panel accionable"
  (atender desde el turno del día, vacunas por vencer de sus pacientes), firmar/bloquear consulta (solo lectura + addendum), autocompletar medicamentos, receta imprimible para el dueño, curva de peso con alerta.
- **Administración**: cuentas por cobrar / pagos parciales, citas recurrentes, sistema de alertas
  (stock bajo + caja sin abrir + citas próximas con badge), recordatorios de WhatsApp por lote.
- **Seguridad**: blindar por rol en el backend los endpoints de administración (hoy solo se ocultan en el frontend).
- **Documentos**: si la BD crece mucho por archivos, migrar a almacenamiento externo (Cloudinary/Supabase).

---

## 10. Otros documentos

- `README.md` — guía general del repo.
- `DOCUMENTACION.md` — documentación funcional más extensa.
- `AVANCES.html` — bitácora de avances (para la tesis).
