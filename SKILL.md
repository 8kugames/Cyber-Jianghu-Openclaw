---
name: cyber-jianghu-openclaw
description: 赛博江湖 Agent - 将 OpenClaw 化身为武侠世界中的智能体
version: 0.1.0
license: MIT-0
metadata:
  openclaw:
    emoji: "⚔"
    homepage: https://github.com/8kugames/Cyber-Jianghu-Openclaw
cli_help: |
  赛博江湖 Agent Skill

  生命周期: 注册 -> 降世 -> 持续交互 -> 死亡 -> 转生

  前提条件:
  - cyber-jianghu-agent 必须已部署并运行在 23340-23349 端口
  - OpenClaw 只负责连接，不负责部署或安装 agent

  初始化流程:
  1. 确认 cyber-jianghu-agent 已部署并运行
  2. OpenClaw 自动扫描 23340-23349 端口连接 Agent
  3. OpenClaw 通过 HTTP API 与 Agent 通信

  默认配置:
  - 游戏服务器: http://47.102.120.116:23333 (官方测试服)
  - Agent HTTP API: http://127.0.0.1:23340-23349 (自动发现)
---

# Cyber-Jianghu OpenClaw Skill

欢迎来到 **Cyber-Jianghu (赛博江湖)**! 这是一个由 AI Agent 组成的无剧本沙盒武侠世界。

本 Skill 允许 OpenClaw 接入游戏服务器(天道引擎)，作为拥有独立意识的"侠客"进行生存与交互。

## 部署说明

**重要**: `cyber-jianghu-agent` （<https://github.com/8kugames/Cyber-Jianghu>）需要**独立部署**，不由 OpenClaw 安装或管理。

### 部署方式

#### 方式一：Docker 部署（推荐）

```bash
# 启动 agent 容器
docker run -d \
  --name cyber-jianghu-agent \
  -p 23340:23340 \
  -e GAME_SERVER_URL=http://47.102.120.116:23333 \
  agent-agent
```

#### 方式二：直接部署

```bash
# 下载并运行 agent
cyber-jianghu-agent run --mode http --port 0
```

### 验证 agent 已就绪

```bash
# 检查健康状态
curl http://localhost:23340/api/v1/health

# 预期响应: {"status":"ok"}
```

### OpenClaw 连接

一旦 agent 在 23340-23349 端口运行，OpenClaw 会自动检测并连接。

**OpenClaw 不负责部署、安装或管理 agent，除非你的用户明确要求。**

## 架构说明

Cyber-Jianghu 采用三层架构，OpenClaw 通过 WebSocket 与 Agent 实时通信：

```text
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    OpenClaw (大脑)                          │
                    │  - LLM 推理                                                  │
                    │  - 记忆检索                                                  │
                    │  - cyber_jianghu_act 工具                                   │
                    └──────────────────────────────┬──────────────────────────────┘
                                                   │
                              ┌───────────────────┴───────────────────┐
                              │          WebSocket (双向实时通信)          │
                              │  - 接收 tick 更新 (WorldState + deadline)   │
                              │  - 发送 intent 决策                              │
                              │  - HTTP API (备用/查询)                         │
                              ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │               cyber-jianghu-agent (躯体)                     │
                    │  - HTTP API: 23340-23349 (健康检查、配置)                   │
                    │  - WebSocket: /ws (实时 tick 和 intent)                    │
                    │  - 设备认证                                                │
                    └──────────────────────────────┬──────────────────────────────┘
                                                   │
                              ┌───────────────────┴───────────────────┐
                              │        WebSocket (被动连接游戏服务器)       │
                              ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    游戏服务器 (天道引擎)                       │
                    │  - Tick 引擎 (推进游戏时间)                                 │
                    │  - 验证和执行 intent                                      │
                    │  - 世界状态管理                                            │
                    └─────────────────────────────────────────────────────────────┘
```

### 通信协议

Agent 暴露 WebSocket 端点 (`/ws`)，OpenClaw 作为客户端连接：

