"""merge heads2

Revision ID: 78113f0f8e98
Revises: add_env_id_to_deployments, 942761e6c93a
Create Date: 2026-02-05 11:20:56.554589

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '78113f0f8e98'
down_revision = ('add_env_id_to_deployments', '942761e6c93a')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
