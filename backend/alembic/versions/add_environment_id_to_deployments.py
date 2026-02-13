"""add environment_id to deployments

Revision ID: add_env_id_to_deployments
Revises: add_svc_versions_deploy
Create Date: 2026-02-05
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_env_id_to_deployments'
down_revision = 'add_svc_versions_deploy'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('deployments', sa.Column('environment_id', sa.String(), nullable=True))
    try:
        op.create_foreign_key(
            'fk_deployments_environment',
            'deployments',
            'environments',
            ['environment_id'],
            ['id'],
            ondelete='SET NULL',
        )
    except Exception:
        pass
    try:
        op.create_index('ix_deployments_environment_id', 'deployments', ['environment_id'])
    except Exception:
        pass


def downgrade():
    try:
        op.drop_index('ix_deployments_environment_id', table_name='deployments')
    except Exception:
        pass
    try:
        op.drop_constraint('fk_deployments_environment', 'deployments', type_='foreignkey')
    except Exception:
        pass
    op.drop_column('deployments', 'environment_id')

