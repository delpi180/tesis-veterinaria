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

## Operación de la plataforma (operador)

Quien opera el SaaS entra por la pantalla de acceso normal con una cuenta de rol
`plataforma` y llega a su propio panel (**Clínicas**). Desde ahí:

- ve todas las clínicas con **solo conteos** (usuarios, clientes, mascotas,
  consultas de 30 días, última actividad): **nunca** nombres de clientes,
  mascotas, historias ni ventas;
- **suspende** (con motivo obligatorio) y **reactiva**: rige en el acto, también
  para las sesiones abiertas;
- cambia el **plan** y el **vencimiento**: pasado el último día de uso la clínica
  queda bloqueada hasta que el operador lo extienda;
- anota una **nota interna** (la clínica no la ve);
- **restablece la contraseña** de la administradora: devuelve una temporal una
  sola vez y cierra sus sesiones abiertas;
- consulta la **bitácora del operador** (quién hizo qué, sobre qué clínica).

Reglas de seguridad:

- El rol `plataforma` **no se puede otorgar desde la aplicación** (ni al crear ni
  al editar usuarios, ni al registrarse). Solo se crea en el servidor:
  `python -m scripts.crear_operador <usuario>` (contraseña de 12+ caracteres).
- Los operadores viven en una clínica interna reservada (plan `plataforma`) que no
  aparece en ninguna lista ni se puede abrir.
- La sesión del operador **no está acotada a una clínica** (necesita ver todas),
  así que tiene una segunda barrera: solo puede llamar a `/api/plataforma/*`; todo
  lo demás responde 403, y el panel no tiene acceso a datos clínicos.
- Sus acciones **no** se escriben en la bitácora de ninguna clínica: tienen la
  suya (`acciones_plataforma`).
- `DIAS_DE_PRUEBA` (por defecto 0 = sin vencimiento) fija el plazo de las clínicas
  que se registran solas.

## Pendiente (no cubierto aún)

- **Cobro:** `plan` y `vence_en` los fija el operador a mano; no hay pasarela de
  pago ni facturación, ni límites por plan (usuarios, almacenamiento, IA).
- **Segundo factor** para las cuentas de operador (hoy: contraseña de 12+).
- **Baja y borrado de datos** de una clínica que se va: hoy solo se suspende.
- **Archivos:** los documentos de los pacientes viven en la base (por clínica);
  a escala convendrá un almacenamiento de objetos con prefijo por clínica.
- **Límite de uso de IA** por clínica (hoy es por IP).
- **Módulos de tesis** (SUS/TAM): globales y apagados por defecto; no son
  multi-clínica.
