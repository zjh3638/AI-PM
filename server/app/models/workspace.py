from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.department import Department


class Workspace(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    type: Mapped[str] = mapped_column(String(20), default="PROJECT")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    phase: Mapped[str] = mapped_column(String(20), default="PLANNING")
    visibility: Mapped[str] = mapped_column(String(20), default="PRIVATE")
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    strict_gate: Mapped[bool] = mapped_column(Boolean, default=True)
    git_repo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="workspace")
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id])
    department: Mapped[Optional["Department"]] = relationship("Department")
