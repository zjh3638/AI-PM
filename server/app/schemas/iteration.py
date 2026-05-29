from typing import Optional
from datetime import date

from pydantic import BaseModel, Field


class IterationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    goal: Optional[str] = None
    start_date: date
    end_date: date
    capacity_points: float = 0


class IterationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    capacity_points: Optional[float] = None


class IterationResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    goal: Optional[str] = None
    start_date: str
    end_date: str
    capacity_points: float = 0
    committed_points: float = 0
    status: str
    task_count: int = 0
    created_at: str
    updated_at: str
