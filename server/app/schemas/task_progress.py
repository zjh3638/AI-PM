from typing import Optional

from pydantic import BaseModel, Field


class TaskProgressCreate(BaseModel):
    progress: int = Field(ge=0, le=100)
    note: Optional[str] = None


class TaskProgressResponse(BaseModel):
    id: str
    task_id: str
    progress: int
    note: Optional[str] = None
    created_by: str
    creator_name: Optional[str] = None
    created_at: str
