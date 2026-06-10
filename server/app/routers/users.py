from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListParams
from app.schemas.common import APIResponse, PaginatedResponse
from app.services import user as user_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("", response_model=APIResponse)
async def create_user(
    req: UserCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    user = await user_service.create_user(
        db,
        username=req.username,
        display_name=req.display_name,
        email=req.email,
        password=req.password,
        department_id=req.department_id,
        system_role=req.system_role,
    )
    data = await user_service.get_user_with_department(db, user)
    return {"code": 0, "message": "ok", "data": data}


@router.get("", response_model=PaginatedResponse)
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    keyword: str = Query(default=""),
    status: str = Query(default=""),
    department_id: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users, total = await user_service.list_users(
        db,
        page=page,
        page_size=page_size,
        keyword=keyword or None,
        status=status or None,
        department_id=department_id or None,
    )
    data = [await user_service.get_user_with_department(db, u) for u in users]
    return {
        "code": 0, "message": "ok",
        "data": data, "total": total,
        "page": page, "page_size": page_size,
    }


@router.get("/departments/list", response_model=APIResponse)
async def list_departments(
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    from sqlalchemy import select
    from app.models.department import Department
    result = await db.execute(select(Department).order_by(Department.sort_order))
    depts = result.scalars().all()
    return {"code": 0, "message": "ok", "data": [{"id": d.id, "name": d.name, "path": d.path} for d in depts]}


@router.get("/{user_id}", response_model=APIResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await user_service.get_user(db, user_id)
    if user is None:
        raise AppException(404, "用户不存在", 404)
    data = await user_service.get_user_with_department(db, user)
    return {"code": 0, "message": "ok", "data": data}


@router.patch("/{user_id}", response_model=APIResponse)
async def update_user(
    user_id: str,
    req: UserUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    user = await user_service.get_user(db, user_id)
    if user is None:
        raise AppException(404, "用户不存在", 404)
    user = await user_service.update_user(
        db, user,
        display_name=req.display_name,
        email=req.email,
        department_id=req.department_id,
        system_role=req.system_role,
        status=req.status,
    )
    data = await user_service.get_user_with_department(db, user)
    return {"code": 0, "message": "ok", "data": data}


@router.delete("/{user_id}", response_model=APIResponse)
async def disable_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN")
    user = await user_service.get_user(db, user_id)
    if user is None:
        raise AppException(404, "用户不存在", 404)
    if user.id == pc.user.id:
        raise AppException(400, "不能禁用自己")
    await user_service.update_user(db, user, status="DISABLED")
    return {"code": 0, "message": "ok", "data": None}
