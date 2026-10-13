# Modelo multi-clínica (SaaS)

Una sola base de datos y una sola aplicación sirven a muchas clínicas. Lo único
que las separa es la columna `clinica_id`. Este documento explica cómo se
garantiza el aislamiento y qué reglas hay que seguir al programar.

## Cómo se aísla

El aislamiento **no depende de que cada consulta escriba un filtro**. Lo hace la
sesión de base de datos (`backend/database.py`), para toda tabla que herede de
`TenantMixin`:

| Operación | Qué pasa solo |
|---|---|
| Leer (`query`, `select`, `get`, conteos, borrados masivos) | Se filtra por la clínica de la sesión. |
| Crear | La fila queda con la clínica de la sesión. Si declara otra, se rechaza. |
| Enlazar | Una fila no puede apuntar a un registro de otra clínica (p. ej. un turno con la mascota de otra). Las claves foráneas de la base no lo impiden; esto sí. |

La clínica sale de la sesión del usuario: el middleware (`main.py`) valida el
token, busca la cuenta y su clínica, y la deja en `request.state.clinica_id`;
`get_db` la copia a `session.info["clinica_id"]`.

## Reglas al programar

1. **Tabla nueva = de una clínica.** Hereda de `TenantMixin`. Si de verdad es
   global, declárala en `GLOBALES` u `OPCIONALES` de
   `tests/test_multiclinica.py` con su razón; esa prueba falla si te olvidas.
2. **Claves únicas por clínica.** Un `unique=True` global (DNI, código, fecha…)
   haría que una clínica bloquee a otra. Usa
   `UniqueConstraint("clinica_id", "campo")`. El `usuario` de login es la
   excepción: es único en todo el sistema porque es lo único que se pide al
   entrar.
3. **Sesiones.** En una petición usa siempre `Depends(get_db)`. Fuera de una
   petición (tareas, hilos, IA) abre `nueva_sesion(clinica_id)`.
   `SessionLocal()` a secas es una sesión **sin filtro**, solo para arranque,
   scripts, inicio de sesión y tareas de plataforma.
4. **Cachés y memoria compartida.** Todo caché global debe llevar la clínica en
   su clave (ver `services/vocabulario.py`) y los canales de eventos deben ser
   por clínica (ver `ConnectionManager` en `routers/citas.py`).
5. **SQL a mano (`text()`).** No pasa por el filtro. Evítalo en el código de las
   peticiones; si es inevitable, filtra por `clinica_id` explícitamente.

## Altas y bajas

- Una clínica se crea con `POST /api/registro/` (pública, con tope por IP):
  crea la clínica, su configuración y a su administradora (rol `recepcionista`).
  `REGISTRO_ABIERTO=false` la cierra.
- `clinicas.estado = 'suspendida'` bloquea el inicio de sesión y corta las
  sesiones abiertas (en ≤ 30 s, por el caché de cuentas).
- Cada clínica elige su **color de marca** (`configuracion_clinica.color_marca`);
  el frontend deriva la paleta completa de ese color (`utils/paleta.js`).

## Pendiente (no cubierto aún)

- **Plataforma:** no hay un rol de operador para listar/suspender clínicas desde
  la app; hoy se hace por SQL o script.
- **Planes y cobro:** `clinicas.plan` existe, pero nada lo hace cumplir.
- **Archivos:** los documentos de los pacientes viven en la base (por clínica);
  a escala convendrá un almacenamiento de objetos con prefijo por clínica.
- **Límite de uso de IA** por clínica (hoy es por IP).
- **Módulos de tesis** (SUS/TAM): globales y apagados por defecto; no son
  multi-clínica.
