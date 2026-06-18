from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document
from app.exceptions import AppException
from app.services.git_storage import git_store


async def create_doc(
    db: AsyncSession,
    workspace_id: str,
    author_id: str,
    author_name: str = "",
    author_email: Optional[str] = None,
    **kwargs,
) -> Document:
    doc = Document(workspace_id=workspace_id, author_id=author_id, **kwargs)
    doc.version = 1
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    # Initial commit — content may be empty for newly created placeholder docs
    await git_store.save_document(
        workspace_id, doc.id, doc.content or "",
        author_name=author_name or "unknown",
        author_email=author_email,
        commit_msg=f"Create {doc.title}",
    )
    return doc


async def get_doc(db: AsyncSession, doc_id: str) -> Optional[Document]:
    return await db.get(Document, doc_id)


async def list_docs(
    db: AsyncSession,
    workspace_id: str,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
    doc_type: Optional[str] = None,
    tag: Optional[str] = None,
) -> tuple[list[Document], int]:
    query = select(Document).where(Document.workspace_id == workspace_id)
    count_q = select(func.count(Document.id)).where(Document.workspace_id == workspace_id)

    if keyword:
        like = f"%{keyword}%"
        query = query.where(Document.title.ilike(like) | Document.content.ilike(like))
        count_q = count_q.where(Document.title.ilike(like) | Document.content.ilike(like))
    if doc_type:
        query = query.where(Document.doc_type == doc_type)
        count_q = count_q.where(Document.doc_type == doc_type)

    total = (await db.execute(count_q)).scalar()
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size).order_by(Document.updated_at.desc()))
    return list(result.scalars().all()), total


async def update_doc(
    db: AsyncSession, doc: Document, author_name: str = "", author_email: Optional[str] = None, **kwargs
) -> Document:
    content_changed = False
    for field, value in kwargs.items():
        if value is None:
            continue
        if field == "content" and value != doc.content:
            content_changed = True
        setattr(doc, field, value)
    if content_changed:
        doc.version = (doc.version or 0) + 1
        await git_store.save_document(
            doc.workspace_id, doc.id, doc.content or "",
            author_name=author_name or "unknown",
            author_email=author_email,
            commit_msg=f"Update {doc.title}",
        )
    await db.commit()
    await db.refresh(doc)
    return doc


async def delete_doc(db: AsyncSession, doc: Document, author_name: str = "") -> None:
    workspace_id = doc.workspace_id
    doc_id = doc.id
    await db.delete(doc)
    await db.commit()
    await git_store.delete_document(
        workspace_id, doc_id,
        author_name=author_name or "unknown",
        commit_msg=f"Delete {doc.title}",
    )


def _doc_to_dict(doc: Document) -> dict:
    return {
        "id": doc.id, "workspace_id": doc.workspace_id,
        "path": doc.path, "title": doc.title, "content": doc.content,
        "doc_type": doc.doc_type, "tags": doc.tags or [],
        "author_id": doc.author_id, "version": doc.version,
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
    }
