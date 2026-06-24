# AgentSSH

**AI Agent-specialized SSH Client** — Secure SSH connections with MCP (Model Context Protocol) file operations.

AgentSSH is an Electron desktop application that bridges SSH remote servers with AI agents like Claude Desktop. It manages persistent SSH connections, provides a GUI for browsing and editing remote files via SFTP, and exposes 7 file operations as standard MCP tools so AI assistants can directly read, write, and manage files on your cloud servers.

## Features

- **Multiple SSH Connections** — Manage multiple connections with password, private key, or SSH agent authentication
- **Remote File Explorer** — Browse remote filesystem with a tree view, lazily loading directory contents on demand
- **Built-in Code Editor** — View and edit remote files with Monaco Editor, supporting syntax highlighting for multiple languages
- **MCP Server Integration** — Expose remote file operations as MCP tools for AI agents
- **Dual MCP Modes**:
  - **Embedded** — MCP server runs inside the Electron app over stdio transport
  - **Standalone** — Separate MCP process launches via Claude Desktop, communicating through an HTTP bridge
- **Credential Encryption** — SSH credentials are AES-256-GCM encrypted and stored via OS-level keychain (keytar)
- **Activity Log** — Real-time log of MCP tool invocations with timing and result tracking

## MCP Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read the full contents of a remote file |
| `write_file` | Write text content to a remote file (supports base64 for binary) |
| `list_directory` | List directory contents with metadata |
| `get_file_info` | Get detailed file/directory stats |
| `create_directory` | Create directories (mkdir -p) |
| `delete_file` | Delete a remote file |
| `file_exists` | Check if a file/directory exists |

## Architecture

```
Renderer (React + Vite + Tailwind CSS + Zustand)
    │  window.api (contextBridge IPC)
    ▼
Main Process (Electron)
    ├── SSH Manager (ssh2)
    │   ├── Connection Management
    │   ├── SFTP Operations
    │   └── Encrypted Credential Store
    ├── MCP Server (embedded stdio)
    ├── MCP Http Bridge (127.0.0.1)
    └── MCP Standalone (launched by Claude Desktop)
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand, Monaco Editor
- **Backend**: Electron 30, ssh2, electron-store, keytar
- **MCP**: @modelcontextprotocol/sdk
- **Validation**: Zod
- **Build**: Vite, electron-builder

## Getting Started

### Prerequisites

- Node.js >= 18
- npm

### Install

```bash
git clone https://github.com/BaiWoww/SSH_MCP.git
cd SSH_MCP
npm install
```

### Development

```bash
npm run dev
```

Runs both the Vite dev server and Electron app concurrently.

### Build

```bash
npm run build:electron
```

Builds the Electron application with electron-builder (output in `release/`).

### Running Tests

```bash
npm test
```

## Claude Desktop Integration

1. Launch AgentSSH, connect to a server, and activate the connection
2. Go to the **Agent** tab to see the Claude Desktop configuration snippet
3. Copy the JSON to your `claude_desktop_config.json`:

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

4. Restart Claude Desktop — it will now have access to AgentSSH's file operation tools

## Project Structure

```
src/                         # Renderer (React frontend)
├── components/              # UI components
│   ├── ConnectionList.tsx   # Saved connections list
│   ├── ConnectionForm.tsx   # Create/edit connection
│   ├── QuickConnectForm.tsx # Quick password connect
│   ├── FileExplorer.tsx     # Remote file tree
│   ├── FileEditor.tsx       # Monaco editor
│   └── AgentPanel.tsx       # MCP status & config
├── store/                   # Zustand state
├── lib/                     # IPC wrappers
├── App.tsx                  # Root layout (tabs)
└── main.tsx                 # Entry point

electron/                    # Main process (Node.js backend)
├── main.ts                  # Electron entry, window creation
├── preload.ts               # Context bridge
├── types.ts                 # Shared TypeScript types
├── ssh/
│   ├── connection-manager.ts # SSH connection lifecycle
│   ├── sftp-operations.ts   # SFTP file operations
│   └── credential-store.ts  # Encrypted storage
├── mcp/
│   ├── tools.ts             # MCP tool definitions
│   ├── server.ts            # Embedded MCP server
│   ├── bridge.ts            # HTTP bridge for standalone
│   └── standalone.ts        # Standalone MCP entry
└── ipc/
    └── handlers.ts          # IPC handler registration

tests/                       # Test suite
```

## License

MIT License - see [LICENSE](LICENSE) for details.
