# Vender el sistema a otras veterinarias

Lo que sigue es el estado real de hoy, no un plan. Sirve para saber qué se
puede prometer y qué no.

---

## Cómo está armado: una instalación por clínica

El sistema **no es multi-cliente**. La tabla `configuracion_clinica` guarda
una sola fila (`id=1`) con el nombre, RUC y dirección de *la* clínica, y no
hay ninguna columna que separe los datos de una veterinaria de otra: los
clientes, las mascotas y las historias simplemente pertenecen a la base donde
están.

En la práctica: **cada veterinaria necesita su propia base de datos y su
propio despliegue.** No se crea una cuenta, se instala una copia.

### Por qué esto no es necesariamente malo

Para historias clínicas es el modelo más defendible. Los datos de una clínica
están físicamente separados de los de otra: no hay forma de que una consulta
se filtre al sistema equivocado por un error en una consulta SQL. Si una
clínica se va, se le entrega su base y listo. Si una pide un respaldo, es su
base entera y de nadie más.

El costo es operativo: cada clínica nueva es un despliegue que alguien tiene
que hacer y mantener.

### Qué haría falta para vender con registro automático

Convertirlo en multi-cliente significa agregar `clinica_id` a **todas** las
tablas, filtrar por él en **todas** las consultas, y no equivocarse ni una
vez — porque el error se ve como la historia clínica de otro paciente. Es un
trabajo grande y arriesgado. No conviene hacerlo hasta tener suficientes
clínicas como para que el trabajo manual duela más que ese riesgo.

---

## Qué cuesta cada clínica nueva

Costos que se repiten **por clínica**, no una vez:

| Concepto | Notas |
|---|---|
| Base de datos + servidor | Un servicio de Railway (o equivalente) por clínica |
| Dominio o subdominio | Opcional, pero se ve mejor que una URL genérica |
| Transcripción de voz | Deepgram cobra por minuto de audio procesado |
| Extracción con IA | OpenAI cobra por consulta procesada |

Las dos últimas escalan con el uso: una clínica que dicta todas sus consultas
gasta más que una que llena a mano. Conviene medirlo con Los Pinos durante un
mes antes de poner precio, para no vender por debajo del costo variable.

**Las claves de Deepgram y OpenAI**: hoy son las tuyas. Si todas las clínicas
usan las mismas, el gasto de todas cae en tu cuenta y no sabés cuál consume
qué. Antes de la segunda clínica hay que decidir si cada una pone las suyas
(más barato para vos, más fricción para vender) o si se mide el consumo por
clínica y se cobra encima.

---

## Instalar una clínica nueva

```bash
cd backend
.venv/Scripts/python.exe scripts/instalar_clinica.py \
    --url "postgresql://usuario:clave@host:puerto/base" \
    --clinica "Veterinaria San Roque" \
    --admin-usuario recepcion \
    --admin-nombre "Rosa Medina" \
    --ruc 20601234567 \
    --direccion "Av. Grau 120, Piura" \
    --telefono "(073) 555-0110"
```

El script pide la contraseña de la primera cuenta al vuelo (no se pasa por
parámetro: quedaría en el historial de la terminal), aplica las migraciones,
guarda los datos que salen en las boletas, y **avisa de lo que falta
configurar** — sobre todo `AUTH_SECRET`, que si queda con el valor de ejemplo
permite falsificar sesiones a cualquiera que vea el repositorio.

Se niega a correr sobre una base que ya tiene usuarios, para no pisar una
clínica en funcionamiento.

Después, dentro del sistema:

1. **Servicios** — consulta, vacunación, baño, con sus precios
2. **Inventario** — los productos; esto además habilita que el dictado
   reconozca las marcas que esa clínica maneja
3. **Usuarios** — dar de alta a los veterinarios
4. Enseñarle a la dueña **Usuarios → Copia de tus datos**

---

## Actualizaciones

Con una instalación por clínica, una corrección no llega sola a todas: hay
que desplegar en cada una. Mientras sean pocas es manejable; a partir de unas
cinco conviene automatizarlo.

**Cuidado con las migraciones.** Cada despliegue corre `alembic upgrade`
contra su base. Si una clínica lleva tiempo sin actualizarse, va a aplicar
varias migraciones de golpe. Conviene probar ese salto contra una copia de su
base antes, no directo en producción.

---

## Material de venta

### Videos

```bash
# 1. Sembrar la clínica de demostración (datos inventados)
cd backend
.venv/Scripts/python.exe scripts/sembrar_demo.py --url "<url de la base demo>"

# 2. Levantar el backend apuntando a ESA base, y el frontend

# 3. Grabar
cd demos
node grabar.mjs            # los tres videos
node grabar.mjs ventas     # solo uno
node grabar.mjs --lento    # más pausado, para narrar encima
```

Los videos quedan en `demos/salida/` en formato WebM: se abren en cualquier
navegador y YouTube los acepta tal cual. Para WhatsApp o PowerPoint hay que
convertirlos con `node convertir.mjs`, que necesita ffmpeg instalado aparte
(`winget install Gyan.FFmpeg`).

**Nunca grabar contra la base de producción.** El video mostraría nombres,
DNIs y teléfonos de clientes reales de Los Pinos.

### Los tres guiones

| Guion | Qué muestra |
|---|---|
| `recepcion` | El día completo: turnos, alertas, búsqueda de clientes |
| `ventas` | Cobrar, inventario con avisos, cierre de caja |
| `consulta` | Ficha del paciente y la consulta llenada por dictado |

Están escritos en `demos/grabar.mjs`. Cuando cambie una pantalla, se ajusta el
guion y se regraba — no hay que volver a grabar a mano.

---

## Lo que todavía no está resuelto

Cosas que conviene tener en cuenta antes de prometerlas:

- **La sesión dura 12 horas y no se renueva.** Quien entra a las 8 de la
  mañana queda afuera a las 8 de la noche, en plena atención.
- **No hay recuperación de contraseña.** Funciona porque una administradora
  puede resetear a otra; si la única activa olvida la suya, hay que tocar la
  base a mano.
- **El dictado confunde números.** Que "4 mg" se oiga como "2 mg" es un
  problema acústico, no de código. Está mitigado mostrando el fragmento de
  audio junto a cada campo, pero no resuelto. No lo vendas como infalible.
- **Una migración regenerada borra todos los índices.** Alembic los propone
  eliminar porque no están declarados en los modelos. Está avisado dentro de
  la última migración, pero es una trampa esperando a la próxima persona.
