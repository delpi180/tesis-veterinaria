"""configuracion de clinica

Revision ID: 4543463f3a30
Revises: 74f98e9ba71c
Create Date: 2026-07-28 00:30:54.520188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4543463f3a30'
down_revision: Union[str, None] = '74f98e9ba71c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'configuracion_clinica',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('ruc', sa.String(length=20), nullable=True),
        sa.Column('direccion', sa.String(length=200), nullable=True),
        sa.Column('telefono', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('pie_comprobante', sa.String(length=200), nullable=True),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actualizado_por', sa.String(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    # Fila inicial con los datos actuales, para que nada cambie al desplegar.
    op.execute(
        "INSERT INTO configuracion_clinica (id, nombre, pie_comprobante) "
        "VALUES (1, 'Veterinaria Los Pinos', 'Gracias por su preferencia')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('configuracion_clinica')
