"""merge heads2

Revision ID: 942761e6c93a
Revises: add_cluster_id_to_environments, 100e127def81
Create Date: 2026-02-04 14:53:17.231659

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '942761e6c93a'
down_revision = ('add_cluster_id_to_environments', '100e127def81')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
