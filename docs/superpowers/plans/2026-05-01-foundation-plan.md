# AI-PM 平台基石 — 实施计划 (FastAPI 版)

> **Goal:** 搭建平台基座——完成 FastAPI 项目脚手架、认证体系、用户管理、工作空间 CRUD、3 级 RBAC 权限。用户可以用密码/LDAP/企业微信登录，创建工作空间并邀请成员，所有操作受权限控制。

**Architecture:** React 前端（pnpm monorepo）+ FastAPI 后端（Python 3.11+）+ MySQL 8 数据库。前端通过 REST API 与后端通信。

**Tech Stack:** React 18 + TypeScript + Vite + Ant Design 5 | FastAPI + SQLAlchemy 2.0 async + Alembic | MySQL 8 | Redis 7 | GitPython

**Prerequisite:** 现有 `server/` 骨架（FastAPI + SQLAlchemy + Alembic）和 `package.json` + `pnpm-workspace.yaml` 将在此基础上扩展。

---

## Phase 0: 项目脚手架

### Task 0.1: 完善 FastAPI 后端项目结构

**Files:**
- Update: `server/app/main.py` — 扩展应用初始化、全局中间件
- Update: `server/app/config.py` — 补全配置项
- Create: `server/app/exceptions.py` — 统一异常处理
- Create: `server/app/middleware.py` — 请求日志、统一响应格式

- [ ] **Step 1: 扩展配置和中间件**

```python
# server/app/exceptions.py
from fastapi import Request
from fastapi.responses import JSONResponse

class AppException(Exception):
    def __init__(self, code: int, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "data": None}
    )
```

```python
# server/app/middleware.py
import time
import logging
from fastapi import Request

logger = logging.getLogger(__name__)

async def request_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    logger.info(f"{request.method} {request.url.path} {response.status_code} {duration:.3f}s")
    return response
```

- [ ] **Step 2: 更新 main.py 注册中间件和路由**

```python
# server/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.exceptions import AppException, app_exception_handler
from app.middleware import request_logging_middleware

app = FastAPI(title="AI-PM API", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(request_logging_middleware)
app.add_exception_handler(AppException, app_exception_handler)

@app.get("/api/health")
def health():
    return {"code": 0, "message": "ok", "data": {"status": "ok"}}
```

- [ ] **Step 3: 补全配置**

```python
# server/app/config.py (追加)
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 数据库
    database_url: str = "mysql+asyncmy://root@localhost:3306/ai_pm"
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration: int = 86400  # 24 hours in seconds
    # LDAP
    ldap_enabled: bool = False
    ldap_url: str = "ldap://localhost:389"
    ldap_base_dn: str = "dc=example,dc=com"
    # 企微
    wecom_corp_id: str = ""
    wecom_agent_id: str = ""
    wecom_secret: str = ""
    # Git
    git_repos_path: str = "/data/ai-pm/repos"
    # 密码策略
    password_min_length: int = 8

    model_config = {"env_prefix": "AI_PM_", "env_file": ".env"}

settings = Settings()
```

---

### Task 0.2: 初始化前端 Monorepo

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Update: `package.json` — 确认 Turborepo 配置

- [ ] **Step 1: 创建 apps/web/package.json**

```json
{
  "name": "@ai-pm/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "antd": "^5.17.0",
    "@ant-design/icons": "^5.3.0",
    "zustand": "^4.5.0",
    "axios": "^1.7.0",
    "dayjs": "^1.11.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
```

- [ ] **Step 3: 创建目录结构和入口文件**

