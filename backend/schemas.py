from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from models import calcular_tardanza_min


# ---------------------------------------------------------------------------
# Historia Clínica
# ---------------------------------------------------------------------------

class HistoriaClinicaResumen(BaseModel):
    """Versión ligera para embebido en PacienteOut."""
    id:                     int
    fecha:                  datetime
    motivo_consulta:        Optional[str] = None
    diagnostico_presuntivo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HistoriaClinicaCreate(BaseModel):
    """Todos los campos clínicos opcionales; paciente_id viene por la URL."""

    # ANAMNESIS
    motivo_consulta:          Optional[str] = None
    tiempo_evolucion:         Optional[str] = None
    derivado_por:             Optional[str] = None
    detalle:                  Optional[str] = None
    alimentacion_tipo:        Optional[str] = None
    alimentacion_cantidad_gr: Optional[int] = None
    antecedentes:             Optional[str] = None
    tipo_consulta: Optional[Literal[
        'primera_vez', 'control', 'urgencia', 'vacunacion'
    ]] = None

    # EOG
    temperatura_c:           Optional[float] = None
    peso_kg:                 Optional[float] = None
    frecuencia_cardiaca:     Optional[int]   = None
    frecuencia_respiratoria: Optional[int]   = None
    condicion_corporal:      Optional[int]   = Field(None, ge=1, le=9)
    mucosas: Optional[Literal[
        'rosadas', 'palidas', 'congestivas', 'ictericas', 'cianoticas'
    ]] = None
    tllc: Optional[Literal['normal', 'aumentado']] = None
    estado_sensorio: Optional[Literal[
        'alerta', 'deprimido', 'estuporoso', 'comatoso'
    ]] = None
    hidratacion: Optional[Literal[
        'normal', 'leve_5', 'moderada_7', 'grave_10', 'shock_12'
    ]] = None
    pulso: Optional[Literal[
        'fuerte', 'debil', 'filiforme', 'ausente'
    ]] = None
    linfonodulos: Optional[str] = None

    # EOP
    examen_particular: Optional[dict] = None

    # DIAGNÓSTICO
    diagnostico_presuntivo:     Optional[str] = None
    diagnosticos_diferenciales: Optional[str] = None
    diagnostico_definitivo:     Optional[str] = None

    # PLAN
    examenes_solicitados: Optional[str]  = None
    tratamiento_items:    Optional[list] = None
    vacunas_items:        Optional[list] = None
    indicaciones:         Optional[str]  = None
    pronostico: Optional[Literal[
        'favorable', 'reservado', 'desfavorable', 'grave'
    ]] = None
    proxima_cita: Optional[datetime] = None

    # IA / auditoría
    transcripcion: Optional[str]  = None
    datos_ia:      Optional[dict] = None

    # Métricas de registro (tesis)
    segundos_registro: Optional[int] = Field(None, ge=0)
    metodo_registro:   Optional[Literal['manual', 'ia']] = None

    # Veterinario que ATENDIÓ la consulta. Lo manda la recepcionista cuando
    # llena la historia por el doctor; si escribe el propio veterinario se
    # ignora y firma él (nadie firma en nombre de otro).
    veterinario_id: Optional[int] = None


