# Meeting Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade meeting from a throwaway BigScreen page to a persistent meeting lifecycle with data-rich board, chat-style note-taking, and AI-generated minutes.

**Architecture:** New `Meeting` model with dimension (PROJECT_GROUP | PROJECT); backend aggregation API queries tasks/milestones/risks/activity per workspace; React page with tabbed board (Overview/Milestones/Risks) + chat-style NotesPanel + MinutesView; existing BigScreenPage becomes the presentation-mode skin.

**Tech Stack:** Python FastAPI + SQLAlchemy async + React + TypeScript + existing design tokens (design-tokens.css)

---

### Task 1: Meeting model & migration

**Files:**
- Create: `server/app/models/meeting.py`
- Create: Migration via `uv run alembic revision --autogenerate`

- [ ] **Step 1: Create Meeting model**

```python
# server/app/models/meeting.py
from typing import Optional

from sqlalchemy import String, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin

MEETING_DIMENSIONS = ["PROJECT_GROUP", "PROJECT"]
MEETING_TYPES = ["STANDUP", "WEEKLY", "ADHOC"]
MEETING_STATUSES = ["ACTIVE", "CLOSED"]

MEETING_DIMENSION_LABELS = {
    "PROJECT_GROUP": "项目群",
    "PROJECT": "项目",
}

MEETING_TYPE_LABELS = {
    "STANDUP": "站会",
    "WEEKLY": "周会",
    "ADHOC": "临时会议",
}


class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    dimension: Mapped[str] = mapped_column(String(20), nullable=False, default="PROJECT")
    dimension_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    meeting_type: Mapped[str] = mapped_column(String(20), nullable=False, default="WEEKLY")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    host = relationship("User", backref="hosted_meetings", foreign_keys=[host_id])
```

- [ ] **Step 2: Export model from models/__init__.py**

Read `server/app/models/__init__.py`, add:

```python
from app.models.meeting import Meeting
```

- [ ] **Step 3: Generate migration**

```bash
cd server && uv run alembic revision --autogenerate -m "add meetings table"
```

Expected output: `Generating ... done`

- [ ] **Step 4: Run migration**

```bash
cd server && uv run alembic upgrade head
```

Expected output: `Running upgrade ... -> ...`

- [ ] **Step 5: Commit**

```bash
git add server/app/models/meeting.py server/app/models/__init__.py server/migrations/
git commit -m "feat(meeting): add Meeting model and migration"
```

---

### Task 2: Meeting Pydantic schemas

**Files:**
- Create: `server/app/schemas/meeting.py`

- [ ] **Step 1: Create schemas**

```python
# server/app/schemas/meeting.py
from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class MeetingCreate(BaseModel):
    title: str
    dimension: str = "PROJECT"  # "PROJECT_GROUP" | "PROJECT"
    dimension_id: str
    meeting_type: str = "WEEKLY"


class MeetingNote(BaseModel):
    who: str
    text: str
    note_type: str = "speech"  # "speech" | "decision" | "action"


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None


class MeetingOut(BaseModel):
    id: str
    title: str
    dimension: str
    dimension_id: str
    meeting_type: str
    status: str
    summary: Optional[str] = None
    notes: Optional[list] = None
    host_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BoardMilestone(BaseModel):
    id: str
    name: str
    phase: str
    pct: float
    due_date: Optional[str] = None
    overdue: bool
    total_tasks: int
    done_tasks: int
    completed: list
    in_progress: list
    delayed: list


class BoardRisk(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    level: str
    owner_name: Optional[str] = None
    status: str
    milestone_name: Optional[str] = None


class BoardData(BaseModel):
    workspace_id: str
    workspace_name: str
    owner_name: Optional[str] = None
    health: str
    pct: int
    total_tasks: int
    done: int
    overdue: int
    milestones: list[BoardMilestone]
    risks: list[BoardRisk]
    recent_completed: list
```

- [ ] **Step 2: Commit**

```bash
git add server/app/schemas/meeting.py
git commit -m "feat(meeting): add Pydantic schemas"
```

---

### Task 3: Meeting service — CRUD + board aggregation

**Files:**
- Create: `server/app/services/meeting.py`

- [ ] **Step 1: Create meeting service with CRUD**

