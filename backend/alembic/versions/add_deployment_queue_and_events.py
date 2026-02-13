"""add_deployment_queue_and_events

Revision ID: add_deploy_queue_events
Revises: add_svc_versions_deploy
Create Date: 2026-01-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'add_deploy_queue_events'
down_revision = 'add_svc_versions_deploy'
branch_labels = None
depends_on = None


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return bool(result.scalar())


def upgrade() -> None:
    conn = op.get_bind()

    if not table_exists(conn, 'deployment_queue'):
        op.create_table(
            'deployment_queue',
            sa.Column('id', sa.String(), primary_key=True, nullable=False),
            sa.Column('service_id', sa.String(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('requested_version_label', sa.String(), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default=sa.text("'pending'")),
            sa.Column('locked_by', sa.String(), nullable=True),
            sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_deployment_queue_service_id', 'deployment_queue', ['service_id'])
        op.create_index('ix_deployment_queue_status', 'deployment_queue', ['status'])
        op.create_index('ix_deployment_queue_locked_by', 'deployment_queue', ['locked_by'])

    if not table_exists(conn, 'deployment_step_checkpoints'):
        op.create_table(
            'deployment_step_checkpoints',
            sa.Column('id', sa.String(), primary_key=True, nullable=False),
            sa.Column('deployment_id', sa.String(), sa.ForeignKey('deployments.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('step_name', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.UniqueConstraint('deployment_id', 'step_name', name='uq_deployment_step_unique'),
        )
        op.create_index('ix_deployment_step_ck_deployment_id', 'deployment_step_checkpoints', ['deployment_id'])

    if not table_exists(conn, 'deployment_events'):
        op.create_table(
            'deployment_events',
            sa.Column('id', sa.String(), primary_key=True, nullable=False),
            sa.Column('deployment_id', sa.String(), sa.ForeignKey('deployments.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('event_type', sa.String(), nullable=False),
            sa.Column('message', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        op.create_index('ix_deployment_events_deployment_id', 'deployment_events', ['deployment_id'])


def downgrade() -> None:
    conn = op.get_bind()
    if table_exists(conn, 'deployment_events'):
        op.drop_table('deployment_events')
    if table_exists(conn, 'deployment_step_checkpoints'):
        op.drop_table('deployment_step_checkpoints')
    if table_exists(conn, 'deployment_queue'):
        op.drop_table('deployment_queue')

