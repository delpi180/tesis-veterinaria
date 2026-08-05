"""seguimiento de desparasitacion y avisos por tipo

Desparasitar es lo más recurrente de una clínica y era lo único del sistema
sin fecha de vencimiento: quedaba anotado que se hizo y nadie se enteraba
cuándo tocaba repetirlo. Se agrega `proxima_fecha` al registro clínico y un
`tipo` al aviso, para que la desparasitación entre en la misma bandeja de
pendientes que las vacunas sin compartir el "ya avisé" con ellas.

Revision ID: a1c4f7b90e21
Revises: 72af977dfee4
Create Date: 2026-08-06 07:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c4f7b90e21'
down_revision: Union[str, None] = '72af977dfee4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('registros_clinicos', sa.Column('proxima_fecha', sa.Date(), nullable=True))

    op.add_column(
        'vacunas_avisadas',
        sa.Column('tipo', sa.String(length=20), nullable=False, server_default='vacuna'),
    )
    # La unicidad pasa a incluir el tipo: un antiparasitario y una vacuna que
    # se llamaran igual son dos avisos distintos.
    op.drop_constraint('uq_vacuna_avisada', 'vacunas_avisadas', type_='unique')
    op.create_unique_constraint(
        'uq_vacuna_avisada', 'vacunas_avisadas',
        ['paciente_id', 'vacuna', 'proxima_dosis', 'tipo'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_vacuna_avisada', 'vacunas_avisadas', type_='unique')
    op.create_unique_constraint(
        'uq_vacuna_avisada', 'vacunas_avisadas',
        ['paciente_id', 'vacuna', 'proxima_dosis'],
    )
    op.drop_column('vacunas_avisadas', 'tipo')
    op.drop_column('registros_clinicos', 'proxima_fecha')
