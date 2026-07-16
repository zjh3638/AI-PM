"""项目周报/月报服务：周期数据聚合、CRUD、AI prompt 构造、导出。

聚合来源（四类）：任务动态 / 风险 / 任务进展记录 / 里程碑进度。
生成与润色的 LLM 流式调用在 report_ai_stream.py。
"""
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from datetime import date, datetime, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from app.models.project_report import ProjectReport, REPORT_TYPE_LABELS
from app.models.task import Task
from app.models.task_progress import TaskProgress
from app.models.risk import Risk, RISK_TYPE_LABELS, RISK_STATUS_LABELS
from app.models.milestone import Milestone, MILESTONE_PHASE_LABELS
from app.models.workspace import Workspace
from app.models.project_group import ProjectGroup, ProjectGroupItem


# ── 周期区间 ─────────────────────────────────────────────────────────

def default_period(report_type: str, today: Optional[date] = None) -> tuple[date, date]:
    """按今天推算周期区间：周报=本周一~周日，月报=本月1号~月末。"""
    today = today or date.today()
    if report_type == "MONTHLY":
        start = today.replace(day=1)
        # 下月1号减一天 = 本月最后一天
        if start.month == 12:
            nxt = start.replace(year=start.year + 1, month=1)
        else:
            nxt = start.replace(month=start.month + 1)
        end = nxt - timedelta(days=1)
    else:
        start = today - timedelta(days=today.weekday())  # Monday
        end = start + timedelta(days=6)
    return start, end


def default_title(report_type: str, period_start: date, period_end: date,
                  entity_name: str = "") -> str:
    prefix = f"{entity_name} " if entity_name else ""
    if report_type == "MONTHLY":
        return f"{prefix}{period_start.year}年{period_start.month}月月报"
    week_no = period_start.isocalendar()[1]
    return f"{prefix}{period_start.year}年第{week_no}周周报"


# ── 数据聚合 ─────────────────────────────────────────────────────────

async def aggregate_report_data(
    db: AsyncSession, workspace_id: str, report_type: str,
    period_start: date, period_end: date,
) -> dict:
    """聚合一个周期内的项目数据快照。"""
    # 周期结束日的次日 0 点，用作 datetime 字段的右开区间
    end_dt = datetime.combine(period_end + timedelta(days=1), datetime.min.time())
    start_dt = datetime.combine(period_start, datetime.min.time())

    # 1) 任务动态
    done_count = (await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.status == "DONE",
            Task.completed_at >= start_dt,
            Task.completed_at < end_dt,
        )
    )).scalar() or 0

    new_count = (await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.created_at >= start_dt,
            Task.created_at < end_dt,
        )
    )).scalar() or 0

    in_progress = (await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(
            Task.workspace_id == workspace_id,
            Task.status.in_(["IN_PROGRESS", "IN_REVIEW"]),
        ).limit(30)
    )).scalars().all()
    in_progress_tasks = [
        {"title": t.title, "status": t.status, "priority": t.priority,
         "assignee_name": t.assignee.display_name if t.assignee else None}
        for t in in_progress
    ]

    overdue = (await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(
            Task.workspace_id == workspace_id,
            Task.due_date < date.today(),
            Task.status != "DONE",
        ).limit(20)
    )).scalars().all()
    overdue_tasks = [
        {"title": t.title, "due_date": str(t.due_date) if t.due_date else None,
         "assignee_name": t.assignee.display_name if t.assignee else None}
        for t in overdue
    ]

    # 2) 风险：活跃风险 + 本周期内新识别/关闭的
    risk_rows = (await db.execute(
        select(Risk).options(selectinload(Risk.owner)).where(
            Risk.workspace_id == workspace_id,
        ).order_by(Risk.created_at.desc()).limit(30)
    )).scalars().all()
    risks = []
    for r in risk_rows:
        is_active = r.status != "CLOSED"
        in_period = (
            (r.created_at and start_dt <= r.created_at < end_dt)
            or (r.closed_at and start_dt <= r.closed_at < end_dt)
        )
        if is_active or in_period:
            risks.append({
                "title": r.title,
                "type": RISK_TYPE_LABELS.get(r.risk_type, r.risk_type),
                "probability": r.probability,
                "impact": r.impact,
                "status": RISK_STATUS_LABELS.get(r.status, r.status),
                "owner_name": r.owner.display_name if r.owner else None,
                "mitigation": r.mitigation,
            })

    # 3) 任务进展记录：本周期内的进展条目
    progress_rows = (await db.execute(
        select(TaskProgress)
        .join(Task, TaskProgress.task_id == Task.id)
        .options(selectinload(TaskProgress.task), selectinload(TaskProgress.creator))
        .where(
            Task.workspace_id == workspace_id,
            TaskProgress.created_at >= start_dt,
            TaskProgress.created_at < end_dt,
        )
        .order_by(TaskProgress.created_at.desc())
        .limit(40)
    )).scalars().all()
    progress_logs = [
        {"task_title": p.task.title if p.task else None,
         "progress": p.progress,
         "note": p.note,
         "created_by": p.creator.display_name if p.creator else None,
         "created_at": p.created_at.isoformat() if p.created_at else None}
        for p in progress_rows
    ]

    # 4) 里程碑进度（含任务完成比例）
    ms_rows = (await db.execute(
        select(Milestone).where(Milestone.workspace_id == workspace_id)
        .order_by(Milestone.sort_order).limit(20)
    )).scalars().all()
    milestones = []
    for ms in ms_rows:
        total = (await db.execute(
            select(func.count(Task.id)).where(Task.milestone_id == ms.id)
        )).scalar() or 0
        done = (await db.execute(
            select(func.count(Task.id)).where(
                Task.milestone_id == ms.id, Task.status == "DONE")
        )).scalar() or 0
        milestones.append({
            "name": ms.name,
            "phase": MILESTONE_PHASE_LABELS.get(ms.phase, ms.phase),
            "status": ms.status,
            "end_date": str(ms.end_date) if ms.end_date else None,
            "task_total": total,
            "task_done": done,
            "completion_rate": f"{round(done / total * 100)}%" if total > 0 else "0%",
        })

    period_label = REPORT_TYPE_LABELS.get(report_type, "周报")
    return {
        "report_type": report_type,
        "period": f"{period_start} ~ {period_end}",
        "period_label": period_label,
        "task_summary": {
            "completed": done_count,
            "created": new_count,
            "in_progress_count": len(in_progress_tasks),
            "overdue_count": len(overdue_tasks),
        },
        "in_progress_tasks": in_progress_tasks,
        "overdue_tasks": overdue_tasks,
        "risks": risks,
        "progress_logs": progress_logs,
        "milestones": milestones,
    }


