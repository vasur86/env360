"""
Authentication routes - OAuth/SSO - PostgreSQL version
"""
from typing import Optional, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from fastapi.responses import RedirectResponse
from urllib.parse import quote, urlparse, urlunparse, parse_qs
import secrets
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import get_current_user_required
from app.core.oauth import (
    get_oauth_authorization_url,
    exchange_code_for_token,
    get_user_info,
)
from app.core.security import create_access_token
from app.core.config import settings
from app.models.user import User
from app.models.oauth_state import OAuthState
from app.schemas.user import UserResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# OAuth state is now stored in PostgreSQL via OAuthState model


async def sync_user_from_sso(user_info: Dict, db: AsyncSession) -> User:
    """
    Automatically create or update user from SSO provider information.
    This function is called automatically upon successful SSO authentication.
    
    Args:
        user_info: User information dictionary from SSO provider
        db: Database session
        
    Returns:
        User: Created or updated user object
    """
    # Extract user information from SSO provider response
    # Support multiple OAuth providers (Azure AD, Google, Okta, etc.)
    email = (
        user_info.get("mail") or 
        user_info.get("userPrincipalName") or 
        user_info.get("email") or
        user_info.get("preferred_username")
    )
    name = (
        user_info.get("displayName") or 
        user_info.get("name") or 
        user_info.get("given_name") or
        f"{user_info.get('given_name', '')} {user_info.get('family_name', '')}".strip() or
        email.split("@")[0] if email else ""
    )
    
    if not email:
        raise ValueError("No email found in user info from SSO provider")
    
    if not name:
        # Fallback to email username if no name provided
        name = email.split("@")[0]
    
    # Get existing user or create new one
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user:
        # Update existing user if any profile changes detected
        updated = False
        changes = []
        
        if user.name != name:
            old_name = user.name
            user.name = name
            updated = True
            changes.append(f"name: '{old_name}' -> '{name}'")
        
        # Ensure user remains active (unless explicitly deactivated by admin)
        # This allows users to re-authenticate and regain access
        if not user.is_active:
            user.is_active = True
            updated = True
            changes.append("is_active: False -> True")
        
        if updated:
            logger.info(f"Updating user profile for {email}: {', '.join(changes)}")
            await db.commit()
            await db.refresh(user)
        else:
            logger.debug(f"User {email} profile is up to date")
    else:
        # Automatically create new user upon successful SSO authentication
        user = User(
            email=email,
            name=name,
            is_admin=False,  # New users are not admins by default
            is_active=True,  # Active by default upon successful SSO auth
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"Created new user from SSO: {email} ({name})")
    
    return user


