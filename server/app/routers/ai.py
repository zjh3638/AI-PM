from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.services.ai_service import chat, encrypt_api_key, decrypt_api_key
from app.config import settings

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
    result = await chat(
        db=db,
        user=user,
        message=req.message,
        agent=req.agent,
        workspace_id=req.workspace_id,
        conversation_history=req.conversation_history,
    )
    return {"code": 0, "message": "ok", "data": result}


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
            "gateway_url": settings.llm_gateway_url,
        },
    }
