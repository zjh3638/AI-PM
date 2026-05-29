from typing import Optional

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    key: str = Field(min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    description: Optional[str] = None
    type: str = "PROJECT"
    visibility: str = "PRIVATE"
    department_id: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    visibility: Optional[str] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    key: str
    description: Optional[str] = None
    type: str
    status: str
    visibility: str
    department_id: Optional[str] = None
    git_repo_path: Optional[str] = None
    member_count: int = 0
    created_at: str
    updated_at: str


class MemberCreate(BaseModel):
    user_id: str
    role: str = "MEMBER"


class MemberUpdate(BaseModel):
    role: str


class MemberResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_avatar: Optional[str] = None
    ai_agent_id: Optional[str] = None
    role: str
    created_at: str
