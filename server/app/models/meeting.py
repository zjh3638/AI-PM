from typing import Optional

from sqlalchemy import String, Text, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

MEETING_DIMENSIONS = ["PROJECT_GROUP", "PROJECT", "CUSTOM"]
MEETING_TYPES = ["STANDUP", "WEEKLY", "ADHOC"]
MEETING_STATUSES = ["ACTIVE", "CLOSED"]

MEETING_DIMENSION_LABELS = {
    "PROJECT_GROUP": "项目群",
    "PROJECT": "项目",
    "CUSTOM": "自选项目",
}

MEETING_TYPE_LABELS = {
    "STANDUP": "站会",
    "WEEKLY": "周会",
    "ADHOC": "临时会议",
}


class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    dimension: Mapped[str] = mapped_column(String(20), nullable=False, default="PROJECT")
    dimension_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    meeting_type: Mapped[str] = mapped_column(String(20), nullable=False, default="WEEKLY")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    host = relationship("User", backref="hosted_meetings", foreign_keys=[host_id])
    workspaces: Mapped[list["MeetingWorkspace"]] = relationship(
        "MeetingWorkspace", back_populates="meeting", cascade="all, delete-orphan"
    )


class MeetingWorkspace(Base, UUIDMixin):
    """Snapshot of the projects a CUSTOM-dimension meeting covers.

    For dimension=CUSTOM the meeting's project set is stored here explicitly
    (picked at creation, does not follow later org/department changes).
    """
    __tablename__ = "meeting_workspaces"
    __table_args__ = (
        UniqueConstraint("meeting_id", "workspace_id", name="uq_meeting_workspace"),
    )

    meeting_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    meeting: Mapped["Meeting"] = relationship("Meeting", back_populates="workspaces")
