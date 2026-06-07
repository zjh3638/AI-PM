from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.task import Task
from app.models.workspace_member import WorkspaceMember
from app.exceptions import AppException


# Valid status transitions: who can trigger which transitions
STATUS_TRANSITIONS = {
    "TODO": {
        "IN_PROGRESS": {"assignee", "manager"},     # assignee starts work, or manager assigns
    },
    "IN_PROGRESS": {
        "IN_REVIEW": {"assignee", "manager"},        # assignee submits for review
    },
    "IN_REVIEW": {
        "DONE": {"reviewer", "manager"},             # reviewer approves
        "IN_PROGRESS": {"reviewer", "manager"},      # reviewer rejects (rework)
    },
    "DONE": {
        "TODO": {"manager"},                          # manager reopens
    },
}

# Who can advance phase for which task type at which phase
PHASE_ADVANCE_ROLES = {
    "STORY": {
        "REQUIREMENTS": {"analyst", "manager"},
        "DESIGN": {"assignee", "manager"},
        "DEVELOPMENT": {"assignee", "manager"},
        "TESTING": {"qa_owner", "manager"},
        "RELEASE": {"manager"},
        "ACCEPTANCE": {"proposer", "manager"},
    },
    "TASK": {
        "REQUIREMENTS": {"assignee", "manager"},
        "DESIGN": {"assignee", "manager"},
        "DEVELOPMENT": {"assignee", "manager"},
        "TESTING": {"reviewer", "manager"},
        "RELEASE": {"manager"},
        "ACCEPTANCE": {"manager"},
    },
    "BUG": {
        "DEVELOPMENT": {"assignee", "manager"},
        "TESTING": {"verifier", "manager"},
        "RELEASE": {"verifier", "manager"},
        "ACCEPTANCE": {"manager"},
    },
}


