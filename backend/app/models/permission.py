"""
Permission models for fine-grained access control
"""
from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class PermissionAction(str, enum.Enum):
    """Permission action types"""
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"


class PermissionResource(str, enum.Enum):
    """Permission resource types"""
    PROJECT = "project"
    ENVIRONMENT = "environment"
    SERVICE = "service"
    CONFIG = "config"
    USER = "user"
    PERMISSION = "permission"


class Permission(Base):
    """Permission definition"""
    
    __tablename__ = "permissions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False, index=True)
    action = Column(Enum(PermissionAction), nullable=False)
    resource = Column(Enum(PermissionResource), nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<Permission {self.name} ({self.action}:{self.resource})>"


class UserPermission(Base):
    """User-specific permissions"""
    
    __tablename__ = "user_permissions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(String, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_id = Column(String, nullable=True, index=True)  # Specific resource (project_id, etc.)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(String, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="permissions")
    permission = relationship("Permission", back_populates="user_permissions")
    
    # Unique constraint: one permission per user per resource
    __table_args__ = (
        UniqueConstraint('user_id', 'permission_id', 'resource_id', name='uq_user_permission_resource'),
    )
    
    def __repr__(self):
        return f"<UserPermission user={self.user_id} permission={self.permission_id}>"


# Add back reference to Permission
Permission.user_permissions = relationship("UserPermission", back_populates="permission")


class PermissionScope(str, enum.Enum):
    """Permission scope levels for hierarchical access control"""
    PROJECT = "project"
    ENVIRONMENT = "environment"
    SERVICE = "service"


class ResourcePermission(Base):
    """
    Resource-level permissions for hierarchical access control.
    Allows project owners and admins to grant permissions at project/environment/service levels.
    """
    
    __tablename__ = "resource_permissions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Use postgresql.ENUM with explicit values to match the database enum type
    scope = Column(postgresql.ENUM('project', 'environment', 'service', name='permissionscope', create_type=False), nullable=False, index=True)  # PROJECT, ENVIRONMENT, or SERVICE
    resource_id = Column(String, nullable=False, index=True)  # project_id, environment_id, or service_id
    actions = Column(JSON, nullable=False)  # List of allowed actions: ["read", "write", "delete", "admin"]
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    granted_by = Column(String, ForeignKey("users.id"), nullable=False)  # Project owner or admin who granted this
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="resource_permissions")
    granter = relationship("User", foreign_keys=[granted_by])
    
    # Unique constraint: one permission per user per resource
    __table_args__ = (
        UniqueConstraint('user_id', 'scope', 'resource_id', name='uq_user_resource_permission'),
    )
    
    def __repr__(self):
        return f"<ResourcePermission user={self.user_id} scope={self.scope.value} resource={self.resource_id}>"

