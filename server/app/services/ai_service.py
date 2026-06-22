"""
Global AI Chat Service — single endpoint, tool-calling architecture.

LLM decides which tool to call; server executes it; LLM crafts the natural-language reply.
"""
import json
import hashlib
from datetime import date, timedelta
from typing import Any, Optional

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.task import Task
from app.models.user import User
from app.models.workspace_member import WorkspaceMember
from app.models.iteration import Iteration
from app.models.milestone import Milestone

# ── API Key encryption ────────────────────────────────────────────

def _get_fernet() -> Fernet:
    import base64
    key = hashlib.sha256(settings.jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_api_key(raw: str) -> str:
    return _get_fernet().encrypt(raw.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ── System Prompts ─────────────────────────────────────────────────

SYSTEM_PROMPTS: dict[str, str] = {
    "项目经理": (
        "你是 AI PM 平台的项目经理助手。你擅长项目进度分析、风险识别、报告生成、"
        "任务调度和资源分配。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询项目数据、创建/更新任务、生成报告。"
        "当用户要求执行操作时，先收集必要信息，再调用合适的工具。"
        "操作完成后用自然的语言告知用户结果。"
    ),
    "开发工程师": (
        "你是 AI PM 平台的开发工程师助手。你擅长任务拆解、技术方案讨论、"
        "工作量估算和代码相关问题。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询任务、更新任务状态。"
    ),
    "需求分析师": (
        "你是 AI PM 平台的需求分析师助手。你擅长需求梳理、PRD 编写、"
        "用户故事拆分和需求优先级排序。回复专业、简洁，用中文。"
        "你可以通过调用工具来创建需求、搜索相关文档。"
    ),
    "设计师": (
        "你是 AI PM 平台的设计师助手。你擅长技术方案设计、架构讨论、"
        "接口设计和系统设计评审。回复专业、简洁，用中文。"
        "你可以通过调用工具来查询项目信息、更新设计文档。"
    ),
}

# ── Tool Definitions ────────────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_workspace_context",
            "description": "获取工作空间的上下文信息：成员列表（含姓名和ID）、迭代/里程碑列表。在执行创建任务、分配人员等操作前必须先调用此工具获取可用的成员和迭代/里程碑信息。",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "description": "工作空间ID"},
                },
                "required": ["workspace_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "在工作空间中创建新任务。调用前必须先通过 get_workspace_context 获取成员列表来匹配 assignee_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "description": "工作空间ID"},
                    "title": {"type": "string", "description": "任务标题（必填）"},
                    "description": {"type": "string", "description": "任务描述（可选）"},
                    "priority": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"], "description": "优先级"},
                    "status": {"type": "string", "enum": ["TODO", "IN_PROGRESS"], "description": "状态，默认TODO"},
                    "task_type": {"type": "string", "enum": ["TASK", "STORY", "BUG"], "description": "任务类型，默认TASK"},
                    "assignee_id": {"type": "string", "description": "负责人用户ID（必须从 get_workspace_context 的成员列表中获取）"},
                    "iteration_id": {"type": "string", "description": "迭代ID（仅PROJECT类型工作空间）"},
                    "milestone_id": {"type": "string", "description": "里程碑ID（仅TOPIC类型工作空间）"},
                    "due_date": {"type": "string", "description": "截止日期 YYYY-MM-DD"},
                    "phase": {"type": "string", "enum": ["BACKLOG", "PLAN", "DESIGN", "DEVELOPMENT", "TESTING", "RELEASE"], "description": "研发阶段，默认DEVELOPMENT"},
                },
                "required": ["workspace_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "更新已有任务的字段。只传需要修改的字段。",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "description": "工作空间ID"},
                    "task_id": {"type": "string", "description": "任务ID"},
                    "title": {"type": "string", "description": "新标题"},
                    "status": {"type": "string", "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"], "description": "新状态"},
                    "priority": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
                    "assignee_id": {"type": "string", "description": "新负责人ID"},
                    "due_date": {"type": "string", "description": "新截止日期 YYYY-MM-DD"},
                    "description": {"type": "string", "description": "新描述"},
                    "milestone_id": {"type": "string", "description": "新里程碑ID"},
                    "iteration_id": {"type": "string", "description": "新迭代ID"},
                },
                "required": ["workspace_id", "task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_tasks",
            "description": "搜索/筛选任务。可按状态、负责人、关键词等条件筛选。",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "description": "工作空间ID"},
                    "status": {"type": "string", "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"], "description": "按状态筛选"},
                    "assignee_id": {"type": "string", "description": "按负责人ID筛选"},
                    "keyword": {"type": "string", "description": "标题关键词搜索"},
                    "priority": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
                    "overdue_only": {"type": "boolean", "description": "只返回逾期任务"},
                    "limit": {"type": "integer", "description": "返回数量上限，默认10"},
                },
                "required": ["workspace_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_tasks",
            "description": "获取当前用户的待办任务列表。",
            "parameters": {
                "type": "object",
                "properties": {
                    "status_filter": {"type": "string", "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "ALL"], "description": "状态筛选，默认ALL"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_report",
            "description": "生成周报或月报。后端自动聚合数据，LLM 负责润色。",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "description": "工作空间ID"},
                    "report_type": {"type": "string", "enum": ["weekly", "monthly"], "description": "周报 weekly 或月报 monthly"},
                },
                "required": ["workspace_id", "report_type"],
            },
        },
    },
]


