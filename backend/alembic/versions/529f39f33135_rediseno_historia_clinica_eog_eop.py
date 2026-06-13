"""rediseno_historia_clinica_eog_eop

Revision ID: 529f39f33135
Revises: b1c2d3e4f5a6
Create Date: 2026-06-11

SOLO TOCA: historias_clinicas
NO TOCA: clientes, pacientes, citas, evaluadores, respuestas_sus, respuestas_tam
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '529f39f33135'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.drop_table('historias_clinicas')

    op.create_table(
        'historias_clinicas',
        sa.Column('id',          sa.Integer(),  primary_key=True),
        sa.Column('paciente_id', sa.Integer(),  sa.ForeignKey('pacientes.id'), nullable=False),
        sa.Column('fecha',       sa.DateTime(timezone=True)),

        # ANAMNESIS
        sa.Column('motivo_consulta',          sa.Text()),
        sa.Column('tiempo_evolucion',         sa.String(100)),
        sa.Column('derivado_por',             sa.String(150)),
        sa.Column('detalle',                  sa.Text()),
        sa.Column('alimentacion_tipo',        sa.String(150)),
        sa.Column('alimentacion_cantidad_gr', sa.Integer()),
        sa.Column('antecedentes',             sa.Text()),
        sa.Column('tipo_consulta',            sa.String(50)),

        # EOG
        sa.Column('temperatura_c',           sa.Numeric(4, 1)),
        sa.Column('peso_kg',                 sa.Numeric(5, 2)),
        sa.Column('frecuencia_cardiaca',     sa.Integer()),
        sa.Column('frecuencia_respiratoria', sa.Integer()),
        sa.Column('condicion_corporal',      sa.Integer()),
        sa.Column('mucosas',                 sa.String(50)),
        sa.Column('tllc',                    sa.String(50)),
        sa.Column('estado_sensorio',         sa.String(50)),
        sa.Column('hidratacion',             sa.String(50)),
        sa.Column('pulso',                   sa.String(50)),
        sa.Column('linfonodulos',            sa.Text()),

        # EOP
        sa.Column('examen_particular', JSONB),

        # DIAGNÓSTICO
        sa.Column('diagnostico_presuntivo',     sa.Text()),
        sa.Column('diagnosticos_diferenciales', sa.Text()),
        sa.Column('diagnostico_definitivo',     sa.Text()),

        # PLAN
        sa.Column('examenes_solicitados', sa.Text()),
        sa.Column('tratamiento_items',    JSONB),
        sa.Column('vacunas_items',        JSONB),
        sa.Column('indicaciones',         sa.Text()),
        sa.Column('pronostico',           sa.String(50)),
        sa.Column('proxima_cita',         sa.DateTime(timezone=True)),

        # IA / auditoría
        sa.Column('transcripcion', sa.Text()),
        sa.Column('datos_ia',      JSONB),
        sa.Column('creado_en',     sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table('historias_clinicas')

    op.create_table(
        'historias_clinicas',
        sa.Column('id',          sa.Integer(),  primary_key=True),
        sa.Column('paciente_id', sa.Integer(),  sa.ForeignKey('pacientes.id'), nullable=False),
        sa.Column('fecha',       sa.DateTime(timezone=True)),
        sa.Column('motivo_consulta',           sa.Text()),
        sa.Column('tipo_consulta',             sa.String(50)),
        sa.Column('anamnesis_remota',          sa.Text()),
        sa.Column('anamnesis_actual',          sa.Text()),
        sa.Column('peso_kg',                   sa.Numeric(5, 2)),
        sa.Column('temperatura_c',             sa.Numeric(4, 1)),
        sa.Column('frecuencia_cardiaca',       sa.Integer()),
        sa.Column('frecuencia_respiratoria',   sa.Integer()),
        sa.Column('condicion_corporal',        sa.Integer()),
        sa.Column('estado_hidratacion',        sa.String(100)),
        sa.Column('mucosas',                   sa.String(100)),
        sa.Column('trc_segundos',              sa.Numeric(3, 1)),
        sa.Column('linfonodulos',              sa.String(100)),
        sa.Column('examen_sistemas',           JSONB),
        sa.Column('lista_problemas',           sa.Text()),
        sa.Column('diagnostico_presuntivo',    sa.Text()),
        sa.Column('diagnosticos_diferenciales',sa.Text()),
        sa.Column('diagnostico_definitivo',    sa.Text()),
        sa.Column('examenes_solicitados',      sa.Text()),
        sa.Column('tratamiento',               sa.Text()),
        sa.Column('indicaciones',              sa.Text()),
        sa.Column('pronostico',                sa.String(50)),
        sa.Column('proxima_cita',              sa.DateTime(timezone=True)),
        sa.Column('transcripcion',             sa.Text()),
        sa.Column('datos_ia',                  JSONB),
        sa.Column('creado_en',                 sa.DateTime(timezone=True)),
    )