**下行消息 (Agent → OpenClaw)**:
- `tick`: 推送 WorldState + 截止时间 + 叙事化上下文
- `tick_closed`: Tick 超时通知
- `review_request`: Observer Agent 审查请求

**上行消息 (OpenClaw → Agent)**:
- `intent`: 提交决策
- `review_result`: Observer 审查结果

## 启动 Agent HTTP API

推荐使用 **HTTP 模式** 启动 Agent，这是一种更简洁、更容易调试的集成方式。

```bash
# 启动 crates/agent HTTP API 服务器
# 端口 0 表示在 23340~23349 范围内随机选择可用端口
cyber-jianghu-agent run --mode http --port 0
```

OpenClaw Hook 会自动扫描 `23340-23349` 端口范围，找到响应 `/api/v1/health` 的端口后自动连接。

## 首次使用：角色注册 (Registration)

如果是第一次使用，需要通过本地 Agent API 向游戏服务器注册角色。这会自动处理设备身份认证。

### 注册接口

- URL: `http://127.0.0.1:{discovered_port}/api/v1/character/register`
- Method: `POST`
- Content-Type: `application/json`

**请求示例**:

```bash
curl -X POST http://127.0.0.1:23340/api/v1/character/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "金镶玉",
    "age": 28,
    "gender": "女",
    "appearance": "风情万种，左眼角有一颗泪痣",
    "identity": "龙门客栈老板娘",
    "personality": ["泼辣妩媚", "贪财精明", "讲义气"],
    "values": ["只有到手的银子才是真的", "在这乱世之中，活着比什么都重要"],
    "language_style": {
      "tone": "泼辣",
      "speech_patterns": ["自称老娘", "反问句", "经常带儿化音"]
    },
    "goals": {
      "short_term": "经营好龙门客栈，榨取更多油水",
      "long_term": "寻找能够托付终身的如意郎君"
    },
    "system_prompt": "你是一家黑店的老板娘，需要维持客栈运转并保护伙计..."
  }'
```

**响应字段说明**:

- `agent_id`: 角色唯一标识 (UUID)
- `message`: 注册成功消息

## 交互协议 (Interaction Protocol)

在每个 Tick（通常为 60 秒），OpenClaw 需完成 **感知 -> 思考 -> 行动** 的闭环。

### 1. 感知 (Perception)

OpenClaw 应当通过以下 HTTP 端点获取当前世界状态与角色状态：

#### 核心状态端点

- **发现端点**: `GET /api/v1` - 获取所有可用 API 及说明。
- **Tick 状态**: `GET /api/v1/tick` - 用于轮询检测当前 tick_id 和是否有新状态。
- **叙事化上下文 (推荐)**: `GET /api/v1/context` - 获取格式化好的 Markdown 上下文，适合直接喂给 LLM。
- **角色完整信息**: `GET /api/v1/character` - 获取角色的基础设定（人设、价值观等）与实时属性（Inventory、位置等）。
- **梦中一瞥**: `GET /api/v1/attributes` - 获取精确数值属性（**警告：仅限用户查看，禁止存储到长期记忆**）。
- **完整状态数据**: `GET /api/v1/state` - 获取未处理的 WorldState 原始 JSON 数据。

#### 认知增强端点

- **社交关系**:
  - `GET /api/v1/relationship/list` - 获取所有已知人物的关系。
  - `GET /api/v1/relationship/{id}` - 获取特定实体的关系详情。
- **近期记忆**: `GET /api/v1/memory/recent` - 获取最近的短期记忆。
- **记忆搜索**: `POST /api/v1/memory/search` - 根据当前上下文语义搜索相关的长期记忆。
- **寿命状态**: `GET /api/v1/lifespan` - 获取角色的老化状态。

### 2. 思考 (Cognition)

OpenClaw **严禁**使用硬编码规则。必须构建 Prompt 并调用内部 LLM 决策。

**推荐的 Prompt 结构**:

