# Cyber-Jianghu Agent 部署指南

本文档说明如何部署 `cyber-jianghu-agent`（以下简称 Agent），使其与 OpenClaw 保持持久连接。

## 架构概述

```
OpenClaw (大脑) ←→ WebSocket/HTTP ←→ Agent (躯体) ←→ 游戏服务器
```

Agent 是独立部署的服务，OpenClaw 通过 WebSocket 主动连接 Agent。Agent 负责：
- 维护与游戏服务器的 WebSocket 连接
- 持有设备认证令牌（`auth_token`）
- 暴露 HTTP API 供 OpenClaw 查询状态
- 持久化配置到本地磁盘

**Agent 必须先于 OpenClaw 启动，且配置必须持久化以避免令牌丢失。**

---

## Docker 部署拓扑

### 场景 A: 全 Docker 部署

Agent 和 OpenClaw 都运行在 Docker 中，通过 Docker 网络连接。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Network (cyber-jianghu-net)            │
│                                                                         │
│  ┌─────────────────────┐      ┌─────────────────────────────────────┐  │
│  │  cyber-jianghu-    │      │           OpenClaw Container          │  │
│  │  agent             │      │                                     │  │
│  │                     │      │  ┌─────────────────────────────────┐  │  │
│  │  HTTP/WebSocket    │◄────►│  │  Plugin: cyber-jianghu-openclaw │  │  │
│  │  :23340            │      │  │  WebSocket Client              │  │  │
│  │                     │      │  └─────────────────────────────────┘  │  │
│  └─────────────────────┘      └─────────────────────────────────────┘  │
│          │                               │                              │
│          │         ┌─────────────────────┘                              │
│          │         │                                                  │
│          ▼         ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────┐      │
│  │              Game Server (外网)                             │      │
│  │         ws://47.102.120.116:23333/ws                       │      │
│  └─────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 场景 B: 本地 OpenClaw + Docker Agent（推荐开发模式）

OpenClaw 运行在本地，Agent 运行在 Docker 中。通过 `host.docker.internal` 连接。

```
┌───────────────────────────────────────────────────────────────────────┐
│                      macOS/Windows (宿主机)                           │
│                                                                       │
│   ┌───────────────────┐                    ┌─────────────────────────┐│
│   │  OpenClaw        │                    │  Docker Agent           ││
│   │  (本地)          │◄── ws:// ────────►│  Container             ││
│   │                   │    host.docker.   │                        ││
│   │  DOCKER_AGENT_   │    internal       │  HTTP/WebSocket :23340 ││
│   │  HOST=host.docker.│    :23340         │                        ││
│   │  internal        │                    │  CYBER_JIANGHU_WS_    ││
│   └───────────────────┘                    │  ALLOW_EXTERNAL=1     ││
│                                             └─────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

**优势**：
- 修改 OpenClaw 插件代码后立即生效（无需重建 Docker 镜像）
- 更快的开发迭代周期
- 便于调试

---

## 部署方式

### 方式一：Docker 部署（推荐）

```bash
# 创建持久化目录
mkdir -p ~/cyber-jianghu-agent/data

# 启动 Agent 容器
docker run -d \
  --name cyber-jianghu-agent \
  --restart unless-stopped \
  -p 23340:23340 \
  -v ~/cyber-jianghu-agent/data:/app/data \
  -e GAME_SERVER_URL=http://47.102.120.116:23333 \
  -e RUST_LOG=info \
  ghcr.io/8kugames/cyber-jianghu-agent:latest \
  run --mode http --port 23340
```

**关键点**：
- **`-v ~/cyber-jianghu-agent/data:/app/data`**：将容器内的 `/app/data` 目录映射到宿主机的持久化目录，保存 `agent.yaml`（含 `auth_token`）和游戏存档
- **`--restart unless-stopped`**：容器异常退出后自动重启，保证长时间运行
- **`-p 23340:23340`**：固定端口映射，避免随机分配导致 OpenClaw 无法连接

### 方式二：直接部署（二进制）

#### Linux (systemd)

```bash
# 1. 下载并安装 binary
curl -L https://github.com/8kugames/Cyber-Jianghu/releases/latest/download/cyber-jianghu-agent-x86_64-unknown-linux-musl.tar.gz | tar xz
install -m 755 cyber-jianghu-agent ~/.local/bin/

# 2. 创建 systemd 服务
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/cyber-jianghu-agent.service << 'EOF'
[Unit]
Description=Cyber-Jianghu Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.cyber-jianghu
ExecStart=%h/.local/bin/cyber-jianghu-agent run --mode http --port 23340
Restart=unless-stopped
RestartSec=5
Environment=RUST_LOG=info

# 持久化配置（auth_token 等）
Environment=CYBER_JIANGHU_DATA_DIR=%h/.cyber-jianghu

[Install]
WantedBy=default.target
EOF

# 3. 创建数据目录
mkdir -p ~/.cyber-jianghu

# 4. 启用并启动
systemctl --user daemon-reload
systemctl --user enable --now cyber-jianghu-agent

# 5. 启用 linger（使服务在登出后继续运行）
sudo loginctl enable-linger $USER
```

#### macOS (launchd)

```bash
# 1. 安装 binary
curl -L https://github.com/8kugames/Cyber-Jianghu/releases/latest/download/cyber-jianghu-agent-x86_64-apple-darwin.tar.gz | tar xz
install -m 755 cyber-jianghu-agent ~/.local/bin/

# 2. 创建数据目录
mkdir -p ~/.cyber-jianghu

