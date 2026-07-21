from typing import Optional

from sqlalchemy import String, Text, Float, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class TaskTemplate(Base, UUIDMixin, TimestampMixin):
    """任务模板 - 用于快速创建重复性任务"""
    __tablename__ = "task_templates"

    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 模板字段（镜像 Task 的核心字段，但不含运行时状态）
    task_type: Mapped[str] = mapped_column(String(20), default="TASK", nullable=False)
    title_template: Mapped[str] = mapped_column(String(500), nullable=False)
    # 标题模板支持变量，如 "{项目名称} - Redis监控"
    description_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    phase: Mapped[str] = mapped_column(String(30), default="REQUIREMENTS", nullable=False)
    estimation: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimation_unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # 工作清单模板（不含负责人、时间等运行时字段，创建任务时填充）
    work_items_template: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Example: [{"title": "指标接入", "description": "接入Prometheus指标", "sort_order": 0},
    #           {"title": "指标定义", "description": "定义核心监控指标", "sort_order": 1}]

    # 元数据
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 分类，如"运维监控"
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # 标签
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 使用次数
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    # Relationships
    workspace = relationship("Workspace", backref="task_templates")
    creator = relationship("User", backref="created_templates", foreign_keys=[creator_id])
