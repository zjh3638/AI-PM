from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    email: Optional[str] = None
    password: str = Field(min_length=8)
    department_id: Optional[str] = None
    system_role: str = "MEMBER"


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[str] = None
    department_id: Optional[str] = None
    system_role: Optional[str] = None
    status: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    system_role: str
    status: str
    source: str
    created_at: str
    updated_at: str


class UserListParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    keyword: Optional[str] = None
    status: Optional[str] = None
    department_id: Optional[str] = None
