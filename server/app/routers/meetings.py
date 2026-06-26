from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingNote, MeetingOut
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
    try:
        data = await meeting_service.get_board_data(db, meeting, workspace_id)
    except ValueError:
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
        "id": m.id,
        "title": m.title,
        "dimension": m.dimension,
        "dimension_id": m.dimension_id,
        "meeting_type": m.meeting_type,
        "status": m.status,
        "summary": m.summary,
        "notes": m.notes,
        "host_id": m.host_id,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
