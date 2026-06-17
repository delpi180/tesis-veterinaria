from datetime import datetime, timezone
from sqlalchemy import Column, Boolean, Date, Float, Integer, Numeric, String, Text, DateTime, ForeignKey
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
    foto_url            = Column(Text, nullable=True)  # Base64 data URI de la foto

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

    # Doctor veterinario asignado al turno (opcional)
    veterinario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    paciente    = relationship("Paciente", back_populates="citas")
    veterinario = relationship("Usuario")

    @property
    def veterinario_nombre(self):
        return self.veterinario.nombre if self.veterinario else None


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

    id          = Column(Integer, primary_key=True)
    cliente_id  = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    fecha       = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    total       = Column(Numeric(10, 2), nullable=False)
    metodo_pago = Column(String(20), default="efectivo")  # efectivo | tarjeta | yape | plin

    cliente = relationship("Cliente")
    items   = relationship("VentaItem", back_populates="venta", cascade="all, delete-orphan")


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
