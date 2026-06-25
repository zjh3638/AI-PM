from typing import Optional
from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: Optional[str] = None
    sort_order: int = 0
    ldap_dn: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None
    ldap_dn: Optional[str] = None


class DepartmentResponse(BaseModel):
    id: str
    name: str
    parent_id: Optional[str] = None
    path: str
    sort_order: int
    ldap_dn: Optional[str] = None
    user_count: int = 0
    children: list["DepartmentResponse"] = []
    created_at: str
    updated_at: str
