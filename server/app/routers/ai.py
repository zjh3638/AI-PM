import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.chat_history import ChatHistory
from app.schemas.common import APIResponse
from app.services.ai_chat_stream import chat_stream
from app.services.ai_service import encrypt_api_key, decrypt_api_key, get_gateway_url
from app.config import settings

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatStreamRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    agent: str = "项目经理"
    workspace_id: Optional[str] = None
    conversation_id: Optional[str] = None
    route_context: Optional[dict] = None


class LLMConfigRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=100)


@router.post("/chat-stream")
async def ai_chat_stream(
    req: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    async def event_source():
        try:
            async for frame in chat_stream(
                db=db, user=user,
                message=req.message, agent=req.agent,
                workspace_id=req.workspace_id,
                route_context=req.route_context,
                conversation_id=req.conversation_id,
            ):
                yield frame
        except asyncio.CancelledError:
            # Client disconnected mid-stream — chat_stream already wrote what it had.
            raise
        except Exception as exc:
            yield (
                f'event: error\ndata: {{"message": {json.dumps(str(exc), ensure_ascii=False)}}}\n\n'
            )

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@router.get("/chat-history", response_model=APIResponse)
async def get_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    conversation_id: Optional[str] = Query(default=None),
    workspace_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=100),
):
    """Return one conversation's full message sequence (user/assistant/tool).

    When `conversation_id` is omitted the latest conversation in the given
    workspace scope is returned. `workspace_id=null` (omitted) means the
    global / non-workspace scope.
    """
    if conversation_id is None:
        latest_q = (
            select(ChatHistory.conversation_id)
            .where(ChatHistory.user_id == user.id,
                   ChatHistory.conversation_id.is_not(None))
        )
        if workspace_id is None:
            latest_q = latest_q.where(ChatHistory.workspace_id.is_(None))
        else:
            latest_q = latest_q.where(ChatHistory.workspace_id == workspace_id)
        latest = (await db.execute(
            latest_q.order_by(ChatHistory.created_at.desc()).limit(1)
        )).scalar()
        conversation_id = latest

    if conversation_id is None:
        return {"code": 0, "message": "ok",
                "data": {"conversation_id": None, "messages": []}}

    rows = (await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id,
               ChatHistory.conversation_id == conversation_id)
        .order_by(ChatHistory.created_at.asc()).limit(limit)
    )).scalars().all()

    messages = []
    for r in rows:
        m = {
            "id": r.id, "role": r.role, "content": r.content,
            "agent": r.agent, "created_at": r.created_at.isoformat(),
        }
        if r.tool_calls:
            m["tool_calls"] = r.tool_calls
        if r.tool_call_id:
            m["tool_call_id"] = r.tool_call_id
        if r.tool_actions:
            m["actions"] = [
                {"tool": a["tool"], "label": tool_labels.get(a["tool"], a["tool"]),
                 "args": a.get("args"), "result": a.get("result")}
                for a in r.tool_actions
            ]
        messages.append(m)

    return {"code": 0, "message": "ok",
            "data": {"conversation_id": conversation_id, "messages": messages}}


tool_labels: dict[str, str] = {
    "get_workspace_context": "获取项目信息",
    "create_task": "创建任务",
    "update_task": "更新任务",
    "search_tasks": "搜索任务",
    "get_my_tasks": "查询待办",
    "generate_report": "生成报告",
}


@router.patch("/me/llm-config", response_model=APIResponse)
async def update_llm_config(
    req: LLMConfigRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if req.api_key is not None:
        if req.api_key == "":
            user.llm_api_key = None
        else:
            user.llm_api_key = encrypt_api_key(req.api_key)
    if req.model is not None:
        user.llm_model = req.model if req.model else None
    await db.commit()
    return {
        "code": 0, "message": "ok",
        "data": {
            "llm_model": user.llm_model,
            "has_api_key": user.llm_api_key is not None,
        },
    }


@router.get("/me/llm-config", response_model=APIResponse)
async def get_llm_config(
    user: User = Depends(get_current_user),
):
    """Return user's LLM config (api_key masked)."""
    masked = None
    if user.llm_api_key:
        try:
            raw = decrypt_api_key(user.llm_api_key)
            masked = raw[:4] + "****" + raw[-4:] if len(raw) > 8 else "****"
        except Exception:
            masked = "****"
    return {
        "code": 0, "message": "ok",
        "data": {
            "llm_model": user.llm_model,
            "api_key_masked": masked,
            "has_api_key": user.llm_api_key is not None,
            "gateway_url": get_gateway_url(),
        },
    }


# ── System settings (admin) ─────────────────────────────────────────

def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_settings(data: dict) -> None:
    SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


class SystemSettingsRequest(BaseModel):
    llm_gateway_url: Optional[str] = Field(default=None, max_length=500)


@router.get("/admin/settings", response_model=APIResponse)
async def get_system_settings(user: User = Depends(get_current_user)):
    if user.system_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="仅超级管理员可访问")
    s = _load_settings()
    return {
        "code": 0, "message": "ok",
        "data": {
            "llm_gateway_url": get_gateway_url(),
        },
    }


@router.patch("/admin/settings", response_model=APIResponse)
async def update_system_settings(
    req: SystemSettingsRequest,
    user: User = Depends(get_current_user),
):
    if user.system_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="仅超级管理员可访问")
    s = _load_settings()
    if req.llm_gateway_url is not None:
        s["llm_gateway_url"] = req.llm_gateway_url
    _save_settings(s)
    return {"code": 0, "message": "ok", "data": s}