# ── 项目群聚合 ───────────────────────────────────────────────────────

async def get_group_name(db: AsyncSession, group_id: str) -> str:
    g = (await db.execute(
        select(ProjectGroup).where(ProjectGroup.id == group_id)
    )).scalar_one_or_none()
    return g.name if g else ""


async def _group_workspaces(db: AsyncSession, group_id: str) -> list[Workspace]:
    return list((await db.execute(
        select(Workspace)
        .join(ProjectGroupItem, ProjectGroupItem.workspace_id == Workspace.id)
        .where(ProjectGroupItem.group_id == group_id)
    )).scalars().all())


async def _latest_workspace_report(
    db: AsyncSession, workspace_id: str, report_type: str,
    period_start: date, period_end: date,
) -> Optional[ProjectReport]:
    """取某项目在本周期、匹配类型的最新周报（优先已发布）。"""
    q = (
        select(ProjectReport)
        .where(
            ProjectReport.dimension == "PROJECT",
            ProjectReport.dimension_id == workspace_id,
            ProjectReport.report_type == report_type,
            ProjectReport.period_start == period_start,
            ProjectReport.period_end == period_end,
        )
        # 已发布优先，其次按更新时间倒序
        .order_by(ProjectReport.status.desc(), ProjectReport.updated_at.desc())
        .limit(1)
    )
    return (await db.execute(q)).scalars().first()


async def aggregate_group_report_data(
    db: AsyncSession, group_id: str, report_type: str,
    period_start: date, period_end: date,
) -> dict:
    """聚合项目群下所有子项目的周期数据。

    数据首选来源为各子项目在本周期内已有的周报；某子项目没有对应周报时，
    回退到自动聚合该项目动态（aggregate_report_data）。
    """
    workspaces = await _group_workspaces(db, group_id)
    period_label = REPORT_TYPE_LABELS.get(report_type, "周报")
    projects = []
    for ws in workspaces:
        existing = await _latest_workspace_report(
            db, ws.id, report_type, period_start, period_end)
        if existing and (existing.content or "").strip():
            projects.append({
                "workspace_id": ws.id,
                "workspace_name": ws.name,
                "source": "report",           # 来自子项目已有周报
                "report_status": existing.status,
                "report_content": existing.content,
            })
        else:
            agg = await aggregate_report_data(
                db, ws.id, report_type, period_start, period_end)
            projects.append({
                "workspace_id": ws.id,
                "workspace_name": ws.name,
                "source": "auto",             # 无周报，自动聚合项目动态
                "data": agg,
            })

    return {
        "report_type": report_type,
        "period": f"{period_start} ~ {period_end}",
        "period_label": period_label,
        "workspace_count": len(workspaces),
        "projects": projects,
    }


