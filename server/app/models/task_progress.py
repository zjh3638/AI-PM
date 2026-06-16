from typing import Optional
from datetime import datetime

from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin


class TaskProgress(Base, UUIDMixin):
    __tablename__ = "task_progress"

    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="progress_logs")
    creator = relationship("User")
