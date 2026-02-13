"""create kubernetes_clusters table

Revision ID: add_kubernetes_clusters
Revises: add_svc_versions_deploy
Create Date: 2026-02-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_kubernetes_clusters'
down_revision = 'add_svc_versions_deploy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use existing enum type if already created in a previous run
    auth_enum = postgresql.ENUM(
        'kubeconfig', 'token', 'serviceAccount', 'clientCert',
        name='kubeauthmethod',
        create_type=False,  # don't attempt to CREATE TYPE if it exists
    )
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table('kubernetes_clusters'):
        op.create_table(
            'kubernetes_clusters',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False, unique=True),
            sa.Column('description', sa.String(), nullable=True),
            sa.Column('api_url', sa.String(), nullable=False),
            sa.Column('auth_method', auth_enum, nullable=False),
            sa.Column('kubeconfig_content', sa.String(), nullable=True),
            sa.Column('token', sa.String(), nullable=True),
            sa.Column('client_key', sa.String(), nullable=True),
            sa.Column('client_cert', sa.String(), nullable=True),
            sa.Column('client_ca_cert', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_kubernetes_clusters_name', 'kubernetes_clusters', ['name'])
        op.create_index('ix_kubernetes_clusters_auth_method', 'kubernetes_clusters', ['auth_method'])


def downgrade() -> None:
    op.drop_index('ix_kubernetes_clusters_auth_method', table_name='kubernetes_clusters')
    op.drop_index('ix_kubernetes_clusters_name', table_name='kubernetes_clusters')
    op.drop_table('kubernetes_clusters')
