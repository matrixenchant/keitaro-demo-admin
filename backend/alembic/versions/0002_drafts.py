"""draft/publish: tracked streams and offers

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-20 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('tracked_streams',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('keitaro_campaign_id', sa.Integer(), nullable=False),
    sa.Column('keitaro_stream_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('type', sa.String(length=32), nullable=False),
    sa.Column('schema', sa.String(length=32), nullable=False),
    sa.Column('position', sa.Integer(), nullable=True),
    sa.Column('has_offers', sa.Boolean(), nullable=False),
    sa.Column('meta', sa.JSON(), nullable=False),
    sa.Column('synced_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('keitaro_stream_id')
    )
    with op.batch_alter_table('tracked_streams', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tracked_streams_keitaro_campaign_id'), ['keitaro_campaign_id'], unique=False)

    op.create_table('stream_offers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('stream_id', sa.Integer(), nullable=False),
    sa.Column('offer_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=300), nullable=True),
    sa.Column('accessible', sa.Boolean(), nullable=False),
    sa.Column('share', sa.Integer(), nullable=False),
    sa.Column('pinned', sa.Boolean(), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('kt_present', sa.Boolean(), nullable=False),
    sa.Column('kt_share', sa.Integer(), nullable=True),
    sa.Column('kt_state', sa.String(length=32), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['stream_id'], ['tracked_streams.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('stream_id', 'offer_id', name='uq_stream_offer')
    )
    with op.batch_alter_table('offer_changes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('summary', sa.String(length=300), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('offer_changes', schema=None) as batch_op:
        batch_op.drop_column('summary')
    op.drop_table('stream_offers')
    with op.batch_alter_table('tracked_streams', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tracked_streams_keitaro_campaign_id'))
    op.drop_table('tracked_streams')
