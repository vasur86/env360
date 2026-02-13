"""
User model
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class User(Base):
    """User model for authentication and authorization"""
    
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Relationships
    owned_projects: Mapped[List["Project"]] = relationship("Project", foreign_keys="Project.owner_id", back_populates="owner")
    permissions: Mapped[List["UserPermission"]] = relationship("UserPermission", foreign_keys="UserPermission.user_id", back_populates="user", cascade="all, delete-orphan")
    resource_permissions: Mapped[List["ResourcePermission"]] = relationship("ResourcePermission", back_populates="user", cascade="all, delete-orphan", foreign_keys="ResourcePermission.user_id")
    
    def __repr__(self):
        return f"<User {self.email}>"

