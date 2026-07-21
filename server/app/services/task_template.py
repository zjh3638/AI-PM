import re
import uuid
from typing import Optional
from datetime import date, datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task_template import TaskTemplate
from app.models.task import Task
from app.models.user import User
from app.exceptions import AppException


_VAR_PATTERN = re.compile(r"\{([^{}]+)\}")


def _render(text: Optional[str], variables: dict[str, str]) -> Optional[str]:
    """替换 {占位符}。未提供值的占位符保持原样。"""
    if not text:
        return text
    if not variables:
        return text

    def repl(m: re.Match) -> str:
        key = m.group(1).strip()
        return variables.get(key, m.group(0))

    return _VAR_PATTERN.sub(repl, text)


def _template_to_dict(tpl: TaskTemplate) -> dict:
    try:
        creator_name = tpl.creator.display_name if tpl.creator else None
    except Exception:
        creator_name = None
    wits = tpl.work_items_template or []
    return {
        "id": tpl.id,
        "workspace_id": tpl.workspace_id,
        "name": tpl.name,
        "description": tpl.description,
        "task_type": tpl.task_type,
        "title_template": tpl.title_template,
        "description_template": tpl.description_template,
        "priority": tpl.priority,
        "phase": tpl.phase,
        "estimation": tpl.estimation,
        "estimation_unit": tpl.estimation_unit,
        "work_items_template": wits,
        "work_items_count": len(wits),
        "category": tpl.category,
        "tags": tpl.tags or [],
        "usage_count": tpl.usage_count,
        "creator_id": tpl.creator_id,
        "creator_name": creator_name,
        "created_at": tpl.created_at.isoformat() if tpl.created_at else "",
        "updated_at": tpl.updated_at.isoformat() if tpl.updated_at else "",
    }


async def create_template(db: AsyncSession, workspace_id: str, creator_id: str, **kwargs) -> TaskTemplate:
    # 归一化 work_items_template：按 sort_order 排序并回填连续序号
    wits = kwargs.get("work_items_template")
    if wits:
        wits = sorted(wits, key=lambda x: x.get("sort_order", 0))
        for idx, it in enumerate(wits):
            it["sort_order"] = idx
        kwargs["work_items_template"] = wits
    tpl = TaskTemplate(workspace_id=workspace_id, creator_id=creator_id, **kwargs)
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def get_template(db: AsyncSession, template_id: str) -> Optional[TaskTemplate]:
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
        .options(selectinload(TaskTemplate.creator))
    )
    return result.scalar_one_or_none()


async def list_templates(
    db: AsyncSession, workspace_id: str, category: Optional[str] = None,
) -> list[TaskTemplate]:
    query = (
        select(TaskTemplate)
        .where(TaskTemplate.workspace_id == workspace_id)
        .options(selectinload(TaskTemplate.creator))
        .order_by(TaskTemplate.usage_count.desc(), TaskTemplate.created_at.desc())
    )
    if category:
        query = query.where(TaskTemplate.category == category)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_template(db: AsyncSession, tpl: TaskTemplate, **kwargs) -> TaskTemplate:
    for field, value in kwargs.items():
        if value is not None:
            if field == "work_items_template":
                value = sorted(value, key=lambda x: x.get("sort_order", 0))
                for idx, it in enumerate(value):
                    it["sort_order"] = idx
            setattr(tpl, field, value)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def delete_template(db: AsyncSession, tpl: TaskTemplate) -> None:
    await db.delete(tpl)
    await db.commit()


async def create_task_from_template(
    db: AsyncSession, tpl: TaskTemplate, workspace_id: str,
    variables: Optional[dict] = None,
    milestone_id: Optional[str] = None,
    iteration_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    due_date: Optional[str] = None,
    work_item_overrides: Optional[dict] = None,
) -> Task:
    """依据模板实例化一个任务，把工作项模板转成运行时 work_items。"""
    variables = variables or {}
    work_item_overrides = work_item_overrides or {}

    title = _render(tpl.title_template, variables)
    description = _render(tpl.description_template, variables)

    # 解析截止日期
    due = None
    if due_date:
        try:
            due = date.fromisoformat(due_date.split("T")[0])
        except (ValueError, TypeError):
            due = None

    # 构建运行时 work_items
    work_items = []
    for it in (tpl.work_items_template or []):
        so = it.get("sort_order", len(work_items))
        override = work_item_overrides.get(str(so)) or work_item_overrides.get(so) or {}
        wi_assignee = override.get("assignee_id")
        wi_due = override.get("due_date")
        wi_assignee_name = None
        if wi_assignee:
            u = await db.get(User, wi_assignee)
            wi_assignee_name = u.display_name if u else None
        work_items.append({
            "id": str(uuid.uuid4()),
            "title": _render(it.get("title"), variables),
            "description": _render(it.get("description"), variables),
            "assignee_id": wi_assignee,
            "assignee_name": wi_assignee_name,
            "due_date": wi_due,
            "completed": False,
            "completed_at": None,
            "sort_order": len(work_items),
        })

    task = Task(
        workspace_id=workspace_id,
        task_type=tpl.task_type,
        title=title,
        description=description,
        status="TODO",
        phase=tpl.phase,
        priority=tpl.priority,
        estimation=tpl.estimation,
        estimation_unit=tpl.estimation_unit,
        milestone_id=milestone_id,
        iteration_id=iteration_id,
        assignee_id=assignee_id,
        due_date=due,
        work_items=work_items,
        created_from_template_id=tpl.id,
        created_from_template_name=tpl.name,
    )
    db.add(task)

    # 累加使用次数
    tpl.usage_count = (tpl.usage_count or 0) + 1

    await db.commit()
    await db.refresh(task)
    return task