# ── Tool Executors ──────────────────────────────────────────────────

async def _exec_get_workspace_context(db: AsyncSession, workspace_id: str) -> dict:
    """Fetch members and track info for a workspace."""
    # Members
    result = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()
    member_list = [
        {
            "user_id": m.user_id,
            "name": m.user.display_name if m.user else "Unknown",
            "role": m.role,
        }
        for m in members if m.user_id
    ]

    # Iterations
    iter_result = await db.execute(
        select(Iteration).where(Iteration.workspace_id == workspace_id).limit(20)
    )
    iterations = [
        {"id": it.id, "name": it.name, "status": it.status}
        for it in iter_result.scalars().all()
    ]

    # Milestones
    ms_result = await db.execute(
        select(Milestone).where(Milestone.workspace_id == workspace_id).limit(20)
    )
    milestones = [
        {"id": ms.id, "name": ms.name, "phase": ms.phase}
        for ms in ms_result.scalars().all()
    ]

    return {
        "members": member_list,
        "iterations": iterations,
        "milestones": milestones,
    }


async def _exec_create_task(db: AsyncSession, workspace_id: str, title: str,
                            **kwargs) -> dict:
    task = Task(workspace_id=workspace_id, title=title)
    for field in ("description", "priority", "status", "task_type", "assignee_id",
                  "iteration_id", "milestone_id", "due_date", "phase"):
        if field in kwargs and kwargs[field] is not None:
            setattr(task, field, kwargs[field])
    if kwargs.get("due_date"):
        try:
            task.due_date = date.fromisoformat(kwargs["due_date"])
        except (ValueError, TypeError):
            pass
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": task.id, "title": task.title, "status": task.status,
            "priority": task.priority, "assignee_id": task.assignee_id,
            "due_date": str(task.due_date) if task.due_date else None}


async def _exec_update_task(db: AsyncSession, workspace_id: str, task_id: str,
                            **kwargs) -> dict:
    result = await db.execute(select(Task).where(
        Task.id == task_id, Task.workspace_id == workspace_id
    ))
    task = result.scalar_one_or_none()
    if not task:
        return {"error": f"任务 {task_id} 不存在"}
    updated_fields = []
    for field, value in kwargs.items():
        if value is not None and hasattr(task, field):
            if field == "due_date" and value:
                try:
                    value = date.fromisoformat(value)
                except (ValueError, TypeError):
                    continue
            old_val = getattr(task, field)
            if str(old_val) != str(value):
                setattr(task, field, value)
                updated_fields.append(field)
    await db.commit()
    await db.refresh(task)
    return {"id": task.id, "title": task.title, "updated_fields": updated_fields}


