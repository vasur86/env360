"""
Environment schemas
"""
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.models.environment import EnvironmentType


class EnvironmentBase(BaseModel):
    name: str
    type: EnvironmentType
    url: Optional[str] = None


class EnvironmentCreate(EnvironmentBase):
    project_id: str


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[EnvironmentType] = None
    url: Optional[str] = None


class EnvironmentResponse(EnvironmentBase):
    id: str
    project_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

