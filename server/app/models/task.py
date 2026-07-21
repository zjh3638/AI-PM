from typing import Optional
from datetime import date, datetime

from sqlalchemy import String, Text, Float, Integer, Date, ForeignKey, JSON
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
    # Story-specific roles
    proposer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    analyst_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    qa_owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    acceptance_owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    # Bug-specific roles
    verifier_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    # Multi-reviewers for Story
    reviewer_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Review gate fields (Story phase-gate control)
    requirement_review_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    requirement_reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    requirement_review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    design_review_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    design_reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    design_review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Phase artifact fields
    prd_doc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # 需求PRD
    design_doc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # 方案设计文档
    self_test_report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 自测报告
    test_report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # 测试报告
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)          # 评价打分 1-5
    evaluation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)         # 评价说明

    estimation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimation_unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0)

    # Work items (子工作清单)
    work_items: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Example: [{"id": "uuid", "title": "指标接入", "assignee_id": "uuid", "assignee_name": "张三",
    #            "due_date": "2026-07-25", "completed": false, "completed_at": null, "sort_order": 0}]

    # Template metadata
    created_from_template_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_from_template_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # Self-referential relationships
    parent = relationship("Task", remote_side="Task.id", backref="children", foreign_keys=[parent_id])
    epic = relationship("Task", remote_side="Task.id", backref="stories", foreign_keys=[epic_id])
    iteration = relationship("Iteration", back_populates="tasks")
    assignee = relationship("User", backref="assigned_tasks", foreign_keys=[assignee_id])
    reviewer = relationship("User", backref="review_tasks", foreign_keys=[reviewer_id])
    proposer = relationship("User", backref="proposed_tasks", foreign_keys=[proposer_id])
    analyst = relationship("User", backref="analyzed_tasks", foreign_keys=[analyst_id])
    qa_owner = relationship("User", backref="qa_tasks", foreign_keys=[qa_owner_id])
    acceptance_owner = relationship("User", backref="accepted_tasks", foreign_keys=[acceptance_owner_id])
    verifier = relationship("User", backref="verified_tasks", foreign_keys=[verifier_id])
    requirement_reviewer = relationship("User", backref="req_reviewed_tasks", foreign_keys=[requirement_reviewer_id])
    design_reviewer = relationship("User", backref="design_reviewed_tasks", foreign_keys=[design_reviewer_id])
    milestone = relationship("Milestone", back_populates="tasks")
    progress_logs = relationship("TaskProgress", back_populates="task")
