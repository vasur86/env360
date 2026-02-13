"""drop_deploy_queue_events

Revision ID: drop_deploy_queue_events
Revises: add_deploy_queue_events
Create Date: 2026-01-27 00:30:00.000000

"""
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'drop_deploy_queue_events'
down_revision = 'add_deploy_queue_events'
branch_labels = None
depends_on = None


def table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": table_name})
    return bool(result.scalar())


def upgrade() -> None:
    conn = op.get_bind()
    # Drop custom tables if present
    for t in ('deployment_events', 'deployment_step_checkpoints', 'deployment_queue'):
        if table_exists(conn, t):
            op.drop_table(t)


def downgrade() -> None:
    # No-op: these tables are intentionally removed; use prior migration to recreate if needed.
    pass

