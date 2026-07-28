"""trazabilidad de turnos: creado_por actualizado_por actualizado_en

Revision ID: cffc7fa8157c
Revises: d17a96a71d4d
Create Date: 2026-07-27 02:51:24.891643

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cffc7fa8157c'
down_revision: Union[str, None] = 'd17a96a71d4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('citas', sa.Column('creado_por', sa.String(length=50), nullable=True))
    op.add_column('citas', sa.Column('actualizado_por', sa.String(length=50), nullable=True))
    op.add_column('citas', sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('citas', 'actualizado_en')
    op.drop_column('citas', 'actualizado_por')
    op.drop_column('citas', 'creado_por')
