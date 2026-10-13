# Seguridad por rol

El servidor decide quién puede qué; el menú del frontend solo es comodidad.

## Dónde se decide

`backend/core/permisos.py` es la **única tabla** de permisos (método + ruta →
roles). La aplica el middleware antes de llegar a cualquier endpoint.

- **Niega por defecto.** Una ruta sin declarar responde 403 a todos.
- `tests/test_permisos.py` falla si hay una ruta sin declarar, comprueba que cada
  rol recibe 403 en lo que no le toca, y fija las reglas de negocio con nombre.
- Los `solo_admin()` dentro de los endpoints se conservan como segunda barrera.

## Quién puede qué (resumen)

| | Veterinario | Recepcionista (administradora) |
|---|---|---|
| Agenda, clientes, mascotas (ver y corregir) | sí | sí |
| Borrar cliente o mascota | no | sí |
| Llenar una historia clínica | sí | sí (por el doctor) |
| Firmar, nota de corrección, borrar historia | **sí** | no |
| Emitir recetas | **sí** | no (puede reimprimirlas) |
| Inventario: leer catálogo para recetar | sí | sí |
| Inventario: crear, editar, stock, servicios | no | sí |
| Ventas, caja, reportes, planilla, asistencia | no | sí |
| Usuarios, glosario, contactos, respaldo, bitácora, errores | no | sí |
| Su propio panel (`/api/mi-panel/`) | sí | no |

## Cuentas y sesiones

- El **rol sale de la base de datos en cada petición**, no del token: degradar o
  cambiar el rol de alguien rige de inmediato en su sesión abierta.
- El token lleva un **sello de la contraseña**: cambiarla (o reiniciarla) cierra
  todas las sesiones abiertas con la clave anterior.
- Desactivar una cuenta o suspender la clínica corta las sesiones en el acto.
- Una clínica **no puede quedarse sin administradora**: no se puede degradar,
  desactivar ni borrar a la última, y nadie puede desactivarse a sí mismo.
- Contraseña mínima de 8 caracteres al crear o cambiar.

## Al agregar un endpoint

1. Declara su regla en `core/permisos.py` (la más específica primero).
2. Si dependen de *quién* es el dato (p. ej. el perfil propio), compruébalo
   también dentro del endpoint: la tabla solo conoce roles, no propietarios.
3. Corre `pytest tests/test_permisos.py`.
