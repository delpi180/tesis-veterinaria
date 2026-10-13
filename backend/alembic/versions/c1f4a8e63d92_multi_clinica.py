"""multi-clínica: cada fila pertenece a una clínica

Convierte el sistema de una sola veterinaria en un SaaS. Todo lo que ya existe
pasa a la clínica 1 (la veterinaria actual); desde aquí cada tabla lleva su
`clinica_id` y las claves únicas (DNI de cliente, código de producto, cierre de
caja del día…) pasan a ser únicas POR clínica y no globales.

Revision ID: c1f4a8e63d92
Revises: b9e2a5d71c36
Create Date: 2026-10-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1f4a8e63d92'
down_revision: Union[str, None] = 'b9e2a5d71c36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tablas que pertenecen a una clínica (modelos con TenantMixin)
TABLAS = [
    'usuarios', 'clientes', 'pacientes', 'tratamientos', 'documentos_paciente',
    'registros_clinicos', 'recetas', 'historias_clinicas', 'citas', 'actividades',
    'asistencias', 'productos', 'servicios', 'ventas', 'cierres_caja',
    'movimientos_inventario', 'venta_items', 'configuracion_clinica',
    'vacunas_avisadas', 'glosario_terminos', 'addendums_historia',
    'contactos_cliente', 'plantillas_contacto', 'planillas', 'planilla_lineas',
]

# (tabla, columnas, nombre de la nueva única por clínica)
UNICAS = [
    ('clientes',          ['dni'],     'uq_clientes_clinica_dni'),
    ('productos',         ['codigo'],  None),     # sin única nueva: se valida al crear
    ('cierres_caja',      ['fecha'],   'uq_cierre_caja_clinica_fecha'),
    ('glosario_terminos', ['termino'], 'uq_glosario_clinica_termino'),
    ('planillas',         ['periodo'], 'uq_planilla_clinica_periodo'),
]


def _quitar_unicas(tabla: str, columnas: list[str]) -> None:
    """Quita toda única sobre exactamente esas columnas, sin importar cómo se llame.

    En producción parte de la base se creó con create_all y parte con Alembic,
    así que los nombres de las restricciones no son los mismos en todos lados.
    """
    bind = op.get_bind()
    for uc in sa.inspect(bind).get_unique_constraints(tabla):
        if uc['column_names'] == columnas:
            op.drop_constraint(uc['name'], tabla, type_='unique')
    for ix in sa.inspect(bind).get_indexes(tabla):
        if ix.get('unique') and ix['column_names'] == columnas:
            op.drop_index(ix['name'], table_name=tabla)


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        'clinicas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(120), nullable=False),
        sa.Column('estado', sa.String(12), nullable=False, server_default='activa'),
        sa.Column('plan', sa.String(20), nullable=False, server_default='prueba'),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # La veterinaria que ya usa el sistema es la clínica 1, con su mismo nombre.
    nombre = bind.execute(sa.text(
        "SELECT nombre FROM configuracion_clinica ORDER BY id LIMIT 1")).scalar()
    bind.execute(sa.text(
        "INSERT INTO clinicas (id, nombre, plan) VALUES (1, :n, 'fundadora')"),
        {'n': nombre or 'Mi Veterinaria'})
    bind.execute(sa.text(
        "SELECT setval(pg_get_serial_sequence('clinicas', 'id'), 1)"))

    for t in TABLAS:
        op.add_column(t, sa.Column('clinica_id', sa.Integer(), nullable=False, server_default='1'))
        op.create_foreign_key(f'fk_{t}_clinica', t, 'clinicas', ['clinica_id'], ['id'])
        op.create_index(f'ix_{t}_clinica_id', t, ['clinica_id'])

    # Opcionales: errores sin sesión y avisos de agenda
    op.add_column('errores', sa.Column('clinica_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_errores_clinica', 'errores', 'clinicas', ['clinica_id'], ['id'])
    op.create_index('ix_errores_clinica_id', 'errores', ['clinica_id'])
    bind.execute(sa.text("UPDATE errores SET clinica_id = 1"))
    op.add_column('sse_events', sa.Column('clinica_id', sa.Integer(), nullable=True))

    # Únicas globales → únicas por clínica
    for tabla, columnas, nueva in UNICAS:
        _quitar_unicas(tabla, columnas)
        if nueva:
            op.create_unique_constraint(nueva, tabla, ['clinica_id'] + columnas)
    op.create_index('ix_clientes_dni', 'clientes', ['dni'])
    op.create_index('ix_productos_codigo', 'productos', ['codigo'])
    # El código de producto se autogenera por clínica (MED-0001), así que dos
    # clínicas repiten el mismo código; solo se exige que no se repita dentro.
    op.create_unique_constraint('uq_productos_clinica_codigo', 'productos', ['clinica_id', 'codigo'])

    # Plantillas de mensaje: la clave era el motivo; ahora (clínica, motivo)
    op.execute("ALTER TABLE plantillas_contacto DROP CONSTRAINT IF EXISTS plantillas_contacto_pkey")
    op.execute("ALTER TABLE plantillas_contacto ADD COLUMN id SERIAL PRIMARY KEY")
    op.create_unique_constraint('uq_plantilla_clinica_motivo', 'plantillas_contacto',
                                ['clinica_id', 'motivo'])

    # Configuración: una por clínica, con su color de marca.
    # Antes la fila se guardaba SIEMPRE con id=1 explícito, así que la secuencia
    # del id nunca avanzó: la segunda clínica recibiría el id 1 y chocaría.
    op.execute("SELECT setval(pg_get_serial_sequence('configuracion_clinica', 'id'), "
               "COALESCE((SELECT MAX(id) FROM configuracion_clinica), 1))")
    op.add_column('configuracion_clinica', sa.Column('color_marca', sa.String(7)))
    op.create_unique_constraint('uq_config_clinica', 'configuracion_clinica', ['clinica_id'])


def downgrade() -> None:
    op.drop_constraint('uq_config_clinica', 'configuracion_clinica', type_='unique')
    op.drop_column('configuracion_clinica', 'color_marca')
    op.drop_constraint('uq_plantilla_clinica_motivo', 'plantillas_contacto', type_='unique')
    op.execute("ALTER TABLE plantillas_contacto DROP COLUMN id")
    op.execute("ALTER TABLE plantillas_contacto ADD PRIMARY KEY (motivo)")
    op.drop_constraint('uq_productos_clinica_codigo', 'productos', type_='unique')
    op.drop_index('ix_productos_codigo', table_name='productos')
    op.drop_index('ix_clientes_dni', table_name='clientes')
    for tabla, columnas, nueva in reversed(UNICAS):
        if nueva:
            op.drop_constraint(nueva, tabla, type_='unique')
        op.create_unique_constraint(f'{tabla}_{columnas[0]}_key', tabla, columnas)
    op.drop_column('sse_events', 'clinica_id')
    op.drop_index('ix_errores_clinica_id', table_name='errores')
    op.drop_constraint('fk_errores_clinica', 'errores', type_='foreignkey')
    op.drop_column('errores', 'clinica_id')
    for t in reversed(TABLAS):
        op.drop_index(f'ix_{t}_clinica_id', table_name=t)
        op.drop_constraint(f'fk_{t}_clinica', t, type_='foreignkey')
        op.drop_column(t, 'clinica_id')
    op.drop_table('clinicas')