```
apps/web/src/
├── main.tsx
├── App.tsx
├── api/
│   └── client.ts          # Axios 实例，含 401 拦截器
├── components/
│   └── Layout/
│       └── AppLayout.tsx   # 全局布局
├── pages/
│   ├── login/
│   │   └── LoginPage.tsx
│   ├── dashboard/
│   │   └── DashboardPage.tsx
│   ├── workspace-list/
│   │   └── WorkspaceListPage.tsx
│   ├── workspace-detail/
│   │   └── WorkspaceDetailPage.tsx
│   ├── personal/
│   │   └── PersonalCenterPage.tsx
│   └── placeholder/        # 未实现页面占位
│       └── PlaceholderPage.tsx
├── stores/
│   └── authStore.ts        # Zustand 认证状态
├── hooks/
│   └── usePermission.ts    # 权限检查 Hook
└── types/
    └── index.ts            # 共享类型定义
```

- [ ] **Step 4: 创建 Axios 客户端**

```typescript
// apps/web/src/api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body.code !== 0) return Promise.reject(new Error(body.message));
    return body.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

### Task 0.3: 数据库 Schema 初始化

**Files:**
- Create: `server/app/models/` — 8 个模型文件
- Create: `server/app/models/base.py` — 共享基础类
- Run: `alembic revision --autogenerate -m "init_schema"`
- Create: `server/alembic/versions/seed_roles.py` — 播种角色数据

- [ ] **Step 1: 创建 ORM 基础混入类**

```python
# server/app/models/base.py
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

class UUIDMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
```

- [ ] **Step 2: 实现 Foundation 阶段 ORM 模型**

Foundation 阶段仅建以下 6 张核心表（认证 + 用户 + 角色 + 工作空间），后续 Phase 各自建表：

| 模型文件 | 表名 | 核心字段 |
|---------|------|---------|
| `department.py` | `departments` | id, name, parent_id(FK), path, sort_order |
| `user.py` | `users` | id, username, email, hashed_password, display_name, avatar_url, department_id(FK), status(ACTIVE/DISABLED), source(LOCAL/LDAP/WECOM) |
| `role.py` | `roles` | id, code, name, level(SYSTEM/WORKSPACE), data_scope, permissions(JSON), description |
| `user_role.py` | `user_roles` | id, user_id(FK), role_id(FK), workspace_id(FK nullable, null=系统级角色) |
| `workspace.py` | `workspaces` | id, name, key, description, type(PROJECT/OPERATION/OTHER), status(ACTIVE/ARCHIVED), visibility(PRIVATE/DEPARTMENT/PUBLIC), department_id(FK), template_id, git_repo_path |
| `workspace_member.py` | `workspace_members` | id, workspace_id(FK), user_id(FK nullable, null=AI Agent), ai_agent_id(FK nullable), role(OWNER/MANAGER/MEMBER/VIEWER/AI_AGENT) |

**后续 Phase 建表：**
- Plan 2：tasks, task_dependencies, iterations, comments, documents, requirement_inbox
- Plan 3：ai_agents, agent_executions, model_configs, project_memories, prompt_templates
- Plan 4：meeting_cache, notification_preferences, webhook_subscriptions, automation_rules, audit_logs, notifications

- [ ] **Step 3: 生成初始迁移**

```bash
cd server
alembic revision --autogenerate -m "init_schema"
alembic upgrade head
```

- [ ] **Step 4: 播种初始数据**

```python
# server/alembic/versions/xxxx_seed_data.py
# 播种 4 个系统角色

roles_data = [
    {"code": "SUPER_ADMIN", "name": "超级管理员", "level": "SYSTEM", "data_scope": "ALL"},
    {"code": "ADMIN", "name": "部门管理员", "level": "SYSTEM", "data_scope": "DEPARTMENT"},
    {"code": "MEMBER", "name": "普通成员", "level": "SYSTEM", "data_scope": "SELF"},
    {"code": "EXTERNAL", "name": "外部访客", "level": "SYSTEM", "data_scope": "SELF"},
]

# AI Agent 预设数据延后至 Plan 3 阶段播种
```
```

---

## Phase 1: 认证体系

### Task 1.1: 安全模块（JWT + 密码哈希）

**Files:**
- Create: `server/app/security.py`
- Create: `server/app/deps.py`

