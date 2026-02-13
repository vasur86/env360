"""merge heads1

Revision ID: 100e127def81
Revises: cc22b8e1e187, add_envtype_to_clusters
Create Date: 2026-02-04 14:29:33.028142

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '100e127def81'
down_revision = ('cc22b8e1e187', 'add_envtype_to_clusters')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
