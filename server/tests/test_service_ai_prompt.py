from types import SimpleNamespace
from app.services.ai_prompt import build_system_prompt


def _user(name="赵某", role="MEMBER"):
    return SimpleNamespace(display_name=name, system_role=role)


def test_prompt_no_context():
    p = build_system_prompt("项目经理", _user(), None)
    assert "项目经理助手" in p
    assert "【当前上下文】" in p
    assert "用户：赵某（MEMBER）" in p


def test_prompt_with_workspace_detail():
    ctx = {"page_type": "workspace_detail", "workspace_id": "ws-1",
           "workspace_name": "电商重构", "workspace_tab": "kanban"}
    p = build_system_prompt("项目经理", _user(), ctx)
    assert "所在页：项目详情" in p
    assert "项目：电商重构 (id=ws-1)" in p
    assert "当前 tab：kanban" in p


def test_prompt_with_task_detail():
    ctx = {"page_type": "task_detail", "workspace_id": "ws-1",
           "task_id": "task-9", "task_title": "登录模块"}
    p = build_system_prompt("项目经理", _user(), ctx)
    assert "选中任务：登录模块 (id=task-9)" in p


def test_prompt_unknown_agent_falls_back():
    p = build_system_prompt("xxx", _user(), None)
    assert "项目经理助手" in p
