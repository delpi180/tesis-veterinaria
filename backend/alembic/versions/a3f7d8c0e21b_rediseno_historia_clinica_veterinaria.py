"""rediseno historia clinica veterinaria

Revision ID: a3f7d8c0e21b
Revises: 9bf6957b70e0
Create Date: 2026-06-10 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3f7d8c0e21b'
down_revision: Union[str, None] = '9bf6957b70e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop y recreacion completa de historias_clinicas con modelo veterinario
    estructurado. Las 3 filas existentes son datos de prueba y se descartan.

    SOLO TOCA: historias_clinicas
    NO TOCA:   clientes, pacientes, citas, evaluadores,
               respuestas_sus, respuestas_tam
    """
    op.drop_table('historias_clinicas')

    op.create_table(
        'historias_clinicas',

        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('paciente_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=True),

        # 1. Motivo
        sa.Column('motivo_consulta', sa.Text(), nullable=True),
        sa.Column('tipo_consulta', sa.String(length=50), nullable=True),

        # 2. Anamnesis
        sa.Column('anamnesis_remota', sa.Text(), nullable=True),
        sa.Column('anamnesis_actual', sa.Text(), nullable=True),

        # 3. Constantes fisiologicas (TPR) y examen general
        sa.Column('peso_kg', sa.Numeric(5, 2), nullable=True),
        sa.Column('temperatura_c', sa.Numeric(4, 1), nullable=True),
        sa.Column('frecuencia_cardiaca', sa.Integer(), nullable=True),
        sa.Column('frecuencia_respiratoria', sa.Integer(), nullable=True),
        sa.Column('condicion_corporal', sa.Integer(), nullable=True),
        sa.Column('estado_hidratacion', sa.String(length=20), nullable=True),
        sa.Column('mucosas', sa.String(length=100), nullable=True),
        sa.Column('trc_segundos', sa.Numeric(3, 1), nullable=True),
        sa.Column('linfonodulos', sa.String(length=100), nullable=True),

        # 4. Examen por sistemas (JSONB)
        sa.Column('examen_sistemas',
                  postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        # 5. Diagnostico
        sa.Column('lista_problemas', sa.Text(), nullable=True),
        sa.Column('diagnostico_presuntivo', sa.Text(), nullable=True),
        sa.Column('diagnosticos_diferenciales', sa.Text(), nullable=True),
        sa.Column('diagnostico_definitivo', sa.Text(), nullable=True),

        # 6. Examenes complementarios
        sa.Column('examenes_solicitados', sa.Text(), nullable=True),

        # 7. Plan / tratamiento
        sa.Column('tratamiento', sa.Text(), nullable=True),
        sa.Column('indicaciones', sa.Text(), nullable=True),
        sa.Column('pronostico', sa.String(length=50), nullable=True),
        sa.Column('proxima_cita', sa.DateTime(timezone=True), nullable=True),

        # Pipeline IA / auditoria
        sa.Column('transcripcion', sa.Text(), nullable=True),
        sa.Column('datos_ia',
                  postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=True),

        sa.ForeignKeyConstraint(['paciente_id'], ['pacientes.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Restaura historias_clinicas a la version anterior con 4 campos de texto."""
    op.drop_table('historias_clinicas')

    op.create_table(
        'historias_clinicas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('paciente_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=True),
        sa.Column('anamnesis', sa.Text(), nullable=True),
        sa.Column('examen_fisico', sa.Text(), nullable=True),
        sa.Column('diagnostico', sa.Text(), nullable=True),
        sa.Column('tratamiento', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['paciente_id'], ['pacientes.id']),
        sa.PrimaryKeyConstraint('id'),
    )
