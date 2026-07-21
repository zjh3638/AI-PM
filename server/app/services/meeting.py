from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.meeting import Meeting, MeetingWorkspace
from app.models.task import Task
from app.models.milestone import Milestone
from app.models.risk import Risk
from app.models.workspace import Workspace
from app.models.user import User
from app.models.department import Department
from app.models.project_group import ProjectGroupItem


async def create_meeting(
    db: AsyncSession,
    title: str,
    dimension: str,
    dimension_id: str,
    meeting_type: str,
    host_id: str,
    workspace_ids: Optional[list[str]] = None,
) -> Meeting:
    # CUSTOM dimension: project set is a snapshot in meeting_workspaces.
    # dimension_id is unused for CUSTOM but the column is NOT NULL → store "".
    meeting = Meeting(
        title=title,
        dimension=dimension,
        dimension_id=dimension_id or "",
        meeting_type=meeting_type,
        host_id=host_id,
    )
    db.add(meeting)
    await db.flush()
    if dimension == "CUSTOM" and workspace_ids:
        seen = set()
        for wid in workspace_ids:
            if wid and wid not in seen:
                seen.add(wid)
                db.add(MeetingWorkspace(meeting_id=meeting.id, workspace_id=wid))
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def get_meeting(db: AsyncSession, meeting_id: str) -> Optional[Meeting]:
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .options(selectinload(Meeting.host))
    )
    return result.scalar_one_or_none()


