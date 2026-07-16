import asyncio
import json
import logging
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.schemas.project_report import (
    ReportCreate, ReportUpdate, ReportGenerateRequest, ReportPolishRequest,
    ReportPushRequest,
)
from app.services import report_svc, report_ai_stream
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspaces/{workspace_id}/reports", tags=["reports"])


# ── 共享辅助（供项目 / 项目群路由复用） ───────────────────────────────

def sse_response(gen) -> StreamingResponse:
    async def event_source():
        try:
            async for frame in gen:
                yield frame
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            yield f'event: error\ndata: {{"message": {json.dumps(str(exc), ensure_ascii=False)}}}\n\n'

    return StreamingResponse(
        event_source(), media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


def export_response(report, fmt: str) -> Response:
    """按格式导出报告为 markdown / pdf / docx 附件。"""
    content = report.content or ""
    safe_name = report.title or "report"

    if fmt == "markdown":
        filename = quote(f"{safe_name}.md")
        return Response(
            content=content.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    if fmt in ("pdf", "docx"):
        data = report_svc.render_document(content, report.title or "", fmt)
        if data is None:
            raise AppException(500, f"{fmt.upper()} 生成失败，请检查服务器 pandoc 环境", 500)
        media = ("application/pdf" if fmt == "pdf"
                 else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        ext = "pdf" if fmt == "pdf" else "docx"
        filename = quote(f"{safe_name}.{ext}")
        return Response(
            content=data, media_type=media,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    raise AppException(400, "不支持的导出格式", 400)


# ── 项目（workspace）维度周报 ─────────────────────────────────────────

async def _load_owned(db: AsyncSession, workspace_id: str, report_id: str):
    report = await report_svc.get_report(db, report_id)
    if (report is None or report.dimension != "PROJECT"
            or report.dimension_id != workspace_id):
        raise AppException(404, "报告不存在", 404)
    return report


@router.post("", response_model=APIResponse)
async def create_report(
    workspace_id: str,
    req: ReportCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    data = await report_svc.create_report(
        db, "PROJECT", workspace_id, created_by=user.id,
        report_type=req.report_type, title=req.title,
        period_start=req.period_start, period_end=req.period_end,
    )
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=APIResponse)
async def list_reports(
    workspace_id: str,
    report_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    data = await report_svc.list_reports(db, "PROJECT", workspace_id, report_type=report_type)
    return {"code": 0, "message": "ok", "data": data}


@router.get("/{report_id}", response_model=APIResponse)
async def get_report(
    workspace_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    report = await _load_owned(db, workspace_id, report_id)
    return {"code": 0, "message": "ok", "data": report_svc._report_to_dict(report)}


@router.patch("/{report_id}", response_model=APIResponse)
async def update_report(
    workspace_id: str,
    report_id: str,
    req: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    report = await _load_owned(db, workspace_id, report_id)
    if report.status == "PUBLISHED":
        raise AppException(400, "已发布的报告不可编辑", 400)
    data = await report_svc.update_report(
        db, report, title=req.title, content=req.content)
    return {"code": 0, "message": "ok", "data": data}


@router.post("/{report_id}/publish", response_model=APIResponse)
async def publish_report(
    workspace_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    report = await _load_owned(db, workspace_id, report_id)
    data = await report_svc.publish_report(db, report)
    return {"code": 0, "message": "ok", "data": data}


@router.delete("/{report_id}", response_model=APIResponse)
async def delete_report(
    workspace_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    report = await _load_owned(db, workspace_id, report_id)
    await report_svc.delete_report(db, report)
    return {"code": 0, "message": "ok", "data": {"id": report_id}}


@router.post("/generate-stream")
async def generate_stream(
    workspace_id: str,
    req: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    return sse_response(report_ai_stream.stream_generate(
        db=db, user=user, workspace_id=workspace_id,
        report_type=req.report_type,
        period_start=req.period_start, period_end=req.period_end,
    ))


@router.post("/{report_id}/polish-stream")
async def polish_stream(
    workspace_id: str,
    report_id: str,
    req: ReportPolishRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    await _load_owned(db, workspace_id, report_id)
    return sse_response(report_ai_stream.stream_polish(
        db=db, user=user, content=req.content, instruction=req.instruction,
    ))


@router.get("/{report_id}/export")
async def export_report(
    workspace_id: str,
    report_id: str,
    format: str = Query("markdown"),
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    report = await _load_owned(db, workspace_id, report_id)
    return export_response(report, format)


@router.post("/{report_id}/push", response_model=APIResponse)
async def push_report(
    workspace_id: str,
    report_id: str,
    req: ReportPushRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER")
    report = await _load_owned(db, workspace_id, report_id)

    if req.channel == "dingtalk":
        raise AppException(400, "钉钉推送暂未配置", 400)
    if req.channel != "wecom":
        raise AppException(400, "不支持的推送渠道", 400)

    from app.config import settings
    if not settings.wecom_enabled:
        raise AppException(400, "企业微信集成未启用", 400)

    from app.services import wecom_service
    from app.models.workspace import Workspace

    ws = (await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )).scalar_one_or_none()
    if not ws or not ws.wecom_chat_id:
        raise AppException(400, "该项目空间未关联企业微信群聊", 400)

    md = f"# {report.title}\n\n{report.content or '（暂无内容）'}"
    try:
        await wecom_service.send_markdown_message(ws.wecom_chat_id, md)
    except Exception as exc:  # noqa: BLE001
        logger.warning("周报推送企微失败: %s", exc)
        raise AppException(500, "推送失败，请稍后重试", 500)

    return {"code": 0, "message": "ok", "data": {"pushed": True}}
