"""perfil de doctor: dni telefono especialidad

Revision ID: d17a96a71d4d
Revises: 61860f80c5f2
Create Date: 2026-07-27 01:20:17.474895

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd17a96a71d4d'
down_revision: Union[str, None] = '61860f80c5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('usuarios', sa.Column('dni', sa.String(length=15), nullable=True))
    op.add_column('usuarios', sa.Column('telefono', sa.String(length=20), nullable=True))
    op.add_column('usuarios', sa.Column('especialidad', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('usuarios', 'especialidad')
    op.drop_column('usuarios', 'telefono')
    op.drop_column('usuarios', 'dni')
