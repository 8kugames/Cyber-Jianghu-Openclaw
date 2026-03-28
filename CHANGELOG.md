# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-03-28

### ⚠️ BREAKING CHANGES

- **插件架构完全重写** — 旧模块全部删除，从 6 个工具/插件目录简化为 `register.ts` 单入口
  - 删除 `tools/cyber_jianghu_act/`（7 文件：enforcement、retry-handler、ws-client 等）
  - 删除 `tools/cyber_jianghu_config/`
  - 删除 `tools/cyber_jianghu_report/`（6 文件：aggregator、event_queue、storage、webhook 等）
  - 删除 `tools/cyber_jianghu_review/`（3 文件）
  - 删除 `plugins/memory/`
- **Hook 目录重命名** — `hooks/cyber-jianghu-openclaw-bootstrap/` → `hooks/bootstrap/`
- **配置 schema 不兼容** — `openclaw.plugin.json` configSchema 变更：
  - 删除 `report`（嵌套对象）
  - 新增 `reportChannel`、`reportDelivery`、`reportWebhookUrl`（扁平化）
- **工具注册方式变更** — 旧版工具通过独立模块注册，新版在 `register.ts` 内联注册
- **Agent 运行模式必须为 `claw`** — 旧版无模式概念；新版默认 `cognitive`（无 WebSocket），OpenClaw 集成必须显式设置 `CYBER_JIANGHU_RUNTIME_MODE=claw`
- **环境变量名变更** — 旧版 `GAME_SERVER_URL` → 新版 `CYBER_JIANGHU_SERVER_WS_URL` + `CYBER_JIANGHU_SERVER_HTTP_URL`
- **配置文件路径变更** — `~/.cyber-jianghu/agent.yaml` → `~/.cyber-jianghu/config/agent.yaml`

### Deleted

- `observer-agent.json5`、`templates/observer-agent.json5`（Observer Agent 配置，已不属于本插件范围）
- `docker-compose.dual.yml`（双 Agent Docker 拓扑，已由 DEPLOYMENT.md 场景覆盖）
- `scripts/sync-version.js`、`scripts/version-check.js`（版本同步脚本，CI 已内置）
- `templates/.env.example` 中 `DOCKER_AGENT_HOST` → 由 OpenClaw 框架传入

### Added

- `register.ts` — 单入口插件注册：WebSocket 客户端 + act/dream 工具 + 日报生成
- `tools/act/ws-client.ts` — 重写 WebSocket 客户端：心跳、重连、全协议消息处理
- `tools/act/http-client.ts` — 简化 HTTP 客户端：端口自动发现 23340-23349
- `tools/act/types.ts` — 共享 TypeScript 类型，匹配 Rust WS 协议
- `plugins/reporter/` — 日报生成器：游戏日边界检测 + 武侠叙事报告
- `hooks/bootstrap/` — 角色注册引导：交互式向导 / 环境变量 / 插件配置
- `SKILL.md` — LLM 角色行为指南（武林江湖自主决策准则）
- `DEPLOYMENT.md` — Agent 部署指南（Docker / systemd / launchd）
- `tests/report-builder.test.ts` — 日报生成器单元测试（16 cases）

### Changed

- 工具名称保持不变：`cyber_jianghu_act`、`cyber_jianghu_dream`
- 版本从 `0.2.0` 升级到 `0.3.0`
- CI 增加 `npm run lint`（oxlint）
- 健康检查响应增加 `agent_id`、`tick_id` 字段

---

## [0.2.0] — 2026-03-19

### Added

- 初版 WebSocket 客户端连接游戏服务器
- `cyber_jianghu_act` 工具 — 提交游戏动作
- `cyber_jianghu_report` 工具 — 事件聚合和日报
- `cyber_jianghu_review` 工具 — 观察者审查
- `cyber_jianghu_config` 工具 — 配置管理
- 记忆系统插件 (`plugins/memory/`)
- Docker 双 Agent 部署模板
- 版本同步和检查脚本

---

## [0.1.0] — 2026-03-12

### Added

- 项目初始化
- OpenClaw 插件基础结构
- HTTP 客户端连接 Agent API
