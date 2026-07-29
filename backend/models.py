from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Boolean, Date, Float, Integer, LargeBinary, Numeric, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True)
    usuario       = Column(String(50), unique=True, index=True, nullable=False)
    nombre        = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol           = Column(String(20), default="veterinario")  # veterinario | recepcionista
    activo        = Column(Boolean, default=True)
    creado_en     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Datos personales / de perfil
    dni          = Column(String(15))
    telefono     = Column(String(20))
    especialidad = Column(String(100))    # solo aplica a veterinarios

    # Perfil laboral del doctor (lo asigna la administradora)
    hora_entrada   = Column(String(5))    # horario de ingreso pactado, "HH:MM"
    dias_laborales = Column(String(40))   # CSV de días: "lun,mar,mie,jue,vie"


class Cliente(Base):
    __tablename__ = "clientes"

    id        = Column(Integer, primary_key=True)
    dni       = Column(String(20), unique=True, index=True, nullable=True)
    nombre    = Column(String(100), nullable=False)
    telefono  = Column(String(20))
    direccion = Column(String(200))

    pacientes = relationship(
        "Paciente",
        back_populates="cliente",
        cascade="all, delete-orphan",
    )


class Paciente(Base):
    __tablename__ = "pacientes"

    id         = Column(Integer, primary_key=True)
    nombre     = Column(String(100), nullable=False)
    especie    = Column(String(50),  nullable=False)
    raza       = Column(String(100))
    edad       = Column(Integer)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)

    # Ficha clínica ampliada
    sexo                = Column(String(10))    # macho | hembra
    esterilizado        = Column(Boolean, default=False)
    fecha_nacimiento    = Column(Date)
    microchip           = Column(String(50))
    color               = Column(String(60))
    alergias            = Column(Text)          # alertas clínicas destacadas
    condiciones_cronicas = Column(Text)

    cliente  = relationship("Cliente", back_populates="pacientes")
    historias = relationship(
        "HistoriaClinica",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )
    citas = relationship(
        "Cita",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )
    documentos = relationship(
        "DocumentoPaciente",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )
    registros = relationship(
        "RegistroClinico",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )
    recetas = relationship(
        "Receta",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )


class DocumentoPaciente(Base):
    """Archivos complementarios de la mascota: radiografías, análisis, recetas, etc.

    El contenido se guarda como binario dentro de PostgreSQL (durable en Railway,
    sin depender del filesystem efímero). Para no inflar las consultas de listado,
    los bytes solo se leen en el endpoint de descarga.
    """
    __tablename__ = "documentos_paciente"

    id          = Column(Integer, primary_key=True)
    paciente_id = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    registro_id = Column(Integer, ForeignKey("registros_clinicos.id"), nullable=True)
    historia_id = Column(Integer, ForeignKey("historias_clinicas.id", ondelete="CASCADE"), nullable=True)
    nombre      = Column(String(255), nullable=False)   # nombre original del archivo
    categoria   = Column(String(30), default="otro")    # radiografia | analisis | receta | otro
    descripcion = Column(Text)
    mime_type   = Column(String(120))
    tamano_bytes = Column(Integer, nullable=False, default=0)
    contenido   = Column(LargeBinary, nullable=False)
    subido_por  = Column(String(50))                    # usuario que lo subió
    creado_en   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    paciente = relationship("Paciente", back_populates="documentos")
    registro = relationship("RegistroClinico", back_populates="documentos")
    historia = relationship("HistoriaClinica", back_populates="documentos")


class RegistroClinico(Base):
    """Registros complementarios simples por mascota: antiparasitarios, estética
    y métodos complementarios (radiografías, análisis, ecografías, etc.).

    Son eventos ligeros (fecha + producto/servicio + notas), separados de la
    historia clínica formal. El campo `tipo` distingue la categoría. Los de
    tipo 'complementario' pueden llevar uno o más archivos adjuntos (el
    estudio o informe correspondiente) vía `documentos`.
    """
    __tablename__ = "registros_clinicos"

    id          = Column(Integer, primary_key=True)
    paciente_id = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    tipo        = Column(String(20), nullable=False)   # antiparasitario | estetica | complementario
    fecha       = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    producto    = Column(String(200))                  # producto aplicado / servicio realizado
    notas       = Column(Text)
    registrado_por = Column(String(50))
    creado_en   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    documentos = relationship("DocumentoPaciente", back_populates="registro")

    paciente = relationship("Paciente", back_populates="registros")