class HistoriaClinicaOut(BaseModel):
    """Respuesta completa con todos los campos clínicos."""
    id:          int
    paciente_id: int
    fecha:       datetime
    creado_en:   datetime

    # ANAMNESIS
    motivo_consulta:          Optional[str] = None
    tiempo_evolucion:         Optional[str] = None
    derivado_por:             Optional[str] = None
    detalle:                  Optional[str] = None
    alimentacion_tipo:        Optional[str] = None
    alimentacion_cantidad_gr: Optional[int] = None
    antecedentes:             Optional[str] = None
    tipo_consulta:            Optional[str] = None

    # EOG
    temperatura_c:           Optional[float] = None
    peso_kg:                 Optional[float] = None
    frecuencia_cardiaca:     Optional[int]   = None
    frecuencia_respiratoria: Optional[int]   = None
    condicion_corporal:      Optional[int]   = None
    mucosas:                 Optional[str]   = None
    tllc:                    Optional[str]   = None
    estado_sensorio:         Optional[str]   = None
    hidratacion:             Optional[str]   = None
    pulso:                   Optional[str]   = None
    linfonodulos:            Optional[str]   = None

    # EOP
    examen_particular: Optional[dict] = None

    # DIAGNÓSTICO
    diagnostico_presuntivo:     Optional[str] = None
    diagnosticos_diferenciales: Optional[str] = None
    diagnostico_definitivo:     Optional[str] = None

    # PLAN
    examenes_solicitados: Optional[str]  = None
    tratamiento_items:    Optional[list] = None
    vacunas_items:        Optional[list] = None
    indicaciones:         Optional[str]  = None
    pronostico:           Optional[str]  = None
    proxima_cita:         Optional[datetime] = None

    # IA / auditoría
    transcripcion: Optional[str]  = None
    datos_ia:      Optional[dict] = None

    # Métricas de registro (tesis)
    segundos_registro: Optional[int] = None
    metodo_registro:   Optional[str] = None

    # Autoría: doctor que la llenó (la hora de llenado es creado_en)
    veterinario_id:     Optional[int] = None
    veterinario_nombre: Optional[str] = None

    # Adjuntos de esta consulta puntual (radiografías, análisis…). Solo el
    # conteo: la lista completa se pide aparte con /documentos/?historia_id=
    # para no cargar metadatos de archivos en cada listado de historias.
    documentos: list = Field(default=[], exclude=True)

    @computed_field
    @property
    def documentos_count(self) -> int:
        return len(self.documentos)

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Paciente
# ---------------------------------------------------------------------------

class PacienteBase(BaseModel):
    nombre:  str
    especie: str
    raza:    Optional[str] = None
    edad:    Optional[int] = None
    sexo:                 Optional[Literal['macho', 'hembra']] = None
    esterilizado:         Optional[bool] = None
    fecha_nacimiento:     Optional[date] = None
    microchip:            Optional[str]  = None
    color:                Optional[str]  = None
    alergias:             Optional[str]  = None
    condiciones_cronicas: Optional[str]  = None


class PacienteCreate(PacienteBase):
    pass


class PacienteUpdate(BaseModel):
    nombre:  Optional[str] = None
    especie: Optional[str] = None
    raza:    Optional[str] = None
    edad:    Optional[int] = Field(None, ge=0)
    sexo:                 Optional[Literal['macho', 'hembra']] = None
    esterilizado:         Optional[bool] = None
    fecha_nacimiento:     Optional[date] = None
    microchip:            Optional[str]  = None
    color:                Optional[str]  = None
    alergias:             Optional[str]  = None
    condiciones_cronicas: Optional[str]  = None


class PacienteOut(PacienteBase):
    id:         int
    cliente_id: int
    historias:  list[HistoriaClinicaResumen] = []   # ligero: solo id, fecha, motivo, dx

    model_config = ConfigDict(from_attributes=True)


class PacienteSummary(PacienteBase):
    """Versión sin historias, para listar dentro de un cliente."""
    id:         int
    cliente_id: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Cliente
# ---------------------------------------------------------------------------

class ClienteBase(BaseModel):
    nombre:    str
    dni:       Optional[str] = None
    telefono:  Optional[str] = None
    direccion: Optional[str] = None


class ClienteCreate(ClienteBase):
    dni: str  # requerido al crear

    # La validación de DNI/teléfono SOLO aplica a la entrada (crear/editar),
    # nunca a la salida: así datos heredados/migrados (RUC, etc.) se pueden listar.
    @model_validator(mode='after')
    def _validar_contacto(self):
        if self.dni is not None and self.dni.strip():
            dni = self.dni.strip()
            if not (dni.isdigit() and len(dni) == 8):
                raise ValueError("El DNI debe tener exactamente 8 dígitos")
            self.dni = dni
        if self.telefono is not None and self.telefono.strip():
            tel = ''.join(ch for ch in self.telefono if ch.isdigit())
            if not (6 <= len(tel) <= 12):
                raise ValueError("El teléfono debe tener entre 6 y 12 dígitos")
            self.telefono = tel
        return self


class ClienteOut(ClienteBase):
    id:        int
    pacientes: list[PacienteSummary] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Cita
# ---------------------------------------------------------------------------

ESTADO_CITA = Literal["pendiente", "confirmada", "atendida", "cancelada"]


