from typing import Optional

from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("departments.id"), nullable=True)
    system_role: Mapped[str] = mapped_column(String(20), default="MEMBER")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    source: Mapped[str] = mapped_column(String(20), default="LOCAL")

    # LLM 个人配置
    llm_api_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    llm_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    department = relationship("Department", back_populates="users")
    user_roles: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="user")
    workspace_members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="user")
