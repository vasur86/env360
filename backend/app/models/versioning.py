"""
Models for service versions and deployments
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Enum, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum


class ServiceVersion(Base):
    """Immutable record of a service's versioned configuration."""

    __tablename__ = "service_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    service_id: Mapped[str] = mapped_column(String, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    version_label: Mapped[str] = mapped_column(String, nullable=False, index=True)  # e.g., "v1", "v2"
    config_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)
    spec_json: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # serialized spec for comparison/audit
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('service_id', 'version_label', name='uq_service_versions_label'),
    )

    service = relationship("Service", back_populates="versions")


class DeploymentStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class Deployment(Base):
    """A deployment event of a service version."""

    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    service_id: Mapped[str] = mapped_column(String, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id: Mapped[str] = mapped_column(String, ForeignKey("service_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    environment_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("environments.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_uuid: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    steps: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # ordered list of workflow step dicts
    downstream_overrides: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # [{serviceName, serviceId, version}]
    status: Mapped[DeploymentStatus] = mapped_column(Enum(DeploymentStatus), default=DeploymentStatus.PENDING, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    service_version = relationship("ServiceVersion")
    service = relationship("Service", back_populates="deployments")

# Note: Custom queue-related models removed in favor of native DBOS workflows.
