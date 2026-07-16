from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.department import DepartmentCreate, DepartmentUpdate
from app.schemas.common import APIResponse
from app.services import department as dept_service
from app.services.permission import PermissionChecker, get_permission_checker
from app.exceptions import AppException

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("/tree", response_model=APIResponse)
async def get_department_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 只读参考数据：所有登录用户可访问（工作空间筛选/成员指派需要）
    tree = await dept_service.get_tree(db)
    return {"code": 0, "message": "ok", "data": tree}


@router.get("", response_model=APIResponse)
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 只读参考数据：所有登录用户可访问
    from sqlalchemy import select
    from app.models.department import Department
    result = await db.execute(select(Department).order_by(Department.sort_order))
    depts = result.scalars().all()
    return {"code": 0, "message": "ok", "data": [
        {"id": d.id, "name": d.name, "parent_id": d.parent_id,
         "path": d.path, "sort_order": d.sort_order} for d in depts
    ]}


@router.post("", response_model=APIResponse)
async def create_department(
    req: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    dept = await dept_service.create_department(
        db, name=req.name, parent_id=req.parent_id, sort_order=req.sort_order,
        ldap_dn=req.ldap_dn,
    )
    return {"code": 0, "message": "ok", "data": {
        "id": dept.id, "name": dept.name, "parent_id": dept.parent_id,
        "path": dept.path, "sort_order": dept.sort_order, "ldap_dn": dept.ldap_dn,
    }}


@router.patch("/{dept_id}", response_model=APIResponse)
async def update_department(
    dept_id: str,
    req: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")
    dept = await dept_service.get_department(db, dept_id)
    if not dept:
        raise AppException(404, "部门不存在", 404)
    dept = await dept_service.update_department(
        db, dept,
        name=req.name, parent_id=req.parent_id, sort_order=req.sort_order,
        ldap_dn=req.ldap_dn,
    )
    return {"code": 0, "message": "ok", "data": {
        "id": dept.id, "name": dept.name, "parent_id": dept.parent_id,
        "path": dept.path, "sort_order": dept.sort_order, "ldap_dn": dept.ldap_dn,
    }}


@router.delete("/{dept_id}", response_model=APIResponse)
async def delete_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    await pc.require_system_role("SUPER_ADMIN")
    dept = await dept_service.get_department(db, dept_id)
    if not dept:
        raise AppException(404, "部门不存在", 404)
    await dept_service.delete_department(db, dept)
    return {"code": 0, "message": "ok", "data": None}
