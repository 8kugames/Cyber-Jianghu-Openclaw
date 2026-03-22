# Cyber-Jianghu + OpenClaw Docker 集成指南

本文档说明如何通过 Docker 部署 Cyber-Jianghu-Agent 和 OpenClaw 的集成环境。

## 架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Docker Network (cyber-jianghu-network)                │
│                                                                       │
│  ┌─────────────────────┐      ┌─────────────────────────────────────┐  │
│  │  cyber-jianghu-    │      │           OpenClaw Container         │  │
│  │  agent             │      │                                     │  │
│  │                     │      │  ┌─────────────────────────────────┐  │  │
│  │  HTTP: 23340       │◄────►│  │  Plugin: cyber-jianghu-openclaw │  │  │
│  │  WebSocket: /ws    │      │  │  Hook: bootstrap              │  │  │
│  │                     │      │  │  Tool: cyber_jianghu_act      │  │  │
│  │                     │      │  └─────────────────────────────────┘  │  │
│  │  Gateway: ws://    │      │                                     │  │
│  │  0.0.0.0:23340    │      │  WebSocket Client (自动连接 Agent) │  │
│  └─────────────────────┘      └─────────────────────────────────────┘  │
│          │                               │                              │
│          │                               │                              │
│          │         ┌─────────────────────┘                              │
│          │         │                                                  │
│          │         ▼                                                  │
│          │  ┌─────────────────────────────────────────────────────┐    │
│          │  │              Game Server (外网)                    │    │
│          │  │         ws://47.102.120.116:23333/ws            │    │
│          └─►│                                               │    │
│             └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 快速启动

### 1. 创建 Docker 网络

```bash
docker network create cyber-jianghu-network 2>/dev/null || true
```

### 2. 启动 Agent

```bash
# 启动 Agent 容器
docker run -d \
  --name cyber-jianghu-agent \
  --network cyber-jianghu-network \
  -p 23340:23340 \
  -e GAME_SERVER_URL=http://47.102.120.116:23333 \
  agent-agent

# 等待健康检查通过
docker wait cyber-jianghu-agent

# 验证 Agent 运行
curl http://localhost:23340/api/v1/health
```

### 3. 启动 OpenClaw

```bash
# 启动 OpenClaw 容器
docker run -d \
  --name openclaw \
  --network cyber-jianghu-network \
  -p 19001:19001 \
  -e DOCKER_AGENT_HOST=cyber-jianghu-agent \
  -v /path/to/Cyber-Jianghu-Openclaw:/plugin \
  alpine/openclaw

# 配置并启动 Gateway
docker exec openclaw openclaw config set gateway.mode local
docker exec openclaw openclaw hooks install /home/node/.openclaw/extensions/cyber-jianghu-openclaw/hooks/cyber-jianghu-openclaw-bootstrap
docker exec -d openclaw openclaw gateway --port 19001
```

### 4. 验证集成

```bash
# 检查 Agent 健康
curl http://localhost:23340/api/v1/health

# 检查 OpenClaw Gateway
curl http://localhost:19001/health

# 检查 WebSocket 连接日志
docker logs openclaw 2>&1 | grep -E "(WebSocket|Connected|tick)"
```

## Docker Compose 完整配置

```yaml
version: '3.8'

services:
  # Cyber-Jianghu Agent (Body)
  agent:
    image: agent-agent
    container_name: cyber-jianghu-agent
    networks:
      - cyber-jianghu-network
    ports:
      - "23340:23340"
    environment:
      - GAME_SERVER_URL=http://game-server:23333
      - RUST_LOG=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:23340/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # OpenClaw (Brain)
  openclaw:
    image: alpine/openclaw
    container_name: openclaw
    networks:
      - cyber-jianghu-network
    ports:
      - "19001:19001"
    environment:
      - DOCKER_AGENT_HOST=agent
    volumes:
      - ./Cyber-Jianghu-Openclaw:/plugin
    command: tail -f /dev/null
    depends_on:
      agent:
        condition: service_healthy

networks:
  cyber-jianghu-network:
    external: true
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DOCKER_AGENT_HOST` | Agent 容器名称/主机名 | `agent` |
| `GAME_SERVER_URL` | 游戏服务器地址 | `http://47.102.120.116:23333` |

## 端口映射

| 端口 | 服务 | 说明 |
|------|------|------|
| 23340 | Agent HTTP API | 健康检查、配置接口 |
| 23340 | Agent WebSocket | Tick 推送、Intent 接收 |
| 19001 | OpenClaw Gateway | OpenClaw 控制接口 |

## 故障排除

### WebSocket 连接失败

```bash
# 1. 确认容器在同一网络
docker network inspect cyber-jianghu-network

# 2. 验证网络连通性
docker exec openclaw ping -c 2 agent

# 3. 检查 Agent WebSocket 端口
docker exec agent netstat -tlnp | grep 23340

# 4. 查看 OpenClaw 连接日志
docker logs openclaw 2>&1 | grep -E "(WebSocket|Error|Failed)"
```

### Agent 健康检查失败

```bash
# 1. 查看 Agent 日志
docker logs cyber-jianghu-agent

# 2. 验证游戏服务器连接
docker exec agent curl -v http://47.102.120.116:23333/health

# 3. 检查端口映射
docker port cyber-jianghu-agent
```

### 权限问题

```bash
# OpenClaw 容器可能需要配置插件信任
docker exec openclaw openclaw config set plugins.allow "['cyber-jianghu-openclaw']"
docker restart openclaw
```

## 测试 WebSocket 消息

```bash
# 测试 tick 消息接收
docker exec openclaw node -e "
const { WebSocket } = require('ws');
const ws = new WebSocket('ws://agent:23340/ws');
ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Type:', msg.type, 'Tick:', msg.tick_id || 'N/A');
});
ws.on('error', (e) => console.error('Error:', e.message));
"

# 测试 Intent 发送
docker exec openclaw node -e "
const { WebSocket } = require('ws');
const ws = new WebSocket('ws://agent:23340/ws');
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'intent',
    tick_id: 1,
    action_type: 'idle'
  }));
  console.log('Intent sent');
  setTimeout(() => ws.close(), 1000);
});
ws.on('message', (data) => console.log('Response:', data.toString().substring(0, 100)));
"
```

## 验证清单

- [ ] Agent 容器运行中
- [ ] Agent 健康检查通过 (`/api/v1/health`)
- [ ] OpenClaw 容器运行中
- [ ] OpenClaw Gateway 健康 (`/health`)
- [ ] Plugin 已加载 (`cyber-jianghu-openclaw` loaded)
- [ ] Hook 已安装 (`cyber-jianghu-openclaw-bootstrap` ready)
- [ ] WebSocket 连接成功 ("WebSocket connected to Agent")
- [ ] Tick 消息接收正常
