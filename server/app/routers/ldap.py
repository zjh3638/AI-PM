"""
LDAP 管理路由 — OU 浏览/同步 + 用户浏览/批量导入。

所有端点需要 SUPER_ADMIN 或 ADMIN 权限。
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.department import Department
from app.schemas.common import APIResponse
from app.services.permission import PermissionChecker, get_permission_checker
from app.services import ldap_service
from app.services import department as dept_service
from app.services.ldap_config import get_ldap_config
from app.exceptions import AppException

router = APIRouter(prefix="/api/admin/ldap", tags=["ldap-admin"])


# ─── Schema ──────────────────────────────────────────────────────────────────


class SyncOusRequest(BaseModel):
    """同步 OU 到本地部门请求。"""
    ou_dns: list[str] = Field(..., min_length=1, max_length=200)
    parent_department_id: str | None = None


class ImportUsersRequest(BaseModel):
    """批量导入 LDAP 用户请求。"""
    user_dns: list[str] = Field(..., min_length=1, max_length=500)
    department_id: str | None = None  # 指定统一部门（可选，不传则自动匹配）


# ─── OU 浏览与同步 ──────────────────────────────────────────────────────────


@router.get("/ous", response_model=APIResponse)
async def browse_ous(
    keyword: str = Query(default=""),
    search_base: str = Query(default=""),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    """浏览 LDAP 目录中的组织单位（OU）列表。"""
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")

    try:
        ous = await ldap_service.search_ous(
            search_base=search_base or None,
            keyword=keyword or None,
        )
    except Exception as e:
        raise AppException(400, f"LDAP 搜索失败: {str(e)}")

    return {
        "code": 0,
        "message": "ok",
        "data": [
            {"dn": ou.dn, "name": ou.name, "description": ou.description}
            for ou in ous
        ],
    }


@router.post("/sync-ous", response_model=APIResponse)
async def sync_ous(
    req: SyncOusRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    """将选定的 LDAP OU 同步为本地部门。

    每个 OU 创建一个本地部门，设置其 ldap_dn 字段以便后续用户导入时自动匹配。
    如果 OU 的 DN 路径包含多个层次（如 ou=技术部,ou=研发中心,dc=co,dc=com），
    会递归创建父子部门结构。
    """
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")

    created_count = 0
    skipped_count = 0
    errors = []

    for ou_dn in req.ou_dns:
        try:
            # 从 DN 提取 OU 名称链，如 'OU=技术部,OU=研发中心,DC=co,DC=com'
            # -> ['研发中心', '技术部']（从外到内）
            ou_parts = []
            for part in ou_dn.split(","):
                part = part.strip()
                if part.upper().startswith("OU="):
                    ou_parts.append(part[3:])
            ou_parts.reverse()  # ['研发中心', '技术部']

            if not ou_parts:
                errors.append(f"{ou_dn}: 无法解析 OU 名称")
                continue

            # 检查已有 ldap_dn 的部门
            result = await db.execute(
                select(Department).where(Department.ldap_dn == ou_dn)
            )
            if result.scalar_one_or_none():
                skipped_count += 1
                continue

            # 递归创建部门层级
            parent_id = req.parent_department_id
            current_dn_parts = []
            for i, ou_name in enumerate(ou_parts):
                # 构建当前层级的 DN
                current_dn_parts.insert(0, f"ou={ou_name}")
                full_dn = ",".join(current_dn_parts)
                # 补齐基 DN
                base_parts = [p for p in ou_dn.split(",") if not p.strip().upper().startswith("OU=")]
                if base_parts:
                    full_dn = f"{full_dn},{','.join(p.strip() for p in base_parts)}"

                # 检查是否已存在
                result = await db.execute(
                    select(Department).where(Department.ldap_dn == full_dn)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    parent_id = existing.id
                    continue

                # 检查同名部门
                result = await db.execute(
                    select(Department).where(
                        Department.name == ou_name,
                        Department.parent_id == parent_id,
                    )
                )
                existing = result.scalar_one_or_none()
                if existing:
                    # 更新其 ldap_dn
                    existing.ldap_dn = full_dn
                    await db.commit()
                    parent_id = existing.id
                    skipped_count += 1
                    continue

                dept = await dept_service.create_department(
                    db,
                    name=ou_name,
                    parent_id=parent_id,
                    ldap_dn=full_dn,
                )
                parent_id = dept.id
                created_count += 1

        except Exception as e:
            errors.append(f"{ou_dn}: {str(e)}")

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "created": created_count,
            "skipped": skipped_count,
            "errors": errors,
        },
    }


# ─── 用户浏览与导入 ──────────────────────────────────────────────────────────


@router.get("/users", response_model=APIResponse)
async def browse_users(
    keyword: str = Query(default=""),
    search_base: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    """浏览 LDAP 目录中的用户列表，支持关键词搜索和分页。"""
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")

    try:
        result = await ldap_service.search_users(
            search_base=search_base or None,
            keyword=keyword or None,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        raise AppException(400, f"LDAP 用户搜索失败: {str(e)}")

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "items": [
                {
                    "dn": u.dn,
                    "username": u.username,
                    "display_name": u.display_name,
                    "email": u.email,
                    "department": u.department,
                    "ou_path": u.ou_path,
                }
                for u in result.items
            ],
            "total": result.total,
            "page": page,
            "page_size": page_size,
        },
    }


@router.post("/import-users", response_model=APIResponse)
async def import_users(
    req: ImportUsersRequest,
    db: AsyncSession = Depends(get_db),
    pc: PermissionChecker = Depends(get_permission_checker),
):
    """从 LDAP 批量导入用户到本地用户表。

    - 如果指定了 department_id，所有导入用户统一分配到该部门
    - 否则根据用户的 OU 路径自动匹配 ldap_dn 对应的本地部门
    - 已存在的用户（同 username + source=LDAP）跳过并更新属性
    - 首次创建的用户 hashed_password=""、source=LDAP、status=ACTIVE
    """
    await pc.require_system_role("SUPER_ADMIN", "ADMIN")

    imported_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []

    for user_dn in req.user_dns:
        try:
            ldap_user = await ldap_service.fetch_user(user_dn)
            if not ldap_user:
                errors.append(f"{user_dn}: LDAP 中未找到用户")
                continue

            if not ldap_user.username:
                errors.append(f"{user_dn}: 缺少用户名属性")
                continue

            # 查找或创建部门映射
            department_id = req.department_id
            if not department_id:
                # 从用户 DN 中提取 OU 路径，逐级匹配
                department_id = await _match_department_by_dn(db, user_dn)

            # 检查是否已存在
            result = await db.execute(
                select(User).where(
                    User.username == ldap_user.username,
                    User.source == "LDAP",
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                # 更新属性
                existing.display_name = ldap_user.display_name or existing.display_name
                existing.email = ldap_user.email or existing.email
                if department_id:
                    existing.department_id = department_id
                updated_count += 1
            else:
                # 创建新用户
                new_user = User(
                    username=ldap_user.username,
                    display_name=ldap_user.display_name,
                    email=ldap_user.email,
                    hashed_password="",
                    source="LDAP",
                    status="ACTIVE",
                    department_id=department_id,
                )
                db.add(new_user)
                imported_count += 1

        except Exception as e:
            errors.append(f"{user_dn}: {str(e)}")

    await db.commit()

    return {
        "code": 0,
        "message": "ok",
        "data": {
            "imported": imported_count,
            "updated": updated_count,
            "errors": errors,
        },
    }


# ─── 辅助函数 ────────────────────────────────────────────────────────────────


async def _match_department_by_dn(db: AsyncSession, user_dn: str) -> str | None:
    """根据用户 DN 中的 OU 路径匹配本地部门。

    从最精确的匹配开始逐级回退：
    如 DN='cn=张三,ou=前端组,ou=技术部,ou=研发中心,dc=co,dc=com'
    依次匹配: ou=前端组,ou=技术部,ou=研发中心,dc=co,dc=com
               → ou=技术部,ou=研发中心,dc=co,dc=com
               → ou=研发中心,dc=co,dc=com
    """
    parts = [p.strip() for p in user_dn.split(",")]
    ou_parts = [p for p in parts if p.upper().startswith("OU=")]
    # 仅保留 DC 部分
    dc_parts = [p.strip() for p in parts if p.upper().startswith("DC=")]

    # 从最具体到最通用逐级匹配
    for i in range(len(ou_parts)):
        candidate_ou_parts = ou_parts[i:]  # 从第 i 个开始
        candidate_dn = ",".join(candidate_ou_parts + dc_parts)

        result = await db.execute(
            select(Department).where(Department.ldap_dn == candidate_dn)
        )
        dept = result.scalar_one_or_none()
        if dept:
            return dept.id

    return None
