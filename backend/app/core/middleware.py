"""
Authentication middleware for automatic OAuth redirect
"""
from typing import Callable
from fastapi import Request, status
from fastapi.responses import RedirectResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import logging
from urllib.parse import urlencode, quote

logger = logging.getLogger(__name__)


class OpenIDAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically redirects unauthenticated users to OAuth login.
    Only applies to protected routes (excludes /health, /docs, /auth, etc.)
    """
    
    # Paths that don't require authentication
    PUBLIC_PATHS = [
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/auth/login",
        "/api/v1/auth/callback",
        "/api/v1/auth/logout",
    ]
    
    def __init__(self, app: ASGIApp, oauth_login_url: str = "/api/v1/auth/login"):
        super().__init__(app)
        self.oauth_login_url = oauth_login_url
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Check if path requires authentication
        path = request.url.path
        
        # Skip authentication for public paths
        if any(path.startswith(public_path) for public_path in self.PUBLIC_PATHS):
            logger.debug(f"Skipping auth check for public path: {path}")
            return await call_next(request)
        
        # Check for authentication token in cookie (primary method)
        access_token = request.cookies.get("access_token")
        has_token = bool(access_token)
        
        # Fallback: Check Authorization header (for API clients)
        if not has_token:
            auth_header = request.headers.get("authorization")
            has_token = auth_header and (
                auth_header.startswith("Bearer ") or 
                auth_header.startswith("bearer ")
            )
        
        # If no token and path requires auth, redirect to OAuth login
        if not has_token:
            accept_header = request.headers.get("accept", "").lower()
            content_type = request.headers.get("content-type", "").lower()
            
            # For API requests (JSON/GraphQL POST requests), return 401 with redirect info
            is_api_request = (
                "application/json" in accept_header or
                "application/graphql" in accept_header or
                "application/graphql" in content_type or
                (request.method == "POST" and "/graphql" in path)  # GraphQL queries are typically POST
            )
            
            if is_api_request:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "detail": "Authentication required",
                        "auth_url": f"{self.oauth_login_url}?{urlencode({'redirect_uri': str(request.url)})}",
                    },
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # For browser requests (GET requests, including GraphQL playground), redirect to OAuth login
            redirect_uri = quote(str(request.url), safe="")
            login_url = f"{self.oauth_login_url}?redirect_uri={redirect_uri}"
            logger.info(f"Redirecting unauthenticated {request.method} request to {path} -> {login_url}")
            return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
        
        # Continue with authenticated request
        return await call_next(request)
