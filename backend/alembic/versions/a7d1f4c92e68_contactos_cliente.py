"""registro de contactos con el dueño y plantillas de mensaje

Revision ID: a7d1f4c92e68
Revises: f6c3e8a15d04
Create Date: 2026-10-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7d1f4c92e68'
down_revision: Union[str, None] = 'f6c3e8a15d04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contactos_cliente',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('cliente_id', sa.Integer(),
                  sa.ForeignKey('clientes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('paciente_id', sa.Integer(),
                  sa.ForeignKey('pacientes.id', ondelete='SET NULL')),
        sa.Column('motivo', sa.String(20), nullable=False),
        sa.Column('clave', sa.String(200)),
        sa.Column('canal', sa.String(15), nullable=False),
        sa.Column('resultado', sa.String(15), nullable=False),
        sa.Column('nota', sa.Text()),
        sa.Column('mensaje', sa.Text()),
        sa.Column('creado_en', sa.DateTime(timezone=True)),
        sa.Column('creado_por', sa.String(50)),
    )
    op.create_index('ix_contactos_cliente_cliente_id', 'contactos_cliente', ['cliente_id'])
    op.create_index('ix_contactos_cliente_clave', 'contactos_cliente', ['clave'])
    op.create_index('ix_contactos_cliente_creado_en', 'contactos_cliente', ['creado_en'])
    op.create_table(
        'plantillas_contacto',
        sa.Column('motivo', sa.String(20), primary_key=True),
        sa.Column('texto', sa.Text(), nullable=False),
        sa.Column('actualizado_en', sa.DateTime(timezone=True)),
        sa.Column('actualizado_por', sa.String(50)),
    )


def downgrade() -> None:
    op.drop_table('plantillas_contacto')
    op.drop_index('ix_contactos_cliente_creado_en', table_name='contactos_cliente')
    op.drop_index('ix_contactos_cliente_clave', table_name='contactos_cliente')
    op.drop_index('ix_contactos_cliente_cliente_id', table_name='contactos_cliente')
    op.drop_table('contactos_cliente')
