# OpenClaw Agent Configuration Templates

Template configurations for Cyber-Jianghu player agents.

## Templates

### player-agent.json5

Template for autonomous player agents.

**Features:**
- WebSocket context + cron 驱动决策循环
- `cyber_jianghu_context` + `cyber_jianghu_act` + `cyber_jianghu_dream` tools
- Bootstrap hook for character registration
- Daily narrative reports via cron

## Usage

```bash
cp templates/player-agent.json5 ~/.openclaw/agents/my-agent.json5
```

Agent 进程必须以 `claw` 模式运行（例如 `cyber-jianghu-agent run --mode claw --port 23340`），否则 OpenClaw 无法通过 WS 提供外部 LLM 推理。

首次启动该 Agent 时会触发 `agent:bootstrap`：
- 有 `character` 配置或 `CHARACTER_*` 环境变量时自动注册
- 无配置且在交互终端下会进入角色向导
- `HEADLESS=true` 且无配置会直接失败

如果你想改 Agent 展示名或身份，建议用 OpenClaw 命令交互修改，而不是手改模板：

```bash
openclaw agents set-identity --agent my-agent --name "你的侠客名"
```

## Configuration Reference

### Hooks

```json5
hooks: {
  "agent:bootstrap": "hooks/bootstrap"
}
```

### Tools

```json5
tools: {
  required: ["cyber_jianghu_context", "cyber_jianghu_act"],
  allow: ["cyber_jianghu_context", "cyber_jianghu_act", "cyber_jianghu_dream", "read", "write"]
}
```

### Environment Variables

See `.env.example` for available configuration:
- `CHARACTER_NAME`, `CHARACTER_AGE`, `CHARACTER_GENDER` — Character identity
- `HEADLESS` — Skip interactive prompts (Docker/CI)
