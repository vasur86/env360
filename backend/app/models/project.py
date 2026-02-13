"""
Project model
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Project(Base):
    """Project model - top level entity"""
    
    __tablename__ = "projects"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Unique constraint: project name must be unique globally
    __table_args__ = (
        UniqueConstraint('name', name='uq_project_name'),
    )
    
    # Relationships
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id], back_populates="owned_projects")
    environments: Mapped[List["Environment"]] = relationship("Environment", back_populates="project", cascade="all, delete-orphan")
    services: Mapped[List["Service"]] = relationship("Service", back_populates="project", cascade="all, delete-orphan")
    configs: Mapped[List["ProjectConfig"]] = relationship("ProjectConfig", back_populates="project", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Project {self.name}>"

