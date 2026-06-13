"""ampliar estado_hidratacion varchar 20 -> 100

Revision ID: b1c2d3e4f5a6
Revises: a3f7d8c0e21b
Create Date: 2026-06-11

Solo toca: historias_clinicas.estado_hidratacion
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a3f7d8c0e21b'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'historias_clinicas',
        'estado_hidratacion',
        existing_type=sa.String(20),
        type_=sa.String(100),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        'historias_clinicas',
        'estado_hidratacion',
        existing_type=sa.String(100),
        type_=sa.String(20),
        existing_nullable=True,
    )
