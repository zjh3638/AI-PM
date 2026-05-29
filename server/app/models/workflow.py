from typing import Optional

from sqlalchemy import String, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin


class WorkflowTemplate(Base, UUIDMixin):
    __tablename__ = "workflow_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)

    states: Mapped[list["WorkflowState"]] = relationship("WorkflowState", back_populates="template")
    transitions: Mapped[list["WorkflowTransition"]] = relationship("WorkflowTransition", back_populates="template")


class WorkflowState(Base, UUIDMixin):
    __tablename__ = "workflow_states"

    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_templates.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String(20), nullable=False)

    template = relationship("WorkflowTemplate", back_populates="states")


class WorkflowTransition(Base, UUIDMixin):
    __tablename__ = "workflow_transitions"

    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_templates.id"), nullable=False)
    from_state_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_states.id"), nullable=False)
    to_state_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflow_states.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)

    template = relationship("WorkflowTemplate", back_populates="transitions")
