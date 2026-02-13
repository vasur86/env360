"""
Permission schemas
"""
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.models.permission import PermissionAction, PermissionResource


class PermissionBase(BaseModel):
    name: str
    action: PermissionAction
    resource: PermissionResource
    description: Optional[str] = None


class PermissionCreate(PermissionBase):
    pass


class PermissionResponse(PermissionBase):
    id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserPermissionBase(BaseModel):
    permission_id: str
    resource_id: Optional[str] = None


class UserPermissionCreate(UserPermissionBase):
    user_id: str
    granted_by: Optional[str] = None


class UserPermissionResponse(UserPermissionBase):
    id: str
    user_id: str
    granted_at: datetime
    granted_by: Optional[str] = None
    
    class Config:
        from_attributes = True

