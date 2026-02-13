"""add admin_configs table

Revision ID: add_admin_configs
Revises: add_steps_to_deploy
Create Date: 2026-02-11 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_admin_configs'
down_revision = 'add_steps_to_deploy'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'admin_configs',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('key', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('config_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('admin_configs')
