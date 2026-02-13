"""
Environment model
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, UniqueConstraint, TypeDecorator
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class EnvironmentType(str, enum.Enum):
    """Environment type enumeration"""
    # New values (preferred)
    DEVELOPMENT = "development"
    TESTING = "testing"
    STAGING = "staging"
    PRODUCTION = "production"
    SANDBOX = "sandbox"
    # Legacy values (for backward compatibility)
    DEV = "dev"
    PROD = "prod"


class EnvironmentTypeEnum(TypeDecorator):
    """Custom type decorator to ensure enum values are used, not names"""
    # Use String as base, then cast to PostgreSQL ENUM
    impl = String
    cache_ok = True
    
    def load_dialect_impl(self, dialect):
        """Use PostgreSQL ENUM for PostgreSQL, String for others"""
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_ENUM(
                'development', 'testing', 'staging', 'production', 'sandbox', 'dev', 'prod',
                name='environmenttype',
                create_type=False,  # Type already exists in database
                native_enum=True
            ))
        else:
            return dialect.type_descriptor(String(50))
    
    def process_bind_param(self, value, dialect):
        """Convert enum instance to its string value before binding to database"""
        if value is None:
            return None
        if isinstance(value, EnvironmentType):
            # Extract the enum value (the string, not the member name)
            # For str, enum.Enum, value.value returns the string value
            return value.value
        if isinstance(value, str):
            # If it's already a string, validate it's a valid enum value
            # Check if it's a member name (uppercase) and convert to value
            try:
                # Try to get enum by value first
                env_type = EnvironmentType(value)
                return env_type.value
            except ValueError:
                # If not found by value, it might be a member name
                # Try to find by member name
                for member in EnvironmentType:
                    if member.name == value:
                        return member.value
                # If still not found, return as-is (might be legacy data)
                return value
        return value
    
    def process_result_value(self, value, dialect):
        """Convert database string value back to enum instance"""
        if value is None:
            return None
        if isinstance(value, str):
            try:
                return EnvironmentType(value)
            except ValueError:
                # If value doesn't match any enum member, return as string
                return value
        if isinstance(value, EnvironmentType):
            return value
        return value


class Environment(Base):
    """Environment model - belongs to a project"""
    
    __tablename__ = "environments"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    type: Mapped[EnvironmentType] = mapped_column(EnvironmentTypeEnum, nullable=False, index=True)
    url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cluster_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("kubernetes_clusters.id", ondelete="SET NULL"), nullable=True, index=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: environment name must be unique within a project
    __table_args__ = (
        UniqueConstraint('name', 'project_id', name='uq_environment_name_project'),
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="environments")
    services: Mapped[List["Service"]] = relationship(
        "Service",
        secondary="service_environments",
        back_populates="environments"
    )
    configs: Mapped[List["EnvironmentConfig"]] = relationship("EnvironmentConfig", back_populates="environment", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Environment {self.name} ({self.type})>"