@router.get("/login")
async def login(
    redirect_uri: Optional[str] = Query(None, description="URI to redirect to after successful authentication"),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate OAuth login flow.
    If redirect_uri is provided, user will be redirected there after authentication.
    """
    import time
    from urllib.parse import urlparse
    
    # Log OAuth configuration and redirect URI for debugging
    logger.debug(f"OAuth DISCOVERY_URL: {settings.OAUTH_DISCOVERY_URL}")
    logger.debug(f"Redirect URI: {redirect_uri}")
    
    # Check if OAuth is configured
    if not settings.OAUTH_CLIENT_ID or not settings.OAUTH_DISCOVERY_URL:
        error_message = "OAuth is not configured. Please set OAUTH_CLIENT_ID and OAUTH_DISCOVERY_URL environment variables."
        logger.error(error_message)
        
        # If redirect_uri is provided (browser request), redirect to frontend sign-in page with error
        # This provides better UX than returning a JSON error to a browser
        if redirect_uri:
            try:
                parsed = urlparse(redirect_uri)
                if parsed.scheme in ("http", "https"):
                    from fastapi.responses import RedirectResponse
                    # Extract frontend base URL from redirect_uri and redirect to sign-in page
                    frontend_base = f"{parsed.scheme}://{parsed.netloc}"
                    signin_url = f"{frontend_base}/auth/signin?error={quote('oauth_not_configured')}"
                    logger.info(f"Redirecting to sign-in page with error: {signin_url}")
                    return RedirectResponse(url=signin_url, status_code=status.HTTP_302_FOUND)
            except Exception as e:
                logger.warning(f"Failed to parse redirect_uri for error redirect: {e}")
        
        # Return error response (for API clients or if redirect_uri parsing failed)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_message,
        )
    
    # Generate unique state token
    # secrets.token_urlsafe(32) generates a 32-byte (256-bit) random token
    # This provides ~2^256 possible values, making collisions extremely unlikely
    # Database PRIMARY KEY constraint enforces uniqueness at the database level
    max_retries = 5
    for attempt in range(max_retries):
        state = secrets.token_urlsafe(32)
        
        # Check if state already exists (extremely rare but handle it)
        existing = await db.execute(select(OAuthState).where(OAuthState.state == state))
        if existing.scalar_one_or_none() is None:
            # State is unique, proceed
            break
        else:
            # Collision detected (extremely rare - ~1 in 2^256 chance)
            logger.warning(f"State collision detected on attempt {attempt + 1}, generating new state...")
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to generate unique OAuth state after multiple attempts",
                )
    
    # Store state in database
    # PRIMARY KEY constraint on 'state' column ensures database-level uniqueness
    oauth_state = OAuthState(
        state=state,
        redirect_uri=redirect_uri,
    )
    try:
        db.add(oauth_state)
        await db.commit()
        logger.debug(f"Stored OAuth state in database: {state[:8]}...")
    except Exception as e:
        # Handle database constraint violation (duplicate state)
        await db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            logger.error(f"Database constraint violation: duplicate state detected (this should be extremely rare)")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store OAuth state due to uniqueness constraint violation",
            )
        raise
    
    auth_url = await get_oauth_authorization_url(state)
    logger.debug(f"Generated OAuth authorization URL: {auth_url}")
    # If redirect_uri is provided and it's a valid URL, redirect directly
    if redirect_uri:
        try:
            parsed = urlparse(redirect_uri)
            if parsed.scheme in ("http", "https"):
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url=auth_url)
        except Exception:
            pass  # Fall through to return JSON response
    
    return {"authorization_url": auth_url, "state": state}


@router.get("/callback")
async def oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback handler"""
    logger.info(f"OAuth callback request - Error Check")
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth error: {error}",
        )
    
    logger.info(f"OAuth callback request - Code & State Check")
    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing code or state parameter",
        )
    
    # Verify state exists in database
    result = await db.execute(select(OAuthState).where(OAuthState.state == state))
    oauth_state = result.scalar_one_or_none()
    
    if not oauth_state:
        logger.warning(f"Invalid OAuth state: {state[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter",
        )
    
    # Get redirect URI from state
    redirect_uri = oauth_state.redirect_uri
    
    # Delete used state (one-time use)
    await db.delete(oauth_state)
    await db.commit()
    logger.debug(f"Deleted used OAuth state: {state[:8]}...")
    
    # Cleanup expired states (older than 1 hour) in background
    # This prevents the table from growing indefinitely
    from datetime import timezone
    expired_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    expired_result = await db.execute(
        select(OAuthState).where(OAuthState.created_at < expired_cutoff)
    )
    expired_states = expired_result.scalars().all()
    for expired_state in expired_states:
        await db.delete(expired_state)
    if expired_states:
        await db.commit()
        logger.debug(f"Cleaned up {len(expired_states)} expired OAuth states")
    
    # Exchange code for token
    token_data = await exchange_code_for_token(code)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange code for token",
        )    

    access_token = token_data.get("access_token")
    id_token = token_data.get("id_token")
    
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No access token received",
        )
    
    # Get user info from SSO provider
    logger.info(f"OAuth callback request - Getting user info from SSO provider")
    user_info = await get_user_info(access_token)
    if not user_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to get user information",
        )
    logger.info(f"OAuth callback request - User info: {user_info}")
    # Automatically create or update user from SSO provider information
    try:
        user = await sync_user_from_sso(user_info, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error syncing user from SSO: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync user information",
        )
        
    # Create JWT token for our API
    jwt_token = create_access_token(data={"sub": user.email})
    
    # Convert to UserResponse
    user_response = UserResponse.model_validate(user)
    
    # Create response with HTTP-only cookie
    # Default redirect to GraphQL endpoint if no redirect_uri provided
    if not redirect_uri:
        redirect_uri = "/api/v1/graphql"
    
    # Parse redirect URI to determine if it's a backend URL
    parsed = urlparse(redirect_uri)
    is_backend_url = (
        parsed.netloc and (
            "localhost:8000" in parsed.netloc or 
            "127.0.0.1:8000" in parsed.netloc or
            parsed.netloc.endswith(":8000")
        )
    ) or (not parsed.netloc and parsed.path.startswith("/api/"))
    
    # If it's a backend URL, use it directly; otherwise redirect to frontend
    if is_backend_url:
        redirect_url = redirect_uri
    else:
        # Frontend URL - redirect there
        redirect_url = redirect_uri
    
    # Create redirect response with HTTP-only cookie
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    
    # Set HTTP-only cookie with JWT token
    # Cookie settings for security:
    # - httpOnly: Prevents JavaScript access (XSS protection)
    # - secure: Only sent over HTTPS (set to True in production with HTTPS)
    # - samesite: CSRF protection
    # - max_age: Token expiration time in seconds
    cookie_max_age = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key="access_token",
        value=jwt_token,
        max_age=cookie_max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",  # Available to all paths
    )
    
    logger.info(f"Setting auth cookie and redirecting to: {redirect_url}")
    return response


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Dict = Depends(get_current_user_required),
    db: AsyncSession = Depends(get_db),
):
    """Get current authenticated user info (uses cookie or Authorization header)"""
    result = await db.execute(select(User).where(User.id == current_user.get('id')))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    # Build response and include computed super admin flag
    resp = UserResponse.model_validate(user)
    try:
        is_super_admin = (user.email or "").lower() in settings.super_admin_emails_list
    except Exception:
        is_super_admin = False
    # Pydantic model is mutable by default; set attribute
    resp.is_super_admin = is_super_admin
    return resp


@router.post("/logout")
async def logout(response: Response):
    """Logout user by clearing the authentication cookie"""
    response.delete_cookie(
        key="access_token",
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )
    return {"message": "Logged out successfully"}