async def list_meetings(
    db: AsyncSession,
    dimension: Optional[str] = None,
    dimension_id: Optional[str] = None,
    status: Optional[str] = None,
    host_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Meeting]:
    """List meetings with optional filters."""
    query = select(Meeting).options(selectinload(Meeting.host))
    if dimension:
        query = query.where(Meeting.dimension == dimension)
    if dimension_id:
        query = query.where(Meeting.dimension_id == dimension_id)
    if status:
        query = query.where(Meeting.status == status)
    if host_id:
        query = query.where(Meeting.host_id == host_id)
    query = query.order_by(Meeting.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_workspace_ids_for_meeting(
    db: AsyncSession, meeting: Meeting,
) -> list[str]:
    """Returns list of workspace IDs covered by this meeting.

    If dimension=PROJECT, returns [dimension_id].
    If PROJECT_GROUP, queries ProjectGroupItem for all workspace IDs in the group.
    If CUSTOM, queries MeetingWorkspace snapshot for the chosen workspace IDs.
    """
    if meeting.dimension == "PROJECT":
        return [meeting.dimension_id]

    if meeting.dimension == "CUSTOM":
        result = await db.execute(
            select(MeetingWorkspace.workspace_id).where(
                MeetingWorkspace.meeting_id == meeting.id
            )
        )
        return [row[0] for row in result.all()]

    # PROJECT_GROUP
    result = await db.execute(
        select(ProjectGroupItem.workspace_id).where(
            ProjectGroupItem.group_id == meeting.dimension_id
        )
    )
    return [row[0] for row in result.all()]


async def get_org_project_tree(db: AsyncSession) -> list[dict]:
    """Department tree with projects attached under each project's OWNER department.

    Powers the meeting-creation TreeSelect: checking a department selects every
    project whose owner belongs to that department (or any descendant department).
    Fixed 3 queries (departments, workspaces+owner, none-else); assembled in memory.
    """
    # departments
    dept_rows = (await db.execute(
        select(Department).order_by(Department.sort_order)
    )).scalars().all()

    # workspaces with owner (owner.department_id decides grouping)
    ws_rows = (await db.execute(
        select(Workspace).options(selectinload(Workspace.owner))
        .where(Workspace.status == "ACTIVE")
    )).scalars().all()

    projects_by_dept: dict[Optional[str], list[dict]] = {}
    for ws in ws_rows:
        dept_id = ws.owner.department_id if ws.owner else None
        projects_by_dept.setdefault(dept_id, []).append({
            "id": ws.id,
            "name": ws.name,
            "owner_name": ws.owner.display_name if ws.owner else None,
            "department_id": dept_id,
        })

    def build_node(dept: Department) -> dict:
        children = [build_node(d) for d in dept_rows if d.parent_id == dept.id]
        return {
            "id": dept.id,
            "name": dept.name,
            "parent_id": dept.parent_id,
            "path": dept.path,
            "projects": projects_by_dept.get(dept.id, []),
            "children": sorted(children, key=lambda c: c["name"]),
        }

    roots = [build_node(d) for d in dept_rows if not d.parent_id]
    tree = sorted(roots, key=lambda r: r["name"])

    # projects whose owner has no department (or no owner) → an "未分配" bucket
    orphan = projects_by_dept.get(None, [])
    if orphan:
        tree.append({
            "id": "__no_dept__",
            "name": "未分配部门",
            "parent_id": None,
            "path": "",
            "projects": orphan,
            "children": [],
        })
    return tree


async def get_board_data(
    db: AsyncSession,
    meeting: Meeting,
    workspace_id: str,
) -> dict:
    """Aggregates board data for a given meeting and workspace.

    Returns a dict matching the BoardData Pydantic schema structure.
    """
    today = date.today()

    # ── Workspace info ──────────────────────────────────────────────
    ws_result = await db.execute(
        select(Workspace.name, User.display_name)
        .outerjoin(User, User.id == Workspace.owner_id)
        .where(Workspace.id == workspace_id)
    )
    ws_row = ws_result.one_or_none()
    if ws_row is None:
        raise ValueError(f"Workspace {workspace_id} not found")
    workspace_name, owner_name = ws_row

    # ── Task stats ──────────────────────────────────────────────────
    total_result = await db.execute(
        select(func.count(Task.id)).where(Task.workspace_id == workspace_id)
    )
    total = total_result.scalar() or 0

    done_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id, Task.status == "DONE"
        )
    )
    done = done_result.scalar() or 0

    overdue_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.workspace_id == workspace_id,
            Task.status != "DONE",
            Task.due_date < today,
        )
    )
    overdue = overdue_result.scalar() or 0

    pct = round(done / total * 100, 1) if total > 0 else 0.0

    # ── Health ──────────────────────────────────────────────────────
    if overdue > 2:
        health = "blocked"
    elif overdue > 0 or (total > 0 and done / total < 0.3):
        health = "at-risk"
    else:
        health = "on-track"

    # ── Milestones with grouped tasks ───────────────────────────────
    ms_result = await db.execute(
        select(Milestone)
        .where(Milestone.workspace_id == workspace_id)
        .order_by(Milestone.sort_order, Milestone.start_date)
    )
    milestones_list = ms_result.scalars().all()

    board_milestones = []
    for ms in milestones_list:
        ms_tasks_result = await db.execute(
            select(Task).where(Task.milestone_id == ms.id)
        )
        ms_tasks = ms_tasks_result.scalars().all()

        completed = []
        in_progress = []
        delayed = []

        # Collect assignee IDs for batch name lookup
        ms_assignee_ids = {t.assignee_id for t in ms_tasks if t.assignee_id}
        ms_assignee_names = {}
        if ms_assignee_ids:
            u_result = await db.execute(
                select(User.id, User.display_name).where(User.id.in_(ms_assignee_ids))
            )
            ms_assignee_names = {row[0]: row[1] for row in u_result.all()}

        for t in ms_tasks:
            task_dict = {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "assignee_name": ms_assignee_names.get(t.assignee_id) if t.assignee_id else None,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            if t.status == "DONE":
                completed.append(task_dict)
            elif t.due_date and t.due_date < today:
                delayed.append(task_dict)
            else:
                in_progress.append(task_dict)

        # Last 5 completed by completed_at desc
        completed.sort(key=lambda x: x["completed_at"] or "", reverse=True)
        completed = completed[:5]

        ms_total = len(completed) + len(in_progress) + len(delayed)
        ms_pct = round(len(completed) / ms_total * 100, 1) if ms_total > 0 else 0.0

        board_milestones.append({
            "id": ms.id,
            "name": ms.name,
            "phase": ms.phase,
            "pct": ms_pct,
            "due_date": ms.end_date,
            "overdue": ms.end_date is not None and ms.end_date < today,
            "total_tasks": ms_total,
            "done_tasks": len(completed),
            "completed": completed,
            "in_progress": in_progress,
            "delayed": delayed,
        })

    # ── Risks (non-closed) ──────────────────────────────────────────
    risk_result = await db.execute(
        select(Risk)
        .options(selectinload(Risk.milestone), selectinload(Risk.owner))
        .where(Risk.workspace_id == workspace_id, Risk.status != "CLOSED")
        .order_by(Risk.created_at.desc())
    )
    risks = risk_result.scalars().all()
    board_risks = []
    for r in risks:
        board_risks.append({
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "level": r.impact,
            "owner_name": r.owner.display_name if r.owner else None,
            "status": r.status,
            "milestone_name": r.milestone.name if r.milestone else None,
        })

    # ── Recent completed tasks (last 7 days, up to 20) ──────────────
    seven_days_ago = today - timedelta(days=7)
    seven_days_ago_dt = datetime.combine(seven_days_ago, datetime.min.time())
    recent_result = await db.execute(
        select(Task)
        .where(
            Task.workspace_id == workspace_id,
            Task.status == "DONE",
            Task.completed_at >= seven_days_ago_dt,
        )
        .order_by(Task.completed_at.desc())
        .limit(20)
    )
    recent_tasks = recent_result.scalars().all()

    # Collect assignee_ids and fetch display names in one query
    assignee_ids = {t.assignee_id for t in recent_tasks if t.assignee_id}
    user_names_map = {}
    if assignee_ids:
        user_result = await db.execute(
            select(User.id, User.display_name).where(User.id.in_(assignee_ids))
        )
        user_names_map = {uid: name for uid, name in user_result.all()}

    recent_completed = []
    for t in recent_tasks:
        recent_completed.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "assignee_name": user_names_map.get(t.assignee_id) if t.assignee_id else None,
        })

    return {
        "workspace_id": workspace_id,
        "workspace_name": workspace_name,
        "owner_name": owner_name,
        "health": health,
        "pct": pct,
        "total_tasks": total,
        "done": done,
        "overdue": overdue,
        "milestones": board_milestones,
        "risks": board_risks,
        "recent_completed": recent_completed,
    }


