from typing import Optional
from datetime import datetime

from pydantic import BaseModel


class MeetingCreate(BaseModel):
    title: str
    dimension: str = "PROJECT"  # "PROJECT_GROUP" | "PROJECT"
    dimension_id: str
    meeting_type: str = "WEEKLY"


class MeetingNote(BaseModel):
    who: str
    text: str
    note_type: str = "speech"  # "speech" | "decision" | "action"


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
    notes: Optional[list] = None
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
    due_date: Optional[str] = None
    overdue: bool
    total_tasks: int
    done_tasks: int
    completed: list
    in_progress: list
    delayed: list


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
    pct: int
    total_tasks: int
    done: int
    overdue: int
    milestones: list[BoardMilestone]
    risks: list[BoardRisk]
    recent_completed: list
