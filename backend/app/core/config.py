"""
Application configuration using Pydantic settings
"""
from typing import Dict, List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings"""
    
    # Database - PostgreSQL
    DATABASE_URL: str = ""
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # OAuth/SSO (optional - only required if using OAuth authentication)
    OAUTH_CLIENT_ID: Optional[str] = None
    OAUTH_CLIENT_SECRET: Optional[str] = None
    OAUTH_DISCOVERY_URL: Optional[str] = None  # OpenID Connect discovery endpoint (e.g., https://login.microsoftonline.com/{tenant-id}/.well-known/openid-configuration)
    OAUTH_REDIRECT_URI: Optional[str] = None  # Will be constructed from API_BASE_URL if not provided
    OAUTH_SCOPE: Optional[str] = None
    
    # API Base URL (for constructing OAuth redirect URI)
    API_BASE_URL: str = "http://localhost:8000"  # Backend API base URL
    
    # JWT (optional - only required if using JWT authentication)
    JWT_SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Application
    APP_NAME: str = "Env360 API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SQLALCHEMY_LOG_LEVEL: str = "WARNING"
    ENVIRONMENT: str = "production"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    
    # Cookie settings
    COOKIE_SECURE: bool = False  # Set to True in production with HTTPS
    COOKIE_SAMESITE: str = "lax"  # CSRF protection: "strict", "lax", or "none"
    
    # Frontend URL (for OAuth redirects)
    FRONTEND_URL: str = "http://localhost:5173"  # Default frontend URL for OAuth callback redirects
    
    # OpenID Auth
    ENABLE_OPENID_REDIRECT: bool = True  # Enable automatic redirect to OAuth for unauthenticated users (strict mode - always enabled)
    
    # DBOS
    DBOS_WORKFLOW_QUEUE_NAME: str = "env360-workflow-queue"
    
    # Super admins (comma-separated emails)
    SUPER_ADMIN_EMAILS: str = ""
    
    # Encryption key for secrets at rest (Fernet key - 32 url-safe base64-encoded bytes)
    SECRETS_ENCRYPTION_KEY: Optional[str] = None

    # Admin config (DB-backed, merged at runtime)
    BASE_DOMAIN: str = "env360.synvaraworks.com"

    # Domain / TLS / Gateway settings (overridable via env vars)
    DOMAIN_CERT_NAMESPACE: str = "cert-manager"
    DOMAIN_ISSUER_NAME: str = "letsencrypt-prod"
    DOMAIN_CERT_DURATION_HOURS: int = 2160        # 90 days
    DOMAIN_CERT_RENEW_BEFORE_HOURS: int = 360     # 15 days
    DOMAIN_GATEWAY_NAME: str = "env360-ingress"
    DOMAIN_GATEWAY_NAMESPACE: str = "istio-ingress"
    DOMAIN_GATEWAY_CLASS_NAME: str = "istio"

    # Internal cache for admin configs loaded from DB
    _admin_configs: Dict[str, str] = {}

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    @property
    def oauth_scopes_list(self) -> List[str]:
        """Parse OAuth scopes from space-separated string"""
        if not self.OAUTH_SCOPE:
            return []
        return self.OAUTH_SCOPE.split()
    
    @property
    def oauth_redirect_uri(self) -> str:
        """Get OAuth redirect URI, constructing from API_BASE_URL if not explicitly set"""
        if self.OAUTH_REDIRECT_URI:
            return self.OAUTH_REDIRECT_URI
        # Construct from API_BASE_URL
        base_url = self.API_BASE_URL.rstrip('/')
        return f"{base_url}/api/v1/auth/callback"
    
    @property
    def super_admin_emails_list(self) -> List[str]:
        """Parse SUPER_ADMIN_EMAILS into a normalized list of emails"""
        if not self.SUPER_ADMIN_EMAILS:
            return []
        return [e.strip().lower() for e in self.SUPER_ADMIN_EMAILS.split(",") if e.strip()]


settings = Settings()


async def load_admin_configs() -> None:
    """
    Load admin config key-value pairs from the admin_configs table and
    merge them into the global ``settings`` object.  DB values override
    the env/defaults for any matching attribute (upper-cased key).
    
    Call this once at app startup (e.g. in lifespan) and whenever the
    admin settings page saves changes.
    """
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            from app.models.config import AdminConfig as AdminConfigModel
            result = await db.execute(select(AdminConfigModel))
            rows = result.scalars().all()
            admin_map: Dict[str, str] = {}
            for row in rows:
                if row.value is not None:
                    admin_map[row.key] = row.value
            settings._admin_configs = admin_map
            # Merge known keys into settings attributes
            if "base_domain" in admin_map:
                object.__setattr__(settings, "BASE_DOMAIN", admin_map["base_domain"])
    except Exception:
        # Table may not exist yet (pre-migration) – keep defaults
        pass


def get_admin_config(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Look up an admin config value.  Checks the cached DB values first,
    then falls back to the provided default.
    """
    return settings._admin_configs.get(key, default)

