from typing import Optional
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.task import Task
from app.models.document import Document


async def search(
    db: AsyncSession,
    keyword: str,
    workspace_id: Optional[str] = None,
    search_type: str = "all",
    limit: int = 20,
) -> dict:
    results = {"tasks": [], "documents": []}
    like = f"%{keyword}%"

    if search_type in ("all", "task"):
        query = select(Task)
        if workspace_id:
            query = query.where(Task.workspace_id == workspace_id)
        query = query.where(or_(Task.title.ilike(like), Task.description.ilike(like))).limit(limit)
        tasks = (await db.execute(query)).scalars().all()
        results["tasks"] = [
            {"id": t.id, "title": t.title, "workspace_id": t.workspace_id,
             "task_type": t.task_type, "status": t.status} for t in tasks
        ]

    if search_type in ("all", "doc"):
        query = select(Document)
        if workspace_id:
            query = query.where(Document.workspace_id == workspace_id)
        query = query.where(or_(Document.title.ilike(like), Document.content.ilike(like))).limit(limit)
        docs = (await db.execute(query)).scalars().all()
        results["documents"] = [
            {"id": d.id, "title": d.title, "workspace_id": d.workspace_id,
             "doc_type": d.doc_type, "version": d.version} for d in docs
        ]

    return results
