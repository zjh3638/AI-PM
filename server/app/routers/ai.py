import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.chat_history import ChatHistory
from app.schemas.common import APIResponse
from app.services.ai_chat_stream import chat_stream
from app.services.ai_service import encrypt_api_key, decrypt_api_key, get_gateway_url
from app.services.permission import PermissionChecker, get_permission_checker
from app.config import settings

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatStreamRequest(BaseModel):
    message: str = Field(default="", max_length=4000)
    agent: str = "项目经理"
    workspace_id: Optional[str] = None
    conversation_id: Optional[str] = None
    route_context: Optional[dict] = None
    # 编辑/重试：重新流式前删除该锚点消息之后（created_at 更晚）的所有消息
    edit: Optional[dict] = None  # {"after_id": str}
    # 多模态：base64 data URL 图片列表（最多 3 张，前端已降采样）
    images: Optional[list[str]] = None


class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=64)


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
                edit=req.edit,
                images=req.images,
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
                "data": {"conversation_id": None, "conversation_title": None,
                         "messages": []}}

    rows = (await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id,
               ChatHistory.conversation_id == conversation_id)
        .order_by(ChatHistory.created_at.asc()).limit(limit)
    )).scalars().all()

    title = next((r.conversation_title for r in rows if r.conversation_title), None)

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
            "data": {"conversation_id": conversation_id,
                     "conversation_title": title, "messages": messages}}


@router.get("/chat-conversations", response_model=APIResponse)
async def get_chat_conversations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    workspace_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, le=50),
):
    """Return recent conversations (title + first message) for the switcher dropdown."""
    ws_filter = (
        ChatHistory.workspace_id.is_(None) if workspace_id is None
        else ChatHistory.workspace_id == workspace_id
    )

    rows = (await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id,
               ChatHistory.conversation_id.is_not(None),
               ws_filter)
        .order_by(ChatHistory.created_at.asc())
    )).scalars().all()

    # Aggregate in Python — small dataset, simple code
    convs_map: dict[str, dict] = {}
    for r in rows:
        cid = r.conversation_id
        if cid not in convs_map:
            convs_map[cid] = {
                "conversation_id": cid,
                "conversation_title": None,
                "first_message": r.content if r.role == "user" else None,
                "created_at": r.created_at,
            }
        entry = convs_map[cid]
        if r.conversation_title:
            entry["conversation_title"] = r.conversation_title
        if entry["first_message"] is None and r.role == "user":
            entry["first_message"] = r.content
        # track latest timestamp for ordering
        if r.created_at > entry["created_at"]:
            entry["created_at"] = r.created_at

    # Sort by latest first, truncate
    sorted_convs = sorted(
        convs_map.values(), key=lambda c: c["created_at"], reverse=True
    )[:limit]

    for c in sorted_convs:
        c["conversation_title"] = c["conversation_title"] or c["first_message"] or "对话"
        c["created_at"] = c["created_at"].isoformat()

    return {"code": 0, "message": "ok", "data": {"conversations": sorted_convs}}


