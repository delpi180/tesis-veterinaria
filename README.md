# Implementación de un sistema automatizado para optimizar el seguimiento del historial clínico en el Centro médico veterinario los Pinos - 2026

Sistema integral web de gestión clínica veterinaria diseñado como proyecto de tesis. Cuenta con un módulo avanzado de asistencia por IA para la estructuración automática de historias clínicas en formato SOAP mediante transcripción de voz y procesamiento de lenguaje natural, además de módulos de evaluación académica (SUS, TAM y métricas de exactitud de IA).

---

## 🚀 Arquitectura y Tecnologías Utilizadas

La plataforma está diseñada con una arquitectura Cliente-Servidor moderna, separando completamente el frontend del backend y utilizando servicios en la nube para la inteligencia artificial.

### Frontend (SPA)
*   **Framework:** React 19 + Vite 8
*   **Estilos:** Tailwind CSS v4
*   **Iconos:** Lucide React
*   **Gráficos e Informes:** Recharts (Data Viz) y jsPDF (Exportación de Historias)
*   **Enrutamiento:** React Router DOM v7

### Backend (API REST)
*   **Framework:** FastAPI (Python 3.10+)
*   **ORM y Base de Datos:** SQLAlchemy 2.0 + Alembic (Migraciones) + PostgreSQL (psycopg 3)
*   **Autenticación:** JWT (JSON Web Tokens) con Pydantic Settings
*   **Testing:** Pytest

### Integraciones de Inteligencia Artificial (IA)
A diferencia de versiones anteriores, el sistema ahora utiliza servicios de IA especializados en la nube para maximizar la velocidad y precisión:
*   **Transcripción de Voz:** Deepgram SDK (Modelo `Nova-3`)
*   **Estructuración Clínica (NLP a SOAP):** OpenAI API (Modelo `GPT-4o-mini`)

---

## 📦 Módulos del Sistema

El proyecto abarca la gestión integral de la veterinaria y la validación de la tesis:

### Gestión Veterinaria
*   **Autenticación y Usuarios:** Roles de sistema (Veterinario, Recepcionista).
*   **Clientes y Pacientes:** Registro de propietarios y mascotas (especie, raza, edad, etc.).
*   **Historias Clínicas y SOAP IA:** Ingreso manual o por voz. La IA (Deepgram + GPT) transcribe la consulta y extrae automáticamente los signos vitales, diagnósticos y tratamientos.
*   **Citas (Turnos):** Agenda y calendario de atención.
*   **Inventario (Productos y Servicios):** Control de stock de medicamentos y catálogo de servicios.
*   **Ventas y Facturación:** Registro de transacciones.
*   **Dashboard:** KPIs, gráficos estadísticos y resumen general de la clínica.

### Módulos de Evaluación (Tesis)
*   **Comparativa de Exactitud IA vs Léxico:** Endpoints diseñados para comparar la extracción de datos de GPT-4o-mini contra un algoritmo léxico clásico y un *Gold Standard*, midiendo Precisión, Recall y F1-Score.
*   **Encuestas de Usabilidad:** Formularios y recolección de datos utilizando la Escala de Usabilidad del Sistema (SUS).
*   **Modelo de Aceptación Tecnológica (TAM):** Recolección de métricas sobre la percepción de utilidad y facilidad de uso por parte de los evaluadores.

---

## 📂 Estructura del Proyecto

```text
tesis-veterinaria/
├── backend/                  # API REST (FastAPI)
│   ├── main.py               # Punto de entrada de la aplicación
│   ├── models.py             # Definición de tablas (SQLAlchemy)
│   ├── schemas.py            # Esquemas de validación (Pydantic)
│   ├── database.py           # Conexión a la BD
│   ├── alembic/              # Migraciones de base de datos
│   ├── routers/              # Controladores (clientes, pacientes, citas, etc.)
│   ├── services/             # Lógica de negocio e integraciones
│   │   ├── transcription.py  # Integración Deepgram Nova-3
│   │   ├── historia_extractor.py # Integración OpenAI GPT-4o-mini
│   │   └── soap_processor.py # Procesador léxico comparativo
│   └── tests/                # Pruebas unitarias
│
├── frontend/                 # Interfaz de Usuario (React + Vite)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js        # Configuración de Vite (Proxy hacia el backend)
│   └── src/
│       ├── App.jsx           # Enrutador principal
│       ├── components/       # Componentes reutilizables de UI
│       ├── pages/            # Vistas principales de los módulos
│       ├── hooks/            # Custom Hooks de React
│       ├── services/         # Llamadas a la API (Fetch/Axios)
│       └── utils/            # Funciones auxiliares
│
└── backend/
    ├── Procfile              # Comando de arranque en Railway
    └── railway.json          # Healthcheck + auto-restart en Railway
```

---

## ⚙️ Instrucciones para levantar el proyecto en local

### 1. Variables de Entorno (Backend)
Dentro de la carpeta `backend/`, copia el archivo `.env.example` y renómbralo a `.env`. Configura las credenciales necesarias:
*   URL de conexión a la Base de Datos.
*   Tokens de JWT (Secret Key).
*   `DEEPGRAM_API_KEY`
*   `OPENAI_API_KEY`

### 2. Levantar el Backend (FastAPI)
Abre una terminal y ejecuta:

```bash
cd backend
python -m venv venv

# Activar entorno virtual
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt

# Ejecutar el servidor (Puerto 8000)
uvicorn main:app --reload
```
La documentación interactiva de la API estará en: **http://localhost:8000/docs**

