# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`ai-pm` — AI-native project management platform. Currently in **prototyping/planning phase** (no production code yet).

**Tech Stack (decided):** React frontend + Python FastAPI backend + MySQL 8 + Redis + local LLM (DeepSeek/Qwen) + LDAP + WeChat Work. Private deployment.

## Commands

```bash
# Preview prototypes locally
node scripts/serve-prototypes.js    # Serves prototypes/ on port 3456
# Or via .claude/launch.json → preview_start("prototype")
```

## Key Files

```
docs/superpowers/
  specs/2026-05-01-ai-pm-platform-design.md    # Product design doc (the source of truth)
  plans/2026-05-01-foundation-plan.md           # Phase 0-2 implementation plan

prototypes/
  index.html  # All 8 pages high-fidelity prototype (sole prototype, default entry)
```
## 语言要求
所有对话都以中文返回

## Architecture (planned)

- **Frontend:** React SPA, 6 pages: 工作台 / 工作空间 / 会议大屏 / AI对话 / 个人中心 / 系统管理
- **Backend:** FastAPI modular monolith (10 services, JWT auth) + Hermes Agent (AI agent runtime)
- **DB:** MySQL for core data, Git (GitPython) for knowledge base versioning
- **AI:** 4 Agent roles — 需求分析师 / 设计师 / 开发工程师 / 项目经理 — assigned tasks like human members
- **Project skeleton:** pnpm monorepo (Turborepo), Node.js >= 20, pnpm 9.15.0

## Status

- Product design & high-fidelity prototypes completed
- Phase 0-2 implementation: scaffolding, auth, workspace, task system, kanban — in active development
- R&D workflow: 6-phase SDLC (BACKLOG→PLAN→DESIGN→DEVELOPMENT→TESTING→RELEASE)
- Plans 2-4 (KB, AI Engine, Collaboration) deferred
- React frontend + FastAPI backend + SQLite (dev) / MySQL (prod)
