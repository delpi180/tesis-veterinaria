# Veterinaria Los Pinos

Sistema de gestión de una clínica veterinaria (Perú) que es a la vez **producto en uso** y **tesis**: la tesis mide
cuánto ayuda la IA (voz → Deepgram → OpenAI) a registrar historias clínicas (tiempo, exactitud, encuestas SUS/TAM).
Todo (código, comentarios, pantallas, commits) va en **español**, con palabras simples. Moneda S/, zona horaria
Perú (UTC-5). Detalle técnico completo en `HANDOFF.md` y `DOCUMENTACION.md`.

## Comandos
- **Base de prueba (siempre)**: `bash .claude/scripts/base-prueba.sh iniciar` levanta un Postgres propio en el
  puerto 54329 con la clínica ficticia (`demo_admin` / `demo1234`). Todo comando que toque una base lleva
  `DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo` delante.
- Pruebas backend: `cd backend && DATABASE_URL=… venv/Scripts/python.exe -m pytest -q -m "not prod"`.
  Necesitan datos (doctores, mascotas): por eso van contra `vet_demo`, no contra una base vacía.
  Si quedan sucias: `base-prueba.sh resembrar`.
- Frontend (`cd frontend`): `npm run lint`, `npm run typecheck`, `npm run test -- --run`, `npm run build`.
  Es lo mismo que corre el CI (`.github/workflows/ci.yml`). Atajo: la skill `/verificar`.
- No hay Python en el PATH: usar `backend/venv/Scripts/python.exe`.
- El puerto 5173 lo usa otro proyecto (`C:\proyecto trailers`): para levantar este frontend usar
  `npx vite --port 5180 --strictPort`. Servidores largos con `Start-Process` (los de fondo del shell se mueren).

## Reglas que no se rompen
- IMPORTANT: **`backend/.env` puede apuntar a producción (Railway) con ~2500 clientes reales.** No leerlo ni
  mostrarlo. Nunca correr pytest, uvicorn, alembic ni scripts de `backend/scripts/` sin `DATABASE_URL` a la base de
  prueba. Las pruebas ya ensuciaron producción antes (ventas e inventario inventados).
- `migracion/` (CSV con datos personales y la cadena de conexión de Railway) y `backend/backups/`: no abrir ni
  pegar nada de ahí en el chat.
- No hacer commit ni push salvo que el usuario lo pida. Mensajes en español, una línea, que digan qué cambia para
  quien usa el sistema (ej. «El medicamento recetado deja de ser un texto suelto»).
- No usar el navegador (preview) para verificar salvo que el usuario lo pida: gasta muchos tokens. Basta con
  pruebas, lint, tipos y build.
- Datos para la tesis (métricas, fórmulas, citas): no inventarlos. Si falta una fuente, decirlo.

## Cómo está hecho
- **Backend**: FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 + PostgreSQL (psycopg3, JSONB; SQLite no sirve).
  Un router por módulo en `backend/routers/`; auth propia (token HMAC Bearer) en el middleware de `main.py`;
  roles con `core/deps.py` (`solo_admin`). Servicios de IA y estadística en `backend/services/`.
- **Roles**: `"recepcionista"` = la administradora (`esAdmin()` / `solo_admin`); `"veterinario"` = doctor. La
  recepcionista no ve lo clínico (403); el doctor no ve administración. Cada historia queda firmada por su doctor.
- **Migraciones**: cambiar `models.py` → `alembic revision --autogenerate` → revisar el archivo → probar
  `upgrade` en la base de prueba (skill `/nueva-migracion`). En Railway se aplican solas al arrancar
  (`prestart.py`), así que una migración mala llega directo a producción.
- **Frontend**: React 19 + Vite. **Migración en curso** (rama `rediseno-visual`) de JSX + Tailwind a
  **TypeScript + Ant Design 6** (estilo de CorAll y de TransCarga). Pantallas ya migradas: `Login.tsx`,
  `Inicio.tsx`, `HistorialPaciente.tsx`, `components/MenuLateral.tsx`. Colores y tema en `core/color.ts` y
  `core/tema.ts` (verde bosque + crema); nunca colores sueltos. Pantalla nueva o migrada → `.tsx` con antd
  (skill `/migrar-pantalla`). API con `services/api.js`. El backend **no** se reescribe.
- Despliegue: backend + base en Railway (`backend/Procfile`), frontend en Vercel (`VITE_API_URL`).

## Equipo de agentes (`.claude/agents/`)
`verificador`, `guardian-seguridad`, `revisor-pantallas`, `revisor-tesis`, `investigador`.
Cuándo usar cada uno y las skills: `.claude/LEEME.md`.
