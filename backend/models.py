from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id        = Column(Integer, primary_key=True, index=True)
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

    id         = Column(Integer, primary_key=True, index=True)
    nombre     = Column(String(100), nullable=False)
    especie    = Column(String(50),  nullable=False)
    raza       = Column(String(100))
    edad       = Column(Integer)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)

    cliente  = relationship("Cliente", back_populates="pacientes")
    historias = relationship(
        "HistoriaClinica",
        back_populates="paciente",
        cascade="all, delete-orphan",
    )


class HistoriaClinica(Base):
    __tablename__ = "historias_clinicas"

    id           = Column(Integer, primary_key=True, index=True)
    paciente_id  = Column(Integer, ForeignKey("pacientes.id"), nullable=False)
    fecha        = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    anamnesis    = Column(Text)
    examen_fisico = Column(Text)
    diagnostico  = Column(Text)
    tratamiento  = Column(Text)

    paciente = relationship("Paciente", back_populates="historias")
