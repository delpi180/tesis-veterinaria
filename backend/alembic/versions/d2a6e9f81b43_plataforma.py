"""panel de plataforma: vencimiento, motivo de suspensión, notas y bitácora del operador

Revision ID: d2a6e9f81b43
Revises: c1f4a8e63d92
Create Date: 2026-10-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2a6e9f81b43'
down_revision: Union[str, None] = 'c1f4a8e63d92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinicas', sa.Column('vence_en', sa.Date()))
    op.add_column('clinicas', sa.Column('suspendida_motivo', sa.String(200)))
    op.add_column('clinicas', sa.Column('suspendida_en', sa.DateTime(timezone=True)))
    op.add_column('clinicas', sa.Column('nota_interna', sa.Text()))
    op.create_table(
        'acciones_plataforma',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('operador', sa.String(50), nullable=False),
        sa.Column('clinica_id', sa.Integer(), sa.ForeignKey('clinicas.id', ondelete='SET NULL')),
        sa.Column('clinica_nombre', sa.String(120)),
        sa.Column('accion', sa.String(30), nullable=False),
        sa.Column('detalle', sa.String(300)),
        sa.Column('fecha', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_acciones_plataforma_clinica_id', 'acciones_plataforma', ['clinica_id'])
    op.create_index('ix_acciones_plataforma_fecha', 'acciones_plataforma', ['fecha'])


def downgrade() -> None:
    op.drop_index('ix_acciones_plataforma_fecha', table_name='acciones_plataforma')
    op.drop_index('ix_acciones_plataforma_clinica_id', table_name='acciones_plataforma')
    op.drop_table('acciones_plataforma')
    for c in ('nota_interna', 'suspendida_en', 'suspendida_motivo', 'vence_en'):
        op.drop_column('clinicas', c)
