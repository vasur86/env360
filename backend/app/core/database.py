"""
PostgreSQL database configuration using SQLAlchemy
"""
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.core.config import settings

logger = logging.getLogger(__name__)

# Create async engine with connection timeout settings
# connect_args for asyncpg: command_timeout, server_settings
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,  # Test connections before using them
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_timeout=30,  # Wait up to 30 seconds for a connection from the pool
    pool_recycle=3600,  # Recycle connections after 1 hour to prevent stale connections
    connect_args={
        "command_timeout": 10,  # 10 seconds timeout for individual commands
        "server_settings": {
            "application_name": "env360_backend",
            "statement_timeout": "10000",  # 10 seconds statement timeout at PostgreSQL level
        },
    },
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """
    Dependency to get database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    Initialize database - create all tables
    """
    try:
        logger.info("Initializing database connection...")
        # Test connection first with a simple query
        async with engine.begin() as conn:
            # Test connection with a simple query
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection successful")
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables initialized successfully")
    except TimeoutError as e:
        logger.error(f"Database connection timeout: {e}")
        logger.error("Please check:")
        logger.error("1. PostgreSQL is running: docker-compose up -d postgres")
        logger.error("2. DATABASE_URL is correct in .env file")
        logger.error(f"3. Database is accessible at: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'unknown'}")
        raise
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        logger.error(f"Database URL: {settings.DATABASE_URL.split('@')[0]}@***")  # Hide password
        logger.error("Please check:")
        logger.error("1. PostgreSQL is running: docker-compose up -d postgres")
        logger.error("2. DATABASE_URL is correct in .env file")
        logger.error("3. Database credentials are correct")
        raise


async def close_db():
    """
    Close database connections
    """
    await engine.dispose()
