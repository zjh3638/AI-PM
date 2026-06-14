from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import APIResponse
from app.services import signal as signal_service
from app.services.permission import PermissionChecker, get_permission_checker

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["signals"])


@router.get("/focus-signals", response_model=APIResponse)
async def get_focus_signals(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_workspace_role(workspace_id, "OWNER", "MANAGER", "MEMBER", "VIEWER")
    signals = await signal_service.get_focus_signals(db, workspace_id)
    return {"code": 0, "message": "ok", "data": signals}
