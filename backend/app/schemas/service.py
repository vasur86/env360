"""
Service schemas
"""
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.models.service import ServiceType, ServiceStatus


class ServiceBase(BaseModel):
    name: str
    type: ServiceType
    owner: Optional[str] = None
    repo: Optional[str] = None
    runtime: Optional[str] = None
    status: ServiceStatus = ServiceStatus.UNKNOWN


class ServiceCreate(ServiceBase):
    project_id: str
    environment_id: Optional[str] = None


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[ServiceType] = None
    environment_id: Optional[str] = None
    owner: Optional[str] = None
    repo: Optional[str] = None
    runtime: Optional[str] = None
    status: Optional[ServiceStatus] = None


class ServiceResponse(ServiceBase):
    id: str
    project_id: str
    environment_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

