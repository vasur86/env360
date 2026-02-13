"""merge heads

Revision ID: cc22b8e1e187
Revises: add_kubernetes_clusters, drop_deploy_queue_events
Create Date: 2026-02-03 18:49:05.724056

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cc22b8e1e187'
down_revision = ('add_kubernetes_clusters', 'drop_deploy_queue_events')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
