"""add steps column to deployments

Revision ID: add_steps_to_deploy
Revises: add_workshop_uuid_deploy
Create Date: 2026-02-10 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_steps_to_deploy'
down_revision = '481b7672b9f5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('deployments') as batch_op:
        batch_op.add_column(sa.Column('steps', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('deployments') as batch_op:
        batch_op.drop_column('steps')
