"""add_service_versions_and_deployments

Revision ID: add_svc_versions_deploy
Revises: move_repo_runtime_config
Create Date: 2026-01-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'add_svc_versions_deploy'
down_revision = 'move_repo_runtime_config'
branch_labels = None
depends_on = None


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return bool(result.scalar())


def upgrade() -> None:
    conn = op.get_bind()

    # service_versions
    if not table_exists(conn, 'service_versions'):
        op.create_table(
            'service_versions',
            sa.Column('id', sa.String(), primary_key=True, nullable=False),
            sa.Column('service_id', sa.String(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('version_label', sa.String(), nullable=False, index=True),
            sa.Column('config_hash', sa.String(), nullable=False, index=True),
            sa.Column('spec_json', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.UniqueConstraint('service_id', 'version_label', name='uq_service_versions_label'),
        )

    # deployments
    if not table_exists(conn, 'deployments'):
        op.create_table(
            'deployments',
            sa.Column('id', sa.String(), primary_key=True, nullable=False),
            sa.Column('service_id', sa.String(), sa.ForeignKey('services.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('version_id', sa.String(), sa.ForeignKey('service_versions.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('status', sa.String(), nullable=False, server_default=sa.text("'pending'")),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()

    if table_exists(conn, 'deployments'):
        op.drop_table('deployments')
    if table_exists(conn, 'service_versions'):
        op.drop_table('service_versions')

