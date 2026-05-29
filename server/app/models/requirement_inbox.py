from typing import Optional

from sqlalchemy import String, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class RequirementInbox(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "requirement_inbox"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="MANUAL")
    submitter_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="TRIAGE")
    converted_task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    triage_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    submitter = relationship("User", backref="submitted_requirements", foreign_keys=[submitter_id])
