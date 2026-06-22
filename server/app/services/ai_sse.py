import json
from typing import Optional


def sse(event: str, data: dict) -> str:
    """Format an SSE frame: `event: <name>\\ndata: <json>\\n\\n`."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def accumulate_tool_calls(acc: dict, delta_tool_calls: list) -> None:
    """Merge streamed tool_calls deltas (by index) into accumulator.

    Streamed protocol: id/name only on first chunk; arguments concatenated
    across chunks; multiple parallel calls disambiguated by index.
    """
    for tc in delta_tool_calls:
        idx = tc["index"]
        if idx not in acc:
            acc[idx] = {
                "index": idx,
                "id": "",
                "type": "function",
                "function": {"name": "", "arguments": ""},
            }
        slot = acc[idx]
        if tc.get("id"):
            slot["id"] = tc["id"]
        fn = tc.get("function") or {}
        if fn.get("name"):
            slot["function"]["name"] = fn["name"]
        if fn.get("arguments"):
            slot["function"]["arguments"] += fn["arguments"]


def parse_sse_chunk(line: str) -> Optional[dict]:
    """Parse a single `data:` SSE line into a dict. Returns None for [DONE]."""
    line = line.strip()
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if payload == "[DONE]":
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None
