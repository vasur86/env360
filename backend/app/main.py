"""
Main FastAPI application entry point
"""
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.middleware import OpenIDAuthMiddleware
from app.api.v1.router import api_router
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from app.core.database import AsyncSessionLocal
import asyncio
from app.workflows.dbos_deploy import launch_dbos

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup - initialize database
    try:
        logger.info("Starting application...")
        await init_db()
        logger.info("Application started successfully")
        # Launch DBOS engine for durable workflows
        # Load admin configs from DB into settings
        try:
            from app.core.config import load_admin_configs
            await load_admin_configs()
            logger.info("Admin configs loaded from DB")
        except Exception as e:
            logger.warning(f"Failed to load admin configs: {e}")
        try:
            launch_dbos(settings.DATABASE_URL)
            logger.info("DBOS launched for durable workflows")
        except Exception as e:
            logger.warning(f"DBOS launch failed: {e}")
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        logger.error("Please check:")
        logger.error("1. PostgreSQL is running (docker-compose up -d postgres)")
        logger.error("2. DATABASE_URL is correct in .env file")
        logger.error("3. Database credentials are correct")
        raise
    yield
    # Shutdown - close database connections
    logger.info("Shutting down application...")
    await close_db()
    logger.info("Application shut down successfully")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Env360 API - Production-grade FastAPI backend with GraphQL and OAuth/SSO",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenID Auth middleware - automatically redirect unauthenticated users to OAuth
# Always enabled if ENABLE_OPENID_REDIRECT is True, regardless of OAuth configuration
# If OAuth is not configured, the login endpoint will return an error, but redirects will still work
if settings.ENABLE_OPENID_REDIRECT:
    app.add_middleware(
        OpenIDAuthMiddleware,
        oauth_login_url="/api/v1/auth/login",
    )
    if settings.OAUTH_CLIENT_ID:
        logger.info("OpenID Auth middleware enabled - unauthenticated users will be redirected to OAuth login")
    else:
        logger.warning("OpenID Auth middleware enabled but OAUTH_CLIENT_ID is not set. Login will fail until OAuth is configured.")

# GraphQL cleanup middleware - ensures database sessions are closed after GraphQL requests
# This must be added BEFORE the API router so it wraps all requests
class GraphQLCleanupMiddleware(BaseHTTPMiddleware):
    """Middleware to ensure GraphQL database sessions are properly closed"""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Clean up GraphQL database session if it exists
        if hasattr(request.state, 'graphql_db'):
            db = request.state.graphql_db
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            finally:
                await db.close()
        return response

# Add GraphQL cleanup middleware (before API router so it wraps all requests)
app.add_middleware(GraphQLCleanupMiddleware)

# Include API routes
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "version": settings.APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )

