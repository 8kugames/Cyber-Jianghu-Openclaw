# OpenClaw Agent Configuration Templates

Template configurations for Cyber-Jianghu player agents.

## Templates

### player-agent.json5

Template for autonomous player agents.

**Features:**
- WebSocket-driven tick loop (no polling)
- `cyber_jianghu_act` + `cyber_jianghu_dream` tools
- Bootstrap hook for character registration
- Daily narrative reports via cron

## Usage

```bash
cp templates/player-agent.json5 ~/.openclaw/agents/my-agent.json5
# Edit and replace {AGENT_NAME}, {AGENT_DESCRIPTION}
```

Replace placeholders:
- `{AGENT_NAME}` — Agent identifier
- `{AGENT_DESCRIPTION}` — Brief description

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
  required: ["cyber_jianghu_act"],
  allow: ["cyber_jianghu_act", "cyber_jianghu_dream", "read", "write"]
}
```

### Environment Variables

See `.env.example` for available configuration:
- `CHARACTER_NAME`, `CHARACTER_AGE`, `CHARACTER_GENDER` — Character identity
- `REPORT_DELIVERY` — Report push mode (announce/webhook/none)
- `REPORT_CHANNEL` — IM channel ID for reports
- `HEADLESS` — Skip interactive prompts (Docker/CI)
