from typing import Optional

from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

MEETING_DIMENSIONS = ["PROJECT_GROUP", "PROJECT"]
MEETING_TYPES = ["STANDUP", "WEEKLY", "ADHOC"]
MEETING_STATUSES = ["ACTIVE", "CLOSED"]

MEETING_DIMENSION_LABELS = {
    "PROJECT_GROUP": "项目群",
    "PROJECT": "项目",
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
