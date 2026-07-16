from typing import Optional
from datetime import date, datetime

from sqlalchemy import String, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

REPORT_DIMENSIONS = ["PROJECT", "PROJECT_GROUP"]
REPORT_TYPES = ["WEEKLY", "MONTHLY"]
REPORT_STATUSES = ["DRAFT", "PUBLISHED"]

REPORT_DIMENSION_LABELS = {
    "PROJECT": "项目",
    "PROJECT_GROUP": "项目群",
}

REPORT_TYPE_LABELS = {
    "WEEKLY": "周报",
    "MONTHLY": "月报",
}

REPORT_STATUS_LABELS = {
    "DRAFT": "草稿",
    "PUBLISHED": "已发布",
}


class ProjectReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "project_reports"

    # 归属维度：项目(PROJECT) 或 项目群(PROJECT_GROUP)，对齐 meetings 表范式
    dimension: Mapped[str] = mapped_column(String(20), nullable=False, default="PROJECT")
    dimension_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    report_type: Mapped[str] = mapped_column(String(20), nullable=False, default="WEEKLY")
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 聚合快照：任务动态 / 风险 / 任务进展 / 里程碑，用于回溯与重新润色
    summary_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")

    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    creator = relationship("User", backref="created_reports", foreign_keys=[created_by])
