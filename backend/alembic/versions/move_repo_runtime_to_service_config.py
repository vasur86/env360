"""move_repo_runtime_to_service_config

Revision ID: move_repo_runtime_config
Revises: add_description_to_service
Create Date: 2026-01-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'move_repo_runtime_config'
down_revision = 'add_description_to_service'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if service_configs table exists
    conn = op.get_bind()
    result = conn.execute(text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_configs')"))
    service_configs_exists = result.scalar()
    
    if not service_configs_exists:
        # If service_configs table doesn't exist, we can't migrate
        # This migration assumes service_configs table already exists
        print("Warning: service_configs table does not exist. Skipping data migration.")
        return
    
    # Check if services table has repo and runtime columns
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'services' AND column_name = 'repo'
        )
    """))
    has_repo = result.scalar()
    
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'services' AND column_name = 'runtime'
        )
    """))
    has_runtime = result.scalar()
    
    if not has_repo and not has_runtime:
        # Columns already removed, skip migration
        print("Info: repo and runtime columns already removed. Skipping migration.")
        return
    
    # Migrate existing repo values to ServiceConfig
    if has_repo:
        conn.execute(text("""
            INSERT INTO service_configs (id, service_id, key, value, created_at, updated_at, deleted_at)
            SELECT 
                gen_random_uuid()::text,
                id,
                'repo',
                repo,
                created_at,
                updated_at,
                NULL
            FROM services
            WHERE repo IS NOT NULL 
            AND repo != ''
            AND deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM service_configs 
                WHERE service_id = services.id 
                AND key = 'repo'
                AND deleted_at IS NULL
            )
        """))
        print("Migrated repo values to ServiceConfig")
    
    # Migrate existing runtime values to ServiceConfig
    if has_runtime:
        conn.execute(text("""
            INSERT INTO service_configs (id, service_id, key, value, created_at, updated_at, deleted_at)
            SELECT 
                gen_random_uuid()::text,
                id,
                'runtime',
                runtime,
                created_at,
                updated_at,
                NULL
            FROM services
            WHERE runtime IS NOT NULL 
            AND runtime != ''
            AND deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM service_configs 
                WHERE service_id = services.id 
                AND key = 'runtime'
                AND deleted_at IS NULL
            )
        """))
        print("Migrated runtime values to ServiceConfig")
    
    # Remove repo column if it exists
    if has_repo:
        op.drop_column('services', 'repo')
        print("Dropped repo column from services table")
    
    # Remove runtime column if it exists
    if has_runtime:
        op.drop_column('services', 'runtime')
        print("Dropped runtime column from services table")


def downgrade() -> None:
    # Add repo and runtime columns back
    conn = op.get_bind()
    
    # Check if columns already exist
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'services' AND column_name = 'repo'
        )
    """))
    has_repo = result.scalar()
    
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'services' AND column_name = 'runtime'
        )
    """))
    has_runtime = result.scalar()
    
    # Add repo column if it doesn't exist
    if not has_repo:
        op.add_column('services', sa.Column('repo', sa.String(), nullable=True))
        print("Added repo column to services table")
    
    # Add runtime column if it doesn't exist
    if not has_runtime:
        op.add_column('services', sa.Column('runtime', sa.String(), nullable=True))
        print("Added runtime column to services table")
    
    # Migrate data back from ServiceConfig to services table
    # Check if service_configs table exists
    result = conn.execute(text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_configs')"))
    service_configs_exists = result.scalar()
    
    if service_configs_exists:
        # Restore repo values from ServiceConfig
        conn.execute(text("""
            UPDATE services
            SET repo = (
                SELECT value FROM service_configs 
                WHERE service_configs.service_id = services.id 
                AND service_configs.key = 'repo'
                AND service_configs.deleted_at IS NULL
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM service_configs 
                WHERE service_configs.service_id = services.id 
                AND service_configs.key = 'repo'
                AND service_configs.deleted_at IS NULL
            )
        """))
        print("Restored repo values from ServiceConfig")
        
        # Restore runtime values from ServiceConfig
        conn.execute(text("""
            UPDATE services
            SET runtime = (
                SELECT value FROM service_configs 
                WHERE service_configs.service_id = services.id 
                AND service_configs.key = 'runtime'
                AND service_configs.deleted_at IS NULL
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM service_configs 
                WHERE service_configs.service_id = services.id 
                AND service_configs.key = 'runtime'
                AND service_configs.deleted_at IS NULL
            )
        """))
        print("Restored runtime values from ServiceConfig")
