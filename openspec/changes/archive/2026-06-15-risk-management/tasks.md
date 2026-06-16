## 1. 后端 — Risk 数据模型

- [x] 1.1 创建 `server/app/models/risk.py`：Risk 模型（Base, UUIDMixin, TimestampMixin）
- [x] 1.2 在 `server/app/models/__init__.py` 中导出 Risk 模型
- [x] 1.3 在 Alembic 中创建 risks 表迁移或更新 seed.py 的 DDL

## 2. 后端 — Risk Schema

- [x] 2.1 创建 `server/app/schemas/risk.py`：RiskCreate / RiskUpdate / RiskResponse / RiskListParams

## 3. 后端 — Risk Service

- [x] 3.1 创建 `server/app/services/risk.py`：create_risk / get_risk / list_risks / update_risk / close_risk

## 4. 后端 — Risk API

- [x] 4.1 创建 `server/app/routers/risks.py`：REST 端点（GET/POST/PUT/PATCH 关闭）
- [x] 4.2 在 `server/app/main.py` 中注册 risks 路由

## 5. 前端 — 类型 & Store

- [x] 5.1 在 `apps/web/src/types/index.ts` 中新增 Risk 接口类型
- [x] 5.2 创建 `apps/web/src/stores/riskStore.ts`：Zustand store（列表/筛选/创建/编辑/关闭）
- [x] 5.3 在 riskStore 中实现 API 调用（遵循项目现有模式，通过 api/client 直接调用）

## 6. 前端 — UI 组件

- [x] 6.1 创建 `RiskPanel.tsx`：风险列表表格（列：标题/类型/可能性/影响/状态/里程碑/负责人/操作）
- [x] 6.2 创建风险表单弹窗（内嵌在 RiskPanel 中：标题/描述/类型/可能性/影响/关联里程碑/应对措施/负责人）
- [x] 6.3 实现风险筛选栏（状态/类型/里程碑下拉筛选）

## 7. 前端 — 集成

- [x] 7.1 在工作空间详情页添加「风险管理」Tab，嵌入 RiskPanel
- [x] 7.2 在风险列表操作列中实现「开始应对」和「关闭风险」按钮
