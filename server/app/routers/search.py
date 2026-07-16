from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.common import APIResponse
from app.services import search as search_svc

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=APIResponse)
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query(default="all"),
    workspace_id: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = await search_svc.search(
        db, q,
        workspace_id=workspace_id or None,
        search_type=type,
    )
    return {"code": 0, "message": "ok", "data": results}
