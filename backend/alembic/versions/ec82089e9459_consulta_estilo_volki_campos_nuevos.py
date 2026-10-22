"""consulta estilo Volki: veces al día, libre demanda, observaciones y productos aplicados

Revision ID: ec82089e9459
Revises: c3f9a71b6d20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'ec82089e9459'
down_revision: Union[str, None] = 'c3f9a71b6d20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('historias_clinicas', sa.Column('alimentacion_veces_dia', sa.Integer(), nullable=True))
    op.add_column('historias_clinicas', sa.Column('alimentacion_libre_demanda', sa.Boolean(), nullable=True))
    op.add_column('historias_clinicas', sa.Column('observaciones', sa.Text(), nullable=True))
    op.add_column('historias_clinicas', sa.Column('productos_aplicados', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('historias_clinicas', 'productos_aplicados')
    op.drop_column('historias_clinicas', 'observaciones')
    op.drop_column('historias_clinicas', 'alimentacion_libre_demanda')
    op.drop_column('historias_clinicas', 'alimentacion_veces_dia')
