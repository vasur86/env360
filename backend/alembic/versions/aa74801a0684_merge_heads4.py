"""merge heads4

Revision ID: aa74801a0684
Revises: 78113f0f8e98, add_idx_dep_svc_created_at
Create Date: 2026-02-05 11:32:22.980960

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'aa74801a0684'
down_revision = ('78113f0f8e98', 'add_idx_dep_svc_created_at')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
