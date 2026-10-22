"""etiquetas de clientes y datos de registro/estado de la mascota

Revision ID: a1d4e7c9b352
Revises: ec82089e9459
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1d4e7c9b352'
down_revision: Union[str, None] = 'ec82089e9459'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'etiquetas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(length=40), nullable=False),
        sa.Column('color', sa.String(length=20), nullable=True),
        sa.UniqueConstraint('nombre', name='uq_etiquetas_nombre'),
    )
    op.create_table(
        'cliente_etiquetas',
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('etiqueta_id', sa.Integer(), sa.ForeignKey('etiquetas.id', ondelete='CASCADE'), primary_key=True),
    )
    # Mascotas: las que ya existen quedan activas y sin dato de quién/cuándo
    op.add_column('pacientes', sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.add_column('pacientes', sa.Column('creado_en', sa.DateTime(timezone=True), nullable=True))
    op.add_column('pacientes', sa.Column('registrado_por', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('pacientes', 'registrado_por')
    op.drop_column('pacientes', 'creado_en')
    op.drop_column('pacientes', 'activo')
    op.drop_table('cliente_etiquetas')
    op.drop_table('etiquetas')
