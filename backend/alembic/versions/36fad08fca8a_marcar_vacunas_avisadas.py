"""marcar vacunas avisadas

Revision ID: 36fad08fca8a
Revises: 4b7339ab0690
Create Date: 2026-07-28 19:26:13.588846

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36fad08fca8a'
down_revision: Union[str, None] = '4b7339ab0690'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'vacunas_avisadas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('paciente_id', sa.Integer(), nullable=False),
        sa.Column('vacuna', sa.String(length=150), nullable=False),
        sa.Column('proxima_dosis', sa.String(length=60), nullable=False),
        sa.Column('avisado_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('avisado_por', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['paciente_id'], ['pacientes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('paciente_id', 'vacuna', 'proxima_dosis', name='uq_vacuna_avisada'),
    )
    op.create_index('ix_vacunas_avisadas_paciente_id', 'vacunas_avisadas', ['paciente_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_vacunas_avisadas_paciente_id', table_name='vacunas_avisadas')
    op.drop_table('vacunas_avisadas')
