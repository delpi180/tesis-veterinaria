"""adjuntar documentos a historia clinica

Revision ID: 4b7339ab0690
Revises: 4543463f3a30
Create Date: 2026-07-28 12:37:22.836852

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b7339ab0690'
down_revision: Union[str, None] = '4543463f3a30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'documentos_paciente',
        sa.Column('historia_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_documentos_paciente_historia_id',
        'documentos_paciente', 'historias_clinicas',
        ['historia_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_documentos_paciente_historia_id',
        'documentos_paciente', ['historia_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_documentos_paciente_historia_id', table_name='documentos_paciente')
    op.drop_constraint('fk_documentos_paciente_historia_id', 'documentos_paciente', type_='foreignkey')
    op.drop_column('documentos_paciente', 'historia_id')
