# Implementación de un sistema automatizado para optimizar el seguimiento del historial clínico en el Centro médico veterinario los Pinos - 2026

Sistema web de gestión clínica veterinaria con módulo de asistencia por IA para la estructuración automática de historias clínicas en formato SOAP mediante reconocimiento de voz (Whisper).

---

## Tecnologías utilizadas

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + Vite 8 + Tailwind CSS v4 |
| Backend | FastAPI + SQLAlchemy 2 + SQLite |
| IA / Voz | OpenAI Whisper (local, modelo `base`) |
| PDF | jsPDF + jspdf-autotable |
| Gráficos | Recharts |

---

## Estructura del proyecto

```
tesis-veterinaria/
├── backend/          # API REST con FastAPI
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── routers/
│   │   ├── clientes.py
│   │   └── pacientes.py
│   └── services/
│       ├── transcription.py   # Whisper local
│       └── soap_processor.py  # Clasificador NLP SOAP
└── frontend/         # SPA con React + Vite
    └── src/
        ├── pages/
        ├── components/
        ├── hooks/
        └── services/
```

---

## Instrucciones para levantar el proyecto

### Requisitos previos

- Python 3.10 o superior
- Node.js 18 o superior
- npm 9 o superior

---

### 1. Clonar el repositorio

```bash
git clone <URL-del-repositorio>
cd tesis-veterinaria
```

---

### 2. Configurar y levantar el Backend

```bash
# Entrar a la carpeta del backend
cd backend

# Crear el entorno virtual
python -m venv venv

# Activar el entorno virtual
# En Windows:
.\venv\Scripts\activate
# En macOS/Linux:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Levantar el servidor (puerto 8000)
uvicorn main:app --reload
```

La base de datos `veterinaria.db` se crea automáticamente al primer inicio.

El servidor quedará disponible en: **http://localhost:8000**
Documentación interactiva (Swagger): **http://localhost:8000/docs**

---

### 3. Configurar y levantar el Frontend

Abrir una **nueva terminal** (mantener el backend corriendo):

```bash
# Desde la raíz del proyecto
cd frontend

# Instalar dependencias de Node
npm install

# Levantar el servidor de desarrollo (puerto 5173)
npm run dev
```

La aplicación quedará disponible en: **http://localhost:5173**

> El proxy de Vite redirige automáticamente `/api/*` al backend en el puerto 8000. No se requiere configuración adicional de CORS.

---

### 4. Probar el sistema

1. Abrir el navegador en `http://localhost:5173`
2. Ir a **Clientes** → crear un propietario con DNI
3. En el detalle del cliente → **Agregar** una mascota
4. Hacer clic en **Atender** para abrir la pantalla de consulta
5. Probar las tres modalidades de ingreso: manual, texto libre con IA, o grabación de voz

---

## Nota importante — Módulo de voz (Whisper)

El módulo de transcripción utiliza **OpenAI Whisper en modo local** (sin API key). El modelo `base` (~140 MB) se descarga automáticamente de los servidores de Hugging Face la primera vez que se usa la función de grabación de voz. Esto puede tardar unos minutos dependiendo de la conexión a internet.

No se requiere ninguna API Key de OpenAI para la funcionalidad principal del sistema.

---

## Módulos del sistema

| Módulo | Descripción |
|--------|-------------|
| **Clientes** | Registro de propietarios con DNI, búsqueda en tiempo real |
| **Mascotas** | Registro por propietario con especie, raza y edad |
| **Historias Clínicas** | Consultas SOAP con voz + IA o ingreso manual |
| **Turnos** | Calendario de citas (vista mensual + próximos turnos) |
| **Inventario** | Control de stock con alertas de nivel bajo |
| **Ventas y Reportes** | KPIs financieros y gráficos de consultas |
| **Exportación PDF** | Historia clínica completa del paciente |

---

## Autora

Diana — Tesis de grado, 2026
