from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    dimension: str = "PROJECT"
    dimension_id: str = ""
    meeting_type: str = "WEEKLY"
    workspace_ids: Optional[list[str]] = None  # for dimension=CUSTOM (snapshot)


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


# ── Meeting big-screen timeline (multi-project milestone axis) ─────────

class TimelineMilestone(BaseModel):
    id: str
    name: str
    phase: str
    status: str  # done / active / risk / late / upcoming
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    actual_date: Optional[str] = None
    slip_days: int = 0
    owner_name: Optional[str] = None
    depends_on_id: Optional[str] = None
    pct: float
    total_tasks: int
    done_tasks: int


class TimelineTask(BaseModel):
    id: str
    title: str
    milestone_id: Optional[str] = None
    assignee_name: Optional[str] = None
    status: str
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    pct: int
    critical: bool = False
    is_milestone_row: bool = False


class TimelineProject(BaseModel):
    workspace_id: str
    name: str
    owner_name: Optional[str] = None
    department_name: Optional[str] = None
    health: str
    pct: float
    milestones: list[TimelineMilestone]
    tasks: list[TimelineTask]


class TimelineKeyPerson(BaseModel):
    user_id: str
    name: str
    role: Optional[str] = None
    pct: float
    total_tasks: int
    done_tasks: int
    overdue_tasks: int
    load: int
    flag: str  # ok / warn / block


class TimelineRisk(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    level: str
    status: str
    owner_name: Optional[str] = None
    milestone_name: Optional[str] = None
    workspace_name: Optional[str] = None
    mitigation: Optional[str] = None


class TimelineData(BaseModel):
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    projects: list[TimelineProject]
    key_persons: list[TimelineKeyPerson]
    risks: list[TimelineRisk]