### 3. Levantar el Frontend (React)
Abre una nueva terminal y ejecuta:

```bash
cd frontend
npm install

# Ejecutar el entorno de desarrollo (Puerto 5173)
npm run dev
```
La aplicación web estará disponible en: **http://localhost:5173**

*(Nota: Vite está configurado para hacer proxy de `/api` directamente al puerto 8000 del backend, por lo que no es necesario configurar CORS en entorno de desarrollo local).*

---

## 🔧 Operación y producción

### Migraciones (Alembic)
El esquema se evoluciona **siempre con migraciones** (nunca `create_all` en producción).
```bash
cd backend
python -m alembic revision --autogenerate -m "descripcion del cambio"   # generar
python -m alembic upgrade head                                          # aplicar
```

### Tests y CI
```bash
cd backend
python -m pytest -q
```
También corren automáticamente en **GitHub Actions** en cada push (`.github/workflows/ci.yml`).

### Respaldos (backups)
La base de datos es la fuente de verdad. **Respáldala periódicamente.**
```bash
# Crear respaldo
cd backend
venv/Scripts/python.exe scripts/backup_db.py        # -> backend/backups/backup_*.dump

# Restaurar respaldo (reemplaza el contenido de la BD destino)
pg_restore --clean --no-owner -d "<DATABASE_URL>" backend/backups/backup_XXXX.dump
```
Recomendado: programar el script (Programador de tareas / cron), guardar los `.dump`
en un lugar externo y, si el proveedor lo ofrece, activar backups automáticos / PITR.

### Variables de entorno (producción)
| Variable | Notas |
|---|---|
| `DATABASE_URL` | Postgres (con respaldos en producción) |
| `OPENAI_API_KEY`, `DEEPGRAM_API_KEY` | Claves de IA |
| `AUTH_PASSWORD` | **Cámbiala** (la de por defecto es pública) |
| `AUTH_SECRET` | Cadena larga aleatoria |
| `CORS_ORIGINS` | Dominio del frontend (Vercel) — CSV |
| `VITE_API_URL` (frontend) | URL real del backend |

### Checklist de despliegue
- [ ] `AUTH_PASSWORD` y `AUTH_SECRET` fuertes y únicos.
- [ ] `CORS_ORIGINS` = dominio real del frontend.
- [ ] Base de datos con respaldos activos.
- [ ] `VITE_API_URL` apuntando al backend correcto.
- [ ] `GET /api/health` → 200 tras el deploy.

### Checklist de salida a producción (go-live)
Antes de abrir el sistema a la clínica:
- [ ] **Backups automáticos de la BD activados** en Railway (Database → Settings → Backups). Es lo más crítico: hay datos reales de clientes.
- [ ] **Cambiar la contraseña del admin** por defecto (la inicial es pública).
- [ ] **CI en verde**: backend (tests) y frontend (build) pasan en GitHub Actions.
- [ ] **Smoke test de los flujos críticos** con un usuario real: login, crear cliente+mascota, registrar una consulta, una venta, abrir/cerrar caja.
- [ ] **Probar ambos roles** (veterinario y recepcionista): cada uno ve solo lo suyo.
- [ ] (Opcional, gratis) **UptimeRobot** monitoreando `/api/health` con alerta por correo.
- [ ] Tener a mano el **rollback**: en Railway, Deployments → un deploy anterior en verde → Redeploy.

### Monitoreo y resiliencia (que el backend no se caiga)
El despliegue del backend (Railway) está reforzado para auto-recuperarse:
- **Healthcheck** ([`backend/railway.json`](./backend/railway.json)): Railway no marca un deploy como sano
  hasta que `GET /api/health` responde. Un deploy roto **no entra a producción** (se mantiene el anterior).
- **Auto-restart**: `restartPolicyType: ON_FAILURE` → si el proceso se cae, Railway lo levanta solo.
- **Arranque tolerante**: `prestart.py` espera a que la BD acepte conexiones antes de migrar (reintentos),
  para que un blip transitorio no tumbe el arranque.
- `GET /api/health` devuelve un campo `build` para confirmar de un vistazo qué versión está viva.

**Monitor externo recomendado (alerta + mantener "caliente") — [UptimeRobot](https://uptimerobot.com), gratis:**
1. Crea una cuenta y entra al panel.
2. **+ New monitor** → tipo **HTTP(s)**.
3. URL: `https://tesis-veterinaria-backend-production.up.railway.app/api/health`
4. Intervalo: **5 minutos**. Guarda.
5. En **Alert Contacts**, agrega tu correo para recibir aviso si deja de responder.

> Esto avisa apenas el backend deje de responder (antes que el usuario) y, al hacer ping cada 5 min,
> evita que el servicio se "duerma" por inactividad. Si la clínica necesita **cero caídas reales**,
> el siguiente paso es un plan de Railway con **réplicas** (varios contenedores con balanceo).

**Si el backend cae y hay que forzar un redeploy:** cambia un archivo real y haz push (un commit *vacío*
lo **salta** Railway). Verifica con `GET /api/health` → debe dar `200`.

### Seguridad
- Contraseñas con **PBKDF2-SHA256**; sesión con **tokens firmados (HMAC-SHA256)**.
- **Rate-limit** en el login (anti fuerza bruta), configurable por entorno.
- **CORS** restringible al dominio del frontend en producción.
- `prestart.py` aplica migraciones **sin borrar datos** (no usa `drop_all`).

> Arquitectura, modelo de datos e historias de usuario detalladas en [`DOCUMENTACION.md`](./DOCUMENTACION.md).

---
**Autor:** Mendoza, 2026
