"""Meeting timeline (big-screen) tests: milestone status derivation,
key-person aggregation, project-group multi-workspace, risk inclusion."""
from datetime import date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace
from app.models.milestone import Milestone
from app.models.task import Task
from app.models.risk import Risk
from app.models.meeting import Meeting
from app.models.project_group import ProjectGroup, ProjectGroupItem


TODAY = date.today()


async def _make_workspace(db: AsyncSession, name: str, key: str, owner_id: str) -> Workspace:
    ws = Workspace(name=name, key=key, type="PROJECT", status="ACTIVE", visibility="PRIVATE", owner_id=owner_id)
    db.add(ws)
    await db.flush()
    return ws


@pytest.fixture
async def scenario(db_session: AsyncSession, super_admin: dict) -> dict:
    """A single-project meeting with milestones covering all statuses,
    tasks (done/overdue), and a risk."""
    uid = super_admin["user"].id
    ws = await _make_workspace(db_session, "Q3改版", "Q3", uid)

    # milestones: done / late / risk / upcoming
    m_done = Milestone(workspace_id=ws.id, name="需求", phase="DONE", sort_order=0,
                       start_date=TODAY - timedelta(days=30), end_date=TODAY - timedelta(days=20),
                       owner_id=uid)
    m_late = Milestone(workspace_id=ws.id, name="核心开发", phase="ACTIVE", sort_order=1,
                       start_date=TODAY - timedelta(days=18), end_date=TODAY - timedelta(days=2),
                       owner_id=uid)
    m_risk = Milestone(workspace_id=ws.id, name="UI Review", phase="ACTIVE", sort_order=2,
                       start_date=TODAY - timedelta(days=1), end_date=TODAY + timedelta(days=5),
                       owner_id=uid)
    m_up = Milestone(workspace_id=ws.id, name="上线", phase="PLANNING", sort_order=3,
                     start_date=TODAY + timedelta(days=20), end_date=TODAY + timedelta(days=30),
                     owner_id=uid)
    db_session.add_all([m_done, m_late, m_risk, m_up])
    await db_session.flush()
    m_risk.depends_on_id = m_late.id
    m_late.depends_on_id = m_done.id

    # tasks: m_done fully done (with completed_at slip), m_late has an overdue task
    db_session.add_all([
        Task(workspace_id=ws.id, milestone_id=m_done.id, title="调研", status="DONE",
             assignee_id=uid, completed_at=datetime.combine(TODAY - timedelta(days=15), datetime.min.time())),
        Task(workspace_id=ws.id, milestone_id=m_late.id, title="接口开发", status="IN_PROGRESS",
             assignee_id=uid, due_date=TODAY - timedelta(days=3)),  # overdue → block flag
        Task(workspace_id=ws.id, milestone_id=m_risk.id, title="前端重构", status="TODO",
             assignee_id=uid, due_date=TODAY + timedelta(days=4)),
    ])

    # risk (non-closed, HIGH, on m_late, with mitigation)
    db_session.add(Risk(workspace_id=ws.id, milestone_id=m_late.id, title="开发延期风险",
                        impact="HIGH", status="IDENTIFIED", owner_id=uid, mitigation="协调资源并拆分任务"))

    meeting = Meeting(title="周会", dimension="PROJECT", dimension_id=ws.id,
                      meeting_type="WEEKLY", status="ACTIVE", host_id=uid)
    db_session.add(meeting)
    await db_session.commit()
    return {"meeting": meeting, "workspace": ws,
            "ms": {"done": m_done.id, "late": m_late.id, "risk": m_risk.id, "up": m_up.id}}


class TestMeetingTimeline:
    async def test_timeline_basic(self, client: AsyncClient, auth_headers: dict, scenario: dict):
        mid = scenario["meeting"].id
        resp = await client.get(f"/api/meetings/{mid}/timeline", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 0
        data = body["data"]
        assert len(data["projects"]) == 1
        proj = data["projects"][0]
        assert proj["name"] == "Q3改版"
        assert len(proj["milestones"]) == 4
        assert len(proj["tasks"]) == 3
        assert data["window_start"] and data["window_end"]

    async def test_milestone_status_derivation(self, client: AsyncClient, auth_headers: dict, scenario: dict):
        mid = scenario["meeting"].id
        resp = await client.get(f"/api/meetings/{mid}/timeline", headers=auth_headers)
        ms = {m["id"]: m for m in resp.json()["data"]["projects"][0]["milestones"]}
        assert ms[scenario["ms"]["done"]]["status"] == "done"
        assert ms[scenario["ms"]["late"]]["status"] == "late"
        assert ms[scenario["ms"]["risk"]]["status"] == "risk"
        assert ms[scenario["ms"]["up"]]["status"] == "upcoming"
        # done milestone slipped: completed 15d ago vs planned end 20d ago → slip 5
        assert ms[scenario["ms"]["done"]]["slip_days"] == 5

    async def test_key_person_aggregation(self, client: AsyncClient, auth_headers: dict, scenario: dict):
        mid = scenario["meeting"].id
        resp = await client.get(f"/api/meetings/{mid}/timeline", headers=auth_headers)
        persons = resp.json()["data"]["key_persons"]
        assert len(persons) == 1
        p = persons[0]
        # 3 tasks, 1 done, 1 overdue → flag=block
        assert p["total_tasks"] == 3
        assert p["done_tasks"] == 1
        assert p["overdue_tasks"] == 1
        assert p["flag"] == "block"

    async def test_risk_included(self, client: AsyncClient, auth_headers: dict, scenario: dict):
        mid = scenario["meeting"].id
        resp = await client.get(f"/api/meetings/{mid}/timeline", headers=auth_headers)
        risks = resp.json()["data"]["risks"]
        assert len(risks) == 1
        r = risks[0]
        assert r["level"] == "HIGH"
        assert r["workspace_name"] == "Q3改版"
        assert r["mitigation"] == "协调资源并拆分任务"
        assert r["milestone_name"] == "核心开发"

    async def test_meeting_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/meetings/nonexistent/timeline", headers=auth_headers)
        assert resp.status_code == 404


class TestProjectGroupTimeline:
    async def test_project_group_two_workspaces(
        self, client: AsyncClient, auth_headers: dict, db_session: AsyncSession, super_admin: dict
    ):
        uid = super_admin["user"].id
        ws1 = await _make_workspace(db_session, "项目A", "PA", uid)
        ws2 = await _make_workspace(db_session, "项目B", "PB", uid)
        for ws in (ws1, ws2):
            db_session.add(Milestone(workspace_id=ws.id, name="M1", phase="ACTIVE", sort_order=0,
                                     start_date=TODAY - timedelta(days=5), end_date=TODAY + timedelta(days=5)))
        group = ProjectGroup(name="项目群X", creator_id=uid)
        db_session.add(group)
        await db_session.flush()
        db_session.add_all([
            ProjectGroupItem(group_id=group.id, workspace_id=ws1.id),
            ProjectGroupItem(group_id=group.id, workspace_id=ws2.id),
        ])
        meeting = Meeting(title="群会", dimension="PROJECT_GROUP", dimension_id=group.id,
                          meeting_type="WEEKLY", status="ACTIVE", host_id=uid)
        db_session.add(meeting)
        await db_session.commit()

        resp = await client.get(f"/api/meetings/{meeting.id}/timeline", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["projects"]) == 2
        names = {p["name"] for p in data["projects"]}
        assert names == {"项目A", "项目B"}