async def _exec_search_tasks(db: AsyncSession, workspace_id: str, **kwargs) -> dict:
    query = select(Task).where(Task.workspace_id == workspace_id)
    if kwargs.get("status"):
        query = query.where(Task.status == kwargs["status"])
    if kwargs.get("assignee_id"):
        query = query.where(Task.assignee_id == kwargs["assignee_id"])
    if kwargs.get("priority"):
        query = query.where(Task.priority == kwargs["priority"])
    if kwargs.get("keyword"):
        query = query.where(Task.title.contains(kwargs["keyword"]))
    if kwargs.get("overdue_only"):
        query = query.where(Task.due_date < date.today(), Task.status != "DONE")
    query = query.limit(kwargs.get("limit", 10))
    result = await db.execute(query)
    tasks = result.scalars().all()
    return {
        "count": len(tasks),
        "tasks": [
            {
                "id": t.id, "title": t.title, "status": t.status,
                "priority": t.priority,
                "assignee_name": t.assignee.display_name if t.assignee else None,
                "due_date": str(t.due_date) if t.due_date else None,
            }
            for t in tasks
        ],
    }


async def _exec_get_my_tasks(db: AsyncSession, user_id: str, status_filter: str = "ALL") -> dict:
    query = select(Task).where(Task.assignee_id == user_id)
    if status_filter and status_filter != "ALL":
        query = query.where(Task.status == status_filter)
    query = query.where(Task.status != "DONE").limit(20)
    result = await db.execute(query)
    tasks = result.scalars().all()
    return {
        "count": len(tasks),
        "tasks": [
            {
                "id": t.id, "title": t.title, "status": t.status,
                "priority": t.priority, "workspace_id": t.workspace_id,
                "due_date": str(t.due_date) if t.due_date else None,
            }
            for t in tasks
        ],
    }


async def _exec_generate_report(db: AsyncSession, workspace_id: str,
                                report_type: str) -> dict:
    """Aggregate workspace data for report generation."""
    today = date.today()
    if report_type == "weekly":
        start = today - timedelta(days=today.weekday())  # Monday
    else:
        start = today.replace(day=1)  # 1st of month

    # Tasks completed in period
    done_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.status == "DONE",
            Task.completed_at >= start,
        )
    )
    done_count = done_result.scalar() or 0

    # Tasks created in period
    new_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.created_at >= start,
        )
    )
    new_count = new_result.scalar() or 0

    # Active tasks
    active_result = await db.execute(
        select(Task).where(
            Task.workspace_id == workspace_id,
            Task.status.in_(["IN_PROGRESS", "IN_REVIEW"]),
        ).limit(15)
    )
    active_tasks = [
        {"title": t.title, "status": t.status, "priority": t.priority,
         "assignee_name": t.assignee.display_name if t.assignee else None}
        for t in active_result.scalars().all()
    ]

    # Overdue
    overdue_result = await db.execute(
        select(Task).where(
            Task.workspace_id == workspace_id,
            Task.due_date < today,
            Task.status != "DONE",
        ).limit(10)
    )
    overdue_tasks = [
        {"title": t.title, "due_date": str(t.due_date) if t.due_date else None,
         "assignee_name": t.assignee.display_name if t.assignee else None}
        for t in overdue_result.scalars().all()
    ]

    # Total task stats
    total_result = await db.execute(
        select(func.count(Task.id)).where(Task.workspace_id == workspace_id)
    )
    total = total_result.scalar() or 0
    done_total_result = await db.execute(
        select(func.count(Task.id)).where(Task.workspace_id == workspace_id, Task.status == "DONE")
    )
    done_total = done_total_result.scalar() or 0

    period_label = "本周" if report_type == "weekly" else "本月"
    return {
        "report_type": report_type,
        "period": f"{start} ~ {today}",
        "summary": {
            "period_label": period_label,
            "new_tasks": new_count,
            "completed_tasks": done_count,
            "total_tasks": total,
            "total_done": done_total,
            "completion_rate": f"{round(done_total / total * 100)}%" if total > 0 else "0%",
            "overdue_count": len(overdue_tasks),
        },
        "active_tasks": active_tasks,
        "overdue_tasks": overdue_tasks,
    }


TOOL_EXECUTORS = {
    "get_workspace_context": _exec_get_workspace_context,
    "create_task": _exec_create_task,
    "update_task": _exec_update_task,
    "search_tasks": _exec_search_tasks,
    "get_my_tasks": _exec_get_my_tasks,
    "generate_report": _exec_generate_report,
}


# ── Settings helper ─────────────────────────────────────────────────

