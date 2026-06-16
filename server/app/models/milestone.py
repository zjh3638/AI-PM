from typing import Optional
from datetime import date

from sqlalchemy import String, Text, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

MILESTONE_PHASES = ["PLANNING", "ACTIVE", "REVIEW", "DONE"]

MILESTONE_PHASE_LABELS = {
    "PLANNING": "计划",
    "ACTIVE": "执行中",
    "REVIEW": "审核中",
    "DONE": "已完成",
}


class Milestone(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "milestones"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    phase: Mapped[str] = mapped_column(String(20), default="PLANNING")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    depends_on_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("milestones.id"), nullable=True)

    tasks = relationship("Task", back_populates="milestone")
    owner = relationship("User", backref="owned_milestones", foreign_keys=[owner_id])
    depends_on = relationship("Milestone", remote_side="Milestone.id", backref="dependent_milestones", foreign_keys=[depends_on_id])
