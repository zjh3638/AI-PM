"""
企业微信 API 服务 — 群聊管理、消息发送、Token 管理。

提供外部群聊创建、成员管理、消息推送等功能。
所有 API 调用通过 httpx 异步客户端，access_token 内存缓存（7200秒）。
"""
import asyncio
import logging
import time
from typing import Optional
from datetime import datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# access_token 缓存（模块级变量）
_access_token: Optional[str] = None
_token_expires_at: float = 0
_token_lock = asyncio.Lock()


class WeComAPIError(Exception):
    """企业微信 API 调用错误"""
    def __init__(self, errcode: int, errmsg: str):
        self.errcode = errcode
        self.errmsg = errmsg
        super().__init__(f"WeComAPI Error {errcode}: {errmsg}")


async def get_access_token() -> str:
    """获取企业微信 access_token，带内存缓存。

    缓存时长 7000 秒（企业微信 token 有效期 7200 秒，提前 200 秒刷新）。

    Returns:
        access_token 字符串

    Raises:
        WeComAPIError: API 调用失败
    """
    global _access_token, _token_expires_at

    # 如果 token 未过期，直接返回
    if _access_token and time.time() < _token_expires_at:
        return _access_token

    # 使用锁避免并发刷新
    async with _token_lock:
        # 再次检查（可能其他协程已刷新）
        if _access_token and time.time() < _token_expires_at:
            return _access_token

        # 调用企业微信 API 获取 token
        url = f"{settings.wecom_api_base}/gettoken"
        params = {
            "corpid": settings.wecom_corp_id,
            "corpsecret": settings.wecom_agent_secret,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

                if data.get("errcode", -1) != 0:
                    raise WeComAPIError(data.get("errcode", -1), data.get("errmsg", "Unknown error"))

                _access_token = data["access_token"]
                _token_expires_at = time.time() + 7000  # 7000 秒后过期

                logger.info(f"企业微信 access_token 获取成功，有效期至 {datetime.fromtimestamp(_token_expires_at).isoformat()}")
                return _access_token

            except httpx.HTTPError as e:
                logger.error(f"获取企业微信 access_token 失败: {e}")
                raise WeComAPIError(-1, f"HTTP request failed: {e}")


async def _call_api(method: str, endpoint: str, json_data: dict = None, retry: bool = True) -> dict:
    """统一的企业微信 API 调用方法。

    Args:
        method: HTTP 方法（GET/POST）
        endpoint: API 端点（如 /appchat/create）
        json_data: POST 请求的 JSON 数据
        retry: Token 过期时是否自动重试

    Returns:
        API 响应的 JSON 数据

    Raises:
        WeComAPIError: API 调用失败
    """
    token = await get_access_token()
    url = f"{settings.wecom_api_base}{endpoint}"
    params = {"access_token": token}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            if method.upper() == "POST":
                resp = await client.post(url, params=params, json=json_data)
            else:
                resp = await client.get(url, params=params)

            resp.raise_for_status()
            data = resp.json()

            errcode = data.get("errcode", -1)

            # Token 过期，清除缓存并重试
            if errcode in (40014, 42001) and retry:
                logger.warning(f"企业微信 access_token 过期（errcode={errcode}），重新获取")
                global _access_token, _token_expires_at
                _access_token = None
                _token_expires_at = 0
                return await _call_api(method, endpoint, json_data, retry=False)

            if errcode != 0:
                raise WeComAPIError(errcode, data.get("errmsg", "Unknown error"))

            return data

        except httpx.HTTPError as e:
            logger.error(f"企业微信 API 调用失败 [{endpoint}]: {e}")
            raise WeComAPIError(-1, f"HTTP request failed: {e}")


async def create_external_group(name: str, owner_userid: str, member_userids: list[str]) -> str:
    """创建企业微信外部群聊。

    Args:
        name: 群聊名称
        owner_userid: 群主的企业微信 userid
        member_userids: 初始成员的 userid 列表（包括群主）

    Returns:
        群聊的 chatid

    Raises:
        WeComAPIError: 创建失败
    """
    # 去重并确保群主在成员列表中
    userlist = list(set([owner_userid] + member_userids))

    payload = {
        "name": name,
        "owner": owner_userid,
        "userlist": userlist,
        "chatid": "",  # 留空，让企业微信自动生成
    }

    data = await _call_api("POST", "/appchat/create", payload)
    chatid = data.get("chatid")

    if not chatid:
        raise WeComAPIError(-1, "API 未返回 chatid")

    logger.info(f"企业微信群聊创建成功: {name} (chatid={chatid})")
    return chatid


async def add_group_members(chat_id: str, userids: list[str]) -> None:
    """向群聊添加成员。

    Args:
        chat_id: 群聊 chatid
        userids: 要添加的成员 userid 列表

    Raises:
        WeComAPIError: 添加失败
    """
    if not userids:
        return

    payload = {
        "chatid": chat_id,
        "add_user_list": userids,
    }

    await _call_api("POST", "/appchat/update", payload)
    logger.info(f"企业微信群聊 {chat_id} 添加成员成功: {userids}")


async def remove_group_members(chat_id: str, userids: list[str]) -> None:
    """从群聊移除成员。

    Args:
        chat_id: 群聊 chatid
        userids: 要移除的成员 userid 列表

    Raises:
        WeComAPIError: 移除失败
    """
    if not userids:
        return

    payload = {
        "chatid": chat_id,
        "del_user_list": userids,
    }

    await _call_api("POST", "/appchat/update", payload)
    logger.info(f"企业微信群聊 {chat_id} 移除成员成功: {userids}")


async def send_text_message(chat_id: str, content: str) -> None:
    """向群聊发送文本消息。

    Args:
        chat_id: 群聊 chatid
        content: 消息内容

    Raises:
        WeComAPIError: 发送失败
    """
    payload = {
        "chatid": chat_id,
        "msgtype": "text",
        "text": {
            "content": content,
        },
    }

    await _call_api("POST", "/appchat/send", payload)
    logger.debug(f"企业微信群聊 {chat_id} 文本消息发送成功")


async def send_markdown_message(chat_id: str, content: str) -> None:
    """向群聊发送 Markdown 消息。

    Args:
        chat_id: 群聊 chatid
        content: Markdown 格式的消息内容

    Raises:
        WeComAPIError: 发送失败
    """
    payload = {
        "chatid": chat_id,
        "msgtype": "markdown",
        "markdown": {
            "content": content,
        },
    }

    await _call_api("POST", "/appchat/send", payload)
    logger.debug(f"企业微信群聊 {chat_id} Markdown 消息发送成功")


async def send_text_with_mentions(chat_id: str, content: str, mention_userids: list[str]) -> None:
    """向群聊发送带 @提醒 的文本消息。

    企业微信的文本消息通过在内容中插入 <@userid> 来实现 @提醒。

    Args:
        chat_id: 群聊 chatid
        content: 消息内容（不包含 @标记）
        mention_userids: 要 @提醒 的成员 userid 列表

    Raises:
        WeComAPIError: 发送失败
    """
    # 在消息开头添加 @提醒
    mention_text = "".join([f"<@{uid}>" for uid in mention_userids])
    full_content = f"{mention_text}\n{content}" if mention_userids else content

    await send_text_message(chat_id, full_content)
