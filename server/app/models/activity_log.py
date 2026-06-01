from typing import Optional

from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class ActivityLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "activity_logs"

    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE, UPDATE, STATUS_CHANGE, ASSIGN, COMMENT
    field_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    old_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