@router.delete("/conversations/{conversation_id}/messages", response_model=APIResponse)
async def delete_messages_after(
    conversation_id: str,
    after_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除某会话中锚点消息之后（created_at 更晚）的所有消息，用于编辑/重试。"""
    owner = (await db.execute(
        select(ChatHistory.user_id)
        .where(ChatHistory.conversation_id == conversation_id)
        .limit(1)
    )).scalar()
    if owner is None or owner != user.id:
        raise HTTPException(status_code=404, detail="对话不存在")
    anchor = (await db.execute(
        select(ChatHistory.created_at).where(ChatHistory.id == after_id)
    )).scalar()
    if anchor is None:
        raise HTTPException(status_code=404, detail="锚点消息不存在")
    result = await db.execute(
        delete(ChatHistory).where(
            ChatHistory.conversation_id == conversation_id,
            ChatHistory.created_at > anchor,
        )
    )
    await db.commit()
    return {"code": 0, "message": "ok", "data": {"deleted": result.rowcount}}


@router.patch("/conversations/{conversation_id}", response_model=APIResponse)
async def rename_conversation(
    conversation_id: str,
    req: ConversationRenameRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """重命名会话（更新该会话所有行的 conversation_title）。"""
    owner = (await db.execute(
        select(ChatHistory.user_id)
        .where(ChatHistory.conversation_id == conversation_id,
               ChatHistory.user_id == user.id)
        .limit(1)
    )).scalar()
    if owner is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    await db.execute(
        update(ChatHistory)
        .where(ChatHistory.conversation_id == conversation_id,
               ChatHistory.user_id == user.id)
        .values(conversation_title=req.title)
    )
    await db.commit()
    return {"code": 0, "message": "ok",
            "data": {"conversation_id": conversation_id, "title": req.title}}


@router.delete("/conversations/{conversation_id}", response_model=APIResponse)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除整个会话（该用户名下该会话的所有消息）。"""
    result = await db.execute(
        delete(ChatHistory).where(
            ChatHistory.conversation_id == conversation_id,
            ChatHistory.user_id == user.id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="对话不存在")
    await db.commit()
    return {"code": 0, "message": "ok",
            "data": {"conversation_id": conversation_id, "deleted": result.rowcount}}


tool_labels: dict[str, str] = {
    "get_workspace_context": "获取项目信息",
    "create_task": "创建任务",
    "update_task": "更新任务",
    "search_tasks": "搜索任务",
    "get_my_tasks": "查询待办",
    "generate_report": "生成报告",
    "scan_risks": "扫描风险",
    "decompose_requirement": "拆解需求",
    "extract_action_items": "提取会议待办",
    "create_milestone": "创建里程碑",
    "update_milestone": "更新里程碑",
    "create_iteration": "创建迭代",
    "update_iteration": "更新迭代",
    "batch_update_tasks": "批量更新任务",
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
    # LDAP
    ldap_enabled: Optional[bool] = None
    ldap_server_uri: Optional[str] = Field(default=None, max_length=500)
    ldap_bind_dn: Optional[str] = Field(default=None, max_length=500)
    ldap_bind_password: Optional[str] = Field(default=None, max_length=200)
    ldap_base_dn: Optional[str] = Field(default=None, max_length=500)
    ldap_user_filter: Optional[str] = Field(default=None, max_length=200)
    ldap_username_attribute: Optional[str] = Field(default=None, max_length=100)
    ldap_display_name_attribute: Optional[str] = Field(default=None, max_length=100)
    ldap_email_attribute: Optional[str] = Field(default=None, max_length=100)
    ldap_auto_create_user: Optional[bool] = None


@router.get("/admin/settings", response_model=APIResponse)
async def get_system_settings(
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    from app.services.ldap_config import get_ldap_config_for_display
    ldap_cfg = get_ldap_config_for_display()
    return {
        "code": 0, "message": "ok",
        "data": {
            "llm_gateway_url": get_gateway_url(),
            **ldap_cfg,
        },
    }


@router.patch("/admin/settings", response_model=APIResponse)
async def update_system_settings(
    req: SystemSettingsRequest,
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    s = _load_settings()

    if req.llm_gateway_url is not None:
        s["llm_gateway_url"] = req.llm_gateway_url

    # LDAP fields — only write if explicitly provided (not None)
    ldap_fields = [
        "ldap_enabled", "ldap_server_uri", "ldap_bind_dn",
        "ldap_bind_password", "ldap_base_dn", "ldap_user_filter",
        "ldap_username_attribute", "ldap_display_name_attribute",
        "ldap_email_attribute", "ldap_auto_create_user",
    ]
    for key in ldap_fields:
        val = getattr(req, key, None)
        if val is not None:
            s[key] = val

    _save_settings(s)
    return {"code": 0, "message": "ok", "data": s}


class LdapTestRequest(BaseModel):
    ldap_server_uri: str = ""
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    ldap_base_dn: str = ""
    ldap_user_filter: str = "(uid={username})"


@router.post("/admin/settings/test-ldap", response_model=APIResponse)
async def test_ldap_connection(
    req: LdapTestRequest,
    pc: PermissionChecker = Depends(get_permission_checker),
):
    """Test LDAP connection with provided parameters. SUPER_ADMIN or ADMIN only."""
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")

    import asyncio
    from ldap3 import Server, Connection, ALL, SUBTREE
    from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

    server_uri = req.ldap_server_uri
    if not server_uri:
        return {"code": 1, "message": "请输入 LDAP 服务器地址", "data": None}

    loop = asyncio.get_running_loop()

    def _test():
        server = Server(server_uri, get_info=ALL)
        conn = None
        try:
            # Step 1: bind with service account
            conn = Connection(
                server,
                user=req.ldap_bind_dn,
                password=req.ldap_bind_password,
                auto_bind=True,
            )

            # Step 2: search users
            search_filter = req.ldap_user_filter.format(username="*")
            conn.search(
                search_base=req.ldap_base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=["cn"],
            )
            user_count = len(conn.entries)
            return {
                "success": True,
                "message": f"连接成功，搜索到 {user_count} 个用户",
                "user_count": user_count,
            }
        except LDAPBindError as e:
            return {"success": False, "message": f"LDAP 绑定失败：{e}"}
        except LDAPSocketOpenError as e:
            return {"success": False, "message": f"无法连接 LDAP 服务器：{e}"}
        except LDAPException as e:
            return {"success": False, "message": f"LDAP 错误：{e}"}
        finally:
            if conn:
                conn.unbind()

    result = await loop.run_in_executor(None, _test)
    if result["success"]:
        return {"code": 0, "message": result["message"], "data": {"user_count": result["user_count"]}}
    return {"code": 1, "message": result["message"], "data": None}
