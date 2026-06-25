"""
LDAP 目录服务 — 浏览 OU 树、搜索用户和组、批量导入用户。

所有搜索操作通过 LDAP 服务账号绑定，在线程池中运行以避免阻塞事件循环。
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from ldap3 import Server, Connection, ALL, SUBTREE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

from app.services.ldap_config import get_ldap_config

logger = logging.getLogger(__name__)


@dataclass
class LdapOu:
    """LDAP 组织单位信息。"""
    dn: str
    name: str
    description: str = ""


@dataclass
class LdapUser:
    """LDAP 用户信息。"""
    dn: str
    username: str
    display_name: str
    email: str = ""
    department: str = ""
    ou_path: str = ""  # 从 DN 提取的组织路径


@dataclass
class LdapGroup:
    """LDAP 用户组信息。"""
    dn: str
    name: str
    description: str = ""


@dataclass
class LdapBrowseResult:
    """LDAP 浏览搜索结果。"""
    items: list = field(default_factory=list)
    total: int = 0


def _get_ldap_connection(ldap_cfg: dict = None) -> Connection:
    """创建并绑定到 LDAP 服务器，返回已绑定的连接。"""
    if ldap_cfg is None:
        ldap_cfg = get_ldap_config()

    server = Server(ldap_cfg["ldap_server_uri"], get_info=ALL)
    conn = Connection(
        server,
        user=ldap_cfg["ldap_bind_dn"],
        password=ldap_cfg["ldap_bind_password"],
        auto_bind=True,
    )
    return conn, ldap_cfg


def _extract_ou_from_dn(dn: str) -> str:
    """从 DN 中提取 OU 路径，如 'ou=技术部,ou=研发中心,dc=co,dc=com' -> '研发中心/技术部'。"""
    parts = [p.strip() for p in dn.split(",")]
    ou_parts = []
    for part in parts:
        if part.lower().startswith("ou="):
            ou_parts.append(part[3:])
    return "/".join(reversed(ou_parts))


def _get_attr_safe(entry, attr_name: str, default=""):
    """安全提取 LDAP 条目属性值。"""
    try:
        if hasattr(entry, attr_name):
            val = getattr(entry, attr_name)
            if val is not None and val.value:
                return str(val.value)
    except Exception:
        pass
    return default


def _search_ous_sync(
    search_base: str = "",
    keyword: str = "",
) -> list[LdapOu]:
    """同步搜索 LDAP 组织单位，返回结构化树。"""
    ldap_cfg = get_ldap_config()
    conn = None
    try:
        conn, _ = _get_ldap_connection(ldap_cfg)
        base = search_base or ldap_cfg["ldap_base_dn"]

        search_filter = "(objectClass=organizationalUnit)"
        if keyword:
            search_filter = f"(&(objectClass=organizationalUnit)(ou=*{keyword}*))"

        conn.search(
            search_base=base,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["ou", "description"],
        )

        result = []
        for entry in conn.entries:
            result.append(LdapOu(
                dn=entry.entry_dn,
                name=_get_attr_safe(entry, "ou", ""),
                description=_get_attr_safe(entry, "description", ""),
            ))
        return result
    finally:
        if conn:
            conn.unbind()


async def search_ous(
    search_base: str = "",
    keyword: str = "",
) -> list[LdapOu]:
    """搜索 LDAP 组织单位（OU）。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _search_ous_sync, search_base, keyword
    )