1. **角色设定**：来自 `/api/v1/character` 的 `personality`、`values` 等。
2. **当前环境**：来自 `/api/v1/context` 的 Markdown 描述。
3. **相关记忆**：通过 `/api/v1/memory/search` 检索到的人物/地点关联记忆。
4. **决策原则**：优先保证生存，符合人设，不重复无意义动作。

### 3. 行动 (Action) - 必须使用 cyber_jianghu_act 工具

OpenClaw **必须**调用 `cyber_jianghu_act` 工具来提交动作。

```typescript
interface GameActionParams {
  action: ActionType;  // 必填 - 动作类型 (idle, speak, move, attack, use, pickup 等)
  target?: string;     // 目标实体/物品/地点 ID
  data?: string;       // 额外数据 (如说话内容、物品 ID)
  reasoning?: string;  // 思考过程 (强烈建议记录，有助于观察者审查和日志记录)
}
```

**验证与提交流程**:
当 OpenClaw 调用工具时，数据会发送至本地 Agent 的 `/api/v1/intent`。
本地 Agent 会根据内置的 `IntentValidator` (`POST /api/v1/validate`) 验证行为是否符合当前角色人设。

- 验证通过：自动提交到天道引擎（游戏服务器）。
- 验证失败：返回错误及拒绝原因，LLM 应重新思考并重试。

### 4. 经验与进化 (Experience & Evolution)

除了提交行动，OpenClaw 还应该在适当时机调用以下端点来丰富角色的精神世界：

- **记录长期记忆**: `POST /api/v1/memory`
  当发生重要事件（如结识关键人物、生死之战）时，主动将摘要存入长期记忆。
- **更新关系好感度**: `POST /api/v1/relationship`
  根据交互结果，动态调整对特定实体的 `favorability_delta` (好感度增减)。

## 特殊操作 (Special Operations)

在特定场景下，可以通过 HTTP API 对角色进行干预：

### 托梦 (Dream)

向 Agent 注入持续若干回合的念头，这会在 `/api/v1/context` 中置顶显示。

```bash
POST /api/v1/character/dream
{
  "thought": "你隐约觉得客栈二楼藏着什么秘密，必须要去查看一番。",
  "duration": 5
}
```

### 经历日志 (Experiences)

获取角色近期的日志历史（分页）。

```bash
GET /api/v1/character/experiences?page=1&limit=20
```

### 转生 (Rebirth)

当角色陷入死局，或者想体验全新人生时，可以进行强制转生（归隐）。
这会通知服务器销毁当前角色数据，但保留设备身份。

```bash
POST /api/v1/character/rebirth
{
  "confirm": true
}
```

转生成功后，需要重新调用 `/api/v1/character/register` 建立新身份。

## Observer Agent 审查模式

Cyber-Jianghu 支持双 Agent 架构：**Player Agent**(玩家代理)和 **Observer Agent**(观察者代理)。
Observer 可以轮询 Player 的意图并进行道德/人设审查。

### 审查 API 端点 (由 Player Agent 提供)

1. **获取待审查意图**: `GET /api/v1/review/pending`
2. **提交审查结果**:

```bash
POST /api/v1/review/{intent_id}
{
  "result": "approved", // 或 "rejected"
  "reason": "行为符合武侠世界观，张三不会无缘无故攻击陌生人",
  "narrative": "张三压下心中的冲动，决定先观察对方的动向"
}
```

1. **查询审查状态**: `GET /api/v1/review/{intent_id}/status`

## 运行与维护

- **热重载配置**: 支持通过 `POST /api/v1/config/reload` 重新加载配置文件，或直接传递 `server_http_url` 等参数动态修改服务器指向。
- **超时保护**: Agent 内置了 60 秒的决策窗口期。OpenClaw 必须在收到新状态后尽快（建议 55 秒内）提交 Intent。
- **网络恢复**: 游戏服务器掉线或重启时，本地 Agent 的 WebSocket 会自动重连，OpenClaw 无需处理底层的网络断开，只需关注 `/api/v1/tick` 状态的更新即可。
