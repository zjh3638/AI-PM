from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Attachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "attachments"

    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    task = relationship("Task", backref="attachments")
    uploader = relationship("User")