class CitaBase(BaseModel):
    fecha_hora: datetime
    motivo:     Optional[str] = None
    estado:     ESTADO_CITA = "pendiente"
    notas:      Optional[str] = None


class CitaCreate(CitaBase):
    paciente_id:    int
    veterinario_id: Optional[int] = None


class CitaUpdate(BaseModel):
    fecha_hora:     Optional[datetime] = None
    motivo:         Optional[str] = None
    estado:         Optional[ESTADO_CITA] = None
    notas:          Optional[str] = None
    veterinario_id: Optional[int] = None


class CitaResponse(CitaBase):
    id:                 int
    paciente_id:        int
    creado_en:          datetime
    creado_por:         Optional[str] = None
    actualizado_por:    Optional[str] = None
    actualizado_en:     Optional[datetime] = None
    veterinario_id:     Optional[int] = None
    veterinario_nombre: Optional[str] = None
    paciente_nombre:    Optional[str] = None
    paciente_especie:   Optional[str] = None
    cliente_id:         Optional[int] = None
    propietario:        Optional[str] = None
    telefono:           Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Evaluador
# ---------------------------------------------------------------------------

class EvaluadorBase(BaseModel):
    nombre: str
    rol:    Optional[str] = None


class EvaluadorCreate(EvaluadorBase):
    pass


class EvaluadorOut(EvaluadorBase):
    id:        int
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Encuesta SUS  (escala 1-5)
# ---------------------------------------------------------------------------

class SUSCreate(BaseModel):
    evaluador_id: int
    p1:  int = Field(ge=1, le=5)
    p2:  int = Field(ge=1, le=5)
    p3:  int = Field(ge=1, le=5)
    p4:  int = Field(ge=1, le=5)
    p5:  int = Field(ge=1, le=5)
    p6:  int = Field(ge=1, le=5)
    p7:  int = Field(ge=1, le=5)
    p8:  int = Field(ge=1, le=5)
    p9:  int = Field(ge=1, le=5)
    p10: int = Field(ge=1, le=5)


class SUSOut(SUSCreate):
    id:        int
    puntaje:   Optional[int] = None
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Encuesta TAM  (escala 1-7)
# ---------------------------------------------------------------------------

class TAMCreate(BaseModel):
    evaluador_id: int
    p1:  int = Field(ge=1, le=7)
    p2:  int = Field(ge=1, le=7)
    p3:  int = Field(ge=1, le=7)
    p4:  int = Field(ge=1, le=7)
    p5:  int = Field(ge=1, le=7)
    p6:  int = Field(ge=1, le=7)
    p7:  int = Field(ge=1, le=7)
    p8:  int = Field(ge=1, le=7)
    p9:  int = Field(ge=1, le=7)
    p10: int = Field(ge=1, le=7)
    p11: int = Field(ge=1, le=7)
    p12: int = Field(ge=1, le=7)


class TAMOut(TAMCreate):
    id:             int
    util_percibida: Optional[float] = None
    facilidad_uso:  Optional[float] = None
    intencion_uso:  Optional[float] = None
    creado_en:      datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Resumen de encuestas (dashboard)
# ---------------------------------------------------------------------------

class ResumenEncuestas(BaseModel):
    total_sus:               int
    puntaje_sus_promedio:    Optional[float]
    total_tam:               int
    util_percibida_promedio: Optional[float]
    facilidad_uso_promedio:  Optional[float]
    intencion_uso_promedio:  Optional[float]


# ---------------------------------------------------------------------------
# Productos
# ---------------------------------------------------------------------------

class ProductoCreate(BaseModel):
    nombre:       str
    descripcion:  Optional[str] = None
    categoria:    Optional[Literal['comida', 'accesorio', 'medicamento']] = None
    proveedor:    Optional[str] = None
    unidad:       Optional[str] = None
    precio:       float = Field(gt=0)
    stock:        int   = Field(default=0, ge=0)
    stock_minimo: int   = Field(default=5,  ge=0)
    activo:       bool  = True
    # Sobre todo para medicamentos y vacunas; null = no aplica
    fecha_vencimiento: Optional[date] = None
    lote:              Optional[str]  = None


