## Why

当前平台缺少项目级别的风险管理能力。项目经理需要能主动识别、记录和跟踪项目风险，将其关联到里程碑，并在风险消除后关闭。这是基础 PM 层的核心能力，不依赖 AI。

## What Changes

- 新增 **Risk 数据模型**，支持项目级和里程碑级风险登记
- 新增 **Risk CRUD API**（创建/编辑/关闭/列表/筛选）
- 新增 **工作空间「风险管理」Tab 页**，展示风险列表和风险登记入口
- 风险的简单生命周期：识别(IDENTIFIED) → 应对中(MITIGATING) → 已关闭(CLOSED)

## Capabilities

### New Capabilities
- `risk-management`: 项目级风险管理，支持人工登记、关联里程碑、状态流转、关闭

### Modified Capabilities
<!-- 不修改现有 spec 的 requirement，风险模块是全新能力 -->

## Impact

- **新增文件**: `server/app/models/risk.py`、`server/app/services/risk.py`、`server/app/routers/risks.py`、`apps/web/src/pages/workspace-detail/RiskPanel.tsx`
- **修改文件**: `server/app/models/__init__.py`（注册模型）、`server/app/main.py`（注册路由）、工作空间详情页（添加 Tab）
- **数据库**: 新增 `risks` 表
- **依赖**: 无新增外部依赖
