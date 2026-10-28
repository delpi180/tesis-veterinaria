"""aviso de recordatorio en las citas

Revision ID: b7e2c4a91f08
Revises: a1d4e7c9b352
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7e2c4a91f08'
down_revision: Union[str, None] = 'a1d4e7c9b352'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('citas', sa.Column('recordado_en', sa.DateTime(timezone=True), nullable=True))
    op.add_column('citas', sa.Column('recordado_por', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('citas', 'recordado_por')
    op.drop_column('citas', 'recordado_en')
