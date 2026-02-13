"""add workflow_uuid to deployments

Revision ID: add_workflow_uuid_deploy
Revises: add_idx_dep_svc_created_at
Create Date: 2026-02-09 12:15:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_workshop_uuid_deploy'
down_revision = 'add_idx_dep_svc_created_at'
branch_labels = None
depends_on = None


def upgrade():
    # add nullable workflow_uuid column with index
    with op.batch_alter_table('deployments') as batch_op:
        batch_op.add_column(sa.Column('workflow_uuid', sa.String(), nullable=True))
        batch_op.create_index('ix_deployments_workflow_uuid', ['workflow_uuid'], unique=False)


def downgrade():
    with op.batch_alter_table('deployments') as batch_op:
        batch_op.drop_index('ix_deployments_workflow_uuid')
        batch_op.drop_column('workflow_uuid')

