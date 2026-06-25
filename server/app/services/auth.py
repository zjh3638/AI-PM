import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.department import Department
from app.security import verify_password, hash_password
from app.exceptions import AppException
from app.integrations.auth_provider import LdapAuthProvider
from app.services.ldap_config import get_ldap_config

logger = logging.getLogger(__name__)


async def login_local(db: AsyncSession, username: str, password: str) -> User:
    """本地用户密码登录 — 仅限 source="LOCAL" 的用户。"""
    result = await db.execute(
        select(User)
        .where(User.username == username, User.source == "LOCAL")
        .options(selectinload(User.department))
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.hashed_password):
        raise AppException(400, "用户名或密码错误")
    if user.status == "DISABLED":
        raise AppException(403, "账户已被禁用", 403)
    return user


async def login_ldap(db: AsyncSession, username: str, password: str) -> User:
    """LDAP 登录 — 验证 LDAP 凭据，首次登录自动创建本地用户记录。"""
    ldap_cfg = get_ldap_config()
    if not ldap_cfg.get("ldap_enabled"):
        raise AppException(400, "LDAP 登录未启用")

    # Step 1: 验证 LDAP 凭据
    provider = LdapAuthProvider()
    auth_result = await provider.authenticate({
        "username": username,
        "password": password,
    })

    if auth_result is None:
        raise AppException(400, "LDAP 用户名或密码错误")

    # Step 2: 查找或创建本地用户记录
    result = await db.execute(
        select(User)
        .where(User.username == username, User.source == "LDAP")
        .options(selectinload(User.department))
    )
    user = result.scalar_one_or_none()

    if user is None:
        if not ldap_cfg.get("ldap_auto_create_user", True):
            raise AppException(403, "LDAP 用户未授权，请联系管理员")

        # 自动匹配部门
        department_id = await _match_department_from_ldap(db, auth_result)

        user = User(
            username=auth_result.username,
            display_name=auth_result.display_name,
            email=auth_result.email,
            hashed_password="",  # LDAP 用户无本地密码
            source="LDAP",
            status="ACTIVE",
            department_id=department_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("Auto-created LDAP user: %s (dept=%s)", username, department_id)

    if user.status == "DISABLED":
        raise AppException(403, "账户已被禁用", 403)

    # Step 3: 同步 LDAP 属性（display_name, email, department）
    updated = False
    if auth_result.display_name and user.display_name != auth_result.display_name:
        user.display_name = auth_result.display_name
        updated = True
    if auth_result.email and user.email != auth_result.email:
        user.email = auth_result.email
        updated = True
    # 如果用户还没有部门，尝试匹配
    if not user.department_id and auth_result.dn:
        dept_id = await _match_department_from_ldap(db, auth_result)
        if dept_id:
            user.department_id = dept_id
            updated = True
    if updated:
        await db.commit()
        await db.refresh(user)

    return user


async def _match_department_from_ldap(db: AsyncSession, auth_result) -> str | None:
    """根据 LDAP 认证结果匹配本地部门。

    依次尝试：
    1. 从用户 DN 中的 OU 路径匹配 ldap_dn 字段
    2. 从用户 department 属性匹配部门名称
    """
    if not auth_result.dn:
        return None

    # 从 DN 提取 OU 部分并逐级匹配 ldap_dn
    parts = [p.strip() for p in auth_result.dn.split(",")]
    ou_parts = [p for p in parts if p.upper().startswith("OU=")]
    # 仅保留 DC 部分作为基路径（排除用户特定部分如 cn=、uid=）
    dc_parts = [p.strip() for p in parts if p.upper().startswith("DC=")]

    for i in range(len(ou_parts)):
        candidate_dn = ",".join(ou_parts[i:] + dc_parts)
        result = await db.execute(
            select(Department).where(Department.ldap_dn == candidate_dn)
        )
        dept = result.scalar_one_or_none()
        if dept:
            return dept.id

    # 回退：按 department 属性匹配部门名称
    if auth_result.department:
        result = await db.execute(
            select(Department).where(Department.name == auth_result.department)
        )
        dept = result.scalar_one_or_none()
        if dept:
            return dept.id

    return None
