"""
OAuth/SSO authentication utilities with OpenID Connect discovery
"""
from typing import Optional, Dict, List
import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Cache for OpenID Connect discovery document
_discovery_cache: Optional[Dict] = None


async def get_discovery_document() -> Dict:
    """
    Fetch OpenID Connect discovery document and cache it.
    Returns the discovery document with endpoints (authorization_endpoint, token_endpoint, userinfo_endpoint).
    """
    global _discovery_cache
    
    if _discovery_cache is not None:
        return _discovery_cache
    
    if not settings.OAUTH_DISCOVERY_URL:
        raise ValueError(
            "OAuth configuration is missing. Please set OAUTH_DISCOVERY_URL environment variable. "
            "Example: https://login.microsoftonline.com/{tenant-id}/.well-known/openid-configuration"
        )
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(settings.OAUTH_DISCOVERY_URL, timeout=10.0)
            response.raise_for_status()
            _discovery_cache = response.json()
            logger.info(f"Fetched OpenID Connect discovery document from {settings.OAUTH_DISCOVERY_URL}")
            return _discovery_cache
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch OpenID Connect discovery document: {e}")
            raise ValueError(
                f"Failed to fetch OpenID Connect discovery document from {settings.OAUTH_DISCOVERY_URL}. "
                f"Error: {str(e)}"
            )


async def get_oauth_authorization_url(state: str) -> str:
    """Generate OAuth authorization URL using discovery document"""
    from urllib.parse import urlencode    

    if not settings.OAUTH_CLIENT_ID:
        raise ValueError("OAuth configuration is missing. Please set OAUTH_CLIENT_ID environment variable.")
    
    discovery = await get_discovery_document()
    authorization_endpoint = discovery.get("authorization_endpoint")
    
    if not authorization_endpoint:
        raise ValueError("Discovery document missing authorization_endpoint")
    
    params = {
        "client_id": settings.OAUTH_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.oauth_redirect_uri,
        "scope": settings.OAUTH_SCOPE or "openid profile email",
        "state": state,
    }
    return f"{authorization_endpoint}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> Optional[Dict]:
    """Exchange authorization code for access token using discovery document"""
    if not settings.OAUTH_CLIENT_ID or not settings.OAUTH_CLIENT_SECRET:
        raise ValueError("OAuth configuration is missing. Please set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables.")
    
    discovery = await get_discovery_document()
    token_endpoint = discovery.get("token_endpoint")
    
    if not token_endpoint:
        raise ValueError("Discovery document missing token_endpoint")
    
    async with httpx.AsyncClient() as client:
        data = {
            "client_id": settings.OAUTH_CLIENT_ID,
            "client_secret": settings.OAUTH_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.oauth_redirect_uri,
        }
        response = await client.post(token_endpoint, data=data)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Token exchange failed: {response.status_code} - {response.text}")
    return None


async def get_user_info(access_token: str) -> Optional[Dict]:
    """Get user information from OAuth provider using discovery document"""
    discovery = await get_discovery_document()
    userinfo_endpoint = discovery.get("userinfo_endpoint")
    
    if not userinfo_endpoint:
        # Fallback: some providers use different endpoints (e.g., Microsoft Graph API)
        # For Azure AD, try Microsoft Graph API endpoint
        issuer = discovery.get("issuer", "")
        if issuer and "microsoftonline.com" in issuer:
            # Azure AD / Microsoft Entra ID - use Microsoft Graph API
            userinfo_endpoint = "https://graph.microsoft.com/v1.0/me"
            logger.info("Using Microsoft Graph API as userinfo endpoint (not in discovery document)")
        elif issuer:
            # Try standard OpenID Connect userinfo endpoint
            userinfo_endpoint = f"{issuer}/userinfo"
            logger.info(f"Using standard userinfo endpoint: {userinfo_endpoint}")
        else:
            raise ValueError("Discovery document missing userinfo_endpoint and issuer")
    
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = await client.get(userinfo_endpoint, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"User info request failed: {response.status_code} - {response.text}")
    return None



