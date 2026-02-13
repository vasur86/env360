"""
FastAPI dependencies for authentication and authorization - PostgreSQL version
"""
from typing import Optional, Dict
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.config import settings
from app.models.user import User
from app.models.permission import PermissionAction, PermissionResource, Permission, UserPermission, ResourcePermission, PermissionScope
from app.models.project import Project as ProjectModel
from app.models.environment import Environment as EnvironmentModel
from app.models.service import Service as ServiceModel

security = HTTPBearer(auto_error=False)  # Don't auto-raise on missing token


async def get_token_from_request(request: Request) -> Optional[str]:
    """
    Extract JWT token from request - checks cookie first, then Authorization header.
    Returns None if no token found.
    """
    # Check cookie first (for browser-based requests)
    token = request.cookies.get("access_token")
    
    # Fallback to Authorization header (for API clients)
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header:
            if auth_header.startswith("Bearer ") or auth_header.startswith("bearer "):
                token = auth_header[7:]
            else:
                token = auth_header
    
    return token


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[Dict]:
    """
    Get current authenticated user from JWT token.
    Checks cookie first, then Authorization header.
    Returns None if not authenticated (for optional auth scenarios).
    """
    # Get token from cookie or Authorization header
    token = await get_token_from_request(request)
    
    # If no token from cookie/header, try credentials (for backward compatibility)
    if not token and credentials:
        token = credentials.credentials
    
    if not token:
        return None
    
    payload = decode_access_token(token)
    
    if payload is None:
        return None
    
    email: str = payload.get("sub")
    if email is None:
        return None
    
    # Query user from database
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        return None
    
    # Convert to dict for GraphQL context
    is_super_admin = user.email.lower() in settings.super_admin_emails_list
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "is_super_admin": is_super_admin,
    }


