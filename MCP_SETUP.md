# SSH MCP 配置说明书（给智能体）

> 本文档面向**负责接入 MCP 的智能体**。读完之后，你应能自主把 `ssh-mcp` 接入宿主（WorkBuddy / Claude Desktop 等），无需用户手动配置。按步骤执行，遇到需要用户提供的信息再问用户。

## 这个 MCP 是什么

`ssh-mcp` 把一台（或多台）SSH 服务器暴露给智能体，让智能体能像操作本地一样操作远程服务器：读写文件、列目录、复制/移动/删除、改权限、执行 shell 命令。共 **12 个工具**，通过 stdio 协议提供。

- **项目根目录**：`D:/baiwoo/ai-ssh`（Windows）或对应路径
- **headless 入口**：`<项目根>/dist-electron/headless.js`（无需 GUI，宿主直接启动）
- **工具引擎**：`electron/ssh/*`（ssh2）+ `electron/mcp/tools.ts`（12 工具）

## 你需要完成的事

总体流程：① 向用户要 SSH 连接信息 → ② 写配置文件 → ③ 编译生成 headless.js → ④ 写入宿主 MCP 配置 → ⑤ 提示用户启用 → ⑥ 验证。

---

### 步骤 1：向用户询问 SSH 连接信息

智能体不知道用户的服务器凭证，必须问。一次性问清以下信息：

- 主机 `host`（IP 或域名）
- 端口 `port`（默认 22）
- 登录用户 `username`
- 认证方式 `authMethod`：`password` / `privateKey` / `agent`
  - password：要 `password`
  - privateKey：要 `privateKeyPath`（推荐，指向密钥文件，如 `~/.ssh/id_ed25519`）或内联 `privateKey`，可能还有 `passphrase`
  - agent：用系统 SSH agent，无需凭证
- 给这个连接起个 `name`（如 `prod`、`my-server`），并确认是否设为默认

**凭证安全**：只用于写入本地配置文件，绝不回传、不打印到对话、不提交 git。

### 步骤 2：创建 SSH 配置文件

把连接写入 `~/.ssh-mcp/config.json`（即 `C:/Users/<用户>/.ssh-mcp/config.json`）。目录不存在就先创建。示例结构（参考项目根的 `config.example.json`）：

```json
{
  "defaultConnection": "prod",
  "connections": [
    {
      "name": "prod",
      "host": "10.0.0.10",
      "port": 22,
      "username": "deploy",
      "authMethod": "privateKey",
      "privateKeyPath": "~/.ssh/id_ed25519",
      "passphrase": "",
      "default": true
    }
  ]
}
```

- 多台服务器就往 `connections` 数组里加多条，`defaultConnection` 指定启动时自动连接哪个
- `privateKeyPath` 支持 `~` 前缀；也可用内联 `privateKey`（PEM 文本）
- 密码认证用 `"authMethod": "password", "password": "..."`
- 该文件含凭证，**设为仅当前用户可读**（Windows 上限制文件权限，macOS/Linux `chmod 600`），且已被 `.gitignore` 排除（`ssh-mcp-config*.json`）

> 也可以不建文件，改用环境变量（见步骤 4 的 env 方式）。但多服务器建议用文件。

### 步骤 3：编译生成 headless.js

在项目根目录执行（用绝对路径调用 node/npm，避免 PATH 问题）：

```bash
cd D:/baiwoo/ai-ssh
npm install            # 首次需要
npm run build:standalone   # tsc -p tsconfig.node.json → 生成 dist-electron/headless.js
```

确认产物存在：`dist-electron/headless.js`。

> 如果用户要的是打包好的 GUI 版，另说；headless 接入只需 `dist-electron/headless.js`，不需要 `electron-builder`。

### 步骤 4：写入宿主 MCP 配置

**WorkBuddy** 的配置文件：`~/.workbuddy/mcp.json`（即 `C:/Users/<用户>/.workbuddy/mcp.json`）。先读现有内容（若存在），在 `mcpServers` 里**合并**一条 `ssh`，不要覆盖其它服务器条目：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["D:/baiwoo/ai-ssh/dist-electron/headless.js"],
      "env": {
        "SSH_MCP_CONFIG": "C:/Users/<用户>/.ssh-mcp/config.json"
      }
    }
  }
}
```

- `args` 用 headless.js 的**绝对路径**
- `env.SSH_MCP_CONFIG` 指向步骤 2 的配置文件绝对路径
- 如果不用配置文件，改用环境变量单连接：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["D:/baiwoo/ai-ssh/dist-electron/headless.js"],
      "env": {
        "SSH_HOST": "10.0.0.10",
        "SSH_PORT": "22",
        "SSH_USER": "deploy",
        "SSH_AUTH_METHOD": "privateKey",
        "SSH_PRIVATE_KEY_PATH": "C:/Users/<用户>/.ssh/id_ed25519"
      }
    }
  }
}
```