```python
# server/app/services/meeting.py
from typing import Optional
from datetime import date, datetime, timedelta

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.meeting import Meeting
from app.models.workspace import Workspace
from app.models.project_group import ProjectGroup, ProjectGroupItem
from app.models.task import Task
from app.models.milestone import Milestone
from app.models.risk import Risk
from app.models.task_progress import TaskProgress
from app.models.user import User


async def create_meeting(
    db: AsyncSession,
    title: str,
    dimension: str,
    dimension_id: str,
    meeting_type: str,
    host_id: str,
) -> Meeting:
    meeting = Meeting(
        title=title,
        dimension=dimension,
        dimension_id=dimension_id,
        meeting_type=meeting_type,
        host_id=host_id,
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def get_meeting(db: AsyncSession, meeting_id: str) -> Optional[Meeting]:
    result = await db.execute(
        select(Meeting).where(Meeting.id == meeting_id)
    )
    return result.scalar_one_or_none()


async def get_workspace_ids_for_meeting(
    db: AsyncSession, meeting: Meeting
) -> list[str]:
    """Get workspace IDs covered by this meeting."""
    if meeting.dimension == "PROJECT":
        return [meeting.dimension_id]
    # PROJECT_GROUP: get all workspace IDs in the group
    result = await db.execute(
        select(ProjectGroupItem.workspace_id).where(
            ProjectGroupItem.group_id == meeting.dimension_id
        )
    )
    return [r[0] for r in result.all()]


async def get_board_data(
    db: AsyncSession,
    meeting: Meeting,
    workspace_id: str,
) -> dict:
    """Aggregate board data for a single workspace within a meeting."""
    # Workspace info
    ws_result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    ws = ws_result.scalar_one_or_none()
    if not ws:
        return None

    # Owner name
    owner_name = None
    if ws.owner_id:
        owner_r = await db.execute(select(User.display_name).where(User.id == ws.owner_id))
        owner_name = owner_r.scalar()

    # Task stats
    task_base = select(func.count(Task.id)).where(Task.workspace_id == workspace_id)
    total_r = await db.execute(task_base)
    total = total_r.scalar() or 0

    done_r = await db.execute(task_base.where(Task.status == "DONE"))
    done = done_r.scalar() or 0

    overdue_r = await db.execute(
        task_base.where(
            Task.status != "DONE",
            Task.due_date < date.today(),
        )
    )
    overdue = overdue_r.scalar() or 0

    pct = round((done / total) * 100) if total > 0 else 0

    # Health
    if overdue > 2:
        health = "blocked"
    elif overdue > 0 or (total > 0 and done / total < 0.3):
        health = "at-risk"
    else:
        health = "on-track"

    # Milestones with tasks
    ms_result = await db.execute(
        select(Milestone).where(
            Milestone.workspace_id == workspace_id
        ).order_by(Milestone.sort_order)
    )
    milestones_db = ms_result.scalars().all()

    milestones = []
    for m in milestones_db:
        # Completed tasks
        done_tasks_r = await db.execute(
            select(Task).where(
                Task.milestone_id == m.id,
                Task.status == "DONE",
            )
        )
        done_tasks = done_tasks_r.scalars().all()

        # In-progress tasks
        prog_tasks_r = await db.execute(
            select(Task).where(
                Task.milestone_id == m.id,
                Task.status.in_(["TODO", "IN_PROGRESS", "IN_REVIEW"]),
                or_(Task.due_date >= date.today(), Task.due_date == None),
            )
        )
        prog_tasks = prog_tasks_r.scalars().all()

        # Delayed tasks
        delayed_r = await db.execute(
            select(Task).where(
                Task.milestone_id == m.id,
                Task.status != "DONE",
                Task.due_date < date.today(),
            )
        )
        delayed = delayed_r.scalars().all()

        ms_total = len(done_tasks) + len(prog_tasks) + len(delayed)
        ms_done = len(done_tasks)
        ms_pct = round((ms_done / ms_total) * 100) if ms_total > 0 else 0
        ms_overdue = m.end_date and m.end_date < date.today() and m.status != "DONE"

        # Get assignee names for completed tasks
        completed_list = []
        for t in done_tasks[-5:]:  # last 5
            aname = None
            if t.assignee_id:
                ar = await db.execute(select(User.display_name).where(User.id == t.assignee_id))
                aname = ar.scalar()
            completed_list.append({
                "title": t.title,
                "assignee_name": aname,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            })

        # In-progress list
        prog_list = []
        for t in prog_tasks:
            aname = None
            if t.assignee_id:
                ar = await db.execute(select(User.display_name).where(User.id == t.assignee_id))
                aname = ar.scalar()
            prog_list.append({
                "title": t.title,
                "assignee_name": aname,
                "status": t.status,
            })

        # Delayed list
        delayed_list = []
        for t in delayed:
            aname = None
            if t.assignee_id:
                ar = await db.execute(select(User.display_name).where(User.id == t.assignee_id))
                aname = ar.scalar()
            delayed_list.append({
                "title": t.title,
                "assignee_name": aname,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            })

        milestones.append({
            "id": m.id,
            "name": m.name,
            "phase": m.phase,
            "pct": ms_pct,
            "due_date": m.end_date.isoformat() if m.end_date else None,
            "overdue": ms_overdue,
            "total_tasks": ms_total,
            "done_tasks": ms_done,
            "completed": completed_list,
            "in_progress": prog_list,
            "delayed": delayed_list,
        })

    # Risks
    risk_result = await db.execute(
        select(Risk).where(
            Risk.workspace_id == workspace_id,
            Risk.status != "CLOSED",
        )
    )
    risks_db = risk_result.scalars().all()

    risks = []
    for r in risks_db:
        oname = None
        if r.owner_id:
            or2 = await db.execute(select(User.display_name).where(User.id == r.owner_id))
            oname = or2.scalar()
        mname = None
        if r.milestone_id:
            mr = await db.execute(select(Milestone.name).where(Milestone.id == r.milestone_id))
            mname = mr.scalar()
        risks.append({
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "level": r.impact,
            "owner_name": oname,
            "status": r.status,
            "milestone_name": mname,
        })

    # Recent completed (7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_r = await db.execute(
        select(Task).where(
            Task.workspace_id == workspace_id,
            Task.status == "DONE",
            Task.completed_at >= seven_days_ago,
        ).order_by(Task.completed_at.desc()).limit(20)
    )
    recent_tasks = recent_r.scalars().all()

    recent_completed = []
    for t in recent_tasks:
        aname = None
        if t.assignee_id:
            ar = await db.execute(select(User.display_name).where(User.id == t.assignee_id))
            aname = ar.scalar()
        recent_completed.append({
            "title": t.title,
            "assignee_name": aname,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        })

    return {
        "workspace_id": workspace_id,
        "workspace_name": ws.name,
        "owner_name": owner_name,
        "health": health,
        "pct": pct,
        "total_tasks": total,
        "done": done,
        "overdue": overdue,
        "milestones": milestones,
        "risks": risks,
        "recent_completed": recent_completed,
    }


async def add_note(db: AsyncSession, meeting: Meeting, who: str, text: str, note_type: str = "speech") -> Meeting:
    notes = meeting.notes or []
    notes.append({
        "who": who,
        "text": text,
        "type": note_type,
        "time": datetime.utcnow().isoformat(),
    })
    meeting.notes = notes
    await db.commit()
    await db.refresh(meeting)
    return meeting


async def close_meeting(db: AsyncSession, meeting: Meeting, summary: Optional[str] = None) -> Meeting:
    meeting.status = "CLOSED"
    if summary:
        meeting.summary = summary
    await db.commit()
    await db.refresh(meeting)
    return meeting
```

- [ ] **Step 2: Commit**

```bash
git add server/app/services/meeting.py
git commit -m "feat(meeting): add meeting service with CRUD and board aggregation"
```

---

### Task 4: Meeting API router

**Files:**
- Create: `server/app/routers/meetings.py`
- Modify: `server/app/main.py` (register router)

- [ ] **Step 1: Create meetings router**

```python
# server/app/routers/meetings.py
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingOut, BoardData, MeetingNote
from app.schemas.common import APIResponse
from app.services import meeting as meeting_service
from app.exceptions import AppException

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.post("", response_model=APIResponse)
async def create_meeting(
    req: MeetingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await meeting_service.create_meeting(
        db,
        title=req.title,
        dimension=req.dimension,
        dimension_id=req.dimension_id,
        meeting_type=req.meeting_type,
        host_id=user.id,
    )
    return {"code": 0, "message": "ok", "data": _meeting_to_dict(meeting)}


@router.get("/{meeting_id}", response_model=APIResponse)
async def get_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await meeting_service.get_meeting(db, meeting_id)
    if not meeting:
        raise AppException(404, "会议不存在", 404)
    return {"code": 0, "message": "ok", "data": _meeting_to_dict(meeting)}


@router.get("/{meeting_id}/board", response_model=APIResponse)
async def get_board(
    meeting_id: str,
    workspace_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await meeting_service.get_meeting(db, meeting_id)
    if not meeting:
        raise AppException(404, "会议不存在", 404)
    data = await meeting_service.get_board_data(db, meeting, workspace_id)
    if not data:
        raise AppException(404, "项目不存在", 404)
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{meeting_id}/notes", response_model=APIResponse)
async def add_note(
    meeting_id: str,
    req: MeetingNote,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await meeting_service.get_meeting(db, meeting_id)
    if not meeting:
        raise AppException(404, "会议不存在", 404)
    meeting = await meeting_service.add_note(
        db, meeting, who=req.who, text=req.text, note_type=req.note_type,
    )
    return {"code": 0, "message": "ok", "data": _meeting_to_dict(meeting)}


@router.post("/{meeting_id}/close", response_model=APIResponse)
async def close_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    meeting = await meeting_service.get_meeting(db, meeting_id)
    if not meeting:
        raise AppException(404, "会议不存在", 404)
    meeting = await meeting_service.close_meeting(db, meeting)
    return {"code": 0, "message": "ok", "data": _meeting_to_dict(meeting)}


def _meeting_to_dict(m):
    return {
        "id": m.id, "title": m.title, "dimension": m.dimension,
        "dimension_id": m.dimension_id, "meeting_type": m.meeting_type,
        "status": m.status, "summary": m.summary, "notes": m.notes,
        "host_id": m.host_id, "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
```