# ── AI Prompt 构造 ───────────────────────────────────────────────────

def build_generation_prompt(agg: dict, entity_name: str = "") -> tuple[str, str]:
    """项目周报生成 prompt。返回 (system_prompt, user_prompt)。"""
    import json
    label = agg.get("period_label", "周报")
    system = (
        f"你是 AI PM 平台的项目经理助手，负责撰写项目{label}。"
        "根据提供的项目数据，生成一份专业、简洁、条理清晰的中文项目"
        f"{label}（Markdown 格式）。"
        "结构包含以下二级标题：## 本期概述、## 关键进展、## 风险与问题、## 下期计划。"
        "要求：基于事实、不臆造数据；对进展和风险给出提炼性的判断而非简单罗列；"
        "语言平实专业。直接输出 Markdown 正文，不要额外说明。"
    )
    user = (
        f"项目名称：{entity_name or '（未命名项目）'}\n"
        f"报告周期：{agg.get('period')}\n\n"
        f"项目数据（JSON）：\n```json\n"
        f"{json.dumps(agg, ensure_ascii=False, indent=2)}\n```\n\n"
        f"请据此撰写{label}。"
    )
    return system, user


def build_group_generation_prompt(agg: dict, group_name: str = "") -> tuple[str, str]:
    """项目群汇总周报生成 prompt。

    数据来源分两类：source=report（子项目已提交的周报）优先直接采信并提炼；
    source=auto（无周报，系统自动聚合的动态）需谨慎概括。
    """
    import json
    label = agg.get("period_label", "周报")
    system = (
        f"你是 AI PM 平台的项目群负责人助手，负责撰写项目群的汇总{label}。"
        f"下属每个子项目的数据有两种来源：source=report 表示该子项目已提交{label}"
        "（应优先采信并提炼其要点），source=auto 表示该子项目暂无周报、"
        "由系统自动聚合其任务动态（需谨慎概括）。"
        f"请综合所有子项目，生成一份面向管理层的项目群汇总{label}（Markdown 格式），"
        "结构包含二级标题：## 整体概述、## 各项目进展、## 群级风险与关注点、## 下期重点。"
        "其中「各项目进展」需按子项目分小节（三级标题为项目名）。"
        "要求：基于事实、不臆造数据；突出跨项目的整体态势与需管理层关注的问题；"
        "语言平实专业。直接输出 Markdown 正文，不要额外说明。"
    )
    user = (
        f"项目群名称：{group_name or '（未命名项目群）'}\n"
        f"报告周期：{agg.get('period')}\n"
        f"子项目数量：{agg.get('workspace_count')}\n\n"
        f"各子项目数据（JSON）：\n```json\n"
        f"{json.dumps(agg, ensure_ascii=False, indent=2)}\n```\n\n"
        f"请据此撰写项目群汇总{label}。"
    )
    return system, user


def build_polish_prompt(content: str, instruction: Optional[str] = None) -> tuple[str, str]:
    system = (
        "你是一名专业的中文项目文档编辑。请对用户提供的项目周报/月报进行润色优化，"
        "保持所有事实、数据、结论不变，仅优化表达、结构与专业度，保留 Markdown 格式。"
        "直接输出优化后的 Markdown 全文，不要额外说明。"
    )
    extra = f"\n\n额外要求：{instruction}" if instruction else ""
    user = f"请润色以下周报：\n\n{content}{extra}"
    return system, user


# ── CRUD ─────────────────────────────────────────────────────────────

async def get_workspace_name(db: AsyncSession, workspace_id: str) -> str:
    ws = (await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )).scalar_one_or_none()
    return ws.name if ws else ""


async def _entity_name(db: AsyncSession, dimension: str, dimension_id: str) -> str:
    if dimension == "PROJECT_GROUP":
        return await get_group_name(db, dimension_id)
    return await get_workspace_name(db, dimension_id)


