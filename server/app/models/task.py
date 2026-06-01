from typing import Optional
from datetime import date, datetime

from sqlalchemy import String, Text, Float, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Task(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tasks"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    parent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    epic_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True, index=True)
    iteration_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("iterations.id"), nullable=True)
    milestone_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("milestones.id"), nullable=True, index=True)

    task_type: Mapped[str] = mapped_column(String(20), nullable=False, default="TASK")
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="TODO")
    phase: Mapped[str] = mapped_column(String(30), default="REQUIREMENTS")
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    estimation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimation_unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0)

    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # Self-referential relationships
    parent = relationship("Task", remote_side="Task.id", backref="children", foreign_keys=[parent_id])
    epic = relationship("Task", remote_side="Task.id", backref="stories", foreign_keys=[epic_id])
    iteration = relationship("Iteration", back_populates="tasks")
    assignee = relationship("User", backref="assigned_tasks", foreign_keys=[assignee_id])
    reviewer = relationship("User", backref="review_tasks", foreign_keys=[reviewer_id])
    milestone = relationship("Milestone", back_populates="tasks")