- [ ] **Step 1: 实现 JWT 和密码工具**

```python
# server/app/security.py
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_expiration)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except JWTError:
        return None
```

- [ ] **Step 2: 实现 get_current_user 依赖注入**

```python
# server/app/deps.py
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.security import decode_access_token
from app.exceptions import AppException

async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> "User":
    if not authorization.startswith("Bearer "):
        raise AppException(401, "Invalid authorization header", 401)
    token = authorization[7:]
    user_id = decode_access_token(token)
    if user_id is None:
        raise AppException(401, "Invalid or expired token", 401)
    user = await db.get(User, user_id)
    if user is None or user.status != "ACTIVE":
        raise AppException(401, "User not found or disabled", 401)
    return user
```

---

### Task 1.2: 认证 API

**Files:**
- Create: `server/app/schemas/auth.py`
- Create: `server/app/services/auth.py`
- Create: `server/app/routers/auth.py`

- [ ] **Step 1: 定义 Pydantic Schema**

```python
# server/app/schemas/auth.py
from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    username: str
    password: str

class LdapLoginRequest(BaseModel):
    username: str
    password: str
    domain: str = ""

class WecomLoginRequest(BaseModel):
    code: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserInfo"

class UserInfo(BaseModel):
    id: str
    username: str
    display_name: str
    email: str | None
    avatar_url: str | None
    department_name: str | None
    system_role: str
```

- [ ] **Step 2: 实现认证服务**

```python
# server/app/services/auth.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.security import verify_password, create_access_token
from app.exceptions import AppException

async def login_local(db: AsyncSession, username: str, password: str):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.hashed_password):
        raise AppException(400, "用户名或密码错误")
    if user.status == "DISABLED":
        raise AppException(403, "账户已被禁用")
    return user

async def login_ldap(db: AsyncSession, username: str, password: str, domain: str):
    # TODO: LDAP 集成在 Task 1.3
    raise AppException(501, "LDAP 登录暂未实现")

async def login_wecom(db: AsyncSession, code: str):
    # TODO: 企微 OAuth 集成在 Task 1.4
    raise AppException(501, "企业微信登录暂未实现")
```

- [ ] **Step 3: 实现认证路由**

```python
# server/app/routers/auth.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, UserInfo
from app.services import auth as auth_service
from app.security import create_access_token
from app.config import settings
from app.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.login_local(db, req.username, req.password)
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expiration,
        user=UserInfo(
            id=user.id, username=user.username, display_name=user.display_name,
            email=user.email, avatar_url=user.avatar_url,
            department_name=None, system_role=user.system_role,
        )
    )

@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return UserInfo(...)

@router.post("/refresh")
async def refresh(user: User = Depends(get_current_user)):
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "expires_in": settings.jwt_expiration}

@router.post("/logout")
async def logout(user: User = Depends(get_current_user)):
    # 可选：将 token 加入 Redis 黑名单
    return {"code": 0, "message": "ok"}
```

---

### Task 1.3: LDAP 认证集成

**Files:**
- Create: `server/app/integrations/__init__.py`
- Create: `server/app/integrations/ldap.py`

```python
# server/app/integrations/ldap.py
import ldap3  # 需要添加到 pyproject.toml 依赖
from app.config import settings
from app.models.user import User

async def ldap_authenticate(username: str, password: str) -> dict | None:
    """LDAP 认证，成功返回用户属性，失败返回 None"""
    if not settings.ldap_enabled:
        return None
    server = ldap3.Server(settings.ldap_url)
    user_dn = f"uid={username},{settings.ldap_base_dn}"
    conn = ldap3.Connection(server, user_dn, password)
    try:
        if conn.bind():
            conn.search(settings.ldap_base_dn, f"(uid={username})",
                        attributes=["cn", "mail", "departmentNumber"])
            entry = conn.entries[0] if conn.entries else None
            conn.unbind()
            if entry:
                return {
                    "display_name": str(entry.cn),
                    "email": str(entry.mail) if entry.mail else None,
                    "department": str(entry.departmentNumber) if entry.departmentNumber else None,
                }
        return None
    except Exception:
        return None

async def sync_ldap_user(db, username: str, ldap_attrs: dict) -> User:
    """LDAP 用户自动创建或更新本地用户记录"""
    ...
```