- [ ] **Step 2: Register router in main.py**

Add after existing router registrations in `server/app/main.py`:

```python
from app.routers import meetings
app.include_router(meetings.router)
```

- [ ] **Step 3: Commit**

```bash
git add server/app/routers/meetings.py server/app/main.py
git commit -m "feat(meeting): add meetings API router"
```

---

### Task 5: Frontend meeting store & API client

**Files:**
- Create: `apps/web/src/stores/meetingStore.ts`
- Create: `apps/web/src/api/meeting.ts`

- [ ] **Step 1: Create API client**

```typescript
// apps/web/src/api/meeting.ts
import api from './client';

export interface Meeting {
  id: string;
  title: string;
  dimension: 'PROJECT_GROUP' | 'PROJECT';
  dimension_id: string;
  meeting_type: string;
  status: string;
  summary: string | null;
  notes: Array<{
    who: string;
    text: string;
    type: 'speech' | 'decision' | 'action';
    time: string;
  }> | null;
  host_id: string;
  created_at: string;
  updated_at: string | null;
}

export interface BoardData {
  workspace_id: string;
  workspace_name: string;
  owner_name: string | null;
  health: 'on-track' | 'at-risk' | 'blocked';
  pct: number;
  total_tasks: number;
  done: number;
  overdue: number;
  milestones: MilestoneData[];
  risks: RiskData[];
  recent_completed: CompletedTask[];
}

export interface MilestoneData {
  id: string;
  name: string;
  phase: string;
  pct: number;
  due_date: string | null;
  overdue: boolean;
  total_tasks: number;
  done_tasks: number;
  completed: Array<{ title: string; assignee_name: string | null; completed_at: string | null }>;
  in_progress: Array<{ title: string; assignee_name: string | null; status: string }>;
  delayed: Array<{ title: string; assignee_name: string | null; due_date: string | null }>;
}

export interface RiskData {
  id: string;
  title: string;
  description: string | null;
  level: string;
  owner_name: string | null;
  status: string;
  milestone_name: string | null;
}

export interface CompletedTask {
  title: string;
  assignee_name: string | null;
  completed_at: string | null;
}

export const meetingApi = {
  create: (data: { title: string; dimension: string; dimension_id: string; meeting_type?: string }) =>
    api.post('/meetings', data).then(r => r.data),

  get: (id: string) =>
    api.get(`/meetings/${id}`).then(r => r.data),

  getBoard: (id: string, workspaceId: string): Promise<BoardData> =>
    api.get(`/meetings/${id}/board`, { params: { workspace_id: workspaceId } }).then(r => r.data),

  addNote: (id: string, note: { who: string; text: string; note_type?: string }) =>
    api.post(`/meetings/${id}/notes`, note).then(r => r.data),

  close: (id: string) =>
    api.post(`/meetings/${id}/close`).then(r => r.data),
};
```

- [ ] **Step 2: Create Zustand store**

```typescript
// apps/web/src/stores/meetingStore.ts
import { create } from 'zustand';
import { meetingApi, Meeting, BoardData } from '../api/meeting';

interface MeetingState {
  meeting: Meeting | null;
  boardData: BoardData | null;
  loading: boolean;
  boardLoading: boolean;

  fetchMeeting: (id: string) => Promise<void>;
  fetchBoard: (meetingId: string, workspaceId: string) => Promise<void>;
  addNote: (meetingId: string, who: string, text: string, noteType?: string) => Promise<void>;
  closeMeeting: (meetingId: string) => Promise<void>;
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meeting: null,
  boardData: null,
  loading: false,
  boardLoading: false,

  fetchMeeting: async (id) => {
    set({ loading: true });
    try {
      const meeting = await meetingApi.get(id);
      set({ meeting });
    } finally {
      set({ loading: false });
    }
  },

  fetchBoard: async (meetingId, workspaceId) => {
    set({ boardLoading: true });
    try {
      const boardData = await meetingApi.getBoard(meetingId, workspaceId);
      set({ boardData });
    } finally {
      set({ boardLoading: false });
    }
  },

  addNote: async (meetingId, who, text, noteType = 'speech') => {
    const updated = await meetingApi.addNote(meetingId, { who, text, note_type: noteType });
    set({ meeting: updated });
  },

  closeMeeting: async (meetingId) => {
    const updated = await meetingApi.close(meetingId);
    set({ meeting: updated });
  },

  reset: () => set({ meeting: null, boardData: null }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/meeting.ts apps/web/src/stores/meetingStore.ts
git commit -m "feat(meeting): add frontend API client and store"
```

---

### Task 6: MeetingBoardPage — page shell + project switcher

**Files:**
- Create: `apps/web/src/pages/meeting/MeetingBoardPage.tsx`
- Create: `apps/web/src/pages/meeting/ProjectSwitcher.tsx`
- Modify: `apps/web/src/components/Layout/AppLayout.tsx` (add route)

- [ ] **Step 1: Create ProjectSwitcher component**

