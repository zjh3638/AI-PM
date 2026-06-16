from typing import Optional
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

RISK_TYPES = ["SCHEDULE", "QUALITY", "RESOURCE", "SCOPE", "OTHER"]
RISK_SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH"]
RISK_STATUSES = ["IDENTIFIED", "MITIGATING", "CLOSED"]

RISK_TYPE_LABELS = {
    "SCHEDULE": "进度",
    "QUALITY": "质量",
    "RESOURCE": "资源",
    "SCOPE": "范围",
    "OTHER": "其他",
}

RISK_STATUS_LABELS = {
    "IDENTIFIED": "已识别",
    "MITIGATING": "应对中",
    "CLOSED": "已关闭",
}


class Risk(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "risks"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    milestone_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("milestones.id"), nullable=True, index=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risk_type: Mapped[str] = mapped_column(String(20), nullable=False, default="OTHER")
    probability: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    impact: Mapped[str] = mapped_column(String(20), nullable=False, default="MEDIUM")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="IDENTIFIED")
    mitigation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    milestone = relationship("Milestone", backref="risks")
    owner = relationship("User", backref="owned_risks", foreign_keys=[owner_id])
