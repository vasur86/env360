"""
GraphQL resolvers for queries and mutations - PostgreSQL/SQLAlchemy version
"""
from typing import List, Optional, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from app.models.user import User
from app.models.project import Project
from app.models.environment import Environment
from app.models.service import Service
from app.models.config import ProjectConfig, EnvironmentConfig, ServiceConfig
from app.models.permission import Permission, UserPermission
from app.graphql_api.types import (
    User as UserType, Project as ProjectType, Environment as EnvironmentType, Service as ServiceType,
    ProjectConfig as ProjectConfigType, EnvironmentConfig as EnvironmentConfigType, ServiceConfig as ServiceConfigType,
    Permission as PermissionType, UserPermission as UserPermissionType,
)


def model_to_user(user: User) -> UserType:
    """Convert User model to GraphQL type"""
    return UserType(
        id=user.id,
        email=user.email,
        name=user.name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def model_to_project(project: Project, include_nested: bool = True) -> ProjectType:
    """Convert Project model to GraphQL type
    
    Args:
        project: The Project model instance
        include_nested: If False, skip loading nested environments/services (for nested contexts)
    """
    environments = []
    services = []
    
    if include_nested:
        # Try to access relationships, but catch lazy loading errors
        # This is safer than trying to inspect loading state
        try:
            # Try to access environments - if it triggers lazy loading, it will raise an error
            # We catch it and leave environments as empty list
            if hasattr(project, 'environments'):
                try:
                    env_list = list(project.environments) if project.environments else []
                    environments = [model_to_environment(e) for e in env_list]
                except Exception:
                    # Lazy loading was triggered, skip environments
                    environments = []
        except Exception:
            # Any other error, skip environments
            environments = []
        
        try:
            # Try to access services - if it triggers lazy loading, it will raise an error
            if hasattr(project, 'services'):
                try:
                    svc_list = list(project.services) if project.services else []
                    services = [model_to_service(s) for s in svc_list]
                except Exception:
                    # Lazy loading was triggered, skip services
                    services = []
        except Exception:
            # Any other error, skip services
            services = []
    
    return ProjectType(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        environments=environments,
        services=services,
    )


def model_to_environment(env: Environment) -> EnvironmentType:
    """Convert Environment model to GraphQL type"""
    # When converting project in nested context, don't include nested relationships
    # to avoid circular lazy loading issues
    project = None
    if env.project:
        project = model_to_project(env.project, include_nested=False)
    
    return EnvironmentType(
        id=env.id,
        name=env.name,
        type=env.type.value if hasattr(env.type, 'value') else str(env.type),
        url=env.url,
        cluster_id=getattr(env, "cluster_id", None),
        cluster=None,
        project_id=env.project_id,
        project=project,
        created_at=env.created_at,
        updated_at=env.updated_at,
        services=[model_to_service(s) for s in (env.services or [])],
    )


def model_to_service(service: Service, include_nested: bool = True) -> ServiceType:
    """Convert Service model to GraphQL type
    
    Args:
        service: The Service model instance
        include_nested: If False, skip loading nested project/environments (for nested contexts)
    """
    project = None
    environments = []
    
    if include_nested:
        # Try to access relationships, but catch lazy loading errors
        try:
            if hasattr(service, 'project') and service.project:
                project = model_to_project(service.project, include_nested=False)
        except Exception:
            project = None
        
        try:
            if hasattr(service, 'environments'):
                try:
                    env_list = list(service.environments) if service.environments else []
                    environments = [model_to_environment(e) for e in env_list]
                except Exception:
                    # Lazy loading was triggered, skip environments
                    environments = []
        except Exception:
            environments = []
    
    return ServiceType(
        id=service.id,
        name=service.name,
        description=service.description,
        type=service.type.value if hasattr(service.type, 'value') else str(service.type),
        project_id=service.project_id,
        project=project,
        environments=environments,
        owner=service.owner,
        status=service.status.value if hasattr(service.status, 'value') else str(service.status),
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


async def resolve_users(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: AsyncSession = None,
    current_user: Dict = None,
) -> tuple[List[UserType], int]:
    """Resolve users query - returns all non-deleted users with total count"""
    # Build base query - exclude soft-deleted users
    base_query = select(User).where(User.deleted_at.is_(None))
    
    if search:
        base_query = base_query.where(
            or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%")
            )
        )
    
    # Count total items - create a separate count query
    count_query = select(func.count(User.id)).where(User.deleted_at.is_(None))
    if search:
        count_query = count_query.where(
            or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%")
            )
        )
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()
    
    # Get paginated items
    query = base_query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    
    items = [model_to_user(u) for u in users]
    return (items, total)


