from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import document_svc
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/workspaces/{workspace_id}/docs", tags=["documents"])


class DocCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    content: str = ""
    doc_type: str = "MARKDOWN"
    path: str = ""
    tags: list[str] = []


class DocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None


@router.post("", response_model=APIResponse)
async def create_doc(
    workspace_id: str,
    req: DocCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    path = req.path or req.title
    doc = await document_svc.create_doc(
        db, workspace_id, user.id,
        title=req.title, content=req.content,
        doc_type=req.doc_type, path=path, tags=req.tags,
    )
    return {"code": 0, "message": "ok", "data": document_svc._doc_to_dict(doc)}


@router.get("", response_model=PaginatedResponse)
async def list_docs(
    workspace_id: str,
    page: int = 1,
    page_size: int = 20,
    keyword: str = "",
    doc_type: str = "",
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    docs, total = await document_svc.list_docs(
        db, workspace_id, page=page, page_size=page_size,
        keyword=keyword or None, doc_type=doc_type or None,
    )
    data = [document_svc._doc_to_dict(d) for d in docs]
    return {"code": 0, "message": "ok", "data": data, "total": total, "page": page, "page_size": page_size}


@router.get("/{doc_id}", response_model=APIResponse)
async def get_doc(
    workspace_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    doc = await document_svc.get_doc(db, doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise AppException(404, "文档不存在", 404)
    return {"code": 0, "message": "ok", "data": document_svc._doc_to_dict(doc)}


@router.patch("/{doc_id}", response_model=APIResponse)
async def update_doc(
    workspace_id: str,
    doc_id: str,
    req: DocUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    doc = await document_svc.get_doc(db, doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise AppException(404, "文档不存在", 404)
    doc = await document_svc.update_doc(
        db, doc, title=req.title, content=req.content, tags=req.tags,
    )
    return {"code": 0, "message": "ok", "data": document_svc._doc_to_dict(doc)}


@router.delete("/{doc_id}", response_model=APIResponse)
async def delete_doc(
    workspace_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    doc = await document_svc.get_doc(db, doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise AppException(404, "文档不存在", 404)
    await db.delete(doc)
    await db.commit()
    return {"code": 0, "message": "ok", "data": None}