class ProductoUpdate(BaseModel):
    nombre:       Optional[str]   = None
    descripcion:  Optional[str]   = None
    categoria:    Optional[Literal['comida', 'accesorio', 'medicamento']] = None
    proveedor:    Optional[str]   = None
    unidad:       Optional[str]   = None
    precio:       Optional[float] = Field(None, gt=0)
    stock:        Optional[int]   = Field(None, ge=0)
    stock_minimo: Optional[int]   = Field(None, ge=0)
    activo:       Optional[bool]  = None
    fecha_vencimiento: Optional[date] = None
    lote:              Optional[str]  = None


class ProductoOut(BaseModel):
    id:           int
    codigo:       Optional[str] = None
    nombre:       str
    descripcion:  Optional[str] = None
    categoria:    Optional[str] = None
    proveedor:    Optional[str] = None
    unidad:       Optional[str] = None
    precio:       float
    stock:        int
    stock_minimo: int
    activo:       bool
    creado_en:    datetime
    fecha_vencimiento: Optional[date] = None
    lote:              Optional[str]  = None

    @computed_field
    @property
    def stock_bajo(self) -> bool:
        return self.stock <= self.stock_minimo

    @computed_field
    @property
    def dias_para_vencer(self) -> Optional[int]:
        """Negativo si ya venció; null si el producto no lleva fecha."""
        if not self.fecha_vencimiento:
            return None
        return (self.fecha_vencimiento - date.today()).days

    @computed_field
    @property
    def estado_vencimiento(self) -> Optional[str]:
        """vencido | por_vencer (30 días) | vigente. Null si no lleva fecha."""
        d = self.dias_para_vencer
        if d is None:
            return None
        if d < 0:
            return "vencido"
        return "por_vencer" if d <= 30 else "vigente"

    @computed_field
    @property
    def valor_stock(self) -> float:
        return round(self.precio * self.stock, 2)

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Servicios
# ---------------------------------------------------------------------------

class ServicioCreate(BaseModel):
    nombre:          str
    descripcion:     Optional[str]   = None
    precio:          Optional[float] = Field(None, ge=0)
    precio_variable: bool            = False
    activo:          bool            = True

    @model_validator(mode='after')
    def _precio_segun_tipo(self):
        if not self.precio_variable and (self.precio is None or self.precio <= 0):
            raise ValueError("Un servicio de precio fijo requiere un precio mayor a 0")
        return self


class ServicioUpdate(BaseModel):
    nombre:          Optional[str]   = None
    descripcion:     Optional[str]   = None
    precio:          Optional[float] = Field(None, ge=0)
    precio_variable: Optional[bool]  = None
    activo:          Optional[bool]  = None


class ServicioOut(BaseModel):
    id:              int
    nombre:          str
    descripcion:     Optional[str] = None
    precio:          Optional[float] = None
    precio_variable: bool
    activo:          bool
    creado_en:       datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Servicios por voz/texto (IA)
# ---------------------------------------------------------------------------

class ServicioInterpretarReq(BaseModel):
    texto: str


class ServInItemPreview(BaseModel):
    nombre:          str
    descripcion:     Optional[str]   = None
    precio:          Optional[float] = None
    precio_variable: bool            = False
    accion:          str                       # 'nuevo' | 'actualizar'
    servicio_id:     Optional[int]   = None


class ServInItemAplicar(BaseModel):
    nombre:          str
    descripcion:     Optional[str]   = None
    precio:          Optional[float] = Field(None, gt=0)
    precio_variable: bool            = False
    accion:          Literal['nuevo', 'actualizar']
    servicio_id:     Optional[int]   = None

    @model_validator(mode='after')
    def _precio_segun_tipo(self):
        if not self.precio_variable and (self.precio is None or self.precio <= 0):
            raise ValueError(f"'{self.nombre}': un servicio de precio fijo requiere precio mayor a 0")
        return self


class ServiciosAplicarReq(BaseModel):
    items: list[ServInItemAplicar] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Ventas
# ---------------------------------------------------------------------------

class VentaItemCreate(BaseModel):
    producto_id: Optional[int]   = None
    servicio_id: Optional[int]   = None
    cantidad:    int             = Field(default=1, ge=1)
    precio:      Optional[float] = Field(None, gt=0)  # solo para servicios de monto variable

    @model_validator(mode='after')
    def _uno_u_otro(self):
        if bool(self.producto_id) == bool(self.servicio_id):
            raise ValueError("Cada ítem debe referenciar un producto O un servicio (exactamente uno)")
        return self