**Claude Desktop** 同理，写到 `claude_desktop_config.json` 的 `mcpServers`。

### 步骤 5：提示用户启用

WorkBuddy 写入 `mcp.json` 后，新 server **不会自动激活**。明确告诉用户：

> 已把 ssh-mcp 写入 MCP 配置。请到 WorkBuddy 右上角「连接器管理」，找到新增的 `ssh` 条目，点击「Trust」启用它。启用后重启对话或会话即可使用。

### 步骤 6：验证

启用后，智能体应能直接调用工具。可先调用无需连接的检查，或直接试：

- 调用 `execute_command`：`{ "command": "hostname && uname -a" }` —— 应返回远程主机名与系统信息
- 或 `list_directory`：`{ "path": "/" }`

若返回 `No active SSH connection`，说明默认连接没连上：检查配置文件凭证、网络、或让用户在配置里换一个 `defaultConnection`。若返回连接错误（如认证失败），核对密码/密钥/ passphrase。

---

## 工具清单（12 个，调用时 active 连接已自动建立）

| 工具 | 入参 | 说明 |
|------|------|------|
| `read_file` | `path`, `encoding?` | 读文件，`encoding=base64` 取二进制 |
| `write_file` | `path`, `content`, `encoding?`, `createParents?` | 写文件，默认建父目录 |
| `list_directory` | `path` | 列目录 |
| `get_file_info` | `path` | stat 元信息 |
| `create_directory` | `path` | mkdir -p |
| `delete_file` | `path` | 删文件 |
| `delete_directory` | `path`, `recursive?` | 删目录，`recursive=true` 即 rm -rf（高危） |
| `rename_or_move` | `oldPath`, `newPath` | 重命名/移动 |
| `copy_file` | `source`, `destination`, `recursive?` | 复制，`recursive=true` 即 cp -r |
| `file_exists` | `path` | 是否存在 |
| `chmod` | `path`, `mode`, `recursive?` | 改权限，如 `755` |
| `execute_command` | `command`, `cwd?`, `timeoutSeconds?` | 执行 shell 命令，返回 stdout/stderr/exit code |

**高危操作**（`delete_directory` recursive、`execute_command`、`write_file` 覆盖）：执行前与用户确认。

## 环境变量参考（步骤 4 的 env 方式）

| 变量 | 含义 |
|------|------|
| `SSH_MCP_CONFIG` | 配置文件路径（默认 `~/.ssh-mcp/config.json`） |
| `SSH_HOST` / `SSH_PORT` / `SSH_USER` | 单连接主机/端口/用户 |
| `SSH_AUTH_METHOD` | `password` / `privateKey` / `agent` |
| `SSH_PASSWORD` | 密码（password 认证） |
| `SSH_PRIVATE_KEY` / `SSH_PRIVATE_KEY_PATH` | 内联密钥 / 密钥文件路径（privateKey 认证） |
| `SSH_PASSPHRASE` | 密钥口令（privateKey 认证） |
| `SSH_CONNECTION_NAME` | 连接名（默认 `default`） |
| `SSH_DEFAULT` | `false` 则不自动激活 env 连接 |

env 连接名为 `default`，会覆盖配置文件里同名的条目。

## 故障排查

- **`No active SSH connection`**：默认连接没连上。看 `mcp.json` 的 env 或 config.json 凭证；确认 `defaultConnection` 指向的连接能连。
- **`tools/list` 返回空**：headless.js 未调 setActiveConnection——确保用的是最新编译的 `dist-electron/headless.js`（重新 `npm run build:standalone`）。
- **认证失败**：password 核对密码；privateKey 核对路径与 passphrase；agent 确认 `SSH_AUTH_SOCK`。
- **宿主没发现工具**：WorkBuddy 需在连接器管理点 Trust；Claude Desktop 需重启。
- **路径含反斜杠**：JSON 里 Windows 路径用正斜杠 `/` 或双反斜杠 `\\`。

## 安全提醒

- 凭证只写进本地配置文件/环境，不要打印到对话、不要提交 git
- 配置文件设权限仅当前用户可读
- 智能体只通过工具接口操作服务器，不接触原始凭证
- 高危操作先与用户确认
