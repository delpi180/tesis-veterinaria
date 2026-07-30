"""firmado_por: conservar el autor al borrar una cuenta

Revision ID: 72af977dfee4
Revises: 5429de010a6d
Create Date: 2026-07-30 10:11:33.491186

NOTA para quien regenere migraciones acá: `alembic revision --autogenerate`
propone borrar TODOS los índices de la base, porque se crearon en migraciones
anteriores y no están declarados con `index=True` en models.py. No son
sobrantes: son los índices de claves foráneas que sostienen el rendimiento de
la aplicación. Hay que quitar esos `drop_index` a mano, como se hizo aquí.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '72af977dfee4'
down_revision: Union[str, None] = '5429de010a6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nombre del veterinario copiado en el momento de borrar su cuenta. Una
    # historia clínica o una receta no pueden quedar sin autor porque esa
    # persona ya no trabaje en la clínica; mientras la cuenta exista el nombre
    # se sigue leyendo de ella (así un cambio de nombre se refleja solo).
    op.add_column('historias_clinicas', sa.Column('firmado_por', sa.String(length=120), nullable=True))
    op.add_column('recetas', sa.Column('firmado_por', sa.String(length=120), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('recetas', 'firmado_por')
    op.drop_column('historias_clinicas', 'firmado_por')
