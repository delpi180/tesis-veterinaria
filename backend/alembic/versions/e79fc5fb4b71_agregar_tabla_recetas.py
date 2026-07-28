"""agregar tabla recetas

Revision ID: e79fc5fb4b71
Revises: cffc7fa8157c
Create Date: 2026-07-27 17:16:24.560233

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e79fc5fb4b71'
down_revision: Union[str, None] = 'cffc7fa8157c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('recetas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('paciente_id', sa.Integer(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=False),
    sa.Column('diagnostico', sa.Text(), nullable=True),
    sa.Column('indicaciones', sa.Text(), nullable=True),
    sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), nullable=True),
    sa.Column('veterinario_id', sa.Integer(), nullable=True),
    sa.Column('actualizado_por', sa.String(length=50), nullable=True),
    sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['paciente_id'], ['pacientes.id'], ),
    sa.ForeignKeyConstraint(['veterinario_id'], ['usuarios.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('recetas')
