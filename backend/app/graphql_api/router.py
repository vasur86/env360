"""
GraphQL router for FastAPI
"""
from typing import Optional
from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials
from strawberry.fastapi import GraphQLRouter
from strawberry.fastapi import BaseContext
from app.graphql_api.schema import schema
from app.core.database import get_db
from app.core.dependencies import get_current_user


class GraphQLContext(BaseContext):
    """GraphQL context with request, db, and current user"""
    def __init__(self, request: Request, db, current_user: Optional[dict] = None):
        self.request = request
        self.db = db
        self.current_user = current_user


async def get_context(request: Request) -> GraphQLContext:
    """Get GraphQL context with current user and database"""
    # Create database session directly using AsyncSessionLocal
    # We'll ensure cleanup via middleware
    from app.core.database import AsyncSessionLocal
    db = AsyncSessionLocal()
    current_user = None
    
    try:
        # Extract token from cookie (primary method) or Authorization header (fallback)
        token = None
        
        # Check cookie first (for browser-based requests)
        token = request.cookies.get("access_token")
        
        # Fallback to Authorization header (for API clients)
        if not token:
            auth_header = request.headers.get("authorization")
            if auth_header:
                # Remove "Bearer " prefix if present
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
                else:
                    token = auth_header
        
        if token:
            # Try to get current user if token is provided (optional auth)
            # Pass request so get_current_user can access cookies
            try:
                # Create a mock credentials object for backward compatibility
                credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token) if token else None
                current_user = await get_current_user(request=request, credentials=credentials, db=db)
            except Exception:
                # User not authenticated, but allow unauthenticated queries if needed
                current_user = None
        
        # Store database session in request state for cleanup
        request.state.graphql_db = db
        
        # Create context
        context = GraphQLContext(request=request, db=db, current_user=current_user)
        return context
    except Exception:
        # If anything fails, ensure session is closed
        try:
            await db.rollback()
        except Exception:
            pass
        finally:
            await db.close()
        raise


# Create GraphQL router
graphql_router = GraphQLRouter(
    schema=schema,
    context_getter=get_context,
)
