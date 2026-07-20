# AgentSSH

**SSH 连接管理 GUI + MCP 工具** —— 在桌面界面里安全管理 SSH 连接，并通过 MCP 把这些连接暴露给 AI 智能体，让智能体能像操作本地一样操作远程服务器（文件操作 + 命令执行）。

AgentSSH 是一个 Electron 应用：GUI 只负责**添加/编辑/连接 SSH 服务器**（凭证经 OS keychain 加密存储，避免写进配置文件或直接发给智能体）；实际的文件与命令操作通过 **MCP 工具**交给智能体执行。

## 特性

- **GUI 连接管理** — 添加/编辑/删除连接，密码/私钥/SSH agent 认证，凭证 AES-256-GCM 加密 + OS keychain（keytar）
- **一键激活** — 在连接列表把某个连接设为 MCP 活动连接，智能体即通过它操作
- **MCP 工具集（12 个）** — 文件读写/列举/复制/移动/删除/chmod + 远程命令执行
- **双 MCP 模式** — 内嵌 stdio MCP；或 standalone 进程（Claude Desktop 启动，经 HTTP 桥接回 GUI 管理的连接）
- **命令执行** — `execute_command` 支持 cwd、超时，返回 stdout/stderr/exit code

## MCP 工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取远程文件（utf8 或 base64） |
| `write_file` | 写远程文件（建父目录，支持 base64） |
| `list_directory` | 列目录 |
| `get_file_info` | 文件/目录元信息 |
| `create_directory` | mkdir -p |
| `delete_file` | 删除文件 |
| `delete_directory` | 删除目录（recursive=true 即 rm -rf） |
| `rename_or_move` | 重命名/移动 |
| `copy_file` | 复制（recursive=true 即 cp -r） |
| `file_exists` | 检查是否存在 |
| `chmod` | 改权限（-R 可选） |
| `execute_command` | 执行 shell 命令（cwd、超时可选） |

## 架构

```
Renderer (React + Vite + Tailwind + Zustand)
    │  window.api (contextBridge IPC)
    ▼
Main Process (Electron)
    ├── CredentialStore (keytar + AES-256-GCM)
    ├── ConnectionManager (ssh2)  ── SFTP + exec(超时)
    ├── McpServer (内嵌 stdio)
    ├── McpHttpBridge (127.0.0.1，供 standalone 调用)
    └── McpStandalone (Claude Desktop 启动)
```

## 开发

```bash
npm install
npm run dev      # Vite + Electron 并行启动
```

## 构建

```bash
npm run build            # tsc(后端) + vite build(前端)
npm run build:electron   # 打包可执行文件（输出到 release/）
```

## 测试

```bash
npm test          # vitest（22 个测试）
```

## Headless MCP 接入（推荐，无需 GUI）

智能体宿主（WorkBuddy / Claude Desktop 等）可直接启动 headless 入口，读配置文件或环境变量连 SSH，**不依赖 GUI**：

1. 准备配置文件 `~/.ssh-mcp/config.json`（参考 `config.example.json`），或用 `SSH_*` 环境变量
2. 编译：`npm run build:standalone`（生成 `dist-electron/headless.js`），或 `npm run start:mcp` 直接启动
3. 在宿主 MCP 配置里声明：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["D:/baiwoo/ai-ssh/dist-electron/headless.js"],
      "env": {
        "SSH_MCP_CONFIG": "C:/Users/you/.ssh-mcp/config.json"
      }
    }
  }
}
```

或用环境变量单连接（无需配置文件）：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["D:/baiwoo/ai-ssh/dist-electron/headless.js"],
      "env": {
        "SSH_HOST": "10.0.0.10",
        "SSH_USER": "deploy",
        "SSH_AUTH_METHOD": "privateKey",
        "SSH_PRIVATE_KEY_PATH": "C:/Users/you/.ssh/id_ed25519"
      }
    }
  }
}
```

启动后默认连接自动建立，12 个工具立即可用。环境变量（优先级高于配置文件同名条目）：

| 变量 | 含义 |
|------|------|
| `SSH_MCP_CONFIG` | 配置文件路径（默认 `~/.ssh-mcp/config.json`） |
| `SSH_HOST` / `SSH_PORT` / `SSH_USER` | 单连接主机/端口/用户 |
| `SSH_AUTH_METHOD` | `password` \| `privateKey` \| `agent` |
| `SSH_PASSWORD` / `SSH_PRIVATE_KEY` / `SSH_PRIVATE_KEY_PATH` / `SSH_PASSPHRASE` | 认证凭证 |
| `SSH_CONNECTION_NAME` | 连接名（默认 `default`） |
| `SSH_DEFAULT` | `false` 则不自动激活 env 连接 |

> 配置文件可能含凭证，请用文件权限/密钥管理保护，且**不要提交到 git**（`.gitignore` 已排除 `ssh-mcp-config*.json`）。

## Claude Desktop 接入（GUI + standalone 模式）

1. 启动 AgentSSH，添加并连接一台服务器，点击「设为活动」
2. 在「智能体」信息里拿到 bridge 端口与连接 id（或从 GUI 状态查看）
3. 写入 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "agentssh": {
      "command": "node",
      "args": ["path/to/dist-electron/mcp/standalone.js"],
      "env": {
        "AGENTSSH_BRIDGE_PORT": "<port>",
        "AGENTSSH_CONNECTION_ID": "<connection-id>"
      }
    }
  }
}
```

4. 重启 Claude Desktop —— 智能体即可使用 AgentSSH 的 12 个工具操作该连接

## 技术栈

- **前端**：React 18、TypeScript、Tailwind CSS、Zustand
- **后端**：Electron 30、ssh2、electron-store、keytar
- **MCP**：@modelcontextprotocol/sdk、Zod
- **构建**：Vite、electron-builder、vitest 3

## 安全

- SSH 凭证经 AES-256-GCM 加密后存入 OS keychain，不落明文
- 智能体只拿到工具接口，不接触原始凭证
- `delete_directory`(recursive) 与 `execute_command` 为高危操作，智能体应在执行前与你确认

## License
MIT — 见 [LICENSE](LICENSE)
