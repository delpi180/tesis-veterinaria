"""enlazar el tratamiento con el inventario y la venta con la mascota

El medicamento indicado era un texto suelto: 36 nombres distintos escritos a
mano para 39 ítems, ninguno atado al producto que la clínica vende. Así no se
puede avisar de un vencimiento al recetar ni saber si el dueño se llevó lo
indicado.

Revision ID: c3f9a71b6d20
Revises: b8d2e5a13c47
Create Date: 2026-08-06 09:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f9a71b6d20'
down_revision: Union[str, None] = 'b8d2e5a13c47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tratamientos', sa.Column('producto_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_tratamientos_producto', 'tratamientos', 'productos', ['producto_id'], ['id'],
    )

    # A qué mascota se le entregó lo comprado. Nullable: la comida y los
    # accesorios son del dueño, no de un animal concreto.
    op.add_column('ventas', sa.Column('paciente_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_ventas_paciente', 'ventas', 'pacientes', ['paciente_id'], ['id'],
    )
    op.create_index('ix_ventas_paciente_id', 'ventas', ['paciente_id'])


def downgrade() -> None:
    op.drop_index('ix_ventas_paciente_id', table_name='ventas')
    op.drop_constraint('fk_ventas_paciente', 'ventas', type_='foreignkey')
    op.drop_column('ventas', 'paciente_id')
    op.drop_constraint('fk_tratamientos_producto', 'tratamientos', type_='foreignkey')
    op.drop_column('tratamientos', 'producto_id')
