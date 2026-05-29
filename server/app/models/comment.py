from typing import Optional

from sqlalchemy import String, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Comment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "comments"

    task_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True, index=True)
    document_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("documents.id"), nullable=True)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    parent_comment_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("comments.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mentions: Mapped[Optional[list]] = mapped_column(JSON, default=list)

    author = relationship("User", backref="comments", foreign_keys=[author_id])
    parent = relationship("Comment", remote_side="Comment.id", backref="replies", foreign_keys=[parent_comment_id])