async def resolve_projects(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: AsyncSession = None,
    current_user: Dict = None,
    require_write_permission: bool = False,
) -> tuple[List[ProjectType], int]:
    """Resolve projects query - returns projects for authenticated users with optional write permission filter"""
    from app.models.permission import PermissionAction, PermissionScope, ResourcePermission
    
    # Build base query - exclude soft-deleted projects
    base_query = select(Project).where(Project.deleted_at.is_(None))
    
    if search:
        base_query = base_query.where(Project.name.ilike(f"%{search}%"))
    
    # If filtering by write permission, use efficient batch permission checking
    if require_write_permission and current_user:
        is_admin = current_user.get('is_admin', False)
        user_id = current_user.get('id')
        
        # Get all projects first (before permission filtering)
        # Use nested selectinload to load environments and their services
        query = base_query.options(
            selectinload(Project.environments).selectinload(Environment.services),
            selectinload(Project.services),
        )
        result = await db.execute(query)
        all_projects = result.scalars().all()
        
        if not all_projects:
            return ([], 0)
        
        # Ensure relationships are fully loaded by accessing them while still in async context
        # This prevents lazy loading issues
        for project in all_projects:
            # Access relationships to ensure they're loaded
            if project.environments:
                for env in project.environments:
                    _ = list(env.services) if env.services else []
            _ = list(project.services) if project.services else []
        
        # Batch fetch all resource permissions for this user and these projects in one query
        project_ids = [p.id for p in all_projects]
        # Note: ResourcePermission.scope is a PostgreSQL ENUM column, so we compare with the string value
        permissions_query = select(ResourcePermission).where(
            ResourcePermission.user_id == user_id,
            ResourcePermission.scope == 'project',  # Use string value directly for PostgreSQL enum
            ResourcePermission.resource_id.in_(project_ids),
        )
        permissions_result = await db.execute(permissions_query)
        user_permissions = permissions_result.scalars().all()
        
        # Create a set of project IDs where user has write permission
        projects_with_write = set()
        for perm in user_permissions:
            if perm.actions and 'write' in perm.actions:
                projects_with_write.add(perm.resource_id)
        
        # Filter projects: include if user is admin, owner, or has write permission
        filtered_projects = []
        for project in all_projects:
            if is_admin or project.owner_id == user_id or project.id in projects_with_write:
                filtered_projects.append(project)
        
        # Count total after filtering
        total = len(filtered_projects)
        
        # Apply pagination
        paginated_projects = filtered_projects[skip:skip + limit]
        
        return ([model_to_project(p) for p in paginated_projects], total)
    else:
        # No permission filtering - use efficient pagination
        # Count total items - create a separate count query
        count_query = select(func.count(Project.id)).where(Project.deleted_at.is_(None))
        if search:
            count_query = count_query.where(Project.name.ilike(f"%{search}%"))
        count_result = await db.execute(count_query)
        total = count_result.scalar_one()
        
        # Get paginated items
        # Use nested selectinload to load environments and their services
        query = base_query.options(
            selectinload(Project.environments).selectinload(Environment.services),
            selectinload(Project.services),
        ).offset(skip).limit(limit)
        result = await db.execute(query)
        projects = result.scalars().all()
        
        # Ensure relationships are fully loaded by accessing them while still in async context
        # This prevents lazy loading issues
        for project in projects:
            # Access relationships to ensure they're loaded
            if project.environments:
                for env in project.environments:
                    _ = list(env.services) if env.services else []
            _ = list(project.services) if project.services else []
        
        return ([model_to_project(p) for p in projects], total)


async def resolve_environments(
    skip: int = 0,
    limit: int = 100,
    project_id: Optional[str] = None,
    db: AsyncSession = None,
    current_user: Dict = None,
) -> tuple[List[EnvironmentType], int]:
    """Resolve environments query - returns all non-deleted environments for any authenticated user with total count"""
    base_query = select(Environment).where(Environment.deleted_at.is_(None))
    
    if project_id:
        base_query = base_query.where(Environment.project_id == project_id)
    
    # Count total items
    count_query = select(func.count(Environment.id)).where(Environment.deleted_at.is_(None))
    if project_id:
        count_query = count_query.where(Environment.project_id == project_id)
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()
    
    # Get paginated items
    query = base_query.options(
        selectinload(Environment.project),
        selectinload(Environment.services),
    ).offset(skip).limit(limit)
    result = await db.execute(query)
    environments = result.scalars().all()
    
    # Ensure relationships are fully loaded by accessing them while still in async context
    # This prevents lazy loading issues
    for env in environments:
        # Access relationships to ensure they're loaded
        _ = list(env.services) if env.services else []
    
    return ([model_to_environment(env) for env in environments], total)


async def resolve_services(
    skip: int = 0,
    limit: int = 100,
    project_id: Optional[str] = None,
    environment_id: Optional[str] = None,
    db: AsyncSession = None,
    current_user: Dict = None,
) -> tuple[List[ServiceType], int]:
    """Resolve services query - returns all non-deleted services for any authenticated user with total count"""
    from app.models.service import service_environment_association
    
    base_query = select(Service).where(Service.deleted_at.is_(None))
    
    if project_id:
        base_query = base_query.where(Service.project_id == project_id)
    if environment_id:
        # Filter services that are linked to the specified environment via the association table
        base_query = base_query.join(
            service_environment_association,
            Service.id == service_environment_association.c.service_id
        ).where(service_environment_association.c.environment_id == environment_id)
    
    # Count total items
    count_query = select(func.count(Service.id)).where(Service.deleted_at.is_(None))
    if project_id:
        count_query = count_query.where(Service.project_id == project_id)
    if environment_id:
        count_query = count_query.join(
            service_environment_association,
            Service.id == service_environment_association.c.service_id
        ).where(service_environment_association.c.environment_id == environment_id)
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()
    
    # Get paginated items
    query = base_query.options(
        selectinload(Service.project),
        selectinload(Service.environments),
    ).offset(skip).limit(limit).distinct()  # distinct() needed when joining with association table
    result = await db.execute(query)
    services = result.scalars().all()
    
    # Ensure relationships are fully loaded by accessing them while still in async context
    # This prevents lazy loading issues
    for service in services:
        # Access relationships to ensure they're loaded (if needed)
        _ = service.project
        _ = list(service.environments) if service.environments else []
    
    return ([model_to_service(service) for service in services], total)