class Receta(Base):
    """Receta médica veterinaria: el tratamiento formal que el doctor indica
    para un paciente (medicamentos, dosis, vía, frecuencia y duración),
    separada de la historia clínica para poder imprimirse/entregarse sola.
    """
    __tablename__ = "recetas"

    id           = Column(Integer, primary_key=True)
    paciente_id  = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    fecha        = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    diagnostico  = Column(Text)          # motivo / diagnóstico que sustenta el tratamiento
    indicaciones = Column(Text)          # indicaciones generales para el propietario
    items        = Column(JSONB)         # [{medicamento, dosis, via, frecuencia, duracion}]
    creado_en    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Trazabilidad: quién la emitió (siempre un veterinario) y último cambio
    veterinario_id  = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    actualizado_por = Column(String(50))
    actualizado_en  = Column(DateTime(timezone=True))

    paciente    = relationship("Paciente", back_populates="recetas")
    veterinario = relationship("Usuario")

    @property
    def veterinario_nombre(self):
        return self.veterinario.nombre if self.veterinario else None


class HistoriaClinica(Base):
    __tablename__ = "historias_clinicas"

    id          = Column(Integer, primary_key=True)
    paciente_id = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    fecha       = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # ANAMNESIS
    motivo_consulta          = Column(Text)
    tiempo_evolucion         = Column(String(100))
    derivado_por             = Column(String(150))
    detalle                  = Column(Text)
    alimentacion_tipo        = Column(String(150))
    alimentacion_cantidad_gr = Column(Integer)
    antecedentes             = Column(Text)
    tipo_consulta            = Column(String(50))

    # EXAMEN OBJETIVO GENERAL (EOG)
    temperatura_c           = Column(Numeric(4, 1))
    peso_kg                 = Column(Numeric(5, 2))
    frecuencia_cardiaca     = Column(Integer)
    frecuencia_respiratoria = Column(Integer)
    condicion_corporal      = Column(Integer)
    mucosas                 = Column(String(50))
    tllc                    = Column(String(50))
    estado_sensorio         = Column(String(50))
    hidratacion             = Column(String(50))
    pulso                   = Column(String(50))
    linfonodulos            = Column(Text)

    # EXAMEN OBJETIVO PARTICULAR (EOP) — 11 sistemas
    examen_particular = Column(JSONB)

    # DIAGNÓSTICO
    diagnostico_presuntivo     = Column(Text)
    diagnosticos_diferenciales = Column(Text)
    diagnostico_definitivo     = Column(Text)

    # PLAN / TRATAMIENTO / VACUNAS
    examenes_solicitados = Column(Text)
    tratamiento_items    = Column(JSONB)
    vacunas_items        = Column(JSONB)
    indicaciones         = Column(Text)
    pronostico           = Column(String(50))
    proxima_cita         = Column(DateTime(timezone=True))

    # Pipeline IA / auditoría
    transcripcion = Column(Text)
    datos_ia      = Column(JSONB)
    creado_en     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Métricas de registro (tesis): cuánto tardó y con qué método
    segundos_registro = Column(Integer)            # tiempo total de llenado
    metodo_registro   = Column(String(10))         # 'manual' | 'ia'

    # Autoría: qué doctor veterinario llenó la historia (la hora es creado_en)
    veterinario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    paciente    = relationship("Paciente", back_populates="historias")
    veterinario = relationship("Usuario")
    documentos  = relationship("DocumentoPaciente", back_populates="historia", cascade="all, delete-orphan")

    @property
    def veterinario_nombre(self):
        return self.veterinario.nombre if self.veterinario else None


