"""
Configuration models for projects, environments, and services
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy import Column, String, Text, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class ProjectConfig(Base):
    """Project-level configuration"""
    
    __tablename__ = "project_configs"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)  # For complex configurations
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: config key must be unique within a project
    __table_args__ = (
        UniqueConstraint('project_id', 'key', name='uq_project_config_key'),
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="configs")
    
    def __repr__(self):
        return f"<ProjectConfig {self.key} for project {self.project_id}>"


class EnvironmentConfig(Base):
    """Environment-level configuration"""
    
    __tablename__ = "environment_configs"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    environment_id: Mapped[str] = mapped_column(String, ForeignKey("environments.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    workflow_uuid: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: config key must be unique within an environment
    __table_args__ = (
        UniqueConstraint('environment_id', 'key', name='uq_environment_config_key'),
    )
    
    # Relationships
    environment: Mapped["Environment"] = relationship("Environment", back_populates="configs")
    
    def __repr__(self):
        return f"<EnvironmentConfig {self.key} for environment {self.environment_id}>"


class ServiceConfig(Base):
    """Service-level configuration"""
    
    __tablename__ = "service_configs"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    service_id: Mapped[str] = mapped_column(String, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: config key must be unique within a service
    __table_args__ = (
        UniqueConstraint('service_id', 'key', name='uq_service_config_key'),
    )
    
    # Relationships
    service: Mapped["Service"] = relationship("Service", back_populates="configs")
    
    def __repr__(self):
        return f"<ServiceConfig {self.key} for service {self.service_id}>"


class AdminConfig(Base):
    """Global admin-level configuration (singleton key-value store)"""
    
    __tablename__ = "admin_configs"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    
    def __repr__(self):
        return f"<AdminConfig {self.key}>"