class PermissionChecker:
    """Role-based permission checker with task-level granularity."""

    def __init__(self, user: User, db: AsyncSession):
        self.user = user
        self.db = db
        self._member_cache: dict[str, WorkspaceMember | None] = {}

    async def require_system_role(self, *roles: str):
        if self.user.system_role not in roles:
            raise AppException(403, "无权访问此功能", 403)

    async def require_workspace_role(self, workspace_id: str, *roles: str):
        if self._is_super_admin():
            return
        member = await self._get_member(workspace_id)
        if member is None:
            raise AppException(403, "不是该工作空间的成员", 403)
        if member.role not in roles:
            raise AppException(403, "无权执行此操作", 403)

    async def _get_member(self, workspace_id: str) -> WorkspaceMember | None:
        if workspace_id not in self._member_cache:
            result = await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == self.user.id,
                )
            )
            self._member_cache[workspace_id] = result.scalar_one_or_none()
        return self._member_cache[workspace_id]

    async def is_manager(self, workspace_id: str) -> bool:
        if self._is_super_admin():
            return True
        member = await self._get_member(workspace_id)
        return member is not None and member.role in ("OWNER", "MANAGER")

    @property
    def data_scope(self) -> str:
        scope_map = {
            "SUPER_ADMIN": "ALL",
            "ADMIN": "DEPARTMENT",
            "MEMBER": "SELF",
            "EXTERNAL": "SELF",
        }
        return scope_map.get(self.user.system_role, "SELF")

    def _is_super_admin(self) -> bool:
        return self.user.system_role == "SUPER_ADMIN"

    # ── Task-level role checks ──

    def _is_assignee(self, task: Task) -> bool:
        return task.assignee_id == self.user.id

    def _is_reviewer(self, task: Task) -> bool:
        return task.reviewer_id == self.user.id or (
            self.user.id in (task.reviewer_ids or [])
        )

    def _is_proposer(self, task: Task) -> bool:
        return task.proposer_id == self.user.id

    def _is_analyst(self, task: Task) -> bool:
        return task.analyst_id == self.user.id

    def _is_qa_owner(self, task: Task) -> bool:
        return task.qa_owner_id == self.user.id

    def _is_verifier(self, task: Task) -> bool:
        return task.verifier_id == self.user.id

    def _is_reporter(self, task: Task) -> bool:
        """Bug reporter — same field as proposer for Bug type."""
        return task.task_type == "BUG" and task.proposer_id == self.user.id

    def _is_parent_assignee(self, task: Task) -> bool:
        """User is the assignee of the parent Story."""
        if task.parent and task.parent.assignee_id == self.user.id:
            return True
        return False

    # ── Status transition validation ──

    @staticmethod
    def can_transition_status(task: Task, new_status: str, user_id: str, is_manager: bool) -> bool:
        """Check if a status transition is allowed. Managers can trigger any valid transition but cannot skip states."""
        current = task.status
        if current not in STATUS_TRANSITIONS:
            return False
        if new_status not in STATUS_TRANSITIONS[current]:
            return False
        if is_manager:
            return True
        allowed_roles = STATUS_TRANSITIONS[current][new_status]
        if "assignee" in allowed_roles and task.assignee_id == user_id:
            return True
        if "reviewer" in allowed_roles and (
            task.reviewer_id == user_id
            or (task.reviewer_ids and user_id in task.reviewer_ids)
        ):
            return True
        return False

    # ── Task permission summary ──

    async def get_task_permissions(self, task: Task) -> dict:
        """Returns what the current user can do with this task."""
        is_mgr = await self.is_manager(task.workspace_id)

        can_view = True  # anyone in the workspace can view

        can_edit = is_mgr or self._is_assignee(task)
        can_delete = is_mgr
        can_change_assignee = is_mgr
        can_change_reviewer = is_mgr

        # Status transitions
        transitions = {}
        for from_s, to_map in STATUS_TRANSITIONS.items():
            for to_s, roles in to_map.items():
                ok = is_mgr
                if not ok:
                    if "assignee" in roles and self._is_assignee(task):
                        ok = True
                    if "reviewer" in roles and self._is_reviewer(task):
                        ok = True
                if ok:
                    transitions[f"{from_s}→{to_s}"] = True

        can_move = len(transitions) > 0 or is_mgr

        # Phase advance
        can_advance = is_mgr
        if not can_advance and task.task_type in PHASE_ADVANCE_ROLES:
            phase_roles = PHASE_ADVANCE_ROLES[task.task_type].get(task.phase, set())
            if "assignee" in phase_roles and self._is_assignee(task):
                can_advance = True
            if "analyst" in phase_roles and self._is_analyst(task):
                can_advance = True
            if "qa_owner" in phase_roles and self._is_qa_owner(task):
                can_advance = True
            if "proposer" in phase_roles and self._is_proposer(task):
                can_advance = True
            if "verifier" in phase_roles and self._is_verifier(task):
                can_advance = True
            if "reviewer" in phase_roles and self._is_reviewer(task):
                can_advance = True

        # Can split (only story assignee and owners can split into sub-tasks)
        can_split = is_mgr or (
            task.task_type == "STORY" and self._is_assignee(task)
        )

        # Can create test tasks (only qa_owner)
        can_create_test = is_mgr or (
            task.task_type == "STORY" and self._is_qa_owner(task)
        )

        # Can review requirement (analyst or manager, in REQUIREMENTS phase)
        can_review_requirement = is_mgr or (
            task.task_type == "STORY"
            and task.phase == "REQUIREMENTS"
            and self._is_analyst(task)
        )

        # Can review design (reviewer or manager, in DESIGN phase)
        can_review_design = is_mgr or (
            task.task_type == "STORY"
            and task.phase == "DESIGN"
            and self._is_reviewer(task)
        )

        return {
            "can_view": can_view,
            "can_edit": can_edit,
            "can_delete": can_delete,
            "can_move": can_move,
            "can_advance_phase": can_advance,
            "can_change_assignee": can_change_assignee,
            "can_change_reviewer": can_change_reviewer,
            "can_split": can_split,
            "can_create_test": can_create_test,
            "can_review_requirement": can_review_requirement,
            "can_review_design": can_review_design,
            "is_assignee": self._is_assignee(task),
            "is_reviewer": self._is_reviewer(task),
            "is_proposer": self._is_proposer(task),
            "is_analyst": self._is_analyst(task),
            "is_qa_owner": self._is_qa_owner(task),
            "is_verifier": self._is_verifier(task),
            "available_transitions": transitions,
            "role": "manager" if is_mgr else (
                "assignee" if self._is_assignee(task) else
                "reviewer" if self._is_reviewer(task) else
                "member"
            ),
        }


async def get_permission_checker(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionChecker:
    return PermissionChecker(user, db)