class Cita(Base):
    __tablename__ = "citas"

    id          = Column(Integer, primary_key=True)
    paciente_id = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    fecha_hora  = Column(DateTime(timezone=True), nullable=False)
    motivo      = Column(String(200))
    estado      = Column(String(20), default="pendiente")
    notas       = Column(Text)
    creado_en   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Trazabilidad: quién agendó el turno y quién hizo el último cambio (usuario.usuario)
    creado_por      = Column(String(50))
    actualizado_por = Column(String(50))
    actualizado_en  = Column(DateTime(timezone=True))

    # Doctor veterinario asignado al turno (opcional)
    veterinario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    paciente    = relationship("Paciente", back_populates="citas")
    veterinario = relationship("Usuario")

    @property
    def veterinario_nombre(self):
        return self.veterinario.nombre if self.veterinario else None

    # Info embebida del paciente/dueño (evita que el front cargue todos los clientes)
    @property
    def paciente_nombre(self):
        return self.paciente.nombre if self.paciente else None

    @property
    def paciente_especie(self):
        return self.paciente.especie if self.paciente else None

    @property
    def cliente_id(self):
        return self.paciente.cliente_id if self.paciente else None

    @property
    def propietario(self):
        return self.paciente.cliente.nombre if self.paciente and self.paciente.cliente else None

    @property
    def telefono(self):
        return self.paciente.cliente.telefono if self.paciente and self.paciente.cliente else None


class ErrorRegistrado(Base):
    """Errores del sistema, guardados para poder dar soporte.

    Antes, cuando algo fallaba en la clínica, el error del navegador moría en
    la consola del usuario (a quien además se le pedía "revisa la consola",
    consejo inútil para una recepcionista) y el del servidor quedaba suelto en
    los logs de Railway, sin aviso. El resultado era una llamada diciendo "no
    funciona" y cero información para saber qué pasó.

    Guardar el error con su contexto (quién, en qué pantalla, qué acción)
    convierte esa llamada en algo diagnosticable sin depender del relato del
    usuario ni de contratar un servicio de monitoreo.
    """
    __tablename__ = "errores"

    id       = Column(Integer, primary_key=True)
    origen   = Column(String(10), nullable=False)   # 'frontend' | 'backend'
    mensaje  = Column(String(500), nullable=False)
    detalle  = Column(Text)                          # traceback o componentStack
    # Dónde ocurrió: la ruta del navegador (frontend) o el endpoint (backend)
    ruta     = Column(String(300))
    usuario  = Column(String(50))                    # puede ser null: un error en el login no tiene sesión
    rol      = Column(String(20))
    navegador = Column(String(300))                  # user-agent, para reproducir el caso
    fecha    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Para no repetir el mismo error mil veces: se agrupan los idénticos y se
    # lleva la cuenta, en vez de llenar la tabla con copias.
    huella   = Column(String(64), index=True)        # hash de origen+mensaje+ruta
    veces    = Column(Integer, default=1)
    visto    = Column(Boolean, default=False)        # marcado como revisado


class Actividad(Base):
    """Bitácora de auditoría: registra cada acción que modifica datos."""
    __tablename__ = "actividades"

    id      = Column(Integer, primary_key=True)
    usuario = Column(String(50))     # username que ejecutó la acción
    rol     = Column(String(20))     # veterinario | recepcionista
    accion  = Column(String(150))    # descripción legible (ej. "Registró una historia clínica")
    detalle = Column(String(200))    # contexto: a qué paciente/entidad aplicó
    metodo  = Column(String(10))     # POST | PUT | DELETE
    ruta    = Column(String(200))    # endpoint afectado
    estado  = Column(Integer)        # código HTTP de respuesta
    fecha   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def calcular_tardanza_min(hora_ingreso, hora_entrada_perfil):
    """Minutos de tardanza respecto al horario pactado.

    Devuelve 0 si llegó a tiempo y None si falta el ingreso o el horario.
    Fuente única usada tanto por el modelo como por el schema AsistenciaOut.
    """
    if not (hora_ingreso and hora_entrada_perfil):
        return None
    try:
        sh, sm = (int(x) for x in hora_entrada_perfil.split(":"))
    except (ValueError, AttributeError):
        return None

    PERU_TZ = timezone(timedelta(hours=-5))
    local_dt = hora_ingreso
    if local_dt.tzinfo is None:
        local_dt = local_dt.replace(tzinfo=timezone.utc)
    local_dt = local_dt.astimezone(PERU_TZ)

    diff = (local_dt.hour * 60 + local_dt.minute) - (sh * 60 + sm)
    return diff if diff > 0 else 0