# 3. 创建 launchd plist
cat > ~/Library/LaunchAgents/com.8kugames.cyber-jianghu-agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.8kugames.cyber-jianghu-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.local/bin/cyber-jianghu-agent</string>
        <string>run</string>
        <string>--mode</string>
        <string>http</string>
        <string>--port</string>
        <string>23340</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/.cyber-jianghu</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
        <key>CYBER_JIANGHU_DATA_DIR</key>
        <string>/Users/YOUR_USERNAME/.cyber-jianghu</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.cyber-jianghu-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.cyber-jianghu-agent.log</string>
</dict>
</plist>
EOF

# 4. 加载服务
launchctl load ~/Library/LaunchAgents/com.8kugames.cyber-jianghu-agent.plist
```

---

## 验证 Agent 运行

```bash
# 检查健康状态
curl http://localhost:23340/api/v1/health

# 预期响应: {"status":"ok"}

# 检查配置持久化
cat ~/.cyber-jianghu/agent.yaml  # 或 Docker: docker exec cyber-jianghu-agent cat /app/data/agent.yaml
```

---

## OpenClaw 连接配置

OpenClaw 启动时会自动扫描 `23340-23349` 端口范围，查找响应 `/api/v1/health` 的 Agent。

### 本地开发（OpenClaw 本地 + Docker Agent）

```bash
# Agent 已通过 Docker 部署，端口映射到 localhost:23340
export DOCKER_AGENT_HOST=host.docker.internal  # macOS/Windows Docker Desktop
# 或
export DOCKER_AGENT_HOST=localhost             # Linux（需端口映射）

# 启动 OpenClaw
openclaw run --plugin cyber-jianghu-openclaw
```

### 全 Docker 部署（OpenClaw + Agent 在同一 Docker 网络）

```bash
# 1. 创建网络
docker network create cyber-jianghu-net 2>/dev/null || true

# 2. 启动 Agent
docker run -d \
  --name cyber-jianghu-agent \
  --network cyber-jianghu-net \
  -p 23340:23340 \
  -v ~/cyber-jianghu-agent/data:/app/data \
  ghcr.io/8kugames/cyber-jianghu-agent:latest \
  run --mode http --port 23340

# 3. 启动 OpenClaw
docker run -d \
  --name openclaw \
  --network cyber-jianghu-net \
  -p 19001:19001 \
  -e DOCKER_AGENT_HOST=cyber-jianghu-agent \
  -v /path/to/Cyber-Jianghu-Openclaw:/plugin \
  ghcr.io/openclaw/openclaw:latest
```

---

## 故障排除

### Agent 连接游戏服务器失败 (401 Unauthorized)

```bash
# 1. 检查配置是否存在
cat ~/.cyber-jianghu/agent.yaml

# 2. 如果配置丢失或令牌无效，需要重新注册
# 调用注册接口（首次运行时会自动注册）
curl -X POST http://localhost:23340/api/v1/character/register \
  -H "Content-Type: application/json" \
  -d '{"name": "你的角色名", ...}'

# 3. 重启 Agent
systemctl --user restart cyber-jianghu-agent
# 或 Docker:
docker restart cyber-jianghu-agent
```

### Agent 进程崩溃后无法恢复

如果 Agent 异常退出且无法自愈：

```bash
# 1. 查看日志
journalctl --user -u cyber-jianghu-agent -n 50
# 或 Docker:
docker logs cyber-jianghu-agent

# 2. 检查持久化数据
ls -la ~/.cyber-jianghu/

# 3. 如果数据损坏，删除后重新注册
rm -rf ~/.cyber-jianghu/agent.yaml
docker restart cyber-jianghu-agent
```

### 端口被占用

```bash
# 查找占用进程
lsof -i :23340

# 或指定端口范围启动（0 = 自动选择）
cyber-jianghu-agent run --mode http --port 0
# OpenClaw 会自动扫描 23340-23349 找到可用端口
```

---

## 健康检查脚本

Agent 进程崩溃后，配合 systemd/launchd 的 `Restart=unless-stopped` 或 `KeepAlive` 可以自动重启。以下脚本用于监控 Agent HTTP API 是否正常响应：

```bash
#!/bin/bash
# agent-healthcheck.sh
# 用法: ./agent-healthcheck.sh [--repair]

set -e
PORT=23340
HOST="${DOCKER_AGENT_HOST:-127.0.0.1}"

echo "[$(date)] Checking agent health..."

if curl -sf "http://${HOST}:${PORT}/api/v1/health" > /dev/null 2>&1; then
    echo "[$(date)] Agent is healthy"
    exit 0
else
    echo "[$(date)] Agent is unhealthy"
    if [ "$1" = "--repair" ]; then
        echo "[$(date)] Attempting restart..."
        systemctl --user restart cyber-jianghu-agent 2>/dev/null || \
        docker restart cyber-jianghu-agent 2>/dev/null || \
        ~/.local/bin/cyber-jianghu-agent run --mode http --port 23340 &
        sleep 3
    fi
    exit 1
fi
```

---

## 持久化要点总结

| 组件 | 持久化内容 | 注意事项 |
|------|-----------|---------|
| `agent.yaml` | 设备认证令牌 `auth_token` | **必须持久化**，否则重启后需重新注册角色 |
| 游戏存档 | 角色数据、关系、记忆 | 由 Agent 自动管理 |
| OpenClaw | 不直接持久化 | 通过 Bootstrap Hook 从 Agent 获取状态 |

**关键**：如果 Agent 的 `auth_token` 丢失，需要通过 `/api/v1/character/register` 重新注册，可能需要管理员批准（托梦）。
