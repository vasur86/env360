"""merge heads5

Revision ID: 481b7672b9f5
Revises: aa74801a0684, add_workshop_uuid_deploy
Create Date: 2026-02-09 13:27:17.793953

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '481b7672b9f5'
down_revision = ('aa74801a0684', 'add_workshop_uuid_deploy')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
