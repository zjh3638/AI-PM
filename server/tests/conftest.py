import asyncio
from typing import AsyncGenerator

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import *  # noqa: F401,F403
from app.security import hash_password, create_access_token

# Use StaticPool so all connections share the same in-memory database
TEST_DATABASE_URL = "sqlite+aiosqlite://"
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def app():
    from app.main import app
    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
async def super_admin(db_session: AsyncSession) -> dict:
    from app.models.user import User
    from app.models.department import Department

    dept = Department(name="技术部")
    db_session.add(dept)
    await db_session.flush()

    user = User(
        username="admin",
        display_name="超级管理员",
        email="admin@test.com",
        hashed_password=hash_password("admin123456"),
        department_id=dept.id,
        system_role="SUPER_ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(user.id)
    return {"user": user, "token": token, "department": dept}


@pytest.fixture
async def member_user(db_session: AsyncSession) -> dict:
    from app.models.user import User

    user = User(
        username="member1",
        display_name="普通成员",
        email="member1@test.com",
        hashed_password=hash_password("member123"),
        system_role="MEMBER",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(user.id)
    return {"user": user, "token": token}


@pytest.fixture
async def workspace(db_session: AsyncSession, super_admin: dict) -> dict:
    from app.models.workspace import Workspace
    from app.models.workspace_member import WorkspaceMember

    ws = Workspace(
        name="测试项目",
        key="TEST-PROJ",
        description="测试用的项目工作空间",
        type="PROJECT",
        status="ACTIVE",
        visibility="PRIVATE",
    )
    db_session.add(ws)
    await db_session.flush()

    member = WorkspaceMember(
        workspace_id=ws.id,
        user_id=super_admin["user"].id,
        role="OWNER",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(ws)

    return {"workspace": ws, "owner_token": super_admin["token"]}


@pytest.fixture
def auth_headers(super_admin: dict) -> dict:
    return {"Authorization": f"Bearer {super_admin['token']}"}


@pytest.fixture
def member_headers(member_user: dict) -> dict:
    return {"Authorization": f"Bearer {member_user['token']}"}
