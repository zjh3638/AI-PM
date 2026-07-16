"""周报/月报的流式 AI 服务：生成初稿与润色，均为纯文本流式（不带 tools）。

复用 ai_chat_stream 的 httpx 流式范式与 ai_sse.sse 帧格式。
"""
import logging
from datetime import date
from typing import AsyncGenerator, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import report_svc
from app.services.ai_service import decrypt_api_key, get_gateway_url
from app.services.ai_sse import sse, parse_sse_chunk

logger = logging.getLogger(__name__)


async def _stream_llm_text(
    api_key: str, model: str, messages: list[dict],
) -> AsyncGenerator[dict, None]:
    """调用 LLM streaming，逐段 yield {"delta": str} 或 {"error": str}。"""
    try:
        async with httpx.AsyncClient(timeout=120.0).stream(
            "POST", f"{get_gateway_url()}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}",
                     "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "temperature": 0.4,
                  "max_tokens": 3072, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                chunk = parse_sse_chunk(line)
                if chunk is None:
                    continue
                delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                if delta.get("content"):
                    yield {"delta": delta["content"]}
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        try:
            await exc.response.aread()
            body = exc.response.text
        except Exception:
            body = ""
        if status == 502:
            yield {"error": "LLM 网关上游服务不可用（502），请联系管理员检查模型服务。"}
        elif status == 401:
            yield {"error": "API Key 认证失败，请到个人中心 → AI 配置检查密钥。"}
        else:
            yield {"error": f"LLM 网关返回错误（{status}）：{body[:200]}"}
    except httpx.TimeoutException:
        yield {"error": "LLM 请求超时，请稍后重试。"}
    except httpx.ConnectError:
        yield {"error": f"无法连接到 LLM 网关（{get_gateway_url()}），请联系管理员。"}
    except Exception as exc:  # noqa: BLE001
        yield {"error": f"LLM 调用失败：{exc}"}


async def stream_generate(
    db: AsyncSession, user: User, workspace_id: str, report_type: str,
    period_start: Optional[date] = None, period_end: Optional[date] = None,
) -> AsyncGenerator[str, None]:
    """流式生成项目周报初稿：聚合数据 → LLM 流式 → done(content)。"""
    if not user.llm_api_key:
        yield sse("error", {"message": "未配置 LLM API Key，请到个人中心 → AI 配置设置。"})
        return

    api_key = decrypt_api_key(user.llm_api_key)
    model = user.llm_model or "deepseek-chat"

    if not period_start or not period_end:
        period_start, period_end = report_svc.default_period(report_type)

    ws_name = await report_svc.get_workspace_name(db, workspace_id)
    agg = await report_svc.aggregate_report_data(
        db, workspace_id, report_type, period_start, period_end)
    yield sse("meta", {"summary_data": agg,
                       "period_start": str(period_start),
                       "period_end": str(period_end)})

    system, user_prompt = report_svc.build_generation_prompt(agg, ws_name)
    messages = [{"role": "system", "content": system},
                {"role": "user", "content": user_prompt}]

    parts: list[str] = []
    async for ev in _stream_llm_text(api_key, model, messages):
        if "error" in ev:
            yield sse("error", {"message": ev["error"]})
            return
        parts.append(ev["delta"])
        yield sse("delta", {"content": ev["delta"]})

    yield sse("done", {"content": "".join(parts)})


async def stream_generate_group(
    db: AsyncSession, user: User, group_id: str, report_type: str,
    period_start: Optional[date] = None, period_end: Optional[date] = None,
) -> AsyncGenerator[str, None]:
    """流式生成项目群汇总周报：优先取子项目周报，缺失回退项目动态。"""
    if not user.llm_api_key:
        yield sse("error", {"message": "未配置 LLM API Key，请到个人中心 → AI 配置设置。"})
        return

    api_key = decrypt_api_key(user.llm_api_key)
    model = user.llm_model or "deepseek-chat"

    if not period_start or not period_end:
        period_start, period_end = report_svc.default_period(report_type)

    group_name = await report_svc.get_group_name(db, group_id)
    agg = await report_svc.aggregate_group_report_data(
        db, group_id, report_type, period_start, period_end)
    yield sse("meta", {"summary_data": agg,
                       "period_start": str(period_start),
                       "period_end": str(period_end)})

    system, user_prompt = report_svc.build_group_generation_prompt(agg, group_name)
    messages = [{"role": "system", "content": system},
                {"role": "user", "content": user_prompt}]

    parts: list[str] = []
    async for ev in _stream_llm_text(api_key, model, messages):
        if "error" in ev:
            yield sse("error", {"message": ev["error"]})
            return
        parts.append(ev["delta"])
        yield sse("delta", {"content": ev["delta"]})

    yield sse("done", {"content": "".join(parts)})


async def stream_polish(
    db: AsyncSession, user: User, content: str,
    instruction: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """流式润色现有报告内容。"""
    if not user.llm_api_key:
        yield sse("error", {"message": "未配置 LLM API Key，请到个人中心 → AI 配置设置。"})
        return

    api_key = decrypt_api_key(user.llm_api_key)
    model = user.llm_model or "deepseek-chat"

    system, user_prompt = report_svc.build_polish_prompt(content, instruction)
    messages = [{"role": "system", "content": system},
                {"role": "user", "content": user_prompt}]

    parts: list[str] = []
    async for ev in _stream_llm_text(api_key, model, messages):
        if "error" in ev:
            yield sse("error", {"message": ev["error"]})
            return
        parts.append(ev["delta"])
        yield sse("delta", {"content": ev["delta"]})

    yield sse("done", {"content": "".join(parts)})
