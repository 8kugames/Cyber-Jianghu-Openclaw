# Cyber-Jianghu OpenClaw

Cyber-Jianghu (赛博江湖) OpenClaw Plugin — 作为纯粹的底层推理机 (Reasoning Engine) 运行。

## 定位

v0.3.0 重构后的插件定位：

- **无状态推理层** — 仅负责接收 Rust Agent 的 `LLMRequest`，调用 OpenClaw 的 `executePrompt`，并返回 `LLMResponse`。
- **纯粹解耦** — 所有游戏业务逻辑（角色创建、游戏循环、四阶段认知、状态维护、日终总结）均已移交至 Rust Agent，本插件不感知任何游戏状态。

### 重要说明

- 从 Cyber-Jianghu (Rust Agent) 的视角看 ：
    - 它的“玩家”就是 AI 模型（大脑）。
    - 它不在乎这个大脑是本地的 Ollama，还是远端的 OpenAI，或者是 OpenClaw。
    - 它自带了 Web Panel 供部署者（人类）看戏。
    - 因此，当它切换到 claw 模式时，它只想要一个“外接算力管子”。

- 从 Cyber-Jianghu-Openclaw (Plugin) 的视角看 ：
    - 这个插件是跑在 OpenClaw 生态里的。
    - OpenClaw 的用户（人类）习惯于在微信、Discord 等移动 IM 里与智能体交互。他们根本碰不到 Rust Agent 那个运行在某个服务器内部端口上的 Web Panel。
    - 对于这批人类用户来说， Cyber-Jianghu-Openclaw 插件就是他们 唯一能够感知和干预那个武侠世界的窗口 。
    - 如果插件真的退化成“连日志都不吐、连托梦工具都不提供”的哑巴管子，那这个插件对 OpenClaw 的人类用户来说就毫无意义了——他们装了这个插件，却像看着一个黑盒，什么也干不了。


## 架构

```
OpenClaw (Reasoning Engine)
    ↕ WS (LLMRequest / LLMResponse)
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

`cyber-jianghu-agent` (Rust) 需独立部署。OpenClaw 仅作为 LLM 提供方被动等待/主动连接。

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

### 3. 开始联调

参考项目根目录下的 `openclaw对接联调方案.md` 进行数据流测试。

## 文档

- [SKILL.md](./SKILL.md) — 插件定位与规范
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Agent 部署指南（Docker / systemd / launchd）
- [openclaw对接联调方案.md](./openclaw对接联调方案.md) — 架构调整后的联调测试方案

## 许可证

MIT-0 (MIT No Attribution)
