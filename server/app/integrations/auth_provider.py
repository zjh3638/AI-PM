import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from ldap3 import Server, Connection, ALL, SUBTREE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

from app.services.ldap_config import get_ldap_config

logger = logging.getLogger(__name__)


@dataclass
class AuthResult:
    username: str
    display_name: str
    email: Optional[str] = None
    department: Optional[str] = None
    dn: Optional[str] = None  # LDAP 用户的 distinguishedName，用于部门匹配
    source: str = "LOCAL"


class AuthProvider(ABC):

    @abstractmethod
    async def authenticate(self, credentials: dict) -> Optional[AuthResult]:
        ...

    @abstractmethod
    def provider_name(self) -> str:
        ...


class LocalAuthProvider(AuthProvider):

    def provider_name(self) -> str:
        return "local"

    async def authenticate(self, credentials: dict) -> Optional[AuthResult]:
        # 本地认证在 service 层直接查 DB 验证密码
        return None


class LdapAuthProvider(AuthProvider):
    """LDAP 认证提供者 — 连接 LDAP 服务器验证用户凭据。

    认证流程：
    1. 用服务账号绑定 LDAP 服务器
    2. 按 username filter 搜索用户条目
    3. 用搜索到的用户 DN + 密码尝试重新绑定以验证凭据
    """

    def provider_name(self) -> str:
        return "ldap"

    async def authenticate(self, credentials: dict) -> Optional[AuthResult]:
        ldap_cfg = get_ldap_config()
        if not ldap_cfg.get("ldap_enabled"):
            logger.warning("LDAP is not enabled, skipping LDAP authentication")
            return None

        username = credentials.get("username", "")
        password = credentials.get("password", "")

        if not username or not password:
            return None

        # ldap3 是同步库，在线程池中执行避免阻塞事件循环
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._authenticate_sync, username, password
        )

    def _authenticate_sync(
        self, username: str, password: str
    ) -> Optional[AuthResult]:
        ldap_cfg = get_ldap_config()
        server = Server(ldap_cfg["ldap_server_uri"], get_info=ALL)
        conn = None

        try:
            # Step 1: 服务账号绑定
            conn = Connection(
                server,
                user=ldap_cfg["ldap_bind_dn"],
                password=ldap_cfg["ldap_bind_password"],
                auto_bind=True,
            )

            # Step 2: 搜索用户
            search_filter = ldap_cfg["ldap_user_filter"].format(username=username)
            conn.search(
                search_base=ldap_cfg["ldap_base_dn"],
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=[
                    ldap_cfg["ldap_username_attribute"],
                    ldap_cfg["ldap_display_name_attribute"],
                    ldap_cfg["ldap_email_attribute"],
                ],
            )

            if len(conn.entries) == 0:
                logger.info("LDAP user not found: %s", username)
                return None

            if len(conn.entries) > 1:
                logger.warning(
                    "Multiple LDAP entries found for %s, using first one", username
                )

            entry = conn.entries[0]
            user_dn = entry.entry_dn

            # Step 3: 用用户 DN + 密码重新绑定以验证凭据
            user_conn = Connection(
                server,
                user=user_dn,
                password=password,
                auto_bind=True,
            )

            try:
                # 提取属性值
                ldap_username = _get_attr(
                    entry, ldap_cfg["ldap_username_attribute"], username
                )
                ldap_display_name = _get_attr(
                    entry, ldap_cfg["ldap_display_name_attribute"], username
                )
                ldap_email = _get_attr(
                    entry, ldap_cfg["ldap_email_attribute"], None
                )

                logger.info("LDAP authentication succeeded for %s", username)
                return AuthResult(
                    username=ldap_username,
                    display_name=ldap_display_name,
                    email=ldap_email,
                    department=_get_attr(entry, "department", None),
                    dn=user_dn,
                    source="LDAP",
                )
            finally:
                user_conn.unbind()

        except LDAPBindError:
            logger.info("LDAP bind failed for %s", username)
            return None
        except LDAPSocketOpenError as e:
            logger.error("LDAP server unreachable: %s", e)
            return None
        except LDAPException as e:
            logger.error("LDAP error for %s: %s", username, e)
            return None
        finally:
            if conn:
                conn.unbind()


def _get_attr(entry, attr_name: str, default=None):
    """安全提取 LDAP 条目属性值。"""
    if hasattr(entry, attr_name) and getattr(entry, attr_name).value:
        return str(getattr(entry, attr_name).value)
    return default