def get_gateway_url() -> str:
    """Read gateway URL from settings.json (admin override) or config default."""
    from pathlib import Path
    import json
    settings_file = Path(__file__).parent.parent.parent / "settings.json"
    if settings_file.exists():
        try:
            data = json.loads(settings_file.read_text())
            if data.get("llm_gateway_url"):
                return data["llm_gateway_url"]
        except (json.JSONDecodeError, OSError):
            pass
    return settings.llm_gateway_url


# ── Main Chat Function ──────────────────────────────────────────────

async def chat(
    db: AsyncSession,
    user: User,
    message: str,
    agent: str = "项目经理",
    workspace_id: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
) -> dict:
    """Main AI chat entry point. Returns {"reply": str, "actions": list}."""

    # Check user has LLM config
    if not user.llm_api_key:
        return {
            "reply": (
                "你还没有配置 LLM API Key。请前往 **个人中心 → AI 配置** 设置你的 API Key 和模型。\n\n"
                "网关地址由系统管理员统一配置。"
            ),
            "actions": [],
        }

    api_key = decrypt_api_key(user.llm_api_key)
    model = user.llm_model or "deepseek-chat"

    system_prompt = SYSTEM_PROMPTS.get(agent, SYSTEM_PROMPTS["项目经理"])
    if workspace_id:
        system_prompt += (
            f"\n\n当前工作空间ID: {workspace_id}。"
            f"在操作前记得先用 get_workspace_context 获取成员和项目信息。"
        )

    messages = [{"role": "system", "content": system_prompt}]
    if conversation_history:
        messages.extend(conversation_history[-20:])  # Keep last 20 messages
    messages.append({"role": "user", "content": message})

    actions = []
    max_tool_rounds = 3

    for _ in range(max_tool_rounds):
        llm_response = await _call_llm(api_key, model, messages, tools=TOOLS)

        if "error" in llm_response:
            return {"reply": f"LLM 调用失败：{llm_response['error']}", "actions": []}

        choice = llm_response.get("choices", [{}])[0]
        msg = choice.get("message", {})

        # If LLM wants to call a tool
        if msg.get("tool_calls"):
            tool_call = msg["tool_calls"][0]
            tool_name = tool_call["function"]["name"]
            try:
                tool_args = json.loads(tool_call["function"]["arguments"])
            except json.JSONDecodeError:
                tool_args = {}

            executor = TOOL_EXECUTORS.get(tool_name)
            if executor:
                # Inject implicit context
                tool_args.setdefault("workspace_id", workspace_id)
                if tool_name in ("get_my_tasks",):
                    # This tool doesn't take workspace_id
                    pass
                if "workspace_id" in tool_args and not tool_args["workspace_id"]:
                    del tool_args["workspace_id"]

                try:
                    # Add user_id for get_my_tasks
                    if tool_name == "get_my_tasks":
                        result = await executor(db, user_id=user.id, **{k: v for k, v in tool_args.items() if k not in ("workspace_id",)})
                    else:
                        result = await executor(db, **tool_args)
                except Exception as exc:
                    result = {"error": str(exc)}

                actions.append({"tool": tool_name, "args": tool_args, "result": result})

                # Feed tool result back to LLM
                messages.append(msg)  # assistant message with tool_calls
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "content": json.dumps(result, ensure_ascii=False),
                })
            else:
                messages.append(msg)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "content": json.dumps({"error": f"未知工具: {tool_name}"}),
                })
        else:
            # Final text reply
            return {
                "reply": msg.get("content", ""),
                "actions": actions,
            }

    # If we exhausted tool rounds, ask LLM for final summary
    messages.append({"role": "user", "content": "请用简短的中文总结以上操作结果。"})
    final = await _call_llm(api_key, model, messages, tools=None)
    final_text = ""
    try:
        final_text = final["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        final_text = "操作已完成。"
    return {"reply": final_text, "actions": actions}


async def _call_llm(api_key: str, model: str, messages: list[dict],
                    tools: Optional[list[dict]] = None) -> dict:
    """Call OpenAI-compatible chat completions API."""
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2048,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{get_gateway_url()}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            return {"error": str(exc)}
        except Exception as exc:
            return {"error": f"LLM 服务不可用: {exc}"}
