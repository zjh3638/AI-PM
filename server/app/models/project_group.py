from typing import Optional

from sqlalchemy import String, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class ProjectGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_groups"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    items: Mapped[list["ProjectGroupItem"]] = relationship(
        "ProjectGroupItem", back_populates="group", cascade="all, delete-orphan"
    )


class ProjectGroupItem(Base, UUIDMixin):
    __tablename__ = "project_group_items"
    __table_args__ = (
        UniqueConstraint("group_id", "workspace_id", name="uq_group_workspace"),
    )

    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("project_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )

    group: Mapped["ProjectGroup"] = relationship("ProjectGroup", back_populates="items")