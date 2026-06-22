import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.chat_history import ChatHistory
from app.schemas.common import APIResponse
from app.services.ai_service import chat, encrypt_api_key, decrypt_api_key, get_gateway_url
from app.config import settings

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    agent: str = "项目经理"
    workspace_id: Optional[str] = None
    conversation_history: Optional[list[dict]] = None


class LLMConfigRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=100)


@router.post("/chat", response_model=APIResponse)
async def ai_chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Save user message
    db.add(ChatHistory(
        user_id=user.id,
        role="user",
        content=req.message,
        agent=req.agent,
    ))

    result = await chat(
        db=db,
        user=user,
        message=req.message,
        agent=req.agent,
        workspace_id=req.workspace_id,
        conversation_history=req.conversation_history,
    )

    # Save AI reply
    db.add(ChatHistory(
        user_id=user.id,
        role="assistant",
        content=result["reply"],
        agent=req.agent,
        tool_actions=result.get("actions") or None,
    ))
    await db.commit()

    return {"code": 0, "message": "ok", "data": result}


@router.get("/chat-history", response_model=APIResponse)
async def get_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
):
    """Return recent chat history for current user (retained for 3 days)."""
    cutoff = datetime.utcnow() - timedelta(days=3)

    # Clean up old messages
    await db.execute(
        delete(ChatHistory).where(
            ChatHistory.user_id == user.id,
            ChatHistory.created_at < cutoff,
        )
    )

    # Load recent history
    result = await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id, ChatHistory.created_at >= cutoff)
        .order_by(ChatHistory.created_at.asc())
        .limit(limit)
    )
    messages = result.scalars().all()

    return {
        "code": 0, "message": "ok",
        "data": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "agent": m.agent,
                "actions": [
                    {"tool": a["tool"], "label": tool_labels.get(a["tool"], a["tool"])}
                    for a in (m.tool_actions or [])
                ],
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


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
