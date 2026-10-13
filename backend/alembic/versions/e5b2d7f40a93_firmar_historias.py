"""firmar y bloquear la consulta, con notas de corrección

Revision ID: e5b2d7f40a93
Revises: d4a8c1e92b57
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5b2d7f40a93'
down_revision: Union[str, None] = 'd4a8c1e92b57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('historias_clinicas', sa.Column('cerrada_en', sa.DateTime(timezone=True)))
    op.add_column('historias_clinicas', sa.Column('cerrada_por', sa.String(120)))
    op.create_table(
        'addendums_historia',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('historia_id', sa.Integer(),
                  sa.ForeignKey('historias_clinicas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('texto', sa.Text(), nullable=False),
        sa.Column('autor_id', sa.Integer(), sa.ForeignKey('usuarios.id', ondelete='SET NULL')),
        sa.Column('autor_nombre', sa.String(120), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_addendums_historia_historia_id', 'addendums_historia', ['historia_id'])


def downgrade() -> None:
    op.drop_index('ix_addendums_historia_historia_id', table_name='addendums_historia')
    op.drop_table('addendums_historia')
    op.drop_column('historias_clinicas', 'cerrada_por')
    op.drop_column('historias_clinicas', 'cerrada_en')
