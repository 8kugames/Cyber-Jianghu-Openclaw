# Agent 持久化部署指南

本文档提供跨平台的 Agent 持久化运行方案。

## Linux (systemd)

### 用户级服务(推荐)

```bash
# 1. 创建服务目录
mkdir -p ~/.config/systemd/user

# 2. 创建服务文件
cat > ~/.config/systemd/user/cyber-jianghu-agent.service << 'EOF'
[Unit]
Description=Cyber-Jianghu Agent (HTTP Mode)
After=network.target

[Service]
Type=simple
WorkingDirectory=%h
ExecStart=%h/.cargo/bin/cyber-jianghu-agent run --mode http
Restart=always
RestartSec=5
StandardOutput=append:%h/.cyber-jianghu-agent.log
StandardError=append:%h/.cyber-jianghu-agent.log
Environment=RUST_LOG=info

[Install]
WantedBy=default.target
EOF

# 3. 启用并启动服务
systemctl --user daemon-reload
systemctl --user enable cyber-jianghu-agent
systemctl --user start cyber-jianghu-agent
```

### 启用 Linger(登出后继续运行)

```bash
# 需要 root 权限,只需执行一次
sudo loginctl enable-linger $USER
```

### 服务管理命令

```bash
systemctl --user status cyber-jianghu-agent    # 查看状态
systemctl --user restart cyber-jianghu-agent   # 重启
systemctl --user stop cyber-jianghu-agent      # 停止
systemctl --user disable cyber-jianghu-agent   # 禁用自启
tail -f ~/.cyber-jianghu-agent.log             # 查看日志
```

## Windows

### 方案一:NSSM(推荐)

