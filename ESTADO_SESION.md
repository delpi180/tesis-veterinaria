# Estado de la sesión (24-nov-2026) — para retomar en otra PC

Léelo completo al empezar. Sin claves ni contraseñas: esas están en Railway y en `backend/.env` (que no se sube a GitHub).

## Dónde quedó todo
- Rama de trabajo: `rediseno-visual` (subida a GitHub, último commit `c35e76e`). `main` NO tiene estas mejoras.
- Hecho y commiteado: medición de la tesis (gasto de IA con tope, latencia por etapa, WER, banco de casos, exportación CSV).
  Plan y detalle en `PLAN_MEDICIONES.md`. Pruebas: backend 232 pasan / 5 saltadas, frontend 102 pasan, lint/tipos/build OK.
- **Cambios sin commitear en `CLAUDE.md`**: son del usuario, no míos. No viajan a GitHub; si hace falta en la otra PC, copiarlo a mano o commitearlo.

## Despliegue: TODO en Railway (ya no se usa Vercel)
- Cuenta: `delpi180's Projects`. Proyecto nuevo `tesis-veterinaria` (id `c24f3ddf-c1a3-4f1f-a401-de4a7b02d090`, ambiente `production`).
  El proyecto anterior se borró entero, **incluida la base con ~2500 clientes reales**: la base nueva está **vacía**.
- Servicios (los tres con despliegue exitoso):
  - `Postgres` (plantilla de Railway).
  - `tesis-veterinaria-backend`, raíz `/backend`, rama `rediseno-visual`.
    URL: https://tesis-veterinaria-backend-production.up.railway.app
  - `tesis-veterinaria-frontend`, raíz `/frontend`, rama `rediseno-visual` (Railpack + Caddy, sirve `dist`, con `RAILPACK_SPA_OUTPUT_DIR=dist`).
    URL: https://tesis-veterinaria-frontend-production.up.railway.app
- Variables puestas en el backend: `DATABASE_URL` (referencia a Postgres), `AUTH_SECRET`, `AUTH_PASSWORD`, `OPENAI_API_KEY`,
  `DEEPGRAM_API_KEY`, `CORS_ORIGINS` (solo la URL del frontend), `MODULOS_TESIS=true`.
  En el frontend: `VITE_API_URL` (URL del backend), `RAILPACK_SPA_OUTPUT_DIR`, `VITE_MODULOS_TESIS=true`.
  `VITE_*` se meten al compilar: si se cambian, hay que redesplegar el frontend.
- Usuarios: `admin` (recepcionista/administradora) y `doctor` (veterinario). Los dos se sembraron con el valor de `AUTH_PASSWORD`
  (ver en Railway → backend → Variables). Cambiarlas antes de dar acceso a doctores reales.
- Vercel ya no hace falta; el proyecto viejo se puede borrar.

## Pendiente (en orden)
1. El usuario debe probar a mano el login y que `admin` vea **Mediciones** y **Gasto de IA** y `doctor` no (no se pudo probar desde la sesión: no se autentica en producción).
2. Cambiar las contraseñas de `admin` y `doctor`.
3. Prueba real con un audio corto: confirmar que Deepgram devuelve la duración y que el costo en `/gasto-ia` sale bien.
4. Verificar los precios de Deepgram y OpenAI (los de `core/config.py` son estimados).
5. Faltan 15 casos clínicos para llegar a 30 en `backend/services/banco_evaluacion.py` (hay 15). No inventarlos: el usuario dijo que tiene 30; falta su fuente.
6. Restaurar clientes desde un respaldo, si existe (decide el usuario; no abrir `backend/backups/` ni `migracion/`).
7. Decidir si se fusiona `rediseno-visual` en `main` (Railway hoy despliega desde `rediseno-visual`).
8. La voz de Inventario y Servicios no queda registrada en el gasto de IA.

## Para empezar en la otra PC
```powershell
git clone https://github.com/delpi180/tesis-veterinaria.git C:\dev\tesis-veterinaria
cd C:\dev\tesis-veterinaria
git checkout rediseno-visual
python -m venv backend\venv ; backend\venv\Scripts\pip install -r backend\requirements.txt
cd frontend ; npm install
```
- La base de prueba necesita PostgreSQL 16 instalado en `C:\Program Files\PostgreSQL\16\bin`: `bash .claude/scripts/base-prueba.sh iniciar`.
  Si se cuelga, aplicar a mano: `DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/vet_demo backend/venv/Scripts/python.exe -m alembic upgrade head`.
- `backend/.env` NO está en el repo: crearlo en la otra PC. Nunca correr pytest/uvicorn/alembic sin `DATABASE_URL` a la base de prueba.
- Para que Claude use Railway: conectar el servicio MCP de Railway en esa instalación (misma cuenta `delpi180`).
- Reglas del proyecto en `CLAUDE.md`: todo en español, sin commit ni push salvo que el usuario lo pida, no usar el navegador salvo pedido.
