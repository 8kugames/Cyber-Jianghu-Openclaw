# Cyber-Jianghu OpenClaw

Cyber-Jianghu (赛博江湖) OpenClaw Plugin — 兼具“底层推理机”与“用户交互窗口”的**双面人 (Dual-Faced)** 插件。

## 定位与视角

在 v0.3.0 的架构重构中，我们明确了 `Cyber-Jianghu` (Rust Agent) 与 `Cyber-Jianghu-Openclaw` (Plugin) 的不同视角与边界：

### 1. 面向底层的“纯粹算力管子”

从 **Cyber-Jianghu (Rust Agent)** 的视角看：

- 它的“玩家”是 AI 模型（大脑）。
- 无论大脑是本地的 Ollama 还是远端的 OpenClaw，Agent 只负责游戏世界的业务逻辑（四阶段认知、意图解析、状态维护）。
- 当 Agent 切换到 `claw` 模式时，本插件作为**无状态推理层**，仅负责接收 `LLMRequest`，调用大模型，并返回 `LLMResponse`。插件**不干涉**任何游戏核心逻辑。

### 2. 面向顶层的“唯一交互窗口”

从 **OpenClaw 用户** 的视角看：

- OpenClaw 的人类用户通常通过微信、Discord 等移动 IM 与智能体交互，他们无法直接访问 Rust Agent 隐藏在服务器内部的 Web Panel。
- 对于这些用户来说，本插件是他们**唯一能够感知和干预那个武侠世界的窗口**。
- 因此，插件提供了向导技能（SKILL）、状态查询（`cyber_jianghu_status`）、神谕托梦（`cyber_jianghu_dream`）以及轻量级的日终报告推送机制，确保用户在 IM 侧拥有沉浸式的游戏体验。

## 架构

```
User (IM Channel: 微信/Discord)
    ↕ 状态问询 / 托梦指令 / 日终报告
OpenClaw (Gateway + Plugin)
    ↕ WS (LLMRequest / LLMResponse / Tick)
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

`cyber-jianghu-agent` (Rust) 需独立部署。详细部署指南参见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

> **⚠️ 游戏服务器地址**：`CYBER_JIANGHU_SERVER_WS_URL` / `CYBER_JIANGHU_SERVER_HTTP_URL`。如无自建服务器，可用天道引擎测试服务器 `ws://47.102.120.116:23333` 进行预览（**测试资源，勿用于生产**）。

## 快速开始

### 1. 以 Claw 模式启动 Agent（必须）

```bash
# 二进制部署
cyber-jianghu-agent run --mode claw --port 23340

# Docker 部署（参见 DEPLOYMENT.md）
```

> 必须使用 `--mode claw`（或 `CYBER_JIANGHU_RUNTIME_MODE=claw`）。`cognitive` 模式不会开启 OpenClaw 所需的 WS 控制链路。

### 2. 启用插件

```bash
openclaw plugins enable cyber-jianghu-openclaw
```

### 3. 开始交互与联调

在 OpenClaw 的终端或连接的 IM 中，你可以：

- 询问：“我现在在哪？情况如何？”（触发状态查询）
- 下达指令：“让他赶紧去客栈休息”（触发托梦干预）

> 开发者请参考项目根目录下的 [openclaw对接联调方案.md](./openclaw对接联调方案.md) 进行完整的数据流测试。

## 核心交互能力 (Tools)

| 工具                     | 描述                                           |
| ---------------------- | -------------------------------------------- |
| `cyber_jianghu_status` | 读取插件缓存的最新 Tick 状态，供模型以“江湖向导”身份向用户解说当前局势。     |
| `cyber_jianghu_dream`  | 将用户的指令转化为“梦境”，通过 HTTP 注入底层 Agent，实现对角色行为的干预。 |

## 文档

- [SKILL.md](./SKILL.md) — 设定大模型作为“江湖向导”的系统提示词
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Agent 部署指南（Docker / systemd / launchd）

## 许可证

MIT-0 (MIT No Attribution)
