from typing import Optional

from pydantic import BaseModel, Field


class RiskCreate(BaseModel):
    milestone_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    risk_type: str = "OTHER"
    probability: str = "MEDIUM"
    impact: str = "MEDIUM"
    mitigation: Optional[str] = None
    owner_id: Optional[str] = None


class RiskUpdate(BaseModel):
    milestone_id: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    risk_type: Optional[str] = None
    probability: Optional[str] = None
    impact: Optional[str] = None
    mitigation: Optional[str] = None
    owner_id: Optional[str] = None


class RiskClose(BaseModel):
    pass
