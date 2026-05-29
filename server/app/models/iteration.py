from typing import Optional
from datetime import date

from sqlalchemy import String, Text, Float, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Iteration(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "iterations"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity_points: Mapped[float] = mapped_column(Float, default=0)
    committed_points: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="PLANNING")

    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="iteration")
