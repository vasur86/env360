"""add composite index on deployments(service_id, created_at)

Revision ID: add_idx_dep_svc_created_at
Revises: add_env_id_to_deployments
Create Date: 2026-02-05
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_idx_dep_svc_created_at'
down_revision = 'add_env_id_to_deployments'
branch_labels = None
depends_on = None


def upgrade():
    try:
        op.create_index(
            'ix_deployments_service_created_at',
            'deployments',
            ['service_id', 'created_at'],
        )
    except Exception:
        pass


def downgrade():
    try:
        op.drop_index('ix_deployments_service_created_at', table_name='deployments')
    except Exception:
        pass

