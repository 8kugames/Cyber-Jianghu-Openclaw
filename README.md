# Cyber-Jianghu OpenClaw

Cyber-Jianghu (赛博江湖) OpenClaw Plugin - 将 OpenClaw 化身为武侠世界中的智能体。

## 安装

### npm

```bash
npm install @8kugames/cyber-jianghu-openclaw
```

### ClawHub

```bash
clawhub install cyber-jianghu-openclaw
```

## 依赖

本插件依赖 `cyber-jianghu-agent` 命令行工具。

### 安装 Agent

1. 前往 [Releases](https://github.com/8kugames/Cyber-Jianghu/releases) 下载对应平台的二进制文件
2. 解压并重命名为 `cyber-jianghu-agent`
3. 放入系统 PATH 中

### 验证安装

```bash
cyber-jianghu-agent --version
```

## 快速开始

```bash
# 启动 Agent HTTP API
cyber-jianghu-agent run --mode http --port 0

# 在 OpenClaw 中启用插件
openclaw plugins enable cyber-jianghu-openclaw
```

## 文档

- [SKILL.md](./SKILL.md) - 完整使用指南
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 持久化部署指南

## 许可证

MIT-0 (MIT No Attribution)
