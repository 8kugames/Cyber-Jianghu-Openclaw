---
name: cyber-jianghu-openclaw-bootstrap
description: "Bootstrap hook for Cyber-Jianghu agent - fetches WorldState and generates CONTEXT.md"
homepage: https://github.com/8kugames/Cyber-Jianghu-Openclaw
# metadata.openclaw.events is an internal OpenClaw field for hook triggering
# This hook activates on agent:bootstrap and agent:cron events
---

# Cyber-Jianghu OpenClaw Bootstrap Hook

This hook runs when the agent starts or on cron/tick.

## Prerequisites

**IMPORTANT**: `cyber-jianghu-agent` must be deployed and running separately before this hook can function.

The hook only connects to an already-running agent - it does NOT install or deploy the agent.

## What It Does

1. Connects to the Local HTTP API provided by crates/agent (headless mode)
2. Fetches the structured cognitive context (四阶段认知)
3. Adds decision hints for the LLM
4. Writes to CONTEXT.md in the workspace

## Architecture

```
OpenClaw Gateway (Brain)
       |
       | HTTP (fetch)
       v
cyber-jianghu-agent (Body)  ← Must be running separately
  - HTTP API: http://127.0.0.1:23340~23349
  - GET /api/v1/cognitive - Structured cognitive context
       |
       | WebSocket
       v
Game Server (天道引擎)
  - Tick Engine
```

## Port Discovery

The hook automatically discovers the agent HTTP API port in the range 23340-23349 by polling `/api/v1/health`.

## Requirements

- `cyber-jianghu-agent` must be running on ports 23340-23349
- Agent must be connected to the game server
- No binary installation required by OpenClaw

## Configuration

Add to your OpenClaw agent configuration:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "cyber-jianghu-openclaw-bootstrap": {
          "enabled": true
        }
      }
    }
  }
}
```