```tsx
// apps/web/src/pages/meeting/ProjectSwitcher.tsx
import { BoardData } from '../../api/meeting';

interface Props {
  workspaces: Array<{ id: string; name: string; health: string }>;
  currentId: string;
  onChange: (id: string) => void;
}

export default function ProjectSwitcher({ workspaces, currentId, onChange }: Props) {
  if (workspaces.length <= 1) return null;

  return (
    <div className="sw-bar">
      <span className="sw-label">切换项目</span>
      <div className="sw-tabs">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={`sw-tab${ws.id === currentId ? ' on' : ''}`}
            onClick={() => onChange(ws.id)}
          >
            <span className={`sw-dot ${ws.health === 'on-track' ? 'ok' : ws.health === 'at-risk' ? 'warn' : 'bad'}`} />
            {ws.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MeetingBoardPage shell**

```tsx
// apps/web/src/pages/meeting/MeetingBoardPage.tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMeetingStore } from '../../stores/meetingStore';
import { useProjectGroupStore } from '../../stores/projectGroupStore';
import ProjectSwitcher from './ProjectSwitcher';
import OverviewTab from './OverviewTab';
import MilestoneTab from './MilestoneTab';
import RiskTab from './RiskTab';
import NotesPanel from './NotesPanel';
import MinutesView from './MinutesView';

type Step = 'board' | 'minutes';
type BoardTab = 'overview' | 'milestones' | 'risks';

