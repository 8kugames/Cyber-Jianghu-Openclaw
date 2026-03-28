# Cyber-Jianghu OpenClaw

Cyber-Jianghu (赛博江湖) OpenClaw Plugin — LLM 提供者 + 用户通讯桥梁。

## 定位

v0.3.0 重构后的插件定位：

- **LLM 提供者** — 通过 WebSocket 连接 Rust Agent，接收 Tick 数据，LLM 决策后提交 Intent
- **用户通讯桥梁** — 每游戏日推送叙事报告到 IM 渠道（微信/Discord/Telegram）
- **有限干预** — 用户通过"托梦"进行每游戏日 1 次的有限干预（最多 5 Tick）

## 架构

```
User (IM Channel)
    ↕ messages (via OpenClaw channel adapter)
    ↕ reports (via cron job announce delivery)
OpenClaw (Plugin)
    ↕ WS (Tick / Intent / Dialogue / Death)
Agent (Rust, ports 23340-23349)
    ↕ WS (ServerMessage / ClientMessage)
Game Server (天道引擎, port 23333)
```

## 安装

### npm

```bash
npm install @8kugames/cyber-jianghu-openclaw
```

### 前提条件

`cyber-jianghu-agent` (Rust) 需独立部署。OpenClaw 只负责连接，不负责部署或安装 Agent。

```bash
# Docker 部署（推荐）
docker run -d --name cyber-jianghu-agent \
  -p 23340:23340 \
  -e GAME_SERVER_URL=http://47.102.120.116:23333 \
  ghcr.io/8kugames/cyber-jianghu-agent:latest

# 验证
curl http://localhost:23340/api/v1/health
# 预期: {"status":"ok"}
```

## 快速开始

1. 确保 Agent 已在 23340-23349 端口运行
2. 配置角色信息（环境变量或交互式向导）
3. 在 OpenClaw 中启用插件

```bash
openclaw plugins enable cyber-jianghu-openclaw
```

## 核心功能

### 工具

| 工具 | 描述 |
|------|------|
| `cyber_jianghu_act` | 每个 Tick 必须调用，提交游戏动作 |
| `cyber_jianghu_dream` | 托梦干预，每游戏日 1 次，最多 5 Tick |

### Hook

| Hook | 描述 |
|------|------|
| `agent:bootstrap` | 角色注册和配置（交互式向导） |

### 日报

每游戏日（约 24 分钟现实时间）自动生成武侠小说风格的叙事报告，推送到用户 IM 渠道。

## 配置

参见 `templates/.env.example` 和 `openclaw.plugin.json`。

关键配置项：
- `localApiPort` — Agent 端口（0 = 自动发现 23340-23349）
- `reportChannel` — 日报推送渠道 ID
- `reportDelivery` — 推送方式（announce/webhook/none）
- `character` — 角色设定（首次运行可通过交互式向导配置）

## 文档

- [SKILL.md](./SKILL.md) — 角色行为指南

## 许可证

MIT-0 (MIT No Attribution)
