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

## Planes, límites y cobro

Qué incluye cada plan vive en la tabla `planes` y se edita desde el panel del
operador (pestaña **Planes**): precio, topes de **usuarios activos**, **mascotas**,
**almacenamiento** de documentos y **usos de IA por mes**, y si incluye la
**planilla** y el **contacto con clientes**. Un tope vacío es "sin límite".

> Los planes y precios iniciales (Prueba, Básico S/ 79, Profesional S/ 149,
> Fundadora) son **ejemplos** para arrancar. Ajústalos antes de vender.

**Quién lo hace cumplir.** El servidor, en cada petición (`core/limites.py`); el
frontend solo muestra el uso y avisa.

| Recurso | Dónde se corta |
|---|---|
| Usuarios activos | Al crear un usuario o reactivarlo |
| Mascotas | Al registrar una mascota |
| Almacenamiento | Al subir un documento (los tres caminos de subida) |
| IA por mes | **Antes** de llamar al proveedor (dictado, procesar historia/receta, inventario, servicios). Es atómico: dos peticiones simultáneas no pasan el tope |
| Planilla, Contactos | Todo el módulo, si el plan no lo incluye |

Reglas: se corta lo **nuevo**, nunca se borra lo existente (bajar de plan no
elimina datos); responde **402** con un mensaje que dice el plan y el tope; un plan
que no exista en la tabla no bloquea (se registra un aviso).

**Vencimiento y bloqueo.** Pasado `vence_en` la clínica queda bloqueada. Una
clínica bloqueada (vencida o suspendida) solo puede ver su **Mi plan** y pedir la
renovación; todo lo demás responde 403. Sus datos no se tocan.

**Pagos.** `services/cobro.registrar_pago` es el **único** camino por el que entra
dinero: acredita el periodo (renovar antes de vencer suma al final de lo ya
pagado), fija el plan y puede reactivar una clínica suspendida. Es **idempotente**
por (método, referencia): el mismo cobro no se acredita dos veces. Hoy lo usa el
operador al confirmar un Yape o una transferencia. La clínica ve su plan, su uso
y sus pagos, y puede **pedir** un cambio; el operador lo atiende.

Configuración: `INSTRUCCIONES_PAGO` (texto que la clínica ve en "Cómo pagar") y
`DIAS_DE_PRUEBA` (0 = sin vencimiento).

### Conectar una pasarela de pago (pendiente)

No hay pasarela conectada: exige una cuenta de comercio y claves, y no se puede
probar contra un cobro real sin ellas. Cuando se elija una (Culqi, Stripe, Mercado
Pago…), solo hace falta un endpoint que **verifique la firma** de su aviso de cobro
y llame a `registrar_pago(..., metodo="tarjeta", referencia=<id del cobro>)`. La
idempotencia y la renovación ya están resueltas.

## Pendiente (no cubierto aún)

- **Pasarela de pago** y cobro automático (ver arriba), facturación electrónica y
  cobros recurrentes. Hoy cada renovación la confirma el operador a mano.
- **Periodo de gracia** antes de bloquear una clínica vencida (hoy es inmediato).
- **Segundo factor** para las cuentas de operador (hoy: contraseña de 12+).
- **Baja y borrado de datos** de una clínica que se va: hoy solo se suspende.
- **Archivos:** los documentos viven en la base (por clínica); a escala convendrá
  un almacenamiento de objetos con prefijo por clínica.
- **Módulos de tesis** (SUS/TAM): globales y apagados por defecto; no son
  multi-clínica.
