"""tiempos de grabación y de procesamiento del registro con IA

Revision ID: f6c3e8a15d04
Revises: e5b2d7f40a93
Create Date: 2026-10-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6c3e8a15d04'
down_revision: Union[str, None] = 'e5b2d7f40a93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('historias_clinicas', sa.Column('segundos_grabacion', sa.Integer()))
    op.add_column('historias_clinicas', sa.Column('segundos_procesamiento', sa.Integer()))


def downgrade() -> None:
    op.drop_column('historias_clinicas', 'segundos_procesamiento')
    op.drop_column('historias_clinicas', 'segundos_grabacion')