class VentaCreate(BaseModel):
    cliente_id:    int
    metodo_pago:   Literal['efectivo', 'tarjeta', 'yape', 'plin'] = 'efectivo'
    descuento_pct: float = Field(0, ge=0, le=100)   # % de descuento sobre el subtotal
    items:         list[VentaItemCreate] = Field(min_length=1)


class VentaItemOut(BaseModel):
    id:              int
    tipo:            str            # 'producto' | 'servicio'
    producto_id:     Optional[int] = None
    servicio_id:     Optional[int] = None
    descripcion:     str
    cantidad:        int
    precio_unitario: float
    subtotal:        float

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='before')
    @classmethod
    def _from_orm(cls, v):
        # Cuando llega un objeto ORM, aplanamos las relaciones
        if hasattr(v, '__tablename__'):
            desc = v.descripcion or (
                v.producto.nombre if v.producto else
                v.servicio.nombre if v.servicio else ""
            )
            return {
                'id':              v.id,
                'tipo':            'servicio' if v.servicio_id else 'producto',
                'producto_id':     v.producto_id,
                'servicio_id':     v.servicio_id,
                'descripcion':     desc,
                'cantidad':        v.cantidad,
                'precio_unitario': float(v.precio_unitario),
                'subtotal':        round(float(v.cantidad) * float(v.precio_unitario), 2),
            }
        return v


class VentaAnular(BaseModel):
    """Anular exige un motivo: queda como constancia de por qué se dejó sin
    efecto un comprobante ya emitido."""
    motivo: str = Field(..., min_length=3, max_length=200)


class VentaOut(BaseModel):
    id:            int
    cliente_id:    int
    cliente_nombre: Optional[str] = None
    cliente_dni:    Optional[str] = None
    fecha:         datetime
    total:         float                      # total final (con descuento)
    descuento_pct: float = 0
    metodo_pago:   Optional[str] = None
    items:         list[VentaItemOut] = []

    # Anulación (una venta anulada sigue existiendo, fuera de los totales)
    anulada:          bool = False
    anulada_en:       Optional[datetime] = None
    anulada_por:      Optional[str] = None
    motivo_anulacion: Optional[str] = None

    @computed_field
    @property
    def subtotal(self) -> float:
        return round(sum(it.subtotal for it in self.items), 2)

    @computed_field
    @property
    def descuento_monto(self) -> float:
        return round(self.subtotal * (self.descuento_pct or 0) / 100, 2)

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Movimientos de inventario (kardex)
# ---------------------------------------------------------------------------

class AjusteStock(BaseModel):
    cantidad: int = Field(description="Positivo = entrada, negativo = salida")
    motivo:   Optional[str] = None

    @model_validator(mode='after')
    def _no_cero(self):
        if self.cantidad == 0:
            raise ValueError("La cantidad del ajuste no puede ser 0")
        return self


class MovimientoOut(BaseModel):
    id:               int
    producto_id:      int
    tipo:             str
    cantidad:         int
    stock_resultante: int
    motivo:           Optional[str] = None
    referencia:       Optional[str] = None
    fecha:            datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Inventario conversacional (entrada por voz/texto)
# ---------------------------------------------------------------------------

class InventarioInterpretarReq(BaseModel):
    texto: str


class InvItemPreview(BaseModel):
    nombre:       str
    categoria:    Optional[str]   = None
    cantidad:     int
    precio:       Optional[float] = None
    unidad:       Optional[str]   = None
    producto_id:  Optional[int]   = None   # si hizo match con uno existente
    codigo:       Optional[str]   = None
    accion:       str                      # 'nuevo' | 'entrada'
    stock_actual: Optional[int]   = None


class InvItemAplicar(BaseModel):
    nombre:      str
    categoria:   Optional[Literal['comida', 'accesorio', 'medicamento']] = None
    cantidad:    int             = Field(ge=1)
    precio:      Optional[float] = Field(None, gt=0)
    unidad:      Optional[str]   = None
    producto_id: Optional[int]   = None
    accion:      Literal['nuevo', 'entrada']