---

### Task 1.4: 企业微信 OAuth 集成

**Files:**
- Create: `server/app/integrations/wecom.py`

```python
# server/app/integrations/wecom.py
import httpx
from app.config import settings

async def wecom_get_access_token() -> str:
    """获取企业微信 access_token"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken",
            params={"corpid": settings.wecom_corp_id, "corpsecret": settings.wecom_secret}
        )
        data = resp.json()
        if data.get("errcode") != 0:
            raise Exception(f"WeChat Work API error: {data.get('errmsg')}")
        return data["access_token"]

async def wecom_get_user_info(code: str) -> dict:
    """通过 OAuth code 获取企微用户信息"""
    token = await wecom_get_access_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo",
            params={"access_token": token, "code": code}
        )
        return resp.json()
```

---

### Task 1.5: 登录页（前端）

- [ ] 构建 3 个登录 Tab：密码登录 / LDAP 登录 / 企业微信扫码
- [ ] 实现 Zustand authStore：token + currentUser + login/logout actions
- [ ] 登录成功跳转工作台，401 跳转登录页

---

## Phase 2: 用户管理 + RBAC

### Task 2.1: 用户 CRUD API

**Files:**
- Create: `server/app/schemas/user.py`
- Create: `server/app/services/user.py`
- Create: `server/app/routers/users.py`

- [ ] 实现用户的增删改查（字段：用户名、邮箱、显示名、部门、状态、来源）
- [ ] 列表接口支持分页、按部门筛选、按状态筛选
- [ ] 所有查询通过 `data_scope` 过滤

### Task 2.2: 3 级 RBAC 依赖链

**Files:**
- Create: `server/app/services/permission.py`

核心实现：

```python
# server/app/services/permission.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.deps import get_current_user
from app.models.user_role import UserRole
from app.models.workspace_member import WorkspaceMember
from app.exceptions import AppException

class PermissionChecker:
    """3 级权限检查器：系统角色 → 工作空间角色 → 数据范围"""

    def __init__(self, user, db: AsyncSession):
        self.user = user
        self.db = db

    async def require_system_role(self, *roles: str):
        """要求用户具有指定的系统角色之一"""
        if self.user.system_role not in roles:
            raise AppException(403, "无权访问此功能")

    async def require_workspace_role(self, workspace_id: str, *roles: str):
        """要求用户在指定工作空间中具有指定角色之一"""
        member = await self._get_workspace_member(workspace_id)
        if member is None:
            raise AppException(403, "不是该工作空间的成员")
        if member.role not in roles and not self._is_super_admin():
            raise AppException(403, "无权执行此操作")

    async def with_data_scope(self, query, workspace_id: str = None):
        """对查询应用数据范围过滤"""
        scope = self.user.data_scope
        if scope == "ALL":
            return query
        elif scope == "DEPARTMENT":
            return query.where(Model.department_id == self.user.department_id)
        elif scope == "SELF":
            return query.where(Model.created_by == self.user.id)
        return query

    def _is_super_admin(self):
        return self.user.system_role == "SUPER_ADMIN"

async def get_permission_checker(
    user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionChecker:
    return PermissionChecker(user, db)
```

### Task 2.3: 前端权限组件和路由守卫

**Files:**
- Create: `apps/web/src/components/Can.tsx`
- Create: `apps/web/src/hooks/usePermission.ts`

