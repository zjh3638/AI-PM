from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    dimension: str = "PROJECT"
    dimension_id: str = Field(min_length=1)
    meeting_type: str = "WEEKLY"


class MeetingNote(BaseModel):
    who: str = Field(min_length=1)
    text: str = Field(min_length=1)
    note_type: str = "speech"


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None


class MeetingOut(BaseModel):
    id: str
    title: str
    dimension: str
    dimension_id: str
    meeting_type: str
    status: str
    summary: Optional[str] = None
    notes: Optional[list[dict]] = None
    host_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BoardMilestone(BaseModel):
    id: str
    name: str
    phase: str
    pct: float
    due_date: Optional[datetime] = None
    overdue: bool
    total_tasks: int
    done_tasks: int
    completed: list[dict]
    in_progress: list[dict]
    delayed: list[dict]


class BoardRisk(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    level: str
    owner_name: Optional[str] = None
    status: str
    milestone_name: Optional[str] = None


class BoardData(BaseModel):
    workspace_id: str
    workspace_name: str
    owner_name: Optional[str] = None
    health: str
    pct: float
    total_tasks: int
    done: int
    overdue: int
    milestones: list[BoardMilestone]
    risks: list[BoardRisk]
    recent_completed: list[dict]
