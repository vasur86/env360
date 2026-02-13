"""add workflow_uuid to environment_configs

Revision ID: add_wf_uuid_env_cfg
Revises: add_ds_overrides
Create Date: 2026-02-13 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = 'add_wf_uuid_env_cfg'
down_revision = 'add_ds_overrides'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('environment_configs') as batch_op:
        batch_op.add_column(sa.Column('workflow_uuid', sa.String(), nullable=True))
        batch_op.create_index('ix_environment_configs_workflow_uuid', ['workflow_uuid'], unique=False)


def downgrade():
    with op.batch_alter_table('environment_configs') as batch_op:
        batch_op.drop_index('ix_environment_configs_workflow_uuid')
        batch_op.drop_column('workflow_uuid')
