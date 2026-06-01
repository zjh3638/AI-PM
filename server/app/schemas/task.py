from typing import Optional
from datetime import date

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    task_type: str = "TASK"
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    status: str = "TODO"
    phase: str = "REQUIREMENTS"
    priority: str = "MEDIUM"
    severity: Optional[str] = None
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: str
    assignee_id: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: int = 0
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = None
    phase: Optional[str] = None
    priority: Optional[str] = None
    severity: Optional[str] = None
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: Optional[str] = None
    assignee_id: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: Optional[int] = None
    due_date: Optional[date] = None


class TaskResponse(BaseModel):
    id: str
    workspace_id: str
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: Optional[str] = None
    milestone_name: Optional[str] = None
    task_type: str
    title: str
    description: Optional[str] = None
    status: str
    phase: str = "REQUIREMENTS"
    priority: str
    severity: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: int = 0
    due_date: Optional[str] = None
    children_count: int = 0
    created_at: str
    updated_at: str


class TaskMoveRequest(BaseModel):
    new_status: str
    sort_order: int = 0


class EpicResponse(BaseModel):
    id: str
    title: str
    task_type: str
    status: str
    priority: str
    total_stories: int = 0
    done_stories: int = 0
    total_points: float = 0
    completed_points: float = 0
    created_at: str