async def get_timeline_data(db: AsyncSession, meeting: Meeting) -> dict:
    """Aggregates milestone-timeline data across all workspaces of a meeting.

    Powers the meeting big-screen view: multi-project milestone swimlanes,
    gantt drilldown, key-person progress and risk list. Uses a fixed set of
    4 batch queries + in-memory grouping (no N+1 per milestone/project).
    """
    today = date.today()
    ws_ids = await get_workspace_ids_for_meeting(db, meeting)
    if not ws_ids:
        return {"window_start": None, "window_end": None, "projects": [], "key_persons": [], "risks": []}

    # ── 1. Workspaces (id -> name, owner_name, owner department) ────
    ws_result = await db.execute(
        select(Workspace.id, Workspace.name, User.display_name, Department.name)
        .outerjoin(User, User.id == Workspace.owner_id)
        .outerjoin(Department, Department.id == User.department_id)
        .where(Workspace.id.in_(ws_ids))
    )
    ws_map: dict[str, dict] = {}
    for wid, wname, owner_name, dept_name in ws_result.all():
        ws_map[wid] = {"name": wname, "owner_name": owner_name, "department_name": dept_name}

    # ── 2. Milestones (with owner) ──────────────────────────────────
    ms_result = await db.execute(
        select(Milestone)
        .options(selectinload(Milestone.owner))
        .where(Milestone.workspace_id.in_(ws_ids))
        .order_by(Milestone.workspace_id, Milestone.sort_order, Milestone.start_date)
    )
    milestones = list(ms_result.scalars().all())

    # ── 3. Tasks (with assignee) ────────────────────────────────────
    task_result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.workspace_id.in_(ws_ids))
    )
    tasks = list(task_result.scalars().all())

    # Group tasks in memory
    tasks_by_ms: dict[str, list] = {}
    tasks_by_ws: dict[str, list] = {}
    tasks_by_assignee: dict[str, list] = {}
    for t in tasks:
        if t.milestone_id:
            tasks_by_ms.setdefault(t.milestone_id, []).append(t)
        tasks_by_ws.setdefault(t.workspace_id, []).append(t)
        if t.assignee_id:
            tasks_by_assignee.setdefault(t.assignee_id, []).append(t)

    # ── 4. Risks (non-closed, with milestone + owner) ───────────────
    risk_result = await db.execute(
        select(Risk)
        .options(selectinload(Risk.milestone), selectinload(Risk.owner))
        .where(Risk.workspace_id.in_(ws_ids), Risk.status != "CLOSED")
        .order_by(Risk.impact.desc())
    )
    risks = list(risk_result.scalars().all())

    # Milestones with an active/late risk → mark milestone as risk
    ms_ids_with_risk = {r.milestone_id for r in risks if r.milestone_id}

    # ── Build per-milestone status + collect window bounds ──────────
    all_dates: list[date] = []
    late_ms_ids: set[str] = set()
    ms_by_ws: dict[str, list] = {}

    def _ms_view(ms) -> dict:
        ms_tasks = tasks_by_ms.get(ms.id, [])
        total = len(ms_tasks)
        done = sum(1 for t in ms_tasks if t.status == "DONE")
        pct = round(done / total * 100, 1) if total > 0 else 0.0

        actual_date = None
        slip_days = 0
        # status derivation (priority order)
        if ms.phase == "DONE" or (total > 0 and done == total):
            status = "done"
            completed = [t.completed_at for t in ms_tasks if t.completed_at]
            if completed:
                actual_date = max(completed).date()
            elif ms.end_date:
                actual_date = ms.end_date
            if actual_date and ms.end_date and actual_date > ms.end_date:
                slip_days = (actual_date - ms.end_date).days
        elif ms.end_date and ms.end_date < today:
            status = "late"
        elif ms.end_date and 0 <= (ms.end_date - today).days <= 7:
            status = "risk"
        elif ms.id in ms_ids_with_risk:
            status = "risk"
        elif ms.phase == "ACTIVE" or (ms.start_date and ms.start_date <= today):
            status = "active"
        else:
            status = "upcoming"

        if status == "late":
            late_ms_ids.add(ms.id)

        if ms.start_date:
            all_dates.append(ms.start_date)
        if ms.end_date:
            all_dates.append(ms.end_date)
        if actual_date:
            all_dates.append(actual_date)

        return {
            "id": ms.id,
            "name": ms.name,
            "phase": ms.phase,
            "status": status,
            "start_date": ms.start_date.isoformat() if ms.start_date else None,
            "end_date": ms.end_date.isoformat() if ms.end_date else None,
            "actual_date": actual_date.isoformat() if actual_date else None,
            "slip_days": slip_days,
            "owner_name": ms.owner.display_name if ms.owner else None,
            "depends_on_id": ms.depends_on_id,
            "pct": pct,
            "total_tasks": total,
            "done_tasks": done,
        }

    for ms in milestones:
        ms_by_ws.setdefault(ms.workspace_id, []).append(_ms_view(ms))

    # ── Build projects (milestones + gantt tasks) ───────────────────
    def _task_pct(t) -> int:
        if t.status == "DONE":
            return 100
        if t.status == "IN_REVIEW":
            return 80
        if t.status == "IN_PROGRESS":
            return 50
        return 0

    def _ws_health(ws_tasks) -> str:
        total = len(ws_tasks)
        done = sum(1 for t in ws_tasks if t.status == "DONE")
        overdue = sum(1 for t in ws_tasks if t.status != "DONE" and t.due_date and t.due_date < today)
        if overdue > 2:
            return "blocked"
        if overdue > 0 or (total > 0 and done / total < 0.3):
            return "at-risk"
        return "on-track"

    projects = []
    for wid in ws_ids:
        if wid not in ws_map:
            continue
        ws_tasks = tasks_by_ws.get(wid, [])
        total = len(ws_tasks)
        done = sum(1 for t in ws_tasks if t.status == "DONE")
        pct = round(done / total * 100, 1) if total > 0 else 0.0
        gantt_tasks = [
            {
                "id": t.id,
                "title": t.title,
                "milestone_id": t.milestone_id,
                "assignee_name": t.assignee.display_name if t.assignee else None,
                "status": t.status,
                "start_date": (t.started_at.date().isoformat() if t.started_at else None),
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "pct": _task_pct(t),
                "critical": t.milestone_id in late_ms_ids and t.status != "DONE",
                "is_milestone_row": False,
            }
            for t in ws_tasks
        ]
        projects.append({
            "workspace_id": wid,
            "name": ws_map[wid]["name"],
            "owner_name": ws_map[wid]["owner_name"],
            "department_name": ws_map[wid].get("department_name"),
            "health": _ws_health(ws_tasks),
            "pct": pct,
            "milestones": ms_by_ws.get(wid, []),
            "tasks": gantt_tasks,
        })

    # ── Key persons (aggregate tasks by assignee) ───────────────────
    # Map owner_id -> milestone names they own (for a meaningful role label)
    owned_ms_by_user: dict[str, list[str]] = {}
    for ms in milestones:
        if ms.owner_id:
            owned_ms_by_user.setdefault(ms.owner_id, []).append(ms.name)

    key_persons = []
    for uid, u_tasks in tasks_by_assignee.items():
        total = len(u_tasks)
        done = sum(1 for t in u_tasks if t.status == "DONE")
        overdue = sum(1 for t in u_tasks if t.status != "DONE" and t.due_date and t.due_date < today)
        # load = concurrent active work (in-progress + in-review), TODO is backlog not load
        load = sum(1 for t in u_tasks if t.status in ("IN_PROGRESS", "IN_REVIEW"))
        pct = round(done / total * 100, 1) if total > 0 else 0.0
        # flag: overdue → block; heavy concurrent load → warn; else ok
        if overdue > 0:
            flag = "block"
        elif load >= 5:
            flag = "warn"
        else:
            flag = "ok"
        # role: prefer owned milestones; fall back to the project the person works in most
        owned = owned_ms_by_user.get(uid)
        if owned:
            role = "负责 " + "、".join(owned[:2]) + ("等" if len(owned) > 2 else "")
        else:
            ws_count: dict[str, int] = {}
            for t in u_tasks:
                ws_count[t.workspace_id] = ws_count.get(t.workspace_id, 0) + 1
            main_ws = max(ws_count, key=ws_count.get) if ws_count else None
            role = f"{ws_map[main_ws]['name']}" if main_ws and main_ws in ws_map else None
        name = u_tasks[0].assignee.display_name if u_tasks[0].assignee else uid
        key_persons.append({
            "user_id": uid,
            "name": name,
            "role": role,
            "pct": pct,
            "total_tasks": total,
            "done_tasks": done,
            "overdue_tasks": overdue,
            "load": load,
            "flag": flag,
        })

    flag_rank = {"block": 0, "warn": 1, "ok": 2}
    key_persons.sort(key=lambda p: (flag_rank[p["flag"]], -p["overdue_tasks"], -p["load"], -p["total_tasks"]))
    key_persons = key_persons[:8]

    # ── Risks ───────────────────────────────────────────────────────
    board_risks = [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "level": r.impact,
            "status": r.status,
            "owner_name": r.owner.display_name if r.owner else None,
            "milestone_name": r.milestone.name if r.milestone else None,
            "workspace_name": ws_map.get(r.workspace_id, {}).get("name"),
            "mitigation": r.mitigation,
        }
        for r in risks
    ]

    window_start = min(all_dates).isoformat() if all_dates else None
    window_end = max(all_dates).isoformat() if all_dates else None

    return {
        "window_start": window_start,
        "window_end": window_end,
        "projects": projects,
        "key_persons": key_persons,
        "risks": board_risks,
    }


async def add_note(
    db: AsyncSession,
    meeting: Meeting,
    who: str,
    text: str,
    note_type: str = "speech",
) -> Meeting:
    """Appends a note dict to meeting.notes JSON list."""
    note = {
        "who": who,
        "text": text,
        "type": note_type,
        "time": datetime.utcnow().isoformat(),
    }
    if meeting.notes is None:
        meeting.notes = []
    meeting.notes = list(meeting.notes) + [note]
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def close_meeting(
    db: AsyncSession,
    meeting: Meeting,
    summary: Optional[str] = None,
) -> Meeting:
    """Sets meeting.status = CLOSED, optionally stores summary."""
    meeting.status = "CLOSED"
    if summary is not None:
        meeting.summary = summary
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def delete_meeting(db: AsyncSession, meeting: Meeting) -> None:
    """Deletes a meeting. Its meeting_workspaces snapshot rows are removed via
    the cascade relationship."""
    await db.delete(meeting)
    await db.commit()
