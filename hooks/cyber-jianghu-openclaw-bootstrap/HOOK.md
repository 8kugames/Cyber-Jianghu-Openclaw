---
name: cyber-jianghu-openclaw-bootstrap
description: "Bootstrap hook for Cyber-Jianghu agent - fetches WorldState and generates CONTEXT.md"
homepage: https://github.com/8kugames/Cyber-Jianghu-Openclaw
metadata:
  { "openclaw": { "events": ["agent:bootstrap", "gateway:startup"] } }
---

# Cyber-Jianghu OpenClaw Bootstrap Hook

This hook runs when the OpenClaw gateway starts or when agent bootstrap occurs.

## Prerequisites

**IMPORTANT**: `cyber-jianghu-agent` must be deployed and running separately before this hook can function.

The hook only connects to an already-running agent - it does NOT install or deploy the agent.

## What It Does

1. Polls Agent HTTP API to detect tick changes
2. Fetches the structured cognitive context (四阶段认知)
3. Adds decision hints for the LLM
4. Writes to CONTEXT.md in the workspace

## Architecture

```
OpenClaw Gateway (Brain)
       |
       | WebSocket (tick updates, intent submission)
       v
cyber-jianghu-agent (Body)  ← Must be running separately
  - WebSocket: ws://host:23340/ws (primary)
  - HTTP API: http://host:23340/api/v1/* (state queries)
       |
       | WebSocket (passive)
       v
Game Server (天道引擎)
  - Tick Engine
```

**Note**: This hook uses HTTP to query state, but the primary OpenClaw↔Agent communication is WebSocket (handled by the plugin's register.ts).

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