async def create_report(db: AsyncSession, dimension: str, dimension_id: str,
                        created_by: str, report_type: str, title: Optional[str],
                        period_start: Optional[date],
                        period_end: Optional[date]) -> dict:
    if not period_start or not period_end:
        period_start, period_end = default_period(report_type)
    if not title:
        name = await _entity_name(db, dimension, dimension_id)
        title = default_title(report_type, period_start, period_end, name)
    report = ProjectReport(
        dimension=dimension, dimension_id=dimension_id, created_by=created_by,
        report_type=report_type, title=title,
        period_start=period_start, period_end=period_end,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return await get_report_dict(db, report.id)


async def get_report(db: AsyncSession, report_id: str) -> Optional[ProjectReport]:
    return (await db.execute(
        select(ProjectReport)
        .options(selectinload(ProjectReport.creator))
        .where(ProjectReport.id == report_id)
    )).scalar_one_or_none()


async def get_report_dict(db: AsyncSession, report_id: str) -> Optional[dict]:
    r = await get_report(db, report_id)
    return _report_to_dict(r) if r else None


async def list_reports(db: AsyncSession, dimension: str, dimension_id: str,
                       report_type: Optional[str] = None) -> list[dict]:
    query = (
        select(ProjectReport)
        .options(selectinload(ProjectReport.creator))
        .where(ProjectReport.dimension == dimension,
               ProjectReport.dimension_id == dimension_id)
    )
    if report_type:
        query = query.where(ProjectReport.report_type == report_type)
    query = query.order_by(ProjectReport.period_start.desc(),
                           ProjectReport.created_at.desc())
    rows = (await db.execute(query)).scalars().all()
    return [_report_to_dict(r) for r in rows]


async def update_report(db: AsyncSession, report: ProjectReport, **kwargs) -> dict:
    for field, value in kwargs.items():
        if value is not None:
            setattr(report, field, value)
    await db.commit()
    await db.refresh(report)
    return await get_report_dict(db, report.id)


async def publish_report(db: AsyncSession, report: ProjectReport) -> dict:
    report.status = "PUBLISHED"
    report.published_at = datetime.utcnow()
    await db.commit()
    await db.refresh(report)
    return await get_report_dict(db, report.id)


async def delete_report(db: AsyncSession, report: ProjectReport) -> None:
    await db.delete(report)
    await db.commit()


def _report_to_dict(r: ProjectReport) -> dict:
    return {
        "id": r.id,
        "dimension": r.dimension,
        "dimension_id": r.dimension_id,
        "report_type": r.report_type,
        "period_start": str(r.period_start) if r.period_start else None,
        "period_end": str(r.period_end) if r.period_end else None,
        "title": r.title,
        "content": r.content,
        "summary_data": r.summary_data,
        "status": r.status,
        "created_by": r.created_by,
        "created_by_name": r.creator.display_name if r.creator else None,
        "published_at": r.published_at.isoformat() if r.published_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else "",
        "updated_at": r.updated_at.isoformat() if r.updated_at else "",
    }


# ── 导出：Markdown → PDF / Word(docx) via pandoc ─────────────────────

def render_document(content: str, title: str, fmt: str) -> Optional[bytes]:
    """将 Markdown 渲染为 pdf 或 docx。失败返回 None。"""
    with tempfile.TemporaryDirectory() as tmp:
        md_path = Path(tmp) / "report.md"
        out_path = Path(tmp) / f"report.{fmt}"
        header = f"# {title}\n\n" if title else ""
        md_path.write_text(header + (content or ""), encoding="utf-8")

        if fmt == "pdf":
            attempts = [
                ["pandoc", str(md_path), "-o", str(out_path),
                 "--pdf-engine=xelatex",
                 "-V", "mainfont=Noto Serif CJK SC",
                 "-V", "CJKmainfont=Noto Serif CJK SC"],
                # 回退：不指定 CJK 字体
                ["pandoc", str(md_path), "-o", str(out_path), "--pdf-engine=xelatex"],
            ]
        else:  # docx
            attempts = [["pandoc", str(md_path), "-o", str(out_path)]]

        for cmd in attempts:
            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=60)
                return out_path.read_bytes()
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
                    FileNotFoundError) as exc:
                logger.warning("文档导出失败（%s）：%s", fmt, exc)
        return None
