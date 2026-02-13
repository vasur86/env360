"""add cluster_id to environments

Revision ID: add_cluster_id_to_environments
Revises: add_envtype_to_clusters
Create Date: 2026-02-04
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_cluster_id_to_environments'
down_revision = 'add_envtype_to_clusters'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name
    # Add nullable column and FK (SET NULL on delete)
    op.add_column('environments', sa.Column('cluster_id', sa.String(), nullable=True))
    try:
        op.create_foreign_key(
            'fk_environments_cluster',
            'environments',
            'kubernetes_clusters',
            ['cluster_id'],
            ['id'],
            ondelete='SET NULL',
        )
    except Exception:
        pass
    try:
        op.create_index('ix_environments_cluster_id', 'environments', ['cluster_id'])
    except Exception:
        pass


def downgrade():
    try:
        op.drop_index('ix_environments_cluster_id', table_name='environments')
    except Exception:
        pass
    try:
        op.drop_constraint('fk_environments_cluster', 'environments', type_='foreignkey')
    except Exception:
        pass
    op.drop_column('environments', 'cluster_id')

