"""
LDAP 同步和导入功能测试 — 针对新 LDAP 路由与服务层。
"""
from unittest.mock import patch, AsyncMock

import pytest

from app.services import ldap_service
from app.services.ldap_service import LdapUser, LdapOu, LdapBrowseResult


class TestLdapService:
    """LDAP 服务层单元测试（不连接真实 LDAP 服务器）。"""

    def test_extract_ou_from_dn(self):
        """测试从 DN 提取 OU 路径。"""
        ou_path = ldap_service._extract_ou_from_dn(
            "cn=张三,ou=前端组,ou=技术部,ou=研发中心,dc=company,dc=com"
        )
        assert ou_path == "研发中心/技术部/前端组"

    def test_extract_ou_from_dn_no_ou(self):
        """没有 OU 的 DN 返回空字符串。"""
        ou_path = ldap_service._extract_ou_from_dn(
            "cn=admin,dc=company,dc=com"
        )
        assert ou_path == ""

    def test_extract_ou_from_dn_single_ou(self):
        """单层 OU。"""
        ou_path = ldap_service._extract_ou_from_dn(
            "cn=user,ou=技术部,dc=company,dc=com"
        )
        assert ou_path == "技术部"

    def test_get_attr_safe_string(self):
        """_get_attr_safe 处理字符串属性。"""
        # 模拟 ldap3 entry 对象
        class MockAttr:
            value = "test_value"

        class MockEntry:
            pass

        entry = MockEntry()
        setattr(entry, "cn", MockAttr())
        result = ldap_service._get_attr_safe(entry, "cn", "default")
        assert result == "test_value"

    def test_get_attr_safe_missing(self):
        """_get_attr_safe 处理缺失属性。"""
        class MockEntry:
            pass

        entry = MockEntry()
        result = ldap_service._get_attr_safe(entry, "nonexistent", "default")
        assert result == "default"

    def test_get_attr_safe_none_value(self):
        """_get_attr_safe 处理 None 值属性。"""
        class MockAttr:
            value = None

        class MockEntry:
            pass

        entry = MockEntry()
        setattr(entry, "attr", MockAttr())
        result = ldap_service._get_attr_safe(entry, "attr", "default")
        assert result == "default"

    @pytest.mark.asyncio
    async def test_search_ous_returns_list(self):
        """模拟 OU 搜索返回结果。"""
        mock_ous = [
            LdapOu(dn="ou=技术部,dc=co,dc=com", name="技术部"),
            LdapOu(dn="ou=产品部,dc=co,dc=com", name="产品部", description="产品设计部门"),
        ]
        with patch("app.services.ldap_service._search_ous_sync", return_value=mock_ous):
            result = await ldap_service.search_ous()
            assert len(result) == 2
            assert result[0].name == "技术部"
            assert result[1].description == "产品设计部门"

    @pytest.mark.asyncio
    async def test_search_users_returns_paginated(self):
        """模拟用户搜索返回分页结果。"""
        mock_users = [
            LdapUser(dn="cn=zhangsan,ou=dev,dc=co,dc=com", username="zhangsan",
                     display_name="张三", email="zs@co.com", ou_path="dev"),
            LdapUser(dn="cn=lisi,ou=dev,dc=co,dc=com", username="lisi",
                     display_name="李四", ou_path="dev"),
        ]
        mock_result = LdapBrowseResult(items=mock_users, total=45)
        with patch("app.services.ldap_service._search_users_sync", return_value=mock_result):
            result = await ldap_service.search_users(keyword="dev", page=2, page_size=2)
            assert len(result.items) == 2
            assert result.total == 45

    @pytest.mark.asyncio
    async def test_search_groups_returns_list(self):
        """模拟组搜索。"""
        mock_groups = [
            ldap_service.LdapGroup(dn="cn=dev-team,dc=co,dc=com", name="dev-team"),
        ]
        with patch("app.services.ldap_service._search_groups_sync", return_value=mock_groups):
            result = await ldap_service.search_groups(keyword="dev")
            assert len(result) == 1
            assert result[0].name == "dev-team"

    @pytest.mark.asyncio
    async def test_fetch_user_returns_user(self):
        """模拟获取单个用户。"""
        mock_user = LdapUser(
            dn="cn=zhangsan,ou=dev,dc=co,dc=com",
            username="zhangsan",
            display_name="张三",
            email="zs@co.com",
            ou_path="dev",
        )
        with patch("app.services.ldap_service._fetch_user_sync", return_value=mock_user):
            result = await ldap_service.fetch_user("cn=zhangsan,ou=dev,dc=co,dc=com")
            assert result is not None
            assert result.username == "zhangsan"
            assert result.display_name == "张三"

    @pytest.mark.asyncio
    async def test_fetch_user_not_found(self):
        """用户不存在返回 None。"""
        with patch("app.services.ldap_service._fetch_user_sync", return_value=None):
            result = await ldap_service.fetch_user("cn=nobody,dc=co,dc=com")
            assert result is None


