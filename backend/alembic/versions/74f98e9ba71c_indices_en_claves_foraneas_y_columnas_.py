"""indices en claves foraneas y columnas de filtro

Revision ID: 74f98e9ba71c
Revises: e79fc5fb4b71
Create Date: 2026-07-27 19:26:12.881536

PostgreSQL NO crea indices automaticamente para las claves foraneas: solo la
clave primaria queda indexada. Sin estos indices, cada "traer los pacientes de
este dueno", "las historias de este doctor" o "los turnos de este mes" obliga
a Postgres a leer la tabla entera (Seq Scan). Con pocos registros no se nota,
pero el costo crece de forma lineal con los datos de la clinica.

Se indexan las columnas por las que el sistema realmente filtra y ordena.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '74f98e9ba71c'
down_revision: Union[str, None] = 'e79fc5fb4b71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (nombre_indice, tabla, [columnas])
INDICES = [
    # Ficha del cliente -> sus mascotas
    ("ix_pacientes_cliente_id",        "pacientes",              ["cliente_id"]),
    # Historia clinica del paciente / perfil del doctor
    ("ix_historias_paciente_id",       "historias_clinicas",     ["paciente_id"]),
    ("ix_historias_veterinario_id",    "historias_clinicas",     ["veterinario_id"]),
    # Agenda: por paciente, por doctor y por rango de fechas
    ("ix_citas_paciente_id",           "citas",                  ["paciente_id"]),
    ("ix_citas_veterinario_id",        "citas",                  ["veterinario_id"]),
    ("ix_citas_fecha_hora",            "citas",                  ["fecha_hora"]),
    # Adjuntos y registros complementarios de la mascota
    ("ix_documentos_paciente_id",      "documentos_paciente",    ["paciente_id"]),
    ("ix_documentos_registro_id",      "documentos_paciente",    ["registro_id"]),
    ("ix_registros_paciente_id",       "registros_clinicos",     ["paciente_id"]),
    ("ix_recetas_paciente_id",         "recetas",                ["paciente_id"]),
    ("ix_recetas_veterinario_id",      "recetas",                ["veterinario_id"]),
    # Control de asistencia (reporte por doctor y por rango de fechas)
    ("ix_asistencias_usuario_id",      "asistencias",            ["usuario_id"]),
    ("ix_asistencias_fecha",           "asistencias",            ["fecha"]),
    # Bitacora: se ordena por fecha desc y se filtra por usuario
    ("ix_actividades_fecha",           "actividades",            ["fecha"]),
    ("ix_actividades_usuario",         "actividades",            ["usuario"]),
    # Ventas y kardex
    ("ix_ventas_cliente_id",           "ventas",                 ["cliente_id"]),
    ("ix_ventas_fecha",                "ventas",                 ["fecha"]),
    ("ix_venta_items_venta_id",        "venta_items",            ["venta_id"]),
    ("ix_movimientos_producto_id",     "movimientos_inventario", ["producto_id"]),
    # Encuestas de la tesis
    ("ix_respuestas_sus_evaluador_id", "respuestas_sus",         ["evaluador_id"]),
    ("ix_respuestas_tam_evaluador_id", "respuestas_tam",         ["evaluador_id"]),
]


def upgrade() -> None:
    """Upgrade schema."""
    for nombre, tabla, columnas in INDICES:
        op.create_index(nombre, tabla, columnas, if_not_exists=True)


def downgrade() -> None:
    """Downgrade schema."""
    for nombre, tabla, _ in reversed(INDICES):
        op.drop_index(nombre, table_name=tabla, if_exists=True)
