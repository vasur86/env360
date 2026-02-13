"""add environment_type to kubernetes_clusters

Revision ID: add_envtype_to_clusters
Revises: add_kubernetes_clusters
Create Date: 2026-02-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_envtype_to_clusters'
down_revision = 'add_kubernetes_clusters'
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)  # type: ignore
    cols = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in cols


def upgrade():
    # Use existing PostgreSQL ENUM type 'environmenttype' when available
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    if not _has_column('kubernetes_clusters', 'environment_type'):
        if is_postgres:
            env_enum = postgresql.ENUM(
                'development', 'testing', 'staging', 'production', 'sandbox', 'dev', 'prod',
                name='environmenttype',
                create_type=False,
            )
            op.add_column('kubernetes_clusters', sa.Column('environment_type', env_enum, nullable=True))
        else:
            op.add_column('kubernetes_clusters', sa.Column('environment_type', sa.String(), nullable=True))
        # Optional index for filtering by env type
        try:
            op.create_index('ix_kubernetes_clusters_environment_type', 'kubernetes_clusters', ['environment_type'])
        except Exception:
            pass


def downgrade():
    if _has_column('kubernetes_clusters', 'environment_type'):
        try:
            op.drop_index('ix_kubernetes_clusters_environment_type', table_name='kubernetes_clusters')
        except Exception:
            pass
        op.drop_column('kubernetes_clusters', 'environment_type')

