from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import document_svc
from app.services.git_storage import git_store
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
        author_name=user.display_name,
        author_email=user.email,
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
        db, doc,
        author_name=user.display_name,
        author_email=user.email,
        title=req.title, content=req.content, tags=req.tags,
    )
    return {"code": 0, "message": "ok", "data": document_svc._doc_to_dict(doc)}


@router.delete("/{doc_id}", response_model=APIResponse)
async def delete_doc(
    workspace_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    doc = await document_svc.get_doc(db, doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise AppException(404, "文档不存在", 404)
    await document_svc.delete_doc(db, doc, author_name=user.display_name)
    return {"code": 0, "message": "ok", "data": None}


# --- Version history endpoints (Git-backed) ---

@router.get("/{doc_id}/versions", response_model=APIResponse)
async def list_versions(
    workspace_id: str,
    doc_id: str,
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    history = await git_store.get_version_history(workspace_id, doc_id)
    return {"code": 0, "message": "ok", "data": history}


@router.get("/{doc_id}/versions/{commit_hash}", response_model=APIResponse)
async def get_version(
    workspace_id: str,
    doc_id: str,
    commit_hash: str,
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    content = await git_store.get_version_content(workspace_id, doc_id, commit_hash)
    if content is None:
        raise AppException(404, "版本不存在", 404)
    return {"code": 0, "message": "ok", "data": {"commit_hash": commit_hash, "content": content}}


@router.post("/{doc_id}/revert/{commit_hash}", response_model=APIResponse)
async def revert_to_version(
    workspace_id: str,
    doc_id: str,
    commit_hash: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER")
    doc = await document_svc.get_doc(db, doc_id)
    if doc is None or doc.workspace_id != workspace_id:
        raise AppException(404, "文档不存在", 404)
    try:
        commit = await git_store.revert_to_version(
            workspace_id, doc_id, commit_hash,
            author_name=user.display_name,
            author_email=user.email,
        )
    except ValueError:
        raise AppException(404, "版本不存在", 404)
    # Sync DB content + bump version counter
    doc.content = await git_store.get_version_content(workspace_id, doc_id, commit["hash"])
    doc.version = (doc.version or 0) + 1
    await db.commit()
    await db.refresh(doc)
    return {"code": 0, "message": "ok", "data": {"doc": document_svc._doc_to_dict(doc), "commit": commit}}


@router.get("/{doc_id}/diff", response_model=APIResponse)
async def diff_versions(
    workspace_id: str,
    doc_id: str,
    v1: str = Query(..., description="older commit hash"),
    v2: str = Query(..., description="newer commit hash"),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    diff = await git_store.diff_versions(workspace_id, doc_id, v1, v2)
    return {"code": 0, "message": "ok", "data": {"diff": diff}}
