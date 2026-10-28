"""enlace privado al carnet de vacunas de la mascota

Revision ID: c9a3d71e5b24
Revises: b7e2c4a91f08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9a3d71e5b24'
down_revision: Union[str, None] = 'b7e2c4a91f08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pacientes', sa.Column('carnet_token', sa.String(length=40), nullable=True))
    op.create_index('ix_pacientes_carnet_token', 'pacientes', ['carnet_token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_pacientes_carnet_token', table_name='pacientes')
    op.drop_column('pacientes', 'carnet_token')