class InventarioAplicarReq(BaseModel):
    items: list[InvItemAplicar] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Usuarios / Autenticación
# ---------------------------------------------------------------------------

def _validar_dni_telefono(dni, telefono):
    if dni is not None and dni.strip():
        d = dni.strip()
        if not (d.isdigit() and len(d) == 8):
            raise ValueError("El DNI debe tener exactamente 8 dígitos")
        dni = d
    else:
        dni = None
    if telefono is not None and telefono.strip():
        t = ''.join(ch for ch in telefono if ch.isdigit())
        if not (6 <= len(t) <= 12):
            raise ValueError("El teléfono debe tener entre 6 y 12 dígitos")
        telefono = t
    else:
        telefono = None
    return dni, telefono


class UsuarioCreate(BaseModel):
    usuario:        str = Field(min_length=3, max_length=50)
    nombre:         str
    password:       str = Field(min_length=4)
    rol:            Literal['veterinario', 'recepcionista'] = 'veterinario'
    activo:         bool = True
    dni:            Optional[str] = None
    telefono:       Optional[str] = None
    especialidad:   Optional[str] = None
    hora_entrada:   Optional[str] = None
    dias_laborales: Optional[str] = None

    @model_validator(mode='after')
    def _validar_contacto(self):
        self.dni, self.telefono = _validar_dni_telefono(self.dni, self.telefono)
        return self


class UsuarioUpdate(BaseModel):
    nombre:         Optional[str] = None
    password:       Optional[str] = Field(None, min_length=4)
    rol:            Optional[Literal['veterinario', 'recepcionista']] = None
    activo:         Optional[bool] = None
    dni:            Optional[str] = None
    telefono:       Optional[str] = None
    especialidad:   Optional[str] = None
    hora_entrada:   Optional[str] = None
    dias_laborales: Optional[str] = None

    @model_validator(mode='after')
    def _validar_contacto(self):
        self.dni, self.telefono = _validar_dni_telefono(self.dni, self.telefono)
        return self


class UsuarioOut(BaseModel):
    id:             int
    usuario:        str
    nombre:         str
    rol:            str
    activo:         bool
    creado_en:      datetime
    dni:            Optional[str] = None
    telefono:       Optional[str] = None
    especialidad:   Optional[str] = None
    hora_entrada:   Optional[str] = None
    dias_laborales: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ActividadOut(BaseModel):
    id:      int
    usuario: Optional[str] = None
    rol:     Optional[str] = None
    accion:  Optional[str] = None
    detalle: Optional[str] = None
    metodo:  Optional[str] = None
    ruta:    Optional[str] = None
    estado:  Optional[int] = None
    fecha:   datetime

    model_config = ConfigDict(from_attributes=True)


class DoctorOut(BaseModel):
    """Versión mínima de un doctor, para selectores (asignar a turno)."""
    id:             int
    nombre:         str
    hora_entrada:   Optional[str] = None
    dias_laborales: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Documentos complementarios de la mascota (radiografías, análisis, etc.)
# ---------------------------------------------------------------------------

class DocumentoOut(BaseModel):
    """Metadatos del documento (sin los bytes; el contenido se baja aparte)."""
    id:           int
    paciente_id:  int
    registro_id:  Optional[int] = None
    historia_id:  Optional[int] = None
    nombre:       str
    categoria:    str
    descripcion:  Optional[str] = None
    mime_type:    Optional[str] = None
    tamano_bytes: int
    subido_por:   Optional[str] = None
    creado_en:    datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Registros complementarios (antiparasitarios, estética)
# ---------------------------------------------------------------------------

class RegistroClinicoCreate(BaseModel):
    tipo:     Literal["antiparasitario", "estetica", "complementario"]
    fecha:    Optional[date] = None
    producto: Optional[str] = None
    notas:    Optional[str] = None


class RegistroClinicoOut(BaseModel):
    id:             int
    paciente_id:    int
    tipo:           str
    fecha:          date
    producto:       Optional[str] = None
    notas:          Optional[str] = None
    registrado_por: Optional[str] = None
    creado_en:      datetime
    documentos:     list[DocumentoOut] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Recetas (tratamiento formal que indica el veterinario)