class TestLdapDepartmentMatching:
    """测试登录时部门匹配逻辑。"""

    @pytest.mark.asyncio
    async def test_match_department_by_ou_dn(self, db_session):
        """根据用户 DN 中的 OU 匹配 ldap_dn。"""
        from app.services.auth import _match_department_from_ldap
        from app.models.department import Department
        from app.integrations.auth_provider import AuthResult

        # 创建映射了 LDAP DN 的部门
        dept = Department(
            name="技术部",
            path="/技术部",
            ldap_dn="ou=技术部,dc=company,dc=com",
        )
        db_session.add(dept)
        await db_session.commit()

        auth_result = AuthResult(
            username="testuser",
            display_name="Test",
            dn="cn=testuser,ou=技术部,dc=company,dc=com",
            source="LDAP",
        )
        dept_id = await _match_department_from_ldap(db_session, auth_result)
        assert dept_id == dept.id

    @pytest.mark.asyncio
    async def test_match_department_nested_ou(self, db_session):
        """多层 OU 匹配 — 匹配最精确层级。"""
        from app.services.auth import _match_department_from_ldap
        from app.models.department import Department
        from app.integrations.auth_provider import AuthResult

        dept_parent = Department(
            name="研发中心",
            path="/研发中心",
            ldap_dn="ou=研发中心,dc=company,dc=com",
        )
        dept_child = Department(
            name="前端组",
            path="/研发中心/前端组",
            parent_id=None,  # 稍后设置
            ldap_dn="ou=前端组,ou=研发中心,dc=company,dc=com",
        )
        db_session.add(dept_parent)
        await db_session.flush()
        dept_child.parent_id = dept_parent.id
        dept_child.path = "/研发中心/前端组"
        db_session.add(dept_child)
        await db_session.commit()

        # 用户属于更深层的 OU
        auth_result = AuthResult(
            username="devuser",
            display_name="Dev",
            dn="cn=devuser,ou=前端组,ou=研发中心,dc=company,dc=com",
            source="LDAP",
        )
        dept_id = await _match_department_from_ldap(db_session, auth_result)
        # 应匹配到更精确的 前端组
        assert dept_id == dept_child.id

    @pytest.mark.asyncio
    async def test_match_department_by_name_fallback(self, db_session):
        """按 department 属性匹配部门名称（回退策略）。"""
        from app.services.auth import _match_department_from_ldap
        from app.models.department import Department
        from app.integrations.auth_provider import AuthResult

        dept = Department(name="安全部", path="/安全部")
        db_session.add(dept)
        await db_session.commit()

        auth_result = AuthResult(
            username="secuser",
            display_name="Sec",
            dn="cn=secuser,cn=users,dc=company,dc=com",  # 没有 OU
            department="安全部",  # 但有 department 属性
            source="LDAP",
        )
        dept_id = await _match_department_from_ldap(db_session, auth_result)
        assert dept_id == dept.id

    @pytest.mark.asyncio
    async def test_match_department_no_match(self, db_session):
        """无法匹配时返回 None。"""
        from app.services.auth import _match_department_from_ldap
        from app.integrations.auth_provider import AuthResult

        auth_result = AuthResult(
            username="orphan",
            display_name="Orphan",
            dn="cn=orphan,dc=company,dc=com",
            source="LDAP",
        )
        dept_id = await _match_department_from_ldap(db_session, auth_result)
        assert dept_id is None

    @pytest.mark.asyncio
    async def test_match_department_no_dn(self, db_session):
        """无 DN 时返回 None。"""
        from app.services.auth import _match_department_from_ldap
        from app.integrations.auth_provider import AuthResult

        auth_result = AuthResult(
            username="nodn",
            display_name="NoDN",
            source="LDAP",
        )
        dept_id = await _match_department_from_ldap(db_session, auth_result)
        assert dept_id is None
