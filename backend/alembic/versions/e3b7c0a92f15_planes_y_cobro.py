"""planes con límites, uso mensual de IA, libro de pagos y solicitudes de plan

Los planes y sus valores iniciales son EJEMPLOS para arrancar: se editan desde el
panel del operador. La clínica 1 (la veterinaria original) ya está en 'fundadora',
que no tiene límites.

Revision ID: e3b7c0a92f15
Revises: d2a6e9f81b43
Create Date: 2026-10-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3b7c0a92f15'
down_revision: Union[str, None] = 'd2a6e9f81b43'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# codigo, nombre, descripcion, precio, usuarios, mascotas, MB, IA/mes, planilla, contactos, publico, orden
PLANES = [
    ('prueba',      'Prueba',      'Para conocer el sistema',                  0,   3,    150,   200,   40, True,  True,  False, 0),
    ('basico',      'Básico',      'Una clínica pequeña',                     79,   3,   1500,  1000,  300, False, True,  True,  1),
    ('profesional', 'Profesional', 'Equipo completo, sin preocuparse',       149,  10,  10000, 10000, 1500, True,  True,  True,  2),
    ('fundadora',   'Fundadora',   'Primeras clínicas: sin límites',           0, None,  None,  None, None, True,  True,  False, 3),
    ('plataforma',  'Plataforma',  'Interno (operadores)',                     0, None,  None,  None, None, True,  True,  False, 9),
]


def upgrade() -> None:
    planes = op.create_table(
        'planes',
        sa.Column('codigo', sa.String(20), primary_key=True),
        sa.Column('nombre', sa.String(60), nullable=False),
        sa.Column('descripcion', sa.String(200)),
        sa.Column('precio_mensual', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('moneda', sa.String(3), nullable=False, server_default='PEN'),
        sa.Column('max_usuarios', sa.Integer()),
        sa.Column('max_mascotas', sa.Integer()),
        sa.Column('max_almacenamiento_mb', sa.Integer()),
        sa.Column('max_ia_mes', sa.Integer()),
        sa.Column('incluye_planilla', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('incluye_contactos', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('publico', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
    )
    op.bulk_insert(planes, [
        dict(codigo=c, nombre=n, descripcion=d, precio_mensual=p, max_usuarios=u, max_mascotas=m,
             max_almacenamiento_mb=mb, max_ia_mes=ia, incluye_planilla=pl, incluye_contactos=co,
             publico=pub, orden=o)
        for c, n, d, p, u, m, mb, ia, pl, co, pub, o in PLANES
    ])

    op.create_table(
        'uso_mensual',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clinica_id', sa.Integer(), sa.ForeignKey('clinicas.id'), nullable=False, server_default='1'),
        sa.Column('periodo', sa.String(7), nullable=False),
        sa.Column('ia_usos', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('clinica_id', 'periodo', name='uq_uso_clinica_periodo'),
    )
    op.create_index('ix_uso_mensual_clinica_id', 'uso_mensual', ['clinica_id'])

    op.create_table(
        'pagos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clinica_id', sa.Integer(), sa.ForeignKey('clinicas.id'), nullable=False, server_default='1'),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('monto', sa.Numeric(10, 2), nullable=False),
        sa.Column('moneda', sa.String(3), nullable=False, server_default='PEN'),
        sa.Column('meses', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('periodo_desde', sa.Date(), nullable=False),
        sa.Column('periodo_hasta', sa.Date(), nullable=False),
        sa.Column('metodo', sa.String(20), nullable=False),
        sa.Column('referencia', sa.String(100)),
        sa.Column('nota', sa.String(300)),
        sa.Column('registrado_por', sa.String(50)),
        sa.Column('creado_en', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_pagos_clinica_id', 'pagos', ['clinica_id'])
    op.create_index('ix_pagos_creado_en', 'pagos', ['creado_en'])
    op.create_index('uq_pago_metodo_referencia', 'pagos', ['metodo', 'referencia'], unique=True,
                    postgresql_where=sa.text('referencia IS NOT NULL'))

    op.create_table(
        'solicitudes_plan',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('clinica_id', sa.Integer(), sa.ForeignKey('clinicas.id'), nullable=False, server_default='1'),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('mensaje', sa.String(500)),
        sa.Column('estado', sa.String(10), nullable=False, server_default='pendiente'),
        sa.Column('creada_por', sa.String(50)),
        sa.Column('creada_en', sa.DateTime(timezone=True)),
        sa.Column('atendida_por', sa.String(50)),
        sa.Column('atendida_en', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_solicitudes_plan_clinica_id', 'solicitudes_plan', ['clinica_id'])


def downgrade() -> None:
    op.drop_index('ix_solicitudes_plan_clinica_id', table_name='solicitudes_plan')
    op.drop_table('solicitudes_plan')
    op.drop_index('uq_pago_metodo_referencia', table_name='pagos')
    op.drop_index('ix_pagos_creado_en', table_name='pagos')
    op.drop_index('ix_pagos_clinica_id', table_name='pagos')
    op.drop_table('pagos')
    op.drop_index('ix_uso_mensual_clinica_id', table_name='uso_mensual')
    op.drop_table('uso_mensual')
    op.drop_table('planes')
