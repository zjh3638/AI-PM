from typing import Optional
from datetime import date

from pydantic import BaseModel, Field


class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    plan: Optional[str] = None
    owner_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    sort_order: int = 0
    color: Optional[str] = None
    phase: Optional[str] = "PLANNING"
    depends_on_id: Optional[str] = None


class MilestoneUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    plan: Optional[str] = None
    owner_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    phase: Optional[str] = None
    sort_order: Optional[int] = None
    color: Optional[str] = None
    depends_on_id: Optional[str] = None
