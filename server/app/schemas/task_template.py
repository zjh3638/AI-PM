from typing import Optional, Any

from pydantic import BaseModel, Field, field_validator


class WorkItemTemplate(BaseModel):
    """模板中的工作项定义（不含负责人、时间等运行时字段）。"""
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    sort_order: int = 0


class TaskTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    task_type: str = "TASK"
    title_template: str = Field(min_length=1, max_length=500)
    description_template: Optional[str] = None
    priority: str = "MEDIUM"
    phase: str = "REQUIREMENTS"
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    work_items_template: Optional[list[WorkItemTemplate]] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


class TaskTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    task_type: Optional[str] = None
    title_template: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description_template: Optional[str] = None
    priority: Optional[str] = None
    phase: Optional[str] = None
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    work_items_template: Optional[list[WorkItemTemplate]] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


class TaskTemplateResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: Optional[str] = None
    task_type: str
    title_template: str
    description_template: Optional[str] = None
    priority: str
    phase: str
    estimation: Optional[float] = None
    estimation_unit: Optional[str] = None
    work_items_template: Optional[list[dict]] = None
    work_items_count: int = 0
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    usage_count: int = 0
    creator_id: str
    creator_name: Optional[str] = None
    created_at: str
    updated_at: str


class CreateTaskFromTemplate(BaseModel):
    """从模板创建任务。variables 用于替换标题/描述中的 {占位符}。"""
    variables: Optional[dict[str, str]] = None
    milestone_id: Optional[str] = None
    iteration_id: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    # 可选：覆盖每个工作项的负责人/截止时间，key 为工作项在模板中的 sort_order
    work_item_overrides: Optional[dict[str, dict[str, Any]]] = None

    @field_validator("assignee_id", "milestone_id", "iteration_id", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        if v == "" or v == "null":
            return None
        return v