```tsx
// apps/web/src/components/Can.tsx
interface CanProps {
  workspaceRole?: ('OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER')[];
  systemRole?: ('SUPER_ADMIN' | 'ADMIN' | 'MEMBER')[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ workspaceRole, systemRole, children, fallback = null }: CanProps) {
  const { user, workspaceMember } = usePermission();
  if (systemRole && !systemRole.includes(user?.systemRole)) return fallback;
  if (workspaceRole && !workspaceRole.includes(workspaceMember?.role)) return fallback;
  return children;
}
```

---

## Phase 3: 工作空间 + 成员管理

### Task 3.1: 工作空间 CRUD API

**Files:**
- Create: `server/app/schemas/workspace.py`
- Create: `server/app/services/workspace.py`
- Create: `server/app/routers/workspaces.py`

端点设计：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workspaces` | 创建工作空间（自动设置创建者为 Owner） |
| GET | `/api/workspaces` | 列表（data_scope 过滤，分页） |
| GET | `/api/workspaces/{id}` | 详情 |
| PATCH | `/api/workspaces/{id}` | 更新（需 Manager+） |
| POST | `/api/workspaces/{id}/archive` | 归档（需 Owner） |
| POST | `/api/workspaces/from-template` | 从模板创建 |

### Task 3.2: 工作空间成员管理 API

**Files:**
- Extend: `server/app/routers/workspaces.py`

端点设计：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workspaces/{id}/members` | 成员列表 |
| POST | `/api/workspaces/{id}/members` | 添加成员（需 Manager+） |
| PATCH | `/api/workspaces/{id}/members/{mid}` | 修改成员角色（需 Owner） |
| DELETE | `/api/workspaces/{id}/members/{mid}` | 移除成员（需 Manager+） |

### Task 3.3: 工作空间列表页（前端）

- [ ] 网格卡片布局，封裝 `WorkspaceCard` 组件
- [ ] 搜索栏：关键词 + 类型筛选 + 状态筛选
- [ ] 创建按钮：下拉选择「空白创建」「从模板创建」「AI 对话创建(占位)」
- [ ] Zustand workspaceListStore

### Task 3.4: 工作空间详情页（前端壳 + 2 Tab）

- [ ] 7 Tab 导航壳：概览 / 任务 / 知识 / 分析 / 自动化 / 成员 / AI Agent
- [ ] 概览 Tab：基本信息（名称、描述、类型、状态、创建时间）+ 快捷操作
- [ ] 成员 Tab：成员网格，区分人类（Owner/Manager/Member）和 AI Agent（模型标注）
- [ ] 其余 5 个 Tab 显示占位内容

### Task 3.5: 工作台（基础）+ 个人中心（基础）+ 全局布局

**Files:**
- Create: `apps/web/src/pages/dashboard/DashboardPage.tsx`
- Create: `apps/web/src/pages/personal/PersonalCenterPage.tsx`
- Create: `apps/web/src/components/Layout/AppLayout.tsx`

- [ ] **工作台基础：** 4 个统计卡片（静态数值）+ 占位 Section（待决策清单/AI 日报/项目关注）
- [ ] **个人中心基础：** 个人信息表单（查看/编辑）+ 待办/Review/消息 Tab 空状态
- [ ] **全局布局：** 侧边栏导航 + 顶栏面包屑 + 用户下拉菜单 + `<Can>` 控制菜单可见性

---

## 验证清单

- [ ] 用不同角色用户登录，验证系统角色限制（Admin 可见用户管理，Member 不可见）
- [ ] 普通用户创建工作空间后验证自动成为 Owner
- [ ] 邀请 Member 角色用户，验证 Member 不能归档/删除工作空间
- [ ] 邀请 Viewer 角色用户，验证 Viewer 不能创建/编辑任务
- [ ] 验证权限矩阵的所有组合（pytest 参数化测试）
- [ ] 前端：未登录访问 /dashboard 自动跳转 /login
- [ ] 前端：Member 用户看不到系统管理菜单

**预计总工时：5 周（25 个工作日）**
