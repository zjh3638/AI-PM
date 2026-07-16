from typing import Optional, Any
from datetime import date

from pydantic import BaseModel, Field, field_validator


def _coerce_date(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return date.fromisoformat(v.split("T")[0])
    return v


def _coerce_int(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return int(v)
    return v


def _coerce_float(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return float(v)
    return v


_ID_FIELDS = (
    "parent_id", "epic_id", "iteration_id", "milestone_id",
    "assignee_id", "reviewer_id", "proposer_id", "analyst_id",
    "qa_owner_id", "acceptance_owner_id", "verifier_id",
)


def _coerce_optional_id(v: Any) -> Any:
    """Convert empty strings to None for optional ID fields."""
    if v == "" or v == "null":
        return None
    return v


def _coerce_reviewer_ids(v: Any) -> Any:
    """Normalize reviewer_ids: reject string 'null', empty list → None."""
    if v is None or v == "null" or v == "":
        return None
    if isinstance(v, list) and len(v) == 0:
        return None
    return v


class TaskCreate(BaseModel):
    task_type: str = "TASK"
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = None
    status: str = "TODO"
    phase: str = "REQUIREMENTS"
    priority: str = "MEDIUM"
    severity: Optional[str] = None
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: Optional[str] = None
    assignee_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    proposer_id: Optional[str] = None
    analyst_id: Optional[str] = None
    qa_owner_id: Optional[str] = None
    acceptance_owner_id: Optional[str] = None
    verifier_id: Optional[str] = None
    reviewer_ids: Optional[list[str]] = None
    design_doc: Optional[str] = None
    prd_doc: Optional[str] = None
    self_test_report: Optional[str] = None
    test_report: Optional[str] = None
    rating: Optional[int] = None
    evaluation: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: int = 0
    due_date: Optional[date] = None

    @field_validator(*_ID_FIELDS, mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        return _coerce_optional_id(v)

    @field_validator("reviewer_ids", mode="before")
    @classmethod
    def normalize_reviewer_ids(cls, v: Any) -> Any:
        return _coerce_reviewer_ids(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    status: Optional[str] = None
    phase: Optional[str] = None
    priority: Optional[str] = None
    severity: Optional[str] = None
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: Optional[str] = None
    assignee_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    proposer_id: Optional[str] = None
    analyst_id: Optional[str] = None
    qa_owner_id: Optional[str] = None
    acceptance_owner_id: Optional[str] = None
    verifier_id: Optional[str] = None
    reviewer_ids: Optional[list[str]] = None
    design_doc: Optional[str] = None
    prd_doc: Optional[str] = None
    self_test_report: Optional[str] = None
    test_report: Optional[str] = None
    rating: Optional[int] = None
    evaluation: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: Optional[int] = None
    due_date: Optional[date] = None

    @field_validator(*_ID_FIELDS, mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        return _coerce_optional_id(v)

    @field_validator("reviewer_ids", mode="before")
    @classmethod
    def normalize_reviewer_ids(cls, v: Any) -> Any:
        return _coerce_reviewer_ids(v)


class TaskResponse(BaseModel):
    id: str
    workspace_id: str
    parent_id: Optional[str] = None
    epic_id: Optional[str] = None
    iteration_id: Optional[str] = None
    milestone_id: Optional[str] = None
    milestone_name: Optional[str] = None
    task_type: str
    title: str
    description: Optional[str] = None
    status: str
    phase: str = "REQUIREMENTS"
    priority: str
    severity: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    proposer_id: Optional[str] = None
    proposer_name: Optional[str] = None
    analyst_id: Optional[str] = None
    analyst_name: Optional[str] = None
    qa_owner_id: Optional[str] = None
    qa_owner_name: Optional[str] = None
    acceptance_owner_id: Optional[str] = None
    acceptance_owner_name: Optional[str] = None
    verifier_id: Optional[str] = None
    verifier_name: Optional[str] = None
    requirement_review_status: Optional[str] = None
    requirement_reviewer_id: Optional[str] = None
    requirement_reviewer_name: Optional[str] = None
    requirement_review_note: Optional[str] = None
    design_review_status: Optional[str] = None
    design_reviewer_id: Optional[str] = None
    design_reviewer_name: Optional[str] = None
    design_review_note: Optional[str] = None
    reviewer_ids: Optional[list[str]] = None
    design_doc: Optional[str] = None
    prd_doc: Optional[str] = None
    self_test_report: Optional[str] = None
    test_report: Optional[str] = None
    rating: Optional[int] = None
    evaluation: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    sort_order: int = 0
    due_date: Optional[str] = None
    children_count: int = 0
    permissions: Optional[dict] = None
    created_at: str
    updated_at: str


class TaskMoveRequest(BaseModel):
    new_status: str
    sort_order: int = 0


class TaskSplitRequest(BaseModel):
    """Split a Story into child tasks."""
    children: list["TaskCreate"]


class EpicResponse(BaseModel):
    id: str
    title: str
    task_type: str
    status: str
    priority: str
    total_stories: int = 0
    done_stories: int = 0
    total_points: float = 0
    completed_points: float = 0
    created_at: str
