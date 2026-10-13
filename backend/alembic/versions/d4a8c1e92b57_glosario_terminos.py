"""glosario de términos propios de la clínica para el dictado

Revision ID: d4a8c1e92b57
Revises: c3f9a71b6d20
Create Date: 2026-10-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a8c1e92b57'
down_revision: Union[str, None] = 'c3f9a71b6d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'glosario_terminos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('termino', sa.String(120), nullable=False, unique=True),
        sa.Column('suena_como', sa.String(300)),
        sa.Column('tipo', sa.String(20), nullable=False, server_default='otro'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('creado_en', sa.DateTime(timezone=True)),
        sa.Column('creado_por', sa.String(50)),
    )


def downgrade() -> None:
    op.drop_table('glosario_terminos')
