"""vencimiento y lote en productos

Revision ID: 5429de010a6d
Revises: d9377e02aa38
Create Date: 2026-07-29 19:17:26.854987

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5429de010a6d'
down_revision: Union[str, None] = 'd9377e02aa38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Ambas quedan NULL en los productos existentes: NULL significa "no aplica
    # o no se cargó", nunca "vencido". Un accesorio o un alimento sin fecha no
    # debe empezar a dar alertas.
    op.add_column('productos', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))
    op.add_column('productos', sa.Column('lote', sa.String(length=50), nullable=True))
    # Se consulta "qué vence pronto" ordenando por esta columna.
    op.create_index('ix_productos_fecha_vencimiento', 'productos', ['fecha_vencimiento'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_productos_fecha_vencimiento', table_name='productos')
    op.drop_column('productos', 'lote')
    op.drop_column('productos', 'fecha_vencimiento')
