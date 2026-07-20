# SSH MCP

**A local MCP server that exposes cloud servers to AI agents over SSH.**

SSH MCP lets an AI agent (Claude Desktop, WorkBuddy, Cursor, or any MCP-capable host)
operate a remote server almost like a local machine — browse and edit files via SFTP,
run shell commands, manage multiple connections — all through the standard
[Model Context Protocol](https://modelcontextprotocol.io).

This is the refactored, headless successor to the original AgentSSH Electron app.
The Electron GUI and the encrypted keychain credential store have been removed; the
SSH/SFTP engine is preserved and exposed directly as a stdio MCP server.

## Features

- **Pure local MCP server** — no GUI, no Electron. Launched by your AI host over stdio.
- **Multiple SSH connections** — password, private key (file or inline), or SSH agent auth.
- **Local-like file operations** — read/write (text & base64 binary), list, stat,
  mkdir -p, delete, rename/move, copy (recursive), chmod, exists.
- **Remote command execution** — run shell commands with cwd and timeout, get
  stdout/stderr/exit code back.
- **Connection management tools** — list, connect, disconnect, status, switch.
- **Flexible config** — JSON config file (`~/.ssh-mcp/config.json` or `$SSH_MCP_CONFIG`)
  and/or `SSH_*` environment variables for a quick single-server setup.

## MCP Tools

### Connection management
| Tool | Description |
|------|-------------|
| `list_connections` | List configured connections and their connected status |
| `connect` | Connect to a named (or default) connection and activate it |
| `disconnect` | Disconnect a connection (active by default) |
| `connection_status` | Report the active connection and all statuses |

### File operations (on the active connection)
| Tool | Description |
|------|-------------|
| `read_file` | Read a remote file (utf8 or base64) |
| `write_file` | Write a remote file (creates parent dirs; supports base64) |
| `list_directory` | List directory entries with type/size/mtime |
| `get_file_info` | Stat a file or directory |
| `create_directory` | mkdir -p |
| `delete_file` | Delete a file |
| `delete_directory` | Delete a directory (recursive option = `rm -rf`) |
| `rename_or_move` | Rename or move a path |
| `copy_file` | Copy a file or directory (recursive option) |
| `file_exists` | Check existence |
| `chmod` | Change permissions (`-R` optional) |

### Command execution
| Tool | Description |
|------|-------------|
| `execute_command` | Run a shell command (cwd & timeout optional), return stdout/stderr/code |

## Getting Started

### Prerequisites
- Node.js >= 18

### Install
```bash
git clone https://github.com/BaiWoww/SSH_MCP.git
cd SSH_MCP
npm install
npm run build
```

### Configure

Pick one of two ways (they compose — env vars define/override a connection named `default`).

**Option A — config file** (recommended for multiple servers):

```bash
mkdir -p ~/.ssh-mcp
cp config.example.json ~/.ssh-mcp/config.json
# edit ~/.ssh-mcp/config.json with your hosts
```

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
      "default": true
    },
    {
      "name": "staging",
      "host": "10.0.0.11",
      "port": 22,
      "username": "ubuntu",
      "authMethod": "password",
      "password": "your-password"
    }
  ]
}
```

> `privateKeyPath` is read at startup; inline `privateKey` is also supported.
> Restrict the file permissions of `config.json` since it may contain secrets.

**Option B — environment variables** (single server):

| Variable | Meaning |
|----------|---------|
| `SSH_HOST` | Server host (required to enable env-mode) |
| `SSH_PORT` | Port (default 22) |
| `SSH_USER` / `SSH_USERNAME` | Login user (default root) |
| `SSH_AUTH_METHOD` | `password` \| `privateKey` \| `agent` (default password) |
| `SSH_PASSWORD` | Password (password auth) |
| `SSH_PRIVATE_KEY` | Inline PEM key (privateKey auth) |
| `SSH_PRIVATE_KEY_PATH` | Path to a key file (privateKey auth) |
| `SSH_PASSPHRASE` | Key passphrase (privateKey auth) |
| `SSH_CONNECTION_NAME` | Name for the env connection (default `default`) |
| `SSH_DEFAULT` | `false` to not auto-activate the env connection |
| `SSH_MCP_CONFIG` | Path to a config file (overrides the default `~/.ssh-mcp/config.json`) |

### Run standalone
```bash
npm start
# or: node dist/index.js
```

## Connecting an AI host

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/absolute/path/to/SSH_MCP/dist/index.js"],
      "env": {
        "SSH_MCP_CONFIG": "/Users/you/.ssh-mcp/config.json"
      }
    }
  }
}
```

Or with environment-only single server:
```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/absolute/path/to/SSH_MCP/dist/index.js"],
      "env": {
        "SSH_HOST": "10.0.0.10",
        "SSH_USER": "deploy",
        "SSH_AUTH_METHOD": "privateKey",
        "SSH_PRIVATE_KEY_PATH": "/Users/you/.ssh/id_ed25519"
      }
    }
  }
}
```

### WorkBuddy / other MCP hosts
Point the host's MCP config at `node /path/to/dist/index.js` with the appropriate
environment variables. Restart the host after saving.

On startup the default connection is auto-connected (failures are logged to stderr
and surfaced to the agent when it calls a tool). The agent can then call
`list_connections`, `connect`, etc. to switch servers.

## Architecture

```
AI host (Claude Desktop / WorkBuddy / ...)
    │  stdio (MCP protocol)
    ▼
src/index.ts                 entry: load config, start server, graceful shutdown
├── config.ts                config file + env var loading & validation
├── ssh/
│   ├── connection-manager.ts  ssh2 Client lifecycle + exec (timeout-aware)
│   └── sftp-operations.ts     SFTP file ops + shell-based copy/chmod/rm -rf
└── mcp/
    ├── tools.ts             17 MCP tools (zod schemas → JSON Schema)
    └── server.ts            stdio MCP server wiring
```

All diagnostics go to **stderr**; stdout is reserved exclusively for the MCP protocol.

## Development
```bash
npm run dev       # watch compile
npm test          # run vitest
npm run typecheck # tsc --noEmit
```

## Security notes
- Secrets live in your config file or environment — protect them (file perms, secret manager).
- `execute_command` and `delete_directory` (recursive) are powerful and irreversible; agents
  should confirm destructive actions with you.
- Connections target the hosts you configure; no inbound ports are opened by this server.

## License
MIT — see [LICENSE](LICENSE).
