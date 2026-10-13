"""planilla del personal: sueldo, planillas mensuales y sus líneas

Revision ID: b9e2a5d71c36
Revises: a7d1f4c92e68
Create Date: 2026-10-13 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9e2a5d71c36'
down_revision: Union[str, None] = 'a7d1f4c92e68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('sueldo_base', sa.Numeric(10, 2)))
    op.create_table(
        'planillas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('periodo', sa.String(7), nullable=False, unique=True),
        sa.Column('estado', sa.String(10), nullable=False, server_default='borrador'),
        sa.Column('tolerancia_min', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('dias_mes', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('horas_dia', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('creado_en', sa.DateTime(timezone=True)),
        sa.Column('creado_por', sa.String(50)),
        sa.Column('cerrada_en', sa.DateTime(timezone=True)),
        sa.Column('cerrada_por', sa.String(50)),
    )
    op.create_table(
        'planilla_lineas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('planilla_id', sa.Integer(),
                  sa.ForeignKey('planillas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='SET NULL')),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('rol', sa.String(20)),
        sa.Column('sueldo_base', sa.Numeric(10, 2), nullable=False),
        sa.Column('minutos_auto', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('faltas_auto', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('minutos_tardanza', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('faltas', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sin_horario', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('bonos', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('adelantos', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('otros_descuentos', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('nota', sa.String(200)),
    )
    op.create_index('ix_planilla_lineas_planilla_id', 'planilla_lineas', ['planilla_id'])


def downgrade() -> None:
    op.drop_index('ix_planilla_lineas_planilla_id', table_name='planilla_lineas')
    op.drop_table('planilla_lineas')
    op.drop_table('planillas')
    op.drop_column('usuarios', 'sueldo_base')
