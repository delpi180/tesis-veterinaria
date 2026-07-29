"""anular ventas y cierre de caja

Revision ID: d9377e02aa38
Revises: 358e567190fb
Create Date: 2026-07-29 11:01:42.672581

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd9377e02aa38'
down_revision: Union[str, None] = '358e567190fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── Anulación de ventas ──────────────────────────────────────────────────
    # server_default en 'anulada': las ventas que ya existen quedan como NO
    # anuladas. Sin esto, la columna sería NULL en las filas viejas y los
    # filtros "anulada = false" las dejarían fuera de los totales, haciendo
    # desaparecer el historial de ingresos.
    op.add_column('ventas', sa.Column('anulada', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('ventas', sa.Column('anulada_en', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ventas', sa.Column('anulada_por', sa.String(length=50), nullable=True))
    op.add_column('ventas', sa.Column('motivo_anulacion', sa.String(length=200), nullable=True))
    # Se filtra por este campo en todos los totales de caja y reportes.
    op.create_index('ix_ventas_anulada', 'ventas', ['anulada'])

    # ── Cierre de caja (arqueo) ──────────────────────────────────────────────
    op.create_table(
        'cierres_caja',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('efectivo_esperado', sa.Numeric(10, 2), nullable=False),
        sa.Column('efectivo_contado', sa.Numeric(10, 2), nullable=False),
        sa.Column('diferencia', sa.Numeric(10, 2), nullable=False),
        sa.Column('total_dia', sa.Numeric(10, 2), nullable=False),
        sa.Column('num_ventas', sa.Integer(), nullable=False),
        sa.Column('notas', sa.String(length=300), nullable=True),
        sa.Column('cerrado_por', sa.String(length=50), nullable=True),
        sa.Column('cerrado_en', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        # Un solo cierre por día: si se pudiera cerrar dos veces, el arqueo
        # dejaría de ser una constancia y pasaría a ser un borrador editable.
        sa.UniqueConstraint('fecha', name='uq_cierre_caja_fecha'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('cierres_caja')
    op.drop_index('ix_ventas_anulada', table_name='ventas')
    op.drop_column('ventas', 'motivo_anulacion')
    op.drop_column('ventas', 'anulada_por')
    op.drop_column('ventas', 'anulada_en')
    op.drop_column('ventas', 'anulada')
