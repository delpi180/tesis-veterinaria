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
└── render.yaml               # Archivo de configuración para despliegue en Render
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
**Autor:** Mendoza, 2026
