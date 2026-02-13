"""add_description_to_service

Revision ID: add_description_to_service
Revises: 879b51a6e362
Create Date: 2026-01-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_description_to_service'
down_revision = '879b51a6e362'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if column already exists
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'services' 
            AND column_name = 'description'
        )
    """))
    column_exists = result.scalar()
    
    if not column_exists:
        op.add_column('services', sa.Column('description', sa.String(), nullable=True))


def downgrade() -> None:
    # Check if column exists before dropping
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'services' 
            AND column_name = 'description'
        )
    """))
    column_exists = result.scalar()
    
    if column_exists:
        op.drop_column('services', 'description')
