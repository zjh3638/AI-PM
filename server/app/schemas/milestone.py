from typing import Optional, Any
from datetime import date

from pydantic import BaseModel, Field, field_validator


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

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def parse_date_or_empty(cls, v: Any) -> Optional[date]:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            return date.fromisoformat(v.split("T")[0])
        return v


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

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def parse_date_or_empty(cls, v: Any) -> Optional[date]:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            return date.fromisoformat(v.split("T")[0])
        return v
