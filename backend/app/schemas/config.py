"""
Configuration schemas
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class ProjectConfigBase(BaseModel):
    key: str
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class ProjectConfigCreate(ProjectConfigBase):
    project_id: str


class ProjectConfigUpdate(BaseModel):
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class ProjectConfigResponse(ProjectConfigBase):
    id: str
    project_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class EnvironmentConfigBase(BaseModel):
    key: str
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class EnvironmentConfigCreate(EnvironmentConfigBase):
    environment_id: str


class EnvironmentConfigUpdate(BaseModel):
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class EnvironmentConfigResponse(EnvironmentConfigBase):
    id: str
    environment_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ServiceConfigBase(BaseModel):
    key: str
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class ServiceConfigCreate(ServiceConfigBase):
    service_id: str


class ServiceConfigUpdate(BaseModel):
    value: Optional[str] = None
    config_data: Optional[Dict[str, Any]] = None


class ServiceConfigResponse(ServiceConfigBase):
    id: str
    service_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