# ---------------------------------------------------------------------------

class RecetaItem(BaseModel):
    medicamento: Optional[str] = None
    dosis:       Optional[str] = None
    via:         Optional[str] = None
    frecuencia:  Optional[str] = None
    duracion:    Optional[str] = None


class RecetaCreate(BaseModel):
    fecha:        Optional[date] = None
    diagnostico:  Optional[str] = None
    indicaciones: Optional[str] = None
    items:        list[RecetaItem] = []


class RecetaUpdate(BaseModel):
    fecha:        Optional[date] = None
    diagnostico:  Optional[str] = None
    indicaciones: Optional[str] = None
    items:        Optional[list[RecetaItem]] = None


class RecetaOut(BaseModel):
    id:                 int
    paciente_id:        int
    fecha:              date
    diagnostico:        Optional[str] = None
    indicaciones:       Optional[str] = None
    items:              list[RecetaItem] = []
    veterinario_id:     Optional[int] = None
    veterinario_nombre: Optional[str] = None
    creado_en:          datetime
    actualizado_por:    Optional[str] = None
    actualizado_en:     Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Asistencia (control de marcaciones de personal)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Configuración de la clínica (datos que salen en boletas y comprobantes)
# ---------------------------------------------------------------------------

class ConfiguracionOut(BaseModel):
    nombre:          str
    ruc:             Optional[str] = None
    direccion:       Optional[str] = None
    telefono:        Optional[str] = None
    email:           Optional[str] = None
    pie_comprobante: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ConfiguracionUpdate(BaseModel):
    nombre:          Optional[str] = Field(None, min_length=2, max_length=120)
    ruc:             Optional[str] = None
    direccion:       Optional[str] = None
    telefono:        Optional[str] = None
    email:           Optional[str] = None
    pie_comprobante: Optional[str] = None

    @model_validator(mode='after')
    def _validar(self):
        if self.ruc is not None and self.ruc.strip():
            ruc = "".join(ch for ch in self.ruc if ch.isdigit())
            # RUC peruano: 11 dígitos
            if len(ruc) != 11:
                raise ValueError("El RUC debe tener 11 dígitos")
            self.ruc = ruc
        else:
            self.ruc = None
        if self.email is not None and self.email.strip():
            if "@" not in self.email or "." not in self.email.split("@")[-1]:
                raise ValueError("El correo no tiene un formato válido")
            self.email = self.email.strip()
        else:
            self.email = None
        return self


class AsistenciaIngresoReq(BaseModel):
    usuario_id: int
    notas:      Optional[str] = None


class AsistenciaUpdate(BaseModel):
    """Corrección manual de una marcación (solo la recepción).

    Los horarios del personal varían y no siempre se alcanza a marcar en el
    momento exacto: esto permite ajustar la hora real de ingreso o salida sin
    tener que borrar el registro y volver a crearlo.
    """
    hora_ingreso: Optional[datetime] = None
    hora_salida:  Optional[datetime] = None
    notas:        Optional[str] = None

    @model_validator(mode='after')
    def _validar_orden(self):
        if self.hora_ingreso and self.hora_salida and self.hora_salida <= self.hora_ingreso:
            raise ValueError("La hora de salida debe ser posterior a la de ingreso")
        return self


class AsistenciaOut(BaseModel):
    id:                  int
    usuario_id:          int
    usuario_nombre:      Optional[str] = None
    fecha:               date
    hora_ingreso:        Optional[datetime] = None
    hora_salida:         Optional[datetime] = None
    notas:               Optional[str] = None
    registrado_por:      Optional[str] = None
    hora_entrada_perfil: Optional[str] = None   # horario pactado del doctor

    @computed_field
    @property
    def horas_trabajadas(self) -> Optional[float]:
        if self.hora_ingreso and self.hora_salida:
            segundos = (self.hora_salida - self.hora_ingreso).total_seconds()
            return round(segundos / 3600, 2) if segundos > 0 else 0.0
        return None


    @computed_field
    @property
    def tardanza_min(self) -> Optional[int]:
        """Minutos de tardanza respecto al horario pactado (0 = a tiempo)."""
        return calcular_tardanza_min(self.hora_ingreso, self.hora_entrada_perfil)

    model_config = ConfigDict(from_attributes=True)