async def get_current_user_required(
    current_user: Optional[Dict] = Depends(get_current_user),
) -> Dict:
    """
    Require authentication - raises 401 if user is not authenticated.
    Use this for endpoints that require authentication.
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


# Legacy function for backward compatibility (raises on missing auth)
security_required = HTTPBearer()


async def get_current_user_legacy(
    credentials: HTTPAuthorizationCredentials = Depends(security_required),
    db: AsyncSession = Depends(get_db),
) -> Dict:
    """Legacy version that raises exception on missing auth (for backward compatibility)"""
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    # Query user from database
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
        )
    
    # Convert to dict for GraphQL context
    is_super_admin = user.email.lower() in settings.super_admin_emails_list
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "is_super_admin": is_super_admin,
    }
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    
    # Query user from database
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
        )
    
    # Convert to dict for GraphQL context
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
    }


async def get_current_admin_user(
    current_user: Dict = Depends(get_current_user_required),
) -> Dict:
    """Get current user and verify admin status"""
    if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions - Admin access required",
        )
    return current_user


async def check_permission(
    user: Dict,
    action: PermissionAction,
    resource: PermissionResource,
    resource_id: Optional[str] = None,
    db: AsyncSession = None,
) -> bool:
    """
    Check if user has a specific permission
    
    Args:
        user: Current user dict
        action: Permission action (READ, WRITE, DELETE, ADMIN)
        resource: Permission resource type
        resource_id: Optional resource ID for resource-specific permissions
        db: Database session
    
    Returns:
        True if user has permission, False otherwise
    """
    # Admins and super admins have all permissions
    if user.get('is_admin', False) or user.get('is_super_admin', False):
        return True
    
    user_id = user.get('id')
    if not user_id or not db:
        return False
    
    # Query user permissions
    query = select(UserPermission).join(Permission).where(
        UserPermission.user_id == user_id,
        Permission.action == action.value,
        Permission.resource == resource.value,
    )
    
    if resource_id:
        query = query.where(UserPermission.resource_id == resource_id)
    
    result = await db.execute(query)
    user_permissions = result.scalars().all()
    
    return len(user_permissions) > 0


async def check_resource_permission(
    user: Dict,
    action: PermissionAction,
    scope: PermissionScope,
    resource_id: str,
    db: AsyncSession,
) -> bool:
    """
    Check if user has permission for a specific resource at a given scope level.
    Supports hierarchical inheritance:
    - Project permissions apply to all environments and services in the project
    - Environment permissions apply to all services in that environment
    - Project owners have all permissions (READ, WRITE, DELETE, ADMIN) for their projects
    
    Args:
        user: Current user dict
        action: Permission action (READ, WRITE, DELETE, ADMIN)
        scope: Permission scope (PROJECT, ENVIRONMENT, SERVICE)
        resource_id: Resource ID at the specified scope
        db: Database session
    
    Returns:
        True if user has permission, False otherwise
    """
    # Admins and super admins have all permissions
    if user.get('is_admin', False) or user.get('is_super_admin', False):
        return True
    
    user_id = user.get('id')
    if not user_id:
        return False
    
    action_str = action.value
    
    # Check ownership first - owners have all permissions
    if scope == PermissionScope.PROJECT:
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == resource_id)
        )
        project = project_result.scalar_one_or_none()
        if project and project.owner_id == user_id:
            return True
    elif scope == PermissionScope.ENVIRONMENT:
        env_result = await db.execute(
            select(EnvironmentModel).where(EnvironmentModel.id == resource_id)
        )
        env = env_result.scalar_one_or_none()
        if env and env.project_id:
            project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == env.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.owner_id == user_id:
                return True
    elif scope == PermissionScope.SERVICE:
        service_result = await db.execute(
            select(ServiceModel).where(ServiceModel.id == resource_id)
        )
        service = service_result.scalar_one_or_none()
        if service and service.project_id:
            project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == service.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.owner_id == user_id:
                return True
    
    # Check direct resource permissions
    # Use enum value for PostgreSQL enum column comparison
    query = select(ResourcePermission).where(
        ResourcePermission.user_id == user_id,
        ResourcePermission.scope == scope.value,  # Use .value to get "project", "environment", or "service"
        ResourcePermission.resource_id == resource_id,
    )
    result = await db.execute(query)
    resource_perms = result.scalars().all()
    
    for perm in resource_perms:
        if action_str in (perm.actions or []):
            return True
    
    # Check hierarchical inheritance
    if scope == PermissionScope.SERVICE:
        # Check environment-level permission inheritance
        # Users with WRITE/READ/DELETE/ADMIN access to an environment automatically
        # have the same access to all services in that environment
        service_result = await db.execute(
            select(ServiceModel).where(ServiceModel.id == resource_id)
        )
        service = service_result.scalar_one_or_none()
        if service and service.environment_id:
            env_query = select(ResourcePermission).where(
                ResourcePermission.user_id == user_id,
                ResourcePermission.scope == PermissionScope.ENVIRONMENT.value,  # Use .value for enum
                ResourcePermission.resource_id == service.environment_id,
            )
            env_result = await db.execute(env_query)
            env_perms = env_result.scalars().all()
            for perm in env_perms:
                if action_str in (perm.actions or []):
                    return True
        
        # Check project-level permission inheritance
        # Users with WRITE/READ/DELETE/ADMIN access to a project automatically
        # have the same access to all services in that project
        if service and service.project_id:
            proj_query = select(ResourcePermission).where(
                ResourcePermission.user_id == user_id,
                ResourcePermission.scope == PermissionScope.PROJECT.value,  # Use .value for enum
                ResourcePermission.resource_id == service.project_id,
            )
            proj_result = await db.execute(proj_query)
            proj_perms = proj_result.scalars().all()
            for perm in proj_perms:
                if action_str in (perm.actions or []):
                    return True
    
    elif scope == PermissionScope.ENVIRONMENT:
        # Check project-level permission inheritance
        # Users with WRITE/READ/DELETE/ADMIN access to a project automatically
        # have the same access to all environments in that project
        env_result = await db.execute(
            select(EnvironmentModel).where(EnvironmentModel.id == resource_id)
        )
        env = env_result.scalar_one_or_none()
        if env and env.project_id:
            proj_query = select(ResourcePermission).where(
                ResourcePermission.user_id == user_id,
                ResourcePermission.scope == PermissionScope.PROJECT.value,  # Use .value for enum
                ResourcePermission.resource_id == env.project_id,
            )
            proj_result = await db.execute(proj_query)
            proj_perms = proj_result.scalars().all()
            for perm in proj_perms:
                if action_str in (perm.actions or []):
                    return True
    
    return False


async def can_grant_resource_permission(
    user: Dict,
    scope: PermissionScope,
    resource_id: str,
    db: AsyncSession,
) -> bool:
    """
    Check if user can grant permissions for a resource.
    Only project owners and admins can grant permissions.
    
    Args:
        user: Current user dict
        scope: Permission scope (PROJECT, ENVIRONMENT, SERVICE)
        resource_id: Resource ID at the specified scope
        db: Database session
    
    Returns:
        True if user can grant permissions, False otherwise
    """
    # Admins and super admins can always grant permissions
    if user.get('is_admin', False) or user.get('is_super_admin', False):
        return True
    
    user_id = user.get('id')
    if not user_id:
        return False
    
    # For project scope, check if user is the project owner
    if scope == PermissionScope.PROJECT:
        result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == resource_id)
        )
        project = result.scalar_one_or_none()
        if project and project.owner_id == user_id:
            return True
    
    # For environment scope, check if user is the project owner
    elif scope == PermissionScope.ENVIRONMENT:
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project))
            .where(EnvironmentModel.id == resource_id)
        )
        env = result.scalar_one_or_none()
        if env and env.project_id:
            # Query project separately to check ownership
            project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == env.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.owner_id == user_id:
                return True
    
    # For service scope, check if user is the project owner
    elif scope == PermissionScope.SERVICE:
        result = await db.execute(
            select(ServiceModel)
            .where(ServiceModel.id == resource_id)
        )
        service = result.scalar_one_or_none()
        if service and service.project_id:
            # Query project separately to check ownership
            project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == service.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.owner_id == user_id:
                return True
    
    return False