class Asistencia(Base):
    """Marcaciones de ingreso/salida del personal (control de la recepcionista)."""
    __tablename__ = "asistencias"

    id            = Column(Integer, primary_key=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha         = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    hora_ingreso  = Column(DateTime(timezone=True))
    hora_salida   = Column(DateTime(timezone=True), nullable=True)  # null mientras esté "en turno"
    notas         = Column(String(200))
    registrado_por = Column(String(50))   # usuario admin que registró la marcación
    creado_en     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    usuario = relationship("Usuario")

    @property
    def usuario_nombre(self):
        return self.usuario.nombre if self.usuario else None

    @property
    def hora_entrada_perfil(self):
        return self.usuario.hora_entrada if self.usuario else None

    @property
    def tardanza_min(self):
        """Minutos de tardanza respecto al horario pactado (0 = a tiempo)."""
        return calcular_tardanza_min(self.hora_ingreso, self.hora_entrada_perfil)



class Evaluador(Base):
    __tablename__ = "evaluadores"

    id        = Column(Integer, primary_key=True)
    nombre    = Column(String(100), nullable=False)
    rol       = Column(String(50))
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    respuestas_sus = relationship("RespuestaSUS", back_populates="evaluador", cascade="all, delete-orphan")
    respuestas_tam = relationship("RespuestaTAM", back_populates="evaluador", cascade="all, delete-orphan")


class RespuestaSUS(Base):
    __tablename__ = "respuestas_sus"

    id           = Column(Integer, primary_key=True)
    evaluador_id = Column(Integer, ForeignKey("evaluadores.id"), nullable=False)
    p1  = Column(Integer, nullable=False)
    p2  = Column(Integer, nullable=False)
    p3  = Column(Integer, nullable=False)
    p4  = Column(Integer, nullable=False)
    p5  = Column(Integer, nullable=False)
    p6  = Column(Integer, nullable=False)
    p7  = Column(Integer, nullable=False)
    p8  = Column(Integer, nullable=False)
    p9  = Column(Integer, nullable=False)
    p10 = Column(Integer, nullable=False)
    puntaje   = Column(Integer)
    creado_en = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    evaluador = relationship("Evaluador", back_populates="respuestas_sus")


class RespuestaTAM(Base):
    __tablename__ = "respuestas_tam"

    id           = Column(Integer, primary_key=True)
    evaluador_id = Column(Integer, ForeignKey("evaluadores.id"), nullable=False)
    p1  = Column(Integer, nullable=False)
    p2  = Column(Integer, nullable=False)
    p3  = Column(Integer, nullable=False)
    p4  = Column(Integer, nullable=False)
    p5  = Column(Integer, nullable=False)
    p6  = Column(Integer, nullable=False)
    p7  = Column(Integer, nullable=False)
    p8  = Column(Integer, nullable=False)
    p9  = Column(Integer, nullable=False)
    p10 = Column(Integer, nullable=False)
    p11 = Column(Integer, nullable=False)
    p12 = Column(Integer, nullable=False)
    util_percibida = Column(Float)
    facilidad_uso  = Column(Float)
    intencion_uso  = Column(Float)
    creado_en      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    evaluador = relationship("Evaluador", back_populates="respuestas_tam")


# ---------------------------------------------------------------------------
# Módulo de ventas e inventario
# ---------------------------------------------------------------------------

class Producto(Base):
    __tablename__ = "productos"

    id           = Column(Integer, primary_key=True)
    codigo       = Column(String(20), unique=True, index=True)  # SKU autogenerado: MED-0001
    nombre       = Column(String(150), nullable=False)
    descripcion  = Column(Text)
    categoria    = Column(String(50))          # comida / accesorio / medicamento
    proveedor    = Column(String(150))
    unidad       = Column(String(30))          # unidad de medida: caja, frasco, pipeta…
    precio       = Column(Numeric(10, 2), nullable=False)
    stock        = Column(Integer, default=0)
    stock_minimo = Column(Integer, default=5)  # umbral para alerta de stock bajo
    activo       = Column(Boolean, default=True)
    creado_en    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Servicio(Base):
    __tablename__ = "servicios"

    id              = Column(Integer, primary_key=True)
    nombre          = Column(String(100), nullable=False)
    descripcion     = Column(Text)
    precio          = Column(Numeric(10, 2))           # nullable cuando precio_variable=True
    precio_variable = Column(Boolean, default=False)   # operación: monto al momento de la venta
    activo          = Column(Boolean, default=True)
    creado_en       = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Venta(Base):
    __tablename__ = "ventas"

    id            = Column(Integer, primary_key=True)
    cliente_id    = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    fecha         = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    total         = Column(Numeric(10, 2), nullable=False)   # total FINAL (con descuento aplicado)
    descuento_pct = Column(Numeric(5, 2), default=0)         # % de descuento aplicado a la venta
    metodo_pago   = Column(String(20), default="efectivo")  # efectivo | tarjeta | yape | plin

    # ── Anulación ────────────────────────────────────────────────────────────
    # Una venta mal hecha se ANULA, no se borra: el comprobante ya se entregó y
    # su número tiene que seguir existiendo. Anularla devuelve el stock y la
    # deja fuera de los totales de caja, pero el registro queda como constancia
    # de qué pasó y quién lo hizo.
    anulada          = Column(Boolean, default=False, nullable=False)
    anulada_en       = Column(DateTime(timezone=True))
    anulada_por      = Column(String(50))
    motivo_anulacion = Column(String(200))

    cliente = relationship("Cliente")
    items   = relationship("VentaItem", back_populates="venta", cascade="all, delete-orphan")


class CierreCaja(Base):
    """Arqueo del día: lo que dice el sistema contra lo que hay en el cajón.

    Antes el "cierre de caja" era solo un listado de ventas que se podía
    generar mil veces y no dejaba rastro. Lo que le da sentido a un cierre es
    justamente esto: contar el efectivo físico, compararlo con lo esperado y
    dejar registrado quién cerró y si cuadró.

    Con varias personas manejando efectivo, esa constancia protege a las dos
    partes: a la dueña le da trazabilidad y a la recepcionista honesta le da
    respaldo de que su caja cuadró ese día.

    Solo se arquea el EFECTIVO: lo cobrado por tarjeta/Yape/Plin no pasa por
    el cajón, así que no tiene sentido contarlo a mano.
    """
    __tablename__ = "cierres_caja"

    id                = Column(Integer, primary_key=True)
    fecha             = Column(Date, nullable=False, unique=True)   # un cierre por día
    efectivo_esperado = Column(Numeric(10, 2), nullable=False)      # según el sistema
    efectivo_contado  = Column(Numeric(10, 2), nullable=False)      # lo que había en el cajón
    diferencia        = Column(Numeric(10, 2), nullable=False)      # contado - esperado (negativo = falta)
    total_dia         = Column(Numeric(10, 2), nullable=False)      # todos los métodos, para referencia
    num_ventas        = Column(Integer, nullable=False, default=0)
    notas             = Column(String(300))                         # explicación de la diferencia
    cerrado_por       = Column(String(50))
    cerrado_en        = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id               = Column(Integer, primary_key=True)
    producto_id      = Column(Integer, ForeignKey("productos.id"), nullable=False)
    tipo             = Column(String(20), nullable=False)   # entrada | salida | ajuste
    cantidad         = Column(Integer, nullable=False)      # con signo: + entrada, - salida
    stock_resultante = Column(Integer, nullable=False)
    motivo           = Column(String(200))
    referencia       = Column(String(60))                  # p.ej. "Venta B-000012"
    fecha            = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    producto = relationship("Producto")


class VentaItem(Base):
    __tablename__ = "venta_items"

    id              = Column(Integer, primary_key=True)
    venta_id        = Column(Integer, ForeignKey("ventas.id"), nullable=False)
    producto_id     = Column(Integer, ForeignKey("productos.id"), nullable=True)
    servicio_id     = Column(Integer, ForeignKey("servicios.id"), nullable=True)
    descripcion     = Column(String(200))  # snapshot del nombre (producto o servicio)
    cantidad        = Column(Integer, nullable=False)
    precio_unitario = Column(Numeric(10, 2), nullable=False)  # precio al momento de la venta

    venta    = relationship("Venta", back_populates="items")
    producto = relationship("Producto")
    servicio = relationship("Servicio")


class RateLimitHit(Base):
    __tablename__ = "rate_limit_hits"

    id        = Column(Integer, primary_key=True)
    key       = Column(String(255), nullable=False, index=True)
    timestamp = Column(Float, nullable=False, index=True)


class SseEvent(Base):
    __tablename__ = "sse_events"

    id        = Column(Integer, primary_key=True)
    message   = Column(String(100), nullable=False)
    timestamp = Column(Float, nullable=False, index=True)


class ConfiguracionClinica(Base):
    """Datos de la clínica que usa el sistema (una sola fila, id=1).

    Antes el nombre "Veterinaria Los Pinos" estaba escrito a mano en el login,
    el menú, las boletas, las historias en PDF y hasta en los mensajes de
    WhatsApp: instalar el sistema en otra clínica obligaba a editar el código.
    Con esto, la misma versión sirve para cualquier clínica: se configura desde
    la aplicación.
    """
    __tablename__ = "configuracion_clinica"

    id        = Column(Integer, primary_key=True)
    nombre    = Column(String(120), nullable=False, default="Mi Veterinaria")
    # Datos que aparecen en boletas y comprobantes
    ruc       = Column(String(20))
    direccion = Column(String(200))
    telefono  = Column(String(30))
    email     = Column(String(120))
    # Texto libre al pie de los comprobantes (ej. "Gracias por su preferencia")
    pie_comprobante = Column(String(200))

    actualizado_en  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    actualizado_por = Column(String(50))


class VacunaAvisada(Base):
    """Marca que ya se avisó al dueño sobre una vacuna pendiente.

    Los recordatorios de vacuna NO son una tabla propia: se calculan al vuelo
    a partir de `vacunas_items` (JSONB) dentro de cada historia clínica. Sin
    este registro aparte, no había forma de anotar "ya le avisé" sin editar la
    historia — así que la misma vacuna vencida volvía a aparecer todos los
    días para siempre, aunque la recepcionista ya hubiera contactado al dueño.

    Se identifica por (paciente_id, vacuna, proxima_dosis) y no solo por
    (paciente_id, vacuna): si el veterinario aplica la vacuna y registra una
    nueva fecha, es un recordatorio distinto y debe volver a aparecer.
    """
    __tablename__ = "vacunas_avisadas"

    id            = Column(Integer, primary_key=True)
    paciente_id   = Column(Integer, ForeignKey("pacientes.id", ondelete="CASCADE"), nullable=False)
    vacuna        = Column(String(150), nullable=False)
    proxima_dosis = Column(String(60), nullable=False)   # tal cual viene del item (fecha ISO o texto libre)
    avisado_en    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    avisado_por   = Column(String(50))

    __table_args__ = (
        UniqueConstraint("paciente_id", "vacuna", "proxima_dosis", name="uq_vacuna_avisada"),
    )

