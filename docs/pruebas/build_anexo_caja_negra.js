const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  LevelFormat, WidthType, PageOrientation,
} = require("docx");

const numbering = {
  config: [
    {
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ],
    },
    {
      reference: "numbered",
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ],
    },
  ],
};

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 200, after: 100 },
  });
}
function p(text) {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 150 } });
}
function bullet(text) {
  return new Paragraph({
    children: [new TextRun(text)],
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
  });
}
function numbered(text) {
  return new Paragraph({
    children: [new TextRun(text)],
    numbering: { reference: "numbered", level: 0 },
    spacing: { after: 60 },
  });
}
function nota(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: "555555" })],
    spacing: { after: 200 },
  });
}

function escenario(numero, titulo, {
  entorno, parametros, respuestaModulos, condiciones, resultados, estadoFinal,
  metodoPrueba, modulos, hardwareSoftware, procedimientos, dependencias,
}) {
  const out = [];
  out.push(h2(`Escenario ${numero}: `));
  out.push(h3("Datos de Entrada:"));
  out.push(p(titulo));
  out.push(h3("Entorno:"));
  out.push(p(entorno));
  out.push(h3("Parámetros:"));
  parametros.forEach((x) => out.push(bullet(x)));
  out.push(h3("Respuesta de otros módulos:"));
  out.push(p(respuestaModulos));
  out.push(h3("Condiciones iniciales:"));
  condiciones.forEach((x) => out.push(numbered(x)));
  out.push(h3("Datos de Salida:"));
  out.push(new Paragraph({ children: [new TextRun({ text: "Resultados entregados:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(resultados));
  out.push(new Paragraph({ children: [new TextRun({ text: "Estado final de las variables:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(estadoFinal));
  out.push(h3("Requisitos de configuración para hacer la prueba:"));
  out.push(new Paragraph({ children: [new TextRun({ text: "Método de Prueba:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(metodoPrueba));
  out.push(new Paragraph({ children: [new TextRun({ text: "Módulos:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(modulos));
  out.push(new Paragraph({ children: [new TextRun({ text: "Hardware y Software:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(hardwareSoftware));
  out.push(new Paragraph({ children: [new TextRun({ text: "Procedimientos o herramientas necesarios:", bold: true })], spacing: { before: 100, after: 100 } }));
  out.push(p(procedimientos));
  out.push(h3("Dependencias o relación con otros casos de prueba:"));
  dependencias.forEach((x) => out.push(p(x)));
  return out;
}

const HW =
  "Se usó una PC con Windows 11 y navegador Google Chrome, con conexión a internet. " +
  "El backend está desplegado en Railway (Python 3.12 / FastAPI) y el frontend en Vercel (React + Vite); " +
  "la base de datos es PostgreSQL, también alojada en Railway.";

const sections = [];

sections.push(
  new Paragraph({
    text: "Anexo: Documento de Pruebas de Caja Negra",
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Sistema Veterinaria Los Pinos", italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }),
);

sections.push(h1("Descripción del Caso de Prueba:"));
sections.push(h3("Tipo de prueba a realizar:"));
sections.push(p("Pruebas de Caja Negra"));
sections.push(h3("Descripción:"));
sections.push(p("Se debe anotar lo que se probará (funcionalidad), se deben describir lo siguiente:"));
[
  "Todo lo que está fuera de los módulos.",
  "Interfaces",
  "Respuesta a las entradas",
  "Integridad de archivos",
  "Evaluar diferentes escenarios",
  "Respuestas de la aplicación",
  "Secuencia de mensajes",
].forEach((x) => sections.push(bullet(x)));

sections.push(...escenario(1, "Registro de un nuevo cliente y su paciente (mascota) en el sistema Veterinaria Los Pinos", {
  entorno: "Para registrar un cliente nuevo, el módulo de Clientes de la aplicación web contempla campos para nombre, DNI y teléfono del cliente; una vez creado, se accede al submódulo de Pacientes de ese cliente para registrar a la mascota (nombre y especie).",
  parametros: ["Campo Nombre del cliente", "Campo DNI", "Campo Teléfono", "Campo Nombre del paciente (mascota)", "Campo Especie"],
  respuestaModulos: "Se llama al endpoint POST /api/clientes/ del backend (Railway) y, tras crear el cliente, a POST /api/clientes/{id}/pacientes/ para el paciente asociado.",
  condiciones: [
    "Se dejaron vacíos los campos de nombre y teléfono",
    "Se ingresó un DNI con formato inválido (menos de 8 dígitos)",
    "Se ingresó un teléfono con formato inválido",
    "Se ingresó un DNI ya registrado para otro cliente",
    "Se ingresaron todos los campos válidos (nombre, DNI de 8 dígitos, teléfono de 9 dígitos)",
    "Se registró un paciente (mascota) asociado al cliente recién creado, con nombre y especie válidos",
  ],
  resultados: "Para las condiciones 2 y 3, la aplicación rechaza el registro (código 422) y no permite continuar. Para la condición 4, la aplicación rechaza el registro con un error de conflicto (código 409, “Ya existe un cliente registrado con ese DNI”). Para las condiciones 5 y 6, la aplicación permite el registro (código 201), el cliente queda persistido y el paciente queda correctamente ligado al cliente mediante su cliente_id.",
  estadoFinal: "Verificado en producción real (Railway) el 11/07/2026: se creó un cliente de prueba (id 2502) y un paciente asociado, confirmando el enlace cliente_id, y luego se eliminaron ambos registros de prueba sin afectar datos reales.",
  metodoPrueba: "Se usó la partición de equivalencia, insertando distintos tipos de datos válidos e inválidos en los campos de DNI y teléfono, para contemplar las distintas respuestas del backend.",
  modulos: "Para esta prueba se usaron el router clientes.py (validación de DNI único, creación de cliente y paciente) y el modelo Cliente/Paciente (SQLAlchemy) del backend, junto con la página Clientes del frontend React.",
  hardwareSoftware: HW,
  procedimientos: "Para la ejecución de esta prueba se usó la suite automatizada pytest (backend/tests/test_sistema.py y test_integracion_prod.py), que envía las peticiones HTTP directamente contra la API de producción usando la librería httpx.",
  dependencias: [
    "Se debe iniciar sesión con un usuario de rol recepcionista antes de poder crear clientes.",
    "La creación exitosa del cliente es prerrequisito para poder crear la cita del Escenario 5.",
  ],
}));

sections.push(...escenario(2, "Inicio de sesión de un usuario (recepcionista o veterinario) en el sistema", {
  entorno: "El módulo de login presenta una selección de tipo de acceso (Administrador/Recepción o Veterinario) y luego campos de usuario y contraseña.",
  parametros: ["Campo Usuario", "Campo Contraseña"],
  respuestaModulos: "Se llama al endpoint POST /api/auth/login, que valida las credenciales contra la tabla de usuarios y devuelve un token JWT junto con el rol.",
  condiciones: [
    "Se dejaron vacíos los campos de usuario y contraseña",
    "Se ingresó un usuario válido con una contraseña incorrecta",
    "Se ingresó un usuario que no existe en el sistema",
    "Se ingresaron usuario y contraseña correctos de un usuario con rol recepcionista",
    "Se intentó acceder a un endpoint protegido sin enviar el token obtenido",
    "Se intentó acceder a un endpoint protegido enviando un token con formato inválido",
  ],
  resultados: "Para las condiciones 1, 2 y 3, la aplicación responde 401 (No autorizado) y no genera token. Para la condición 4, la aplicación responde 200, entrega un token JWT válido y el rol del usuario, y redirige al panel principal. Para las condiciones 5 y 6, la aplicación responde 401.",
  estadoFinal: "Verificado en producción real navegando en vivo por el sistema: login exitoso con el usuario administrador, llegando correctamente al dashboard con los datos reales del sistema (turnos del día, caja, stock bajo).",
  metodoPrueba: "Técnica de partición de equivalencia y de valores límite sobre los campos de usuario/contraseña.",
  modulos: "routers/auth.py (login, generación de JWT), core/security.py (hash y verificación de contraseña) y el middleware de autenticación en main.py.",
  hardwareSoftware: HW,
  procedimientos: "Se usó tanto la interfaz web real (navegación manual verificada) como la suite automatizada pytest (tests/test_sistema.py::test_login_correcto, test_login_incorrecto, test_sin_token_rechazado, test_token_invalido_rechazado).",
  dependencias: [
    "El login exitoso es prerrequisito de todos los demás escenarios, ya que todos los endpoints (salvo /api/health) exigen un token válido.",
  ],
}));

sections.push(...escenario(3, "Acceso a módulos restringidos según el rol del usuario (recepcionista vs. veterinario)", {
  entorno: "El sistema distingue dos roles: recepcionista (gestión administrativa) y veterinario (atención clínica). Ciertos módulos están restringidos a uno u otro rol mediante un middleware de autorización.",
  parametros: ["Rol del usuario autenticado (recepcionista / veterinario)", "Endpoint solicitado (Bitácora de actividad, Mi panel del doctor, Historias clínicas)"],
  respuestaModulos: "Se llama al middleware de autorización del backend, que evalúa el rol del token antes de despachar la petición al router correspondiente.",
  condiciones: [
    "Un veterinario intentó acceder a la Bitácora de actividad (GET /api/actividad/), módulo exclusivo de recepción",
    "Una recepcionista intentó acceder a “Mi panel” del doctor (GET /api/mi-panel/), módulo exclusivo de veterinarios",
    "Una recepcionista intentó crear o editar una historia clínica (módulo exclusivo de veterinarios, solo lectura para recepción)",
    "Un veterinario accedió a su propio panel y a las historias clínicas de sus pacientes",
  ],
  resultados: "Para las condiciones 1, 2 y 3, la aplicación responde 403 (Prohibido) y no permite la acción. Para la condición 4, la aplicación responde 200 y muestra los datos correctamente.",
  estadoFinal: "Verificado mediante la suite automatizada (test_actividad_solo_admin, test_mi_panel_no_para_recepcion, test_recepcionista_lee_pero_no_escribe_historias), todas en verde.",
  metodoPrueba: "Técnica de tabla de decisión, cruzando el rol de usuario con el módulo solicitado, para verificar las combinaciones permitido/denegado.",
  modulos: "Middleware de autorización (main.py) y las validaciones de rol dentro de cada router (actividad.py, usuarios.py, pacientes.py para historias clínicas).",
  hardwareSoftware: HW,
  procedimientos: "Suite automatizada pytest (backend/tests/test_sistema.py).",
  dependencias: [
    "Requiere haber iniciado sesión (Escenario 2) con cada uno de los dos roles.",
  ],
}));

sections.push(...escenario(4, "Entrada de inventario por voz/texto con Inteligencia Artificial: reconocimiento de productos existentes", {
  entorno: "El módulo de Inventario incluye un botón “Entrada por voz/texto” que abre un cuadro de texto donde el usuario dicta o escribe libremente qué productos llegaron, con su cantidad y precio; un modelo de lenguaje (GPT) interpreta el texto y arma una lista de ítems, que el sistema intenta emparejar contra el catálogo existente antes de mostrarlos al usuario para confirmar.",
  parametros: ["Campo de texto libre (dictado o escrito)"],
  respuestaModulos: "Se llama al endpoint POST /api/inventario/interpretar, que a su vez llama al servicio de IA (OpenAI) para extraer los ítems, y luego a la función de emparejamiento (_match_producto) contra los productos ya existentes en la base de datos.",
  condiciones: [
    "Se dictó el nombre de un producto que ya existe en el catálogo, pero en plural, mientras el nombre guardado estaba en singular (catálogo: “vendas de 10 pulgadas”; se dictó “llegaron 10 vendas más”)",
    "Se dictó el nombre de un producto realmente nuevo, sin ningún parecido a los productos existentes",
    "Se confirmó la lista interpretada, para un producto emparejado con uno existente",
    "Se confirmó la lista interpretada, para un producto marcado como nuevo",
  ],
  resultados: "Para la condición 1 — antes de la corrección aplicada durante este proyecto, la aplicación no reconocía la diferencia singular/plural y proponía crear un producto duplicado (acción “nuevo”); tras la corrección, la aplicación reconoce correctamente el producto existente y propone la acción “+ stock”. Para la condición 2, la aplicación propone correctamente la acción “nuevo”, exigiendo precio. Para la condición 3, al confirmar, el stock del producto existente se incrementa (verificado: de 10 a 20 unidades) y el conteo total de productos del catálogo no cambia. Para la condición 4, al confirmar, se crea un nuevo producto en el catálogo.",
  estadoFinal: "Verificado en producción real (Railway + Vercel) navegando en vivo: se dictó “Llegaron 10 vendas más”, el sistema mostró en el preview la acción “+ stock” contra el producto ACC-0001 ya existente; al confirmar, el stock pasó de 10 a 20 unidades y el total de productos del catálogo se mantuvo en 1 (no se duplicó).",
  metodoPrueba: "Técnica de decisiones, contrastando el caso “coincide con un producto existente” contra “no coincide con ninguno”, incluyendo la variante singular/plural como caso límite.",
  modulos: "services/inventario_extractor.py (interpretación por IA), routers/inventario.py (función _match_producto de emparejamiento difuso de nombres, y el endpoint /aplicar), y la página Inventario del frontend React.",
  hardwareSoftware: HW + " El backend tiene configurada la API de OpenAI para la interpretación del texto.",
  procedimientos: "Se usó tanto la interfaz web real (navegación manual verificada, dictando el texto en el cuadro “Entrada por voz/texto”) como la suite automatizada pytest (backend/tests/test_inventario.py).",
  dependencias: [
    "Requiere haber iniciado sesión (Escenario 2).",
    "Requiere que exista al menos un producto previamente registrado en el catálogo para poder probar el emparejamiento.",
  ],
}));

sections.push(...escenario(5, "Creación de una nueva cita (turno) veterinaria", {
  entorno: "Para generar una nueva cita se accede al módulo de Turnos, se selecciona un paciente ya registrado, una fecha y hora, un veterinario y un motivo de consulta.",
  parametros: ["Selección del paciente", "Selección de la fecha y hora", "Selección del veterinario", "Campo de motivo de consulta"],
  respuestaModulos: "Se llama al endpoint POST /api/citas/, que verifica la existencia del paciente y del veterinario antes de crear el registro, y queda visible en el módulo de Recepción, en el Dashboard y en “Mi panel” del veterinario asignado.",
  condiciones: [
    "No se seleccionó un veterinario",
    "Se seleccionó un paciente inexistente",
    "Se completaron todos los campos correctamente con un veterinario real del sistema",
    "Un veterinario creó un turno para sí mismo",
  ],
  resultados: "Para la condición 1, la aplicación rechaza la creación (error de validación, veterinario_id requerido). Para la condición 2, la aplicación responde con error 404 (paciente no encontrado). Para la condición 3, la aplicación responde 201, la cita queda creada y correctamente asignada al veterinario (el nombre del veterinario en la respuesta coincide con el seleccionado), y aparece en el listado GET /api/citas/. Para la condición 4, el turno se autoasigna automáticamente al veterinario que lo creó.",
  estadoFinal: "Verificado en producción real: se creó una cita de prueba asignada al primer veterinario activo del sistema, confirmando que el nombre del veterinario en la respuesta coincide con el esperado y que la cita aparece en el listado general; luego se eliminó junto con el cliente/paciente de prueba asociado (la eliminación del cliente elimina en cascada sus citas).",
  metodoPrueba: "Partición de equivalencia sobre los campos obligatorios (veterinario, paciente), y técnica de decisión para el caso de autoasignación según el rol de quien crea la cita.",
  modulos: "routers/citas.py (creación, listado y actualización de citas), modelo Cita (SQLAlchemy) con relaciones a Paciente y Usuario/veterinario.",
  hardwareSoftware: HW,
  procedimientos: "Suite automatizada pytest (backend/tests/test_integracion_prod.py::test_flujo_cliente_paciente_cita_conectado, contra producción real, y backend/tests/test_sistema.py::test_turno_creado_por_doctor_se_autoasigna).",
  dependencias: [
    "Requiere que exista un cliente y un paciente ya registrados (Escenario 1) y un veterinario dado de alta en el sistema.",
  ],
}));

sections.push(...escenario(6, "Registro de una venta con descuento de stock", {
  entorno: "El módulo de Ventas permite seleccionar un cliente, agregar ítems (productos y/o servicios) con su cantidad, y un método de pago, para generar el comprobante.",
  parametros: ["Selección del cliente", "Ítems (producto/servicio, cantidad)", "Método de pago (efectivo, tarjeta, yape, plin)"],
  respuestaModulos: "Se llama al endpoint POST /api/ventas/, que descuenta el stock del producto vendido, registra un movimiento de salida en el kardex, y actualiza el cierre de caja.",
  condiciones: [
    "Se intentó vender más unidades de un producto que las disponibles en stock",
    "Se registró una venta válida de 2 unidades de un producto (stock inicial 10) y 1 servicio",
    "Se consultó el cierre de caja tras registrar ventas con distintos métodos de pago",
  ],
  resultados: "Para la condición 1, la aplicación rechaza la venta (no permite vender más stock del disponible). Para la condición 2, la aplicación responde 201, el total calculado es la suma correcta de ítems (2 × precio del producto + precio del servicio), el stock del producto queda descontado (10→8) y el kardex registra el movimiento de tipo “salida”. Para la condición 3, el cierre de caja desglosa correctamente el total por cada uno de los 4 métodos de pago.",
  estadoFinal: "Verificado mediante la suite automatizada (test_venta_kardex_y_pago, test_productos_restriccion_y_stock, test_cierre_caja), todas en verde.",
  metodoPrueba: "Partición de equivalencia (stock suficiente/insuficiente) y prueba de integridad de datos (verificación de kardex y cierre de caja tras la operación).",
  modulos: "routers/ventas.py, modelo Venta/VentaItem/MovimientoInventario, routers/dashboard.py (cierre de caja).",
  hardwareSoftware: HW,
  procedimientos: "Suite automatizada pytest (backend/tests/test_sistema.py, test_adicionales.py).",
  dependencias: [
    "Requiere un cliente, un producto con stock y un servicio ya registrados.",
  ],
}));

sections.push(...escenario(7, "Disponibilidad del backend y del frontend ante peticiones repetidas", {
  entorno: "El backend expone un endpoint público /api/health que no requiere autenticación, pensado para monitoreo de disponibilidad; el frontend, al ser una aplicación en Vercel, debe responder consistentemente al cargar la URL raíz.",
  parametros: ["Ninguno (peticiones GET simples)"],
  respuestaModulos: "Se llama directamente a GET /api/health (Railway) y a GET / (Vercel), sin pasar por el middleware de autenticación (la ruta está en la lista de rutas públicas).",
  condiciones: [
    "Se realizaron 10 peticiones consecutivas a GET /api/health",
    "Se realizaron 10 peticiones consecutivas a la raíz del frontend en Vercel",
  ],
  resultados: "Para la condición 1, las 10 peticiones respondieron 200 (100% de disponibilidad), con una latencia media de 0.213 s y máxima de 0.409 s. Para la condición 2, las 10 peticiones respondieron 200 (100% de disponibilidad), con una latencia media de 0.292 s.",
  estadoFinal: "Verificado en producción real el 11/07/2026 mediante script automatizado.",
  metodoPrueba: "Prueba de disponibilidad por muestreo repetido (10 intentos), midiendo tasa de éxito y tiempo de respuesta.",
  modulos: "main.py (endpoint /api/health) y el despliegue de Vercel para el frontend.",
  hardwareSoftware: HW,
  procedimientos: "Script Python con la librería httpx (backend/tests/test_disponibilidad.py).",
  dependencias: [
    "Ninguna; es independiente de los demás escenarios al no requerir autenticación.",
  ],
}));

sections.push(...escenario(8, "Comportamiento del sistema ante peticiones concurrentes (login y listado de citas)", {
  entorno: "Para simular el uso concurrente real de varios usuarios del sistema, se dispararon peticiones simultáneas mezclando inicios de sesión y consultas de listado de citas contra el backend en producción.",
  parametros: ["Cantidad de peticiones concurrentes (30)", "Tipo de acción (login / listar citas), elegida al azar por cada tarea"],
  respuestaModulos: "Cada tarea concurrente llama a POST /api/auth/login o a GET /api/citas/ (autenticado), de forma independiente y simultánea, usando un pool de hilos.",
  condiciones: [
    "Se lanzaron 30 tareas concurrentes mezclando login y listado de citas contra el backend real",
  ],
  resultados: "Las 30 peticiones (16 de login, 14 de listado de citas) respondieron exitosamente (100%, sin errores 5xx). La latencia media bajo concurrencia fue de 3.5 s para login y 3.0 s para listado de citas, notablemente mayor a la latencia en condiciones normales (~0.2 s medida en el Escenario 7), lo cual se atribuye a las limitaciones de recursos del plan gratuito de Railway y a que el listado de citas no está paginado (devuelve la tabla completa).",
  estadoFinal: "Verificado en producción real el 11/07/2026 mediante script automatizado; se documenta como hallazgo de rendimiento a mejorar, no como fallo funcional.",
  metodoPrueba: "Prueba de concurrencia mediante un pool de hilos (ThreadPoolExecutor) disparando 30 tareas simultáneas.",
  modulos: "routers/auth.py (login) y routers/citas.py (listado), bajo carga concurrente real.",
  hardwareSoftware: "Se usó una PC con Windows 11 con conexión a internet, contra el backend real desplegado en Railway.",
  procedimientos: "Script Python con concurrent.futures y httpx (backend/tests/test_concurrencia.py).",
  dependencias: [
    "Requiere un usuario administrador válido para poder autenticar las tareas de “listar citas”.",
  ],
}));

sections.push(h1("Listado técnico:"));
sections.push(h3("Archivos Involucrados:"));
sections.push(p("Se usaron los routers del backend (auth.py, clientes.py, pacientes.py, citas.py, ventas.py, productos.py, inventario.py, dashboard.py, actividad.py), los modelos SQLAlchemy correspondientes (models.py), los servicios de integración con IA (services/inventario_extractor.py, services/transcription.py), el middleware de autenticación y autorización (main.py), y del lado del frontend las páginas React de Clientes, Inventario, Turnos, Ventas y el componente de login."));

sections.push(h3("Sistemas y Bibliotecas:"));
sections.push(p("Entre las tecnologías utilizadas se pueden listar las siguientes:"));
[
  "FastAPI (backend, Python)",
  "SQLAlchemy + Alembic (ORM y migraciones)",
  "PostgreSQL (base de datos, alojada en Railway)",
  "React + Vite (frontend)",
  "httpx (cliente HTTP para pruebas automatizadas)",
  "pytest (framework de pruebas)",
  "OpenAI API (interpretación de lenguaje natural para inventario/servicios)",
  "Deepgram (transcripción de voz a texto)",
  "Railway (hosting backend + base de datos)",
  "Vercel (hosting frontend)",
].forEach((x) => sections.push(bullet(x)));

sections.push(h3("Errores:"));
[
  "Se encontró que el módulo de Inventario, al recibir por dictado el nombre de un producto ya existente en plural (o con variaciones menores respecto al nombre guardado), no lo reconocía y creaba un producto duplicado en vez de sumar el stock al existente. Este error fue localizado, corregido y verificado durante el desarrollo del presente trabajo (ver Escenario 4).",
  "Se encontró que el endpoint de listado de clientes (GET /api/clientes/) pagina por defecto a 300 resultados sin advertirlo explícitamente en la respuesta, lo que puede llevar a que un cliente recién creado no aparezca en una consulta sin filtro si la base ya tiene muchos registros (en producción, más de 2500 clientes).",
  "Se encontró que el endpoint de listado de citas (GET /api/citas/) no está paginado, devolviendo la tabla completa; bajo concurrencia esto eleva notablemente el tiempo de respuesta (de ~0.2 s a ~3-4.5 s).",
].forEach((x) => sections.push(bullet(x)));

sections.push(h3("Notas:"));
[
  "Se recomienda agregar paginación (skip/limit) al endpoint de listado de citas, siguiendo el mismo patrón ya usado en el listado de clientes.",
  "Se recomienda que el endpoint de listado de clientes indique explícitamente en la respuesta (o en la documentación de la API) el límite de paginación por defecto, para evitar falsos negativos al buscar un registro recién creado.",
  "Se recomienda documentar en la interfaz de “Entrada por voz/texto” del módulo de Inventario que el sistema intenta emparejar automáticamente contra productos existentes, para que el usuario pueda verificar visualmente la acción propuesta (“+ stock” vs. “nuevo”) antes de confirmar.",
].forEach((x) => sections.push(bullet(x)));

const doc = new Document({
  numbering,
  sections: [
    {
      properties: {
        page: { size: { width: 12240, height: 15840 } },
      },
      children: sections,
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  require("fs").writeFileSync(__dirname + "/Anexo_Pruebas_Caja_Negra.docx", buffer);
  console.log("OK");
});
