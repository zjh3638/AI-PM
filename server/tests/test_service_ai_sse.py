import json
from app.services.ai_sse import sse, accumulate_tool_calls, parse_sse_chunk


def test_sse_format():
    frame = sse("delta", {"content": "你好"})
    assert frame == 'event: delta\ndata: {"content": "你好"}\n\n'


def test_accumulate_tool_calls_single():
    acc = {}
    accumulate_tool_calls(acc, [
        {"index": 0, "id": "call_1", "function": {"name": "create_task", "arguments": ""}},
    ])
    accumulate_tool_calls(acc, [
        {"index": 0, "function": {"arguments": '{"title":'}},
    ])
    accumulate_tool_calls(acc, [
        {"index": 0, "function": {"arguments": '"hi"}'}},
    ])
    assert acc[0]["id"] == "call_1"
    assert acc[0]["function"]["name"] == "create_task"
    assert acc[0]["function"]["arguments"] == '{"title":"hi"}'


def test_accumulate_tool_calls_parallel():
    acc = {}
    accumulate_tool_calls(acc, [
        {"index": 0, "id": "call_a", "function": {"name": "f1", "arguments": "{}"}},
        {"index": 1, "id": "call_b", "function": {"name": "f2", "arguments": "{}"}},
    ])
    assert acc[0]["id"] == "call_a"
    assert acc[1]["id"] == "call_b"


def test_parse_sse_chunk_data_only():
    line = 'data: {"choices":[{"delta":{"content":"x"}}]}'
    obj = parse_sse_chunk(line)
    assert obj["choices"][0]["delta"]["content"] == "x"


def test_parse_sse_chunk_done_marker():
    assert parse_sse_chunk("data: [DONE]") is None
