"""add downstream_overrides column to deployments

Revision ID: add_ds_overrides
Revises: add_admin_configs
Create Date: 2026-02-12 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = 'add_ds_overrides'
down_revision = 'add_admin_configs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('deployments', sa.Column('downstream_overrides', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('deployments', 'downstream_overrides')
