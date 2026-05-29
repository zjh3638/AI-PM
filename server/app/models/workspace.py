from typing import Optional

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Workspace(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    type: Mapped[str] = mapped_column(String(20), default="PROJECT")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    visibility: Mapped[str] = mapped_column(String(20), default="PRIVATE")
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    git_repo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="workspace")
