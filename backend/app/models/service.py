"""
Service model
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, UniqueConstraint, Table
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum

# Many-to-many association table for services and environments
service_environment_association = Table(
    'service_environments',
    Base.metadata,
    Column('service_id', String, ForeignKey('services.id', ondelete='CASCADE'), primary_key=True),
    Column('environment_id', String, ForeignKey('environments.id', ondelete='CASCADE'), primary_key=True),
)


class ServiceType(str, enum.Enum):
    """Service type enumeration"""
    MICROSERVICE = "microservice"
    WEBAPP = "webapp"
    DATABASE = "database"
    QUEUE = "queue"


class ServiceStatus(str, enum.Enum):
    """Service status enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


class Service(Base):
    """Service model - belongs to a project and can be linked to multiple environments"""
    
    __tablename__ = "services"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    type: Mapped[ServiceType] = mapped_column(Enum(ServiceType), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[ServiceStatus] = mapped_column(Enum(ServiceStatus), default=ServiceStatus.UNKNOWN, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: service name must be unique within a project
    __table_args__ = (
        UniqueConstraint('name', 'project_id', name='uq_service_name_project'),
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="services")
    environments: Mapped[List["Environment"]] = relationship(
        "Environment",
        secondary=service_environment_association,
        back_populates="services"
    )
    configs: Mapped[List["ServiceConfig"]] = relationship("ServiceConfig", back_populates="service", cascade="all, delete-orphan")
    versions: Mapped[List["ServiceVersion"]] = relationship("ServiceVersion", back_populates="service", cascade="all, delete-orphan")
    deployments: Mapped[List["Deployment"]] = relationship("Deployment", back_populates="service", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Service {self.name} ({self.type})>"