export default function MeetingBoardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meeting, boardData, boardLoading, fetchMeeting, fetchBoard } = useMeetingStore();
  const [step, setStep] = useState<Step>('board');
  const [boardTab, setBoardTab] = useState<BoardTab>('milestones');
  const [currentWsId, setCurrentWsId] = useState<string>('');
  const [presMode, setPresMode] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchMeeting(id);
  }, [id]);

  const handleSwitchWs = useCallback((wsId: string) => {
    setCurrentWsId(wsId);
    if (id) fetchBoard(id, wsId);
  }, [id, fetchBoard]);

  if (!meeting) {
    return <div className="empty-state"><div>加载中...</div></div>;
  }

  const hIcon = boardData?.health === 'on-track' ? '🟢' : boardData?.health === 'at-risk' ? '🟡' : '🔴';

  return (
    <div className={presMode ? 'page presenting' : 'page'}>
      {/* Header */}
      <div className="hd">
        <div className="crumb">
          {meeting.dimension === 'PROJECT_GROUP' ? '项目群' : '项目'} /
          <b>会议</b>
        </div>
        <span className="separator">|</span>
        <span className="title">📋 {meeting.title}</span>
        <span className="meta">
          {new Date(meeting.created_at).toLocaleDateString('zh-CN')}
        </span>
        <span className="sp" />
        <span className="badge acc">
          {meeting.dimension === 'PROJECT_GROUP' ? '项目群' : '项目'}
        </span>
        <button className="step-btn" onClick={() => navigate(-1)}>← 返回</button>
        <button
          className={`step-btn${step === 'board' ? ' on' : ''}`}
          onClick={() => setStep('board')}
        >📊 看板</button>
        <button
          className={`step-btn${step === 'minutes' ? ' on' : ''}`}
          onClick={() => setStep('minutes')}
        >📝 纪要</button>
        <button
          className={`pres-btn${presMode ? ' on' : ''}`}
          onClick={() => setPresMode(!presMode)}
        >{presMode ? '☀ 退出投屏' : '🖥 投屏模式'}</button>
      </div>

      {step === 'board' ? (
        <div className="main">
          <div className="board">
            <ProjectSwitcher
              workspaces={[]}  {/* populated from project group */}
              currentId={currentWsId}
              onChange={handleSwitchWs}
            />

            {boardData && (
              <>
                {/* Summary Bar */}
                <div className="summary">
                  <span className="s-icon">{hIcon}</span>
                  <div>
                    <div className="s-name">{boardData.workspace_name}</div>
                    <div className="s-meta">
                      负责人：{boardData.owner_name || '-'} · {boardData.total_tasks}个任务 · 整体完成 {boardData.pct}%
                    </div>
                  </div>
                  <div className="s-stats">
                    <span className="stat-good">✓ {boardData.done}</span>
                    <span className="stat-bad">⏰ {boardData.overdue} 逾期</span>
                    <span className="stat-warn">⚠ {boardData.risks.length} 风险</span>
                  </div>
                </div>

                {/* Board Tabs */}
                <div className="board-tabs">
                  <button className={`bt-tab${boardTab === 'overview' ? ' on' : ''}`} onClick={() => setBoardTab('overview')}>📊 整体进展</button>
                  <button className={`bt-tab${boardTab === 'milestones' ? ' on' : ''}`} onClick={() => setBoardTab('milestones')}>🏔 里程碑</button>
                  <button className={`bt-tab${boardTab === 'risks' ? ' on' : ''}`} onClick={() => setBoardTab('risks')}>⚠️ 风险</button>
                </div>

                <div className="tab-content">
                  {boardTab === 'overview' && <OverviewTab data={boardData} />}
                  {boardTab === 'milestones' && <MilestoneTab data={boardData} />}
                  {boardTab === 'risks' && <RiskTab data={boardData} />}
                </div>
              </>
            )}

            {boardLoading && <div className="empty-state">加载看板数据...</div>}
          </div>

          <NotesPanel meetingId={id!} />
        </div>
      ) : (
        <MinutesView meetingId={id!} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add route in AppLayout.tsx**

```tsx
import MeetingBoardPage from '../../pages/meeting/MeetingBoardPage';
// Add inside <Routes>:
<Route path="/meetings/:id" element={<MeetingBoardPage />} />
```

Also replace the nav item:
```tsx
// Change:
{ key: '/bigscreen', label: '会议大屏' },
// To:
{ key: '/meetings', label: '会议' },
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/meeting/MeetingBoardPage.tsx apps/web/src/pages/meeting/ProjectSwitcher.tsx apps/web/src/components/Layout/AppLayout.tsx
git commit -m "feat(meeting): add MeetingBoardPage shell with project switcher"
```

---

### Task 7: Board tabs — Overview, Milestones, Risks

**Files:**
- Create: `apps/web/src/pages/meeting/OverviewTab.tsx`
- Create: `apps/web/src/pages/meeting/MilestoneTab.tsx`
- Create: `apps/web/src/pages/meeting/RiskTab.tsx`

- [ ] **Step 1: Create OverviewTab**

```tsx
// apps/web/src/pages/meeting/OverviewTab.tsx
import { BoardData } from '../../api/meeting';

export default function OverviewTab({ data }: { data: BoardData }) {
  const pctColor = data.pct > 60 ? 'var(--blue-500)' : data.pct > 30 ? 'var(--amber-500)' : 'var(--red-500)';
  const barClass = data.pct > 60 ? 'info' : data.pct > 30 ? 'warn' : 'warn';

  return (
    <>
      <div className="ov-grid">
        <div className="ov-card">
          <div className="ov-label">整体完成率</div>
          <div className="ov-big" style={{ color: pctColor }}>{data.pct}%</div>
          <div className="ov-bar"><div className={`ov-bar-fill ${barClass}`} style={{ width: `${data.pct}%` }} /></div>
          <div className="ov-sub">{data.done}/{data.total_tasks} 任务已完成</div>
        </div>
        <div className="ov-card">
          <div className="ov-label">任务状态分布</div>
          <div className="ov-status-row">
            <div className="ov-status-item"><div className="c" style={{ color: '#64748b' }}>{data.total_tasks - data.done}</div><div className="l">待办/进行中</div></div>
            <div className="ov-status-item"><div className="c" style={{ color: 'var(--green-500)' }}>{data.done}</div><div className="l">已完成</div></div>
            <div className="ov-status-item"><div className="c" style={{ color: 'var(--red-500)' }}>{data.overdue}</div><div className="l">逾期</div></div>
          </div>
        </div>
      </div>
      <div className="ov-card">
        <div className="ov-label">最近7天完成的工作</div>
        {data.recent_completed.length === 0 ? (
          <div className="empty-row">暂无</div>
        ) : (
          <table className="task-table">
            <thead><tr><th>任务</th><th>完成人</th><th>时间</th></tr></thead>
            <tbody>
              {data.recent_completed.map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td>
                  <td className="t-who">{t.assignee_name || '-'}</td>
                  <td className="t-time">
                    {t.completed_at ? new Date(t.completed_at).toLocaleDateString('zh-CN') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create MilestoneTab with collapsible cards**

```tsx
// apps/web/src/pages/meeting/MilestoneTab.tsx
import { useState } from 'react';
import { BoardData } from '../../api/meeting';

export default function MilestoneTab({ data }: { data: BoardData }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      {data.milestones.map((m) => {
        const isOpen = expanded.has(m.id);
        const barClass = m.overdue ? 'danger' : (m.pct > 60 ? 'good' : 'warn');
        const pctColor = m.overdue
          ? 'var(--red-500)'
          : m.pct > 60 ? 'var(--green-600)' : 'var(--amber-600)';

        // Key activity summary for collapsed state
        const latestDone = m.completed.slice(0, 2);
        const delayedCount = m.delayed.length;

        return (
          <div key={m.id} className={`ms-block${m.overdue ? ' overdue' : ''}`}>
            {/* Collapsed header — always visible */}
            <div className="ms-header" onClick={() => toggle(m.id)} style={{ cursor: 'pointer' }}>
              <span className="ms-icon">{m.overdue ? '🔴' : '📌'}</span>
              <span className="ms-name">{m.name}</span>
              <span className={`ms-ms-tag ${m.phase === 'ACTIVE' ? 'active' : m.phase === 'DONE' ? 'done' : ''}`}>
                {m.phase === 'ACTIVE' ? '执行中' : m.phase === 'REVIEW' ? '审核中' : m.phase === 'DONE' ? '已完成' : '计划中'}
              </span>
              <span className="ms-ts">{m.done_tasks}/{m.total_tasks}</span>
              <div className="ms-pct" style={{ color: pctColor }}>{m.pct}%</div>
              <div className={`ms-due${m.overdue ? ' over' : ''}`}>
                截止 {m.due_date ? new Date(m.due_date).toLocaleDateString('zh-CN') : '-'}
                {m.overdue ? ' · 已逾期' : ''}
              </div>
              <span className="ms-expand">{isOpen ? '▾' : '▸'}</span>
            </div>
            <div className="ms-bar">
              <div className={`ms-bar-fill ${barClass}`} style={{ width: `${m.pct}%` }} />
            </div>

            {/* Key activity in collapsed state */}
            {!isOpen && (
              <div className="ms-collapsed-summary">
                {latestDone.length > 0 && (
                  <span className="ms-key-done">
                    ✅ {latestDone.map(t => `${t.assignee_name || '?'} 完成了「${t.title}」`).join(' · ')}
                  </span>
                )}
                {delayedCount > 0 && (
                  <span className="ms-key-delay">⚠️ {delayedCount} 个任务延期</span>
                )}
                {latestDone.length === 0 && delayedCount === 0 && (
                  <span className="ms-key-empty">暂无近期动态</span>
                )}
              </div>
            )}

            {/* Expanded detail */}
            {isOpen && (
              <div className="ms-detail">
                <div className="ms-subsection">
                  <div className="ms-subtitle">✅ 已完成</div>
                  <table className="task-table">
                    <tbody>
                      {m.completed.length === 0 ? (
                        <tr><td colSpan={3} className="empty-row">本周无完成任务</td></tr>
                      ) : (
                        m.completed.map((t, i) => (
                          <tr key={i}>
                            <td>{t.title}</td>
                            <td className="t-who">{t.assignee_name || '-'}</td>
                            <td>
                              <span className="t-status done">
                                ✓ {t.completed_at ? new Date(t.completed_at).toLocaleDateString('zh-CN') : ''}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="ms-subsection">
                  <div className="ms-subtitle">🔄 进行中</div>
                  <table className="task-table">
                    <tbody>
                      {m.in_progress.length === 0 ? (
                        <tr><td colSpan={3} className="empty-row">无进行中任务</td></tr>
                      ) : (
                        m.in_progress.map((t, i) => (
                          <tr key={i}>
                            <td>{t.title}</td>
                            <td className="t-who">{t.assignee_name || '-'}</td>
                            <td>
                              <span className={`t-status ${t.status === 'IN_REVIEW' ? 'review' : 'progress'}`}>
                                {t.status === 'IN_REVIEW' ? '待Review' : '进行中'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="ms-subsection">
                  <div className="ms-subtitle">⚠️ 延期 / 阻塞</div>
                  <table className="task-table">
                    <tbody>
                      {m.delayed.length === 0 ? (
                        <tr><td colSpan={3} className="empty-row">✓ 无延期任务</td></tr>
                      ) : (
                        m.delayed.map((t, i) => (
                          <tr key={i}>
                            <td>{t.title}</td>
                            <td className="t-who">{t.assignee_name || '-'}</td>
                            <td>
                              <span className="t-status delayed">
                                ⏰ 应于 {t.due_date ? new Date(t.due_date).toLocaleDateString('zh-CN') : ''}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: Create RiskTab**

```tsx
// apps/web/src/pages/meeting/RiskTab.tsx
import { BoardData } from '../../api/meeting';

export default function RiskTab({ data }: { data: BoardData }) {
  if (data.risks.length === 0) {
    return <div className="ov-card"><div className="empty-row" style={{ padding: 40 }}>✓ 当前无风险项</div></div>;
  }

  return (
    <>
      {data.risks.map((r) => (
        <div key={r.id} className={`risk-item ${r.level.toLowerCase()}`}>
          <span className={`risk-level ${r.level.toLowerCase()}`}>{r.level}</span>
          <div className="risk-body">
            <div className="r-title">{r.title}</div>
            {r.description && <div className="r-desc">{r.description}</div>}
          </div>
          <div className="risk-meta">
            {r.owner_name || '-'}<br />
            {r.status === 'MITIGATING' ? '应对中' : r.status === 'IDENTIFIED' ? '已识别' : r.status}
            {r.milestone_name && ` · ${r.milestone_name}`}
          </div>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/meeting/OverviewTab.tsx apps/web/src/pages/meeting/MilestoneTab.tsx apps/web/src/pages/meeting/RiskTab.tsx
git commit -m "feat(meeting): add board tabs — overview, milestones (collapsible), risks"
```

---

### Task 8: NotesPanel — chat-style meeting notes

**Files:**
- Create: `apps/web/src/pages/meeting/NotesPanel.tsx`

- [ ] **Step 1: Create NotesPanel**

```tsx
// apps/web/src/pages/meeting/NotesPanel.tsx
import { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';

export default function NotesPanel({ meetingId }: { meetingId: string }) {
  const { meeting, addNote } = useMeetingStore();
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const notes = meeting?.notes || [];

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [notes.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await addNote(meetingId, '会议记录', text, 'speech');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="notes">
      <div className="notes-header">
        <span>📝</span>
        <span className="nh-title">会议记录</span>
        <span className="nh-count">{notes.length}条</span>
      </div>

      <div className="notes-body" ref={bodyRef}>
        {notes.length === 0 && (
          <div className="notes-empty">开始记录会议内容...</div>
        )}
        {notes.map((n, i) => (
          <div key={i} className={`note-item${n.type === 'decision' ? ' system' : ''}`}>
            <div className="ni-avatar">{n.who[0]}</div>
            <div className="ni-body">
              <div className="ni-who">{n.who}</div>
              <div className="ni-text">{n.text}</div>
              <div className="ni-time">
                {n.time ? new Date(n.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="notes-footer">
        <div className="ai-bar">
          <button onClick={() => addNote(meetingId, '📌', '标记为决议', 'decision')}>📌 决议</button>
        </div>
        <div className="quick-input">
          <input
            placeholder="快速记录：张三说..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={handleSend}>↑</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/meeting/NotesPanel.tsx
git commit -m "feat(meeting): add chat-style NotesPanel"
```

---

### Task 9: MinutesView — AI summary + export

**Files:**
- Create: `apps/web/src/pages/meeting/MinutesView.tsx`

- [ ] **Step 1: Create MinutesView**

```tsx
// apps/web/src/pages/meeting/MinutesView.tsx
import { useMeetingStore } from '../../stores/meetingStore';
import { useMeetingStore as useMS } from '../../stores/meetingStore';

export default function MinutesView({ meetingId }: { meetingId: string }) {
  const { meeting, boardData } = useMS();

  if (!meeting) return null;

  const notes = meeting.notes || [];
  const summary = meeting.summary;

  const handleExportMd = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title}-会议纪要.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="minutes-view" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 0 60px' }}>
      <div className="mv-header">
        <span className="mv-title">📝 会议纪要</span>
        {summary && <span className="badge acc">AI 生成</span>}
        <span className="mv-meta">{meeting.title} · {new Date(meeting.created_at).toLocaleDateString('zh-CN')}</span>
      </div>

      {summary ? (
        <>
          <div className="ov-card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: '0.75rem' }}>
            {summary}
          </div>
          <div className="minutes-actions">
            <button onClick={handleExportMd}>📥 下载 Markdown</button>
            <button>📄 导出 PDF</button>
            <button className="pri">📧 发送邮件</button>
            <button>✏️ 编辑</button>
          </div>
        </>
      ) : (
        <div className="ov-card">
          <div className="empty-row" style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ marginBottom: 12 }}>尚未生成会议纪要</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>
              请先在看板中记录会议内容，然后使用 AI 生成纪要
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/meeting/MinutesView.tsx
git commit -m "feat(meeting): add MinutesView with export"
```

---

### Task 10: Styles — meeting.css

**Files:**
- Create: `apps/web/src/styles/meeting.css`
- Modify: `apps/web/src/main.tsx` (import css)

- [ ] **Step 1: Create meeting styles**

The CSS below follows existing patterns from `bigscreen.css` and `design-tokens.css`. Reference the visual companion v6 mockup for exact values.

Create `apps/web/src/styles/meeting.css` with these sections:

```css
/* ═══ MEETING BOARD ═══ */
/* --- Project Switcher --- */
.sw-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.sw-label { font-size: 0.62rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.06em; font-weight: 600; }
.sw-tabs { display: flex; gap: 4px; }
.sw-tab { display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 10px; font-size: 0.78rem; cursor: pointer; border: 1px solid transparent; background: var(--bg-surface); color: var(--text-secondary); white-space: nowrap; transition: all var(--fast); font-family: inherit; }
.sw-tab:hover { background: var(--bg-raised); }
.sw-tab.on { background: var(--blue-50); color: var(--blue-600); border-color: var(--blue-200); font-weight: 500; }
.sw-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sw-dot.ok { background: var(--green-500); } .sw-dot.warn { background: var(--amber-500); } .sw-dot.bad { background: var(--red-500); }

/* --- Page Layout --- */
.page { min-height: 100vh; background: var(--bg-root); display: flex; flex-direction: column; }
.page.presenting { background: #0a0f1e; color: #e2e8f0; }
.hd { display: flex; align-items: center; gap: 12px; padding: 10px 24px; background: var(--bg-surface); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.hd .crumb { font-size: 0.76rem; color: var(--text-muted); }
.hd .crumb b { color: var(--text-primary); font-weight: 500; }
.hd .title { font-weight: 600; font-size: 0.85rem; }
.hd .meta { font-size: 0.68rem; color: var(--text-muted); }
.hd .separator { color: var(--text-muted); }
.sp { flex: 1; }
.step-btn { padding: 5px 14px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); cursor: pointer; font-size: 0.7rem; font-family: inherit; transition: all var(--fast); }
.step-btn:hover { background: var(--bg-raised); }
.step-btn.on { background: var(--blue-600); color: #fff; border-color: var(--blue-500); }
.pres-btn { padding: 5px 14px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); cursor: pointer; font-size: 0.7rem; font-family: inherit; }
.pres-btn.on { background: var(--blue-600); color: #fff; border-color: var(--blue-500); }

/* --- Main two-column --- */
.main { display: flex; flex: 1; overflow: hidden; }
.board { flex: 1; overflow-y: auto; padding: 16px 20px 24px; display: flex; flex-direction: column; gap: 12px; }

/* --- Summary --- */
.summary { display: flex; align-items: center; gap: 16px; padding: 12px 18px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg); flex-shrink: 0; }
.s-icon { font-size: 1.3rem; }
.s-name { font-weight: 600; font-size: 0.82rem; }
.s-meta { font-size: 0.65rem; color: var(--text-muted); }
.s-stats { margin-left: auto; display: flex; gap: 14px; font-size: 0.7rem; }
.stat-good { color: var(--green-600); } .stat-bad { color: var(--red-500); } .stat-warn { color: var(--amber-500); }

/* --- Board Tabs --- */
.board-tabs { display: flex; gap: 2px; flex-shrink: 0; border-bottom: 1px solid var(--border-light); }
.bt-tab { padding: 8px 18px; font-size: 0.73rem; cursor: pointer; border: none; background: transparent; color: var(--text-muted); font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all var(--fast); }
.bt-tab:hover { color: var(--text-primary); }
.bt-tab.on { color: var(--blue-600); border-bottom-color: var(--blue-600); font-weight: 500; }
.tab-content { flex: 1; overflow-y: auto; }

/* --- Overview --- */
.ov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.ov-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
.ov-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px; font-weight: 600; }
.ov-big { font-size: 1.8rem; font-weight: 700; }
.ov-bar { height: 6px; border-radius: 3px; background: var(--bg-raised); overflow: hidden; margin: 10px 0; }
.ov-bar-fill { height: 100%; border-radius: 3px; }
.ov-bar-fill.info { background: var(--blue-500); } .ov-bar-fill.good { background: var(--green-500); } .ov-bar-fill.warn { background: var(--amber-500); }
.ov-sub { font-size: 0.62rem; color: var(--text-muted); }
.ov-status-row { display: flex; gap: 20px; }
.ov-status-item { text-align: center; }
.ov-status-item .c { font-size: 1rem; font-weight: 600; }
.ov-status-item .l { font-size: 0.58rem; color: var(--text-muted); }

/* --- Milestones --- */
.ms-block { border: 1px solid var(--border-light); border-radius: var(--radius); margin-bottom: 12px; background: var(--bg-surface); overflow: hidden; }
.ms-block.overdue { border-color: #fecaca; background: #fffbfb; }
.ms-header { display: flex; align-items: center; gap: 10px; padding: 14px 18px; }
.ms-header:hover { background: var(--bg-raised); }
.ms-icon { font-size: 1.1rem; flex-shrink: 0; }
.ms-name { font-weight: 600; font-size: 0.8rem; flex: 1; }
.ms-ms-tag { font-size: 0.58rem; padding: 2px 8px; border-radius: 8px; }
.ms-ms-tag.active { background: var(--amber-50); color: var(--amber-600); }
.ms-ms-tag.done { background: var(--green-50); color: var(--green-600); }
.ms-ts { font-size: 0.62rem; color: var(--text-muted); }
.ms-pct { font-size: 1rem; font-weight: 700; }
.ms-due { font-size: 0.6rem; color: var(--text-muted); text-align: right; }
.ms-due.over { color: var(--red-500); font-weight: 500; }
.ms-expand { font-size: 0.7rem; color: var(--text-muted); width: 20px; text-align: center; }
.ms-bar { height: 5px; background: var(--bg-raised); margin: 0 18px; border-radius: 3px; overflow: hidden; }
.ms-bar-fill { height: 100%; border-radius: 3px; }
.ms-bar-fill.good { background: var(--green-500); } .ms-bar-fill.warn { background: var(--amber-500); } .ms-bar-fill.danger { background: var(--red-500); }
.ms-collapsed-summary { padding: 8px 18px 14px; font-size: 0.65rem; color: var(--text-muted); display: flex; gap: 12px; }
.ms-key-done { color: var(--green-600); } .ms-key-delay { color: var(--red-500); } .ms-key-empty { opacity: 0.5; }
.ms-detail { padding: 0 18px 14px; }
.ms-subtitle { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin-bottom: 6px; font-weight: 600; }
.ms-subsection { margin-bottom: 12px; }
.ms-subsection:last-child { margin-bottom: 0; }

/* --- Risks --- */
.risk-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--radius); margin-bottom: 8px; border: 1px solid var(--border-light); background: var(--bg-surface); }
.risk-item.high { background: #fef2f2; border-color: #fecaca; }
.risk-item.medium { background: #fffbeb; border-color: #fde68a; }
.risk-level { font-size: 0.52rem; padding: 2px 7px; border-radius: 5px; font-weight: 600; flex-shrink: 0; }
.risk-level.high { background: #fee2e2; color: var(--red-500); }
.risk-level.medium { background: #fef3c7; color: var(--amber-600); }
.risk-body { flex: 1; }
.r-title { font-size: 0.7rem; font-weight: 500; margin-bottom: 2px; }
.r-desc { font-size: 0.62rem; color: var(--text-muted); }
.risk-meta { font-size: 0.58rem; color: var(--text-muted); text-align: right; white-space: nowrap; }

/* --- Notes Panel --- */
.notes { width: 320px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg-surface); }
.notes-header { padding: 12px 16px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.nh-title { font-size: 0.76rem; font-weight: 600; flex: 1; }
.nh-count { font-size: 0.6rem; color: var(--text-muted); }
.notes-body { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.notes-empty { text-align: center; padding: 40px 0; color: var(--text-muted); font-size: 0.7rem; }
.notes-footer { padding: 10px 12px; border-top: 1px solid var(--border-light); flex-shrink: 0; }
.ai-bar { display: flex; gap: 6px; margin-bottom: 8px; }
.ai-bar button { padding: 5px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); cursor: pointer; font-size: 0.65rem; font-family: inherit; }
.ai-bar button:hover { background: var(--bg-raised); }
.quick-input { display: flex; gap: 6px; align-items: flex-end; }
.quick-input input { flex: 1; padding: 7px 12px; border-radius: 16px; border: 1px solid var(--border); font-size: 0.7rem; font-family: inherit; outline: none; background: var(--bg-raised); }
.quick-input input:focus { border-color: var(--blue-500); background: var(--bg-surface); }
.quick-input button { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--blue-600); color: #fff; cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

/* --- Note Item --- */
.note-item { display: flex; gap: 8px; font-size: 0.7rem; }
.ni-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--blue-50); color: var(--blue-600); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 600; flex-shrink: 0; }
.note-item.system .ni-avatar { background: var(--bg-raised); color: var(--text-muted); }
.ni-body { flex: 1; min-width: 0; }
.ni-who { font-weight: 600; font-size: 0.7rem; margin-bottom: 1px; }
.ni-text { color: var(--text-secondary); line-height: 1.5; word-break: break-word; }
.ni-time { font-size: 0.55rem; color: var(--text-muted); margin-top: 2px; }

/* --- Minutes --- */
.mv-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.mv-title { font-size: 1.1rem; font-weight: 700; }
.mv-meta { font-size: 0.65rem; color: var(--text-muted); }
.minutes-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; padding-top: 14px; }
.minutes-actions button { padding: 6px 16px; border-radius: 8px; font-size: 0.7rem; cursor: pointer; font-family: inherit; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-secondary); }
.minutes-actions button.pri { background: var(--blue-600); color: #fff; border-color: var(--blue-500); }

/* --- Shared --- */
.task-table { width: 100%; border-collapse: collapse; }
.task-table th { font-size: 0.58rem; color: var(--text-muted); font-weight: 600; text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border-light); }
.task-table td { font-size: 0.68rem; padding: 5px 8px; border-bottom: 1px solid var(--border-light); }
.task-table tr:last-child td { border-bottom: none; }
.t-status { font-size: 0.55rem; padding: 1px 7px; border-radius: 7px; font-weight: 500; white-space: nowrap; }
.t-status.done { background: var(--green-50); color: var(--green-600); }
.t-status.progress { background: var(--blue-50); color: var(--blue-600); }
.t-status.review { background: var(--amber-50); color: var(--amber-600); }
.t-status.delayed { background: var(--red-50); color: var(--red-500); }
.t-who { color: var(--text-muted); font-size: 0.6rem; }
.t-time { font-size: 0.62rem; color: var(--text-muted); }
.empty-row { text-align: center; padding: 10px; color: var(--text-muted); font-size: 0.65rem; }
.badge { font-size: 0.62rem; padding: 3px 10px; border-radius: 12px; background: var(--bg-raised); color: var(--text-secondary); }
.badge.acc { background: var(--blue-50); color: var(--blue-600); }

/* --- Presenting mode --- */
.page.presenting .hd { background: rgba(0,0,0,0.2); border-bottom-color: rgba(255,255,255,0.06); }
.page.presenting .notes { display: none; }
.page.presenting .summary, .page.presenting .ov-card, .page.presenting .ms-block, .page.presenting .risk-item { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); }
.page.presenting .ms-block.overdue { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.04); }
.page.presenting .risk-item.high { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }
.page.presenting .board-tabs { border-bottom-color: rgba(255,255,255,0.06); }
.page.presenting .ms-bar, .page.presenting .ov-bar { background: rgba(255,255,255,0.06); }
.page.presenting .task-table th, .page.presenting .task-table td { border-bottom-color: rgba(255,255,255,0.04); }
.page.presenting .sw-tab { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.08); }
.page.presenting .sw-tab.on { background: rgba(37,99,235,0.15); color: #60a5fa; border-color: rgba(37,99,235,0.25); }
.page.presenting .step-btn { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.12); }
.page.presenting .step-btn.on { background: var(--blue-600); color: #fff; }
.page.presenting .t-who, .page.presenting .ov-sub, .page.presenting .s-meta, .page.presenting .ms-due { color: rgba(255,255,255,0.35); }
.page.presenting .ov-label, .page.presenting .ms-subtitle { color: rgba(255,255,255,0.35); }
.page.presenting .empty-row, .page.presenting .ms-collapsed-summary { color: rgba(255,255,255,0.25); }

/* --- Responsive --- */
@media (max-width: 900px) { .notes { width: 260px; } }
@media (max-width: 700px) { .main { flex-direction: column; } .notes { width: 100%; max-height: 300px; border-left: none; border-top: 1px solid var(--border); } .ov-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Import CSS in main.tsx**

Add to imports in `apps/web/src/main.tsx`:
```typescript
import './styles/meeting.css';
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles/meeting.css apps/web/src/main.tsx
git commit -m "feat(meeting): add meeting board styles"
```

---

### Task 11: Wire up project group meeting — list workspaces & initial board data

**Files:**
- Modify: `apps/web/src/pages/meeting/MeetingBoardPage.tsx` (complete the workspace list logic)

- [ ] **Step 1: Add workspace list loading for project group meetings**

Update the useEffect in `MeetingBoardPage.tsx` to load workspace IDs and fetch first board:

```tsx
// Add import:
import { useProjectGroupStore } from '../../stores/projectGroupStore';

// In component, add after existing useEffect:
const { fetchDetail: fetchGroup } = useProjectGroupStore();
const [workspaceList, setWorkspaceList] = useState<Array<{ id: string; name: string; health: string }>>([]);

useEffect(() => {
  if (!meeting) return;
  if (meeting.dimension === 'PROJECT') {
    // Single project: use dimension_id directly
    setWorkspaceList([{ id: meeting.dimension_id, name: '', health: 'on-track' }]);
    setCurrentWsId(meeting.dimension_id);
    fetchBoard(meeting.id, meeting.dimension_id);
  } else {
    // Project group: fetch workspaces via project group API
    api.get(`/project-groups/${meeting.dimension_id}`).then((res: any) => {
      const wss = res.data?.workspaces || [];
      setWorkspaceList(wss.map((w: any) => ({ id: w.id, name: w.name, health: 'on-track' })));
      if (wss.length > 0) {
        setCurrentWsId(wss[0].id);
        fetchBoard(meeting.id, wss[0].id);
      }
    });
  }
}, [meeting]);
```

- [ ] **Step 2: Pass workspaces to ProjectSwitcher**

Update the ProjectSwitcher usage:
```tsx
<ProjectSwitcher
  workspaces={workspaceList}
  currentId={currentWsId}
  onChange={handleSwitchWs}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/meeting/MeetingBoardPage.tsx
git commit -m "feat(meeting): wire up project group workspace loading"
```

---

## Summary

### Files created
| File | Task |
|------|------|
| `server/app/models/meeting.py` | 1 |
| `server/app/schemas/meeting.py` | 2 |
| `server/app/services/meeting.py` | 3 |
| `server/app/routers/meetings.py` | 4 |
| `apps/web/src/api/meeting.ts` | 5 |
| `apps/web/src/stores/meetingStore.ts` | 5 |
| `apps/web/src/pages/meeting/MeetingBoardPage.tsx` | 6, 11 |
| `apps/web/src/pages/meeting/ProjectSwitcher.tsx` | 6 |
| `apps/web/src/pages/meeting/OverviewTab.tsx` | 7 |
| `apps/web/src/pages/meeting/MilestoneTab.tsx` | 7 |
| `apps/web/src/pages/meeting/RiskTab.tsx` | 7 |
| `apps/web/src/pages/meeting/NotesPanel.tsx` | 8 |
| `apps/web/src/pages/meeting/MinutesView.tsx` | 9 |
| `apps/web/src/styles/meeting.css` | 10 |

### Files modified
| File | Task |
|------|------|
| `server/app/models/__init__.py` | 1 |
| `server/app/main.py` | 4 |
| `apps/web/src/components/Layout/AppLayout.tsx` | 6 |
| `apps/web/src/main.tsx` | 10 |

### Migration
- Alembic migration for `meetings` table (Task 1)
