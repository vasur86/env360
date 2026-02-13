"""
Environment variables and secrets models with scope support
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class VariableScope(str, enum.Enum):
    """Scope for variables and secrets"""
    PROJECT = "project"
    ENVIRONMENT = "environment"
    SERVICE = "service"


class EnvironmentVariable(Base):
    """Environment variable with scope support"""
    
    __tablename__ = "environment_variables"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scope: Mapped[VariableScope] = mapped_column(SQLEnum(VariableScope), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String, nullable=False, index=True)  # project_id, environment_id, or service_id
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Note: Unique constraint is enforced via partial unique index in migration
    # that excludes soft-deleted records (WHERE deleted_at IS NULL)
    # This allows recreating a key after it's been soft-deleted
    
    def __repr__(self):
        return f"<EnvironmentVariable {self.key} for {self.scope} {self.resource_id}>"


class Secret(Base):
    """Secret with scope support"""
    
    __tablename__ = "secrets"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scope: Mapped[VariableScope] = mapped_column(SQLEnum(VariableScope), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String, nullable=False, index=True)  # project_id, environment_id, or service_id
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Should be encrypted in production
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Note: Unique constraint is enforced via partial unique index in migration
    # that excludes soft-deleted records (WHERE deleted_at IS NULL)
    # This allows recreating a key after it's been soft-deleted
    
    def __repr__(self):
        return f"<Secret {self.key} for {self.scope} {self.resource_id}>"
