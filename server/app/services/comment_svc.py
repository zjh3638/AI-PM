from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.comment import Comment
from app.models.user import User


async def create_comment(db: AsyncSession, author_id: str, **kwargs) -> Comment:
    comment = Comment(author_id=author_id, **kwargs)
    db.add(comment)
    await db.commit()
    await db.refresh(comment, ["author"])
    return comment


async def get_comments(db: AsyncSession, task_id: str, document_id: Optional[str] = None) -> list[dict]:
    query = select(Comment).options(selectinload(Comment.author), selectinload(Comment.replies))
    if task_id:
        query = query.where(Comment.task_id == task_id, Comment.parent_comment_id.is_(None))
    elif document_id:
        query = query.where(Comment.document_id == document_id, Comment.parent_comment_id.is_(None))
    query = query.order_by(Comment.created_at.desc())
    result = await db.execute(query)
    return [_comment_to_dict(c) for c in result.scalars().all()]


async def get_comment(db: AsyncSession, comment_id: str) -> Optional[Comment]:
    result = await db.execute(select(Comment).where(Comment.id == comment_id).options(selectinload(Comment.author)))
    return result.scalar_one_or_none()


async def update_comment(db: AsyncSession, comment: Comment, content: str) -> Comment:
    comment.content = content
    await db.commit()
    await db.refresh(comment)
    return comment


async def delete_comment(db: AsyncSession, comment: Comment):
    await db.delete(comment)
    await db.commit()


def _comment_to_dict(c: Comment) -> dict:
    return {
        "id": c.id, "task_id": c.task_id, "document_id": c.document_id,
        "author_id": c.author_id,
        "author_name": c.author.display_name if c.author else None,
        "author_avatar": c.author.avatar_url if c.author else None,
        "parent_comment_id": c.parent_comment_id,
        "content": c.content, "mentions": c.mentions or [],
        "replies": [_comment_to_dict(r) for r in (c.replies or [])],
        "created_at": c.created_at.isoformat() if c.created_at else "",
    }
