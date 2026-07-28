"""adjuntar documento a registro complementario

Revision ID: 61860f80c5f2
Revises: 13ca50689b94
Create Date: 2026-07-27 00:35:14.544704

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '61860f80c5f2'
down_revision: Union[str, None] = '13ca50689b94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'documentos_paciente',
        sa.Column('registro_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_documentos_paciente_registro_id',
        'documentos_paciente', 'registros_clinicos',
        ['registro_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_documentos_paciente_registro_id', 'documentos_paciente', type_='foreignkey')
    op.drop_column('documentos_paciente', 'registro_id')