1. 下载 [NSSM](https://nssm.cc/download)
2. 安装服务:

```powershell
# 以管理员身份运行
nssm install CyberJianghuAgent "C:\path\to\cyber-jianghu-agent.exe" "run --mode http"
nssm set CyberJianghuAgent AppDirectory "C:\path\to\working\dir"
nssm set CyberJianghuAgent AppEnvironmentExtra "RUST_LOG=info"
nssm set CyberJianghuAgent AppStdout "C:\path\to\agent.log"
nssm set CyberJianghuAgent AppStderr "C:\path\to\agent.log"
nssm start CyberJianghuAgent
```

### 方案二:Windows Service (sc)

```powershell
# 以管理员身份运行
sc create CyberJianghuAgent binPath= "C:\path\to\cyber-jianghu-agent.exe run --mode http" start= auto
sc start CyberJianghuAgent
```

### 方案三:任务计划程序(开机自启)

1. 打开「任务计划程序」
2. 创建基本任务 -> 名称:`Cyber-Jianghu Agent`
3. 触发器:计算机启动时
4. 操作:启动程序 -> `cyber-jianghu-agent.exe run --mode http`

## macOS (launchd)

### 创建 LaunchAgent

```bash
# 1. 创建 plist 文件
cat > ~/Library/LaunchAgents/com.8kugames.cyber-jianghu-agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.8kugames.cyber-jianghu-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.cargo/bin/cyber-jianghu-agent</string>
        <string>run</string>
        <string>--mode</string>
        <string>http</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>RUST_LOG</key>
        <string>info</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.cyber-jianghu-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.cyber-jianghu-agent.log</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# 2. 加载服务
launchctl load ~/Library/LaunchAgents/com.8kugames.cyber-jianghu-agent.plist
```

### 服务管理命令

```bash
launchctl list | grep cyber-jianghu    # 查看状态
launchctl unload ...plist              # 停止
launchctl load ...plist                # 启动
tail -f ~/.cyber-jianghu-agent.log     # 查看日志
```

## Docker(跨平台)

```dockerfile
# Dockerfile
FROM rust:1.75 AS builder
WORKDIR /app
COPY . .
RUN cargo build -p cyber-jianghu-agent --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/cyber-jianghu-agent /usr/local/bin/
CMD ["cyber-jianghu-agent", "run", "--mode", "http"]
```

```bash
# 构建并运行
docker build -t cyber-jianghu-agent .
docker run -d --name agent \
  -v ~/.config/cyber-jianghu:/root/.config/cyber-jianghu \
  -p 23340-23349:23340-23349 \
  cyber-jianghu-agent
```

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| WebSocket 400 错误 | 检查 `~/.config/cyber-jianghu/agent.yaml` 中的 `auth_token` |
| 端口被占用 | 使用 `--port 0` 自动选择,或检查 23340-23349 端口占用 |
| 服务启动后立即退出 | 检查日志文件,通常是配置文件缺失或格式错误 |
| 连接超时 | 检查网络连通性和服务器地址 |

## 健康检查与自动恢复

### Linux 健康检查脚本

创建 `~/bin/agent-healthcheck.sh`:

```bash
#!/bin/bash
# cyber-jianghu-agent 健康检查脚本
# 用法: ./agent-healthcheck.sh [--repair]

set -e

LOG_FILE="$HOME/.cyber-jianghu-agent.log"
PORT_RANGE_START=23340
PORT_RANGE_END=23349
REPAIR_MODE="${1:-}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [healthcheck] Starting health check..."

# 检查进程是否存在
check_process() {
    pgrep -f "cyber-jianghu-agent run" > /dev/null 2>&1
}

# 检查 HTTP API 是否响应
check_http_api() {
    for port in $(seq $PORT_RANGE_START $PORT_RANGE_END); do
        if curl -sf "http://127.0.0.1:$port/api/v1/health" > /dev/null 2>&1; then
            echo "HTTP API responding on port $port"
            return 0
        fi
    done
    return 1
}

# 检查 systemd 服务状态
check_systemd_service() {
    systemctl --user is-active cyber-jianghu-agent > /dev/null 2>&1
}

# 修复服务
repair_service() {
    echo "[healthcheck] Attempting to repair service..."

    # 尝试重启 systemd 服务
    if systemctl --user is-enabled cyber-jianghu-agent > /dev/null 2>&1; then
        echo "[healthcheck] Restarting systemd service..."
        systemctl --user restart cyber-jianghu-agent
        sleep 3
        if check_systemd_service && check_http_api; then
            echo "[healthcheck] Service repaired successfully via systemd"
            return 0
        fi
    fi

    # systemd 不可用,直接启动进程
    echo "[healthcheck] Starting agent directly..."
    nohup $HOME/.cargo/bin/cyber-jianghu-agent run --mode http >> "$LOG_FILE" 2>&1 &
    sleep 3
    if check_http_api; then
        echo "[healthcheck] Agent started successfully"
        return 0
    fi

    echo "[healthcheck] Failed to repair service"
    return 1
}

# 主检查逻辑
main() {
    local process_ok=false
    local api_ok=false
    local service_ok=false

    check_process && process_ok=true
    check_http_api && api_ok=true
    check_systemd_service && service_ok=true

    echo "[healthcheck] Process: $process_ok, API: $api_ok, Service: $service_ok"

    if $api_ok; then
        echo "[healthcheck] Agent is healthy"
        exit 0
    fi

    echo "[healthcheck] Agent is unhealthy!"

    if [ "$REPAIR_MODE" = "--repair" ]; then
        repair_service
        exit $?
    else
        echo "[healthcheck] Run with --repair to attempt automatic repair"
        exit 1
    fi
}

main
```

### 设置 Cron 定时检查

```bash
# 编辑 crontab
crontab -e

# 添加以下行(每 5 分钟检查一次,自动修复)
*/5 * * * * $HOME/bin/agent-healthcheck.sh --repair >> $HOME/.agent-healthcheck.log 2>&1
```

### Linux systemd 内置重启

服务文件已配置 `Restart=always` 和 `RestartSec=5`,进程崩溃时会自动重启。

如需额外保障,可创建 systemd timer:

```bash
cat > ~/.config/systemd/user/cyber-jianghu-agent-healthcheck.timer << 'EOF'
[Unit]
Description=Cyber-Jianghu Agent Healthcheck Timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

cat > ~/.config/systemd/user/cyber-jianghu-agent-healthcheck.service << 'EOF'
[Unit]
Description=Cyber-Jianghu Agent Healthcheck

[Service]
Type=oneshot
ExecStart=%h/bin/agent-healthcheck.sh --repair
EOF

systemctl --user daemon-reload
systemctl --user enable cyber-jianghu-agent-healthcheck.timer
systemctl --user start cyber-jianghu-agent-healthcheck.timer
```

### Windows 健康检查(任务计划程序)

创建 `agent-healthcheck.ps1`:

```powershell
# agent-healthcheck.ps1
$PortRange = 23340..23349
$LogPath = "$env:USERPROFILE\.cyber-jianghu-agent.log"
$AgentPath = "C:\path\to\cyber-jianghu-agent.exe"

function Test-AgentApi {
    foreach ($port in $PortRange) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/v1/health" -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {}
    }
    return $false
}

function Start-AgentProcess {
    Start-Process -FilePath $AgentPath -ArgumentList "run --mode http" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 主逻辑
if (-not (Test-AgentApi)) {
    Write-Output "[$(Get-Date)] Agent not responding, attempting restart..."
    Start-AgentProcess
    if (Test-AgentApi) {
        Write-Output "[$(Get-Date)] Agent restarted successfully"
    } else {
        Write-Output "[$(Get-Date)] Failed to restart agent"
    }
} else {
    Write-Output "[$(Get-Date)] Agent is healthy"
}
```

在任务计划程序中创建每 5 分钟运行一次的任务。

### macOS 健康检查(launchd + cron)

launchd 的 `KeepAlive` 已提供基本保障。如需额外监控:

```bash
# 添加到 crontab
*/5 * * * * $HOME/bin/agent-healthcheck.sh --repair >> $HOME/.agent-healthcheck.log 2>&1
```
