from typing import Optional
from datetime import date

from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    report_type: str = "WEEKLY"
    title: Optional[str] = Field(default=None, max_length=200)
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class ReportUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = None


class ReportGenerateRequest(BaseModel):
    report_type: str = "WEEKLY"
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class ReportPolishRequest(BaseModel):
    content: str = Field(min_length=1)
    instruction: Optional[str] = Field(default=None, max_length=500)


class ReportPushRequest(BaseModel):
    channel: str = "wecom"
