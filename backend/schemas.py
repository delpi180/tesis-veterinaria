from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Historia Clínica
# ---------------------------------------------------------------------------

class HistoriaClinicaBase(BaseModel):
    anamnesis:     Optional[str] = None
    examen_fisico: Optional[str] = None
    diagnostico:   Optional[str] = None
    tratamiento:   Optional[str] = None


class HistoriaClinicaCreate(HistoriaClinicaBase):
    pass


class HistoriaClinicaOut(HistoriaClinicaBase):
    id:          int
    paciente_id: int
    fecha:       datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Paciente
# ---------------------------------------------------------------------------

class PacienteBase(BaseModel):
    nombre:  str
    especie: str
    raza:    Optional[str] = None
    edad:    Optional[int] = None


class PacienteCreate(PacienteBase):
    pass


class PacienteOut(PacienteBase):
    id:         int
    cliente_id: int
    historias:  list[HistoriaClinicaOut] = []

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


class ClienteOut(ClienteBase):
    id:        int
    pacientes: list[PacienteSummary] = []

    model_config = ConfigDict(from_attributes=True)
