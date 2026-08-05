"""tabla de tratamientos para poder seguirlos

El tratamiento vivía como JSON dentro de la historia clínica: bien como
documento del día, inservible para preguntar qué mascotas están medicadas hoy
o cuáles terminan esta semana. Esta tabla es la capa operativa; la historia
sigue siendo la fuente de lo indicado.

Revision ID: b8d2e5a13c47
Revises: a1c4f7b90e21
Create Date: 2026-08-06 08:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8d2e5a13c47'
down_revision: Union[str, None] = 'a1c4f7b90e21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tratamientos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('paciente_id', sa.Integer(), nullable=False),
        sa.Column('historia_id', sa.Integer(), nullable=True),
        sa.Column('medicamento', sa.String(length=200), nullable=False),
        sa.Column('dosis', sa.String(length=100), nullable=True),
        sa.Column('via', sa.String(length=60), nullable=True),
        sa.Column('frecuencia', sa.String(length=100), nullable=True),
        sa.Column('dias', sa.Integer(), nullable=True),
        sa.Column('inicio', sa.Date(), nullable=False),
        sa.Column('fin', sa.Date(), nullable=True),
        sa.Column('estado', sa.String(length=20), nullable=False, server_default='en_curso'),
        sa.Column('motivo_corte', sa.String(length=200), nullable=True),
        sa.Column('cerrado_por', sa.String(length=50), nullable=True),
        sa.Column('cerrado_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('veterinario_id', sa.Integer(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['paciente_id'], ['pacientes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['historia_id'], ['historias_clinicas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['veterinario_id'], ['usuarios.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tratamientos_paciente_id'), 'tratamientos', ['paciente_id'])
    op.create_index(op.f('ix_tratamientos_historia_id'), 'tratamientos', ['historia_id'])
    # Se consulta casi siempre por ventana de fechas ("qué termina esta semana").
    op.create_index('ix_tratamientos_fin', 'tratamientos', ['fin'])


def downgrade() -> None:
    op.drop_index('ix_tratamientos_fin', table_name='tratamientos')
    op.drop_index(op.f('ix_tratamientos_historia_id'), table_name='tratamientos')
    op.drop_index(op.f('ix_tratamientos_paciente_id'), table_name='tratamientos')
    op.drop_table('tratamientos')
