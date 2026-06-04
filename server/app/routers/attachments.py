import os
import uuid
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.attachment import Attachment
from app.schemas.common import APIResponse
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

router = APIRouter(prefix="/api/workspaces/{workspace_id}/tasks/{task_id}/attachments", tags=["attachments"])


def _att_to_dict(a: Attachment) -> dict:
    return {
        "id": a.id,
        "task_id": a.task_id,
        "filename": a.filename,
        "file_path": a.file_path,
        "file_size": a.file_size,
        "mime_type": a.mime_type,
        "uploaded_by": a.uploaded_by,
        "created_at": a.created_at.isoformat() if a.created_at else "",
    }


@router.post("", response_model=APIResponse)
async def upload_attachment(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
    file: UploadFile = File(...),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")

    task = await db.get(Task, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)

    # Save file
    ext = Path(file.filename or "file").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / stored_name
    content = await file.read()
    file_path.write_bytes(content)

    att = Attachment(
        task_id=task_id,
        filename=file.filename or "file",
        file_path=str(file_path),
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        uploaded_by=user.id,
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return {"code": 0, "message": "ok", "data": _att_to_dict(att)}


@router.get("", response_model=APIResponse)
async def list_attachments(
    workspace_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")

    task = await db.get(Task, task_id)
    if task is None or task.workspace_id != workspace_id:
        raise AppException(404, "任务不存在", 404)

    result = await db.execute(
        select(Attachment).where(Attachment.task_id == task_id).order_by(Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return {"code": 0, "message": "ok", "data": [_att_to_dict(a) for a in attachments]}


@router.get("/{att_id}/download")
async def download_attachment(
    workspace_id: str,
    task_id: str,
    att_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")

    att = await db.get(Attachment, att_id)
    if att is None or att.task_id != task_id:
        raise AppException(404, "附件不存在", 404)

    path = Path(att.file_path)
    if not path.exists():
        raise AppException(404, "文件已被删除", 404)

    encoded = urllib.parse.quote(att.filename)
    return FileResponse(path, media_type=att.mime_type, filename=att.filename,
                        headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded}"})


@router.delete("/{att_id}", response_model=APIResponse)
async def delete_attachment(
    workspace_id: str,
    task_id: str,
    att_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")

    att = await db.get(Attachment, att_id)
    if att is None or att.task_id != task_id:
        raise AppException(404, "附件不存在", 404)

    # Delete file from disk
    try:
        os.remove(att.file_path)
    except OSError:
        pass

    await db.delete(att)
    await db.commit()
    return {"code": 0, "message": "ok", "data": None}