def _search_users_sync(
    search_base: str = "",
    keyword: str = "",
    page: int = 1,
    page_size: int = 50,
) -> LdapBrowseResult:
    """同步搜索 LDAP 用户，支持分页。"""
    ldap_cfg = get_ldap_config()
    conn = None
    try:
        conn, _ = _get_ldap_connection(ldap_cfg)
        base = search_base or ldap_cfg["ldap_base_dn"]

        # 构建搜索过滤器
        obj_filter = "(objectClass=person)"
        if keyword:
            keyword_filter = (
                f"(|(cn=*{keyword}*)(uid=*{keyword}*)"
                f"(sAMAccountName=*{keyword}*)(mail=*{keyword}*))"
            )
            search_filter = f"(&{obj_filter}{keyword_filter})"
        else:
            search_filter = obj_filter

        # 搜到的属性：用户名、显示名、邮箱、部门、成员
        attrs = [
            ldap_cfg.get("ldap_username_attribute", "uid"),
            ldap_cfg.get("ldap_display_name_attribute", "cn"),
            ldap_cfg.get("ldap_email_attribute", "mail"),
            "department",
            "distinguishedName",
        ]

        conn.search(
            search_base=base,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=list(set(attrs)),  # 去重
        )

        all_entries = conn.entries
        total = len(all_entries)

        # 手动分页（ldap3 的 paged_size 在某些服务器上不可用）
        start = (page - 1) * page_size
        end = start + page_size
        page_entries = all_entries[start:end]

        items = []
        for entry in page_entries:
            items.append(LdapUser(
                dn=entry.entry_dn,
                username=_get_attr_safe(entry, attrs[0], ""),
                display_name=_get_attr_safe(entry, attrs[1], ""),
                email=_get_attr_safe(entry, attrs[2], ""),
                department=_get_attr_safe(entry, "department", ""),
                ou_path=_extract_ou_from_dn(entry.entry_dn),
            ))
        return LdapBrowseResult(items=items, total=total)
    finally:
        if conn:
            conn.unbind()


async def search_users(
    search_base: str = "",
    keyword: str = "",
    page: int = 1,
    page_size: int = 50,
) -> LdapBrowseResult:
    """搜索 LDAP 用户目录，返回分页结果。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _search_users_sync, search_base, keyword, page, page_size
    )


def _search_groups_sync(
    search_base: str = "",
    keyword: str = "",
) -> list[LdapGroup]:
    """同步搜索 LDAP 用户组。"""
    ldap_cfg = get_ldap_config()
    conn = None
    try:
        conn, _ = _get_ldap_connection(ldap_cfg)
        base = search_base or ldap_cfg["ldap_base_dn"]

        search_filter = "(objectClass=group)"
        if keyword:
            search_filter = f"(&(objectClass=group)(cn=*{keyword}*))"

        conn.search(
            search_base=base,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["cn", "description"],
        )

        result = []
        for entry in conn.entries:
            result.append(LdapGroup(
                dn=entry.entry_dn,
                name=_get_attr_safe(entry, "cn", ""),
                description=_get_attr_safe(entry, "description", ""),
            ))
        return result
    finally:
        if conn:
            conn.unbind()


async def search_groups(
    search_base: str = "",
    keyword: str = "",
) -> list[LdapGroup]:
    """搜索 LDAP 用户组。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _search_groups_sync, search_base, keyword
    )


def _fetch_user_sync(dn: str, ldap_cfg: dict = None) -> Optional[LdapUser]:
    """同步获取单个 LDAP 用户的详细信息。"""
    if ldap_cfg is None:
        ldap_cfg = get_ldap_config()
    conn = None
    try:
        conn, _ = _get_ldap_connection(ldap_cfg)

        attrs = [
            ldap_cfg.get("ldap_username_attribute", "uid"),
            ldap_cfg.get("ldap_display_name_attribute", "cn"),
            ldap_cfg.get("ldap_email_attribute", "mail"),
            "department",
            "distinguishedName",
        ]

        conn.search(
            search_base=dn,
            search_filter="(objectClass=*)",
            search_scope="BASE",
            attributes=list(set(attrs)),
        )

        if len(conn.entries) == 0:
            return None

        entry = conn.entries[0]
        return LdapUser(
            dn=entry.entry_dn,
            username=_get_attr_safe(entry, attrs[0], ""),
            display_name=_get_attr_safe(entry, attrs[1], ""),
            email=_get_attr_safe(entry, attrs[2], ""),
            department=_get_attr_safe(entry, "department", ""),
            ou_path=_extract_ou_from_dn(entry.entry_dn),
        )
    finally:
        if conn:
            conn.unbind()


async def fetch_user(dn: str) -> Optional[LdapUser]:
    """获取单个 LDAP 用户的详细信息。"""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _fetch_user_sync, dn)
