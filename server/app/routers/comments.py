from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.services import comment_svc
from app.exceptions import AppException

router = APIRouter(tags=["comments"])


class CommentCreate(BaseModel):
    task_id: Optional[str] = None
    document_id: Optional[str] = None
    parent_comment_id: Optional[str] = None
    content: str = Field(min_length=1)
    mentions: list[str] = []


class CommentUpdate(BaseModel):
    content: str = Field(min_length=1)


@router.get("/api/tasks/{task_id}/comments", response_model=APIResponse)
async def list_task_comments(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comments = await comment_svc.get_comments(db, task_id)
    return {"code": 0, "message": "ok", "data": comments}


@router.post("/api/tasks/{task_id}/comments", response_model=APIResponse)
async def create_task_comment(
    task_id: str,
    req: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await comment_svc.create_comment(
        db, user.id, task_id=task_id,
        content=req.content, mentions=req.mentions,
        parent_comment_id=req.parent_comment_id,
    )
    return {"code": 0, "message": "ok", "data": comment_svc._comment_to_dict(comment)}


@router.patch("/api/comments/{comment_id}", response_model=APIResponse)
async def update_comment(
    comment_id: str,
    req: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await comment_svc.get_comment(db, comment_id)
    if comment is None:
        raise AppException(404, "评论不存在", 404)
    if comment.author_id != user.id:
        raise AppException(403, "只能编辑自己的评论", 403)
    comment = await comment_svc.update_comment(db, comment, req.content)
    return {"code": 0, "message": "ok", "data": comment_svc._comment_to_dict(comment)}


@router.delete("/api/comments/{comment_id}", response_model=APIResponse)
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await comment_svc.get_comment(db, comment_id)
    if comment is None:
        raise AppException(404, "评论不存在", 404)
    if comment.author_id != user.id:
        raise AppException(403, "只能删除自己的评论", 403)
    await comment_svc.delete_comment(db, comment)
    return {"code": 0, "message": "ok", "data": None}
