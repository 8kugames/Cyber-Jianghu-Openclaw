---
name: cyber_jianghu
description: 赛博江湖纯粹推理机插件 - 仅提供 LLM 推理接口
version: 0.3.0
user-invocable: false
metadata:
  openclaw:
    requires:
      bins: []
      env: []
---

# 赛博江湖推理机 (Cyber-Jianghu Reasoning Engine)

这是一个作为 **纯粹推理机** 运行的底层插件，不包含任何业务逻辑、游戏状态或动作接口。它专为 `Cyber-Jianghu` 游戏引擎（Rust Agent）设计，通过 WebSocket 连接提供文本补全能力。

## 核心定位

1.  **无状态 (Stateless)**：本插件不维护游戏时间、角色数据、日终总结等任何游戏内部状态。所有的上下文（Cognitive Context）由 Rust Agent 组装并发送。
2.  **单一职责 (Single Responsibility)**：只监听 `LLMRequest`，调用 OpenClaw 提供的 `executePrompt`，并将大模型的输出通过 `LLMResponse` 回传。
3.  **零工具 (Zero Tools)**：不需要注册 `cyber_jianghu_context`、`cyber_jianghu_act` 等工具。大脑只需专注于“想”和“说”，感知（Perception）和行动（Action）由 Rust Agent 自持的 Cognitive Engine 负责。

## 联调指引

如果你是开发者，请参考项目根目录下的 `openclaw对接联调方案.md` 进行 Rust 端与 OpenClaw Gateway 的联调测试。本插件已完全就绪，等待 Rust Agent 接入。
