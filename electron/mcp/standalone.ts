import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BRIDGE_PORT = parseInt(process.env.AGENTSSH_BRIDGE_PORT ?? '0', 10)
const CONNECTION_ID = process.env.AGENTSSH_CONNECTION_ID ?? ''

if (!BRIDGE_PORT || !CONNECTION_ID) {
  console.error('AGENTSSH_BRIDGE_PORT and AGENTSSH_CONNECTION_ID env vars required')
  process.exit(1)
}

async function callBridge(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ tool, connectionId: CONNECTION_ID, args })
  const resp = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error((data as { error: string }).error)
  }
  return (data as { result: unknown }).result
}

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the full contents of a remote file (utf8 or base64).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the remote file to read' },
        encoding: { type: 'string', description: "'utf8' (default) or 'base64'" },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a remote file (overwrites; supports base64).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the remote file to write' },
        content: { type: 'string', description: 'Text content (or base64 when encoding=base64)' },
        encoding: { type: 'string', description: "Set to 'base64' for binary content" },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the contents of a remote directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to the remote directory' } },
      required: ['path'],
    },
  },
  {
    name: 'get_file_info',
    description: 'Get metadata about a remote file or directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to stat' } },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory including parents (mkdir -p).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the directory to create' } },
      required: ['path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file on the remote server.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the file to delete' } },
      required: ['path'],
    },
  },
  {
    name: 'delete_directory',
    description: 'Delete a directory (recursive=true uses rm -rf).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the directory to delete' },
        recursive: { type: 'boolean', description: 'Recursively delete contents (rm -rf)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'rename_or_move',
    description: 'Rename or move a remote file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        oldPath: { type: 'string', description: 'Current remote path' },
        newPath: { type: 'string', description: 'New remote path' },
      },
      required: ['oldPath', 'newPath'],
    },
  },
  {
    name: 'copy_file',
    description: 'Copy a remote file or directory (recursive=true for directories).',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source remote path' },
        destination: { type: 'string', description: 'Destination remote path' },
        recursive: { type: 'boolean', description: 'Copy directories recursively (cp -r)' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'file_exists',
    description: 'Check whether a remote path exists.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to check' } },
      required: ['path'],
    },
  },
  {
    name: 'chmod',
    description: 'Change permissions of a remote file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path' },
        mode: { type: 'string', description: 'Permission mode, e.g. "755"' },
        recursive: { type: 'boolean', description: 'Apply recursively (chmod -R)' },
      },
      required: ['path', 'mode'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command on the remote server (cwd/timeout optional).',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeoutSeconds: { type: 'number', description: 'Kill timeout in seconds (default 60, max 600)' },
      },
      required: ['command'],
    },
  },
]

const server = new Server(
  { name: 'agentssh-standalone', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await callBridge(
      request.params.name,
      (request.params.arguments as Record<string, unknown>) ?? {},
    )
    return {
      content: [
        { type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) },
      ],
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
      isError: true,
    }
  }
})

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Failed to start MCP standalone server:', err)
  process.exit(1)
})
