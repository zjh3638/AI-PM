import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.project_report import (
    ReportCreate, ReportUpdate, ReportGenerateRequest, ReportPolishRequest,
)
from app.services import report_svc, report_ai_stream
from app.services import project_group_svc as group_svc
from app.exceptions import AppException
from app.routers.project_reports import sse_response, export_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/project-groups/{group_id}/reports", tags=["group-reports"])


async def _require_group(db: AsyncSession, group_id: str):
    group = await group_svc.get_group(db, group_id)
    if group is None:
        raise AppException(404, "项目群不存在", 404)
    return group


def _require_manage(group, user: User):
    """管理权限：创建者 或 SUPER_ADMIN（对齐 project_groups 路由）。"""
    if user.system_role == "SUPER_ADMIN":
        return
    if group.creator_id != user.id:
        raise AppException(403, "无权管理此项目群", 403)


async def _load_owned(db: AsyncSession, group_id: str, report_id: str):
    report = await report_svc.get_report(db, report_id)
    if (report is None or report.dimension != "PROJECT_GROUP"
            or report.dimension_id != group_id):
        raise AppException(404, "报告不存在", 404)
    return report


@router.post("", response_model=APIResponse)
async def create_report(
    group_id: str,
    req: ReportCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    data = await report_svc.create_report(
        db, "PROJECT_GROUP", group_id, created_by=user.id,
        report_type=req.report_type, title=req.title,
        period_start=req.period_start, period_end=req.period_end,
    )
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=APIResponse)
async def list_reports(
    group_id: str,
    report_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_group(db, group_id)
    data = await report_svc.list_reports(db, "PROJECT_GROUP", group_id, report_type=report_type)
    return {"code": 0, "message": "ok", "data": data}


@router.get("/{report_id}", response_model=APIResponse)
async def get_report(
    group_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_group(db, group_id)
    report = await _load_owned(db, group_id, report_id)
    return {"code": 0, "message": "ok", "data": report_svc._report_to_dict(report)}


@router.patch("/{report_id}", response_model=APIResponse)
async def update_report(
    group_id: str,
    report_id: str,
    req: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    report = await _load_owned(db, group_id, report_id)
    if report.status == "PUBLISHED":
        raise AppException(400, "已发布的报告不可编辑", 400)
    data = await report_svc.update_report(
        db, report, title=req.title, content=req.content)
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{report_id}/publish", response_model=APIResponse)
async def publish_report(
    group_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    report = await _load_owned(db, group_id, report_id)
    data = await report_svc.publish_report(db, report)
    return {"code": 0, "message": "ok", "data": data}


@router.delete("/{report_id}", response_model=APIResponse)
async def delete_report(
    group_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    report = await _load_owned(db, group_id, report_id)
    await report_svc.delete_report(db, report)
    return {"code": 0, "message": "ok", "data": {"id": report_id}}


@router.post("/generate-stream")
async def generate_stream(
    group_id: str,
    req: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    return sse_response(report_ai_stream.stream_generate_group(
        db=db, user=user, group_id=group_id,
        report_type=req.report_type,
        period_start=req.period_start, period_end=req.period_end,
    ))


@router.post("/{report_id}/polish-stream")
async def polish_stream(
    group_id: str,
    report_id: str,
    req: ReportPolishRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = await _require_group(db, group_id)
    _require_manage(group, user)
    await _load_owned(db, group_id, report_id)
    return sse_response(report_ai_stream.stream_polish(
        db=db, user=user, content=req.content, instruction=req.instruction,
    ))


@router.get("/{report_id}/export")
async def export_report(
    group_id: str,
    report_id: str,
    format: str = Query("markdown"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_group(db, group_id)
    report = await _load_owned(db, group_id, report_id)
    return export_response(report, format)
