"""add rate limit and sse events

Revision ID: f77918a9e992
Revises: 8e7b47d023fa
Create Date: 2026-06-24 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f77918a9e992'
down_revision: Union[str, None] = '8e7b47d023fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rate_limit_hits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=255), nullable=False),
        sa.Column('timestamp', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rate_limit_hits_key'), 'rate_limit_hits', ['key'], unique=False)
    op.create_index(op.f('ix_rate_limit_hits_timestamp'), 'rate_limit_hits', ['timestamp'], unique=False)

    op.create_table(
        'sse_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message', sa.String(length=100), nullable=False),
        sa.Column('timestamp', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sse_events_timestamp'), 'sse_events', ['timestamp'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sse_events_timestamp'), table_name='sse_events')
    op.drop_table('sse_events')
    op.drop_index(op.f('ix_rate_limit_hits_timestamp'), table_name='rate_limit_hits')
    op.drop_index(op.f('ix_rate_limit_hits_key'), table_name='rate_limit_hits')
    op.drop_table('rate_limit_hits')
