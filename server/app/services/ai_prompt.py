from datetime import date
from typing import Optional

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

PAGE_LABELS = {
    "dashboard": "工作台 - 我的关注",
    "workspace_list": "工作空间列表",
    "workspace_detail": "项目详情",
    "task_detail": "任务详情",
    "personal": "个人中心",
    "admin": "系统管理",
    "project_group": "项目集详情",
    "bigscreen": "会议大屏",
}


def build_system_prompt(agent: str, user, route_context: Optional[dict]) -> str:
    base = SYSTEM_PROMPTS.get(agent, SYSTEM_PROMPTS["项目经理"])
    lines = [
        f"用户：{user.display_name}（{user.system_role}）",
        f"日期：{date.today().isoformat()}",
    ]
    if route_context:
        page = PAGE_LABELS.get(route_context.get("page_type"), "未知")
        lines.append(f"所在页：{page}")
        if route_context.get("workspace_tab"):
            lines[-1] = f"所在页：{page} - {route_context['workspace_tab']}"
        if route_context.get("workspace_name"):
            wid = route_context.get("workspace_id", "")
            lines.append(f"项目：{route_context['workspace_name']} (id={wid})")
        if route_context.get("workspace_tab"):
            lines.append(f"当前 tab：{route_context['workspace_tab']}")
        if route_context.get("task_title"):
            tid = route_context.get("task_id", "")
            lines.append(f"选中任务：{route_context['task_title']} (id={tid})")
        filters = route_context.get("filters") or {}
        if filters:
            kv = ", ".join(f"{k}={v}" for k, v in filters.items() if v)
            if kv:
                lines.append(f"筛选：{kv}")
    ctx_block = "\n".join(f"- {l}" for l in lines)
    return f"{base}\n\n【当前上下文】\n{ctx_block}"
