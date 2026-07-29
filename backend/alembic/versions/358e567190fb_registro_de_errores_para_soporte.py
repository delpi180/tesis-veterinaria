"""registro de errores para soporte

Revision ID: 358e567190fb
Revises: 36fad08fca8a
Create Date: 2026-07-29 02:10:00.465224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '358e567190fb'
down_revision: Union[str, None] = '36fad08fca8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'errores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('origen', sa.String(length=10), nullable=False),
        sa.Column('mensaje', sa.String(length=500), nullable=False),
        sa.Column('detalle', sa.Text(), nullable=True),
        sa.Column('ruta', sa.String(length=300), nullable=True),
        sa.Column('usuario', sa.String(length=50), nullable=True),
        sa.Column('rol', sa.String(length=20), nullable=True),
        sa.Column('navegador', sa.String(length=300), nullable=True),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=True),
        sa.Column('huella', sa.String(length=64), nullable=True),
        sa.Column('veces', sa.Integer(), nullable=True),
        sa.Column('visto', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    # Se busca por huella en cada error nuevo (para agrupar repetidos) y se
    # lista por fecha descendente: ambos merecen índice.
    op.create_index('ix_errores_huella', 'errores', ['huella'])
    op.create_index('ix_errores_fecha', 'errores', ['fecha'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_errores_fecha', table_name='errores')
    op.drop_index('ix_errores_huella', table_name='errores')
    op.drop_table('errores')
