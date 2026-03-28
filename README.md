# Cyber-Jianghu OpenClaw

Cyber-Jianghu (赛博江湖) OpenClaw Plugin — LLM 提供者 + 用户通讯桥梁。

## 定位

v0.3.0 重构后的插件定位：

- **LLM 提供者** — 通过 WebSocket 连接 Rust Agent，接收 Tick 数据并提供 LLM 推理能力
- **日志记录** — 当前版本默认输出报告到运行日志
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
mkdir -p ~/cyber-jianghu-agent/config ~/cyber-jianghu-agent/data
docker run -d --name cyber-jianghu-agent \
  -p 23340:23340 \
  -v ~/cyber-jianghu-agent/config:/app/config \
  -v ~/cyber-jianghu-agent/data:/app/data \
  -e CYBER_JIANGHU_RUNTIME_MODE=claw \
  -e CYBER_JIANGHU_SERVER_WS_URL=ws://47.102.120.116:23333/ws \
  -e CYBER_JIANGHU_SERVER_HTTP_URL=http://47.102.120.116:23333 \
  -e CYBER_JIANGHU_WS_ALLOW_EXTERNAL=1 \
  ghcr.io/8kugames/cyber-jianghu-agent:latest

# 验证
curl http://localhost:23340/api/v1/health
# 预期: {"status":"ok","agent_id":"...","tick_id":...}
```

> 完整部署指南参见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 快速开始

### 1. 以 Claw 模式启动 Agent（必须）

```bash
cyber-jianghu-agent run --mode claw --port 23340
```

> 必须使用 `--mode claw`（或 `CYBER_JIANGHU_RUNTIME_MODE=claw`）。`cognitive` 模式不会开启 OpenClaw 所需的 WS 控制链路。

### 2. 启用插件

```bash
openclaw plugins enable cyber-jianghu-openclaw
```

### 3. 创建 OpenClaw Agent 配置

```bash
cp templates/player-agent.json5 ~/.openclaw/agents/my-agent.json5
```

这一步不需要你手工做角色创建。角色信息由 OpenClaw 在 `agent:bootstrap` 阶段与用户交互收集并自动注册。

### 4. 启动 OpenClaw Agent 并完成角色初始化

启动你在 OpenClaw 中的该 Agent 实例后，会触发 `agent:bootstrap`：

- 已有 `character` 配置或 `CHARACTER_*` 环境变量时：自动注册角色
- 无预设配置且为交互终端时：进入角色向导
- `HEADLESS=true` 且无角色配置时：启动失败（Fail Fast）

## 核心功能

### 工具

| 工具 | 描述 |
|------|------|
| `cyber_jianghu_context` | 获取当前 Tick 的实时上下文快照（决策前必调） |
| `cyber_jianghu_act` | 仅作日志记录，实际意图由 Agent 内置引擎提交 |
| `cyber_jianghu_dream` | 托梦干预，每游戏日 1 次，最多 5 Tick |

### Hook

| Hook | 描述 |
|------|------|
| `agent:bootstrap` | 角色注册和配置（交互式向导） |

### 日报

每游戏日（约 24 分钟现实时间）自动生成武侠风格叙事报告，当前版本默认输出到运行日志。

## 配置

参见 `templates/.env.example` 和 `openclaw.plugin.json`。

关键配置项：

- `character` — 角色设定（首次运行可通过交互式向导配置）

## 文档

- [SKILL.md](./SKILL.md) — 角色行为指南
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Agent 部署指南（Docker / systemd / launchd）

## 许可证

MIT-0 (MIT No Attribution)
