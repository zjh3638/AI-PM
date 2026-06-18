from typing import Optional
from pydantic import BaseModel, Field


class ProjectGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


class ProjectGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


class ProjectGroupItemAdd(BaseModel):
    workspace_id: str


class ProjectGroupResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    creator_id: str
    creator_name: Optional[str] = None
    workspace_count: int = 0
    workspaces: list[dict] = []
    created_at: str
    updated_at: str