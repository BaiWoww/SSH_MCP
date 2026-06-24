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
    description: 'Read the full contents of a remote file on the connected SSH server.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, encoding: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write text content to a remote file, overwriting existing content.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, encoding: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'list_directory',
    description: 'List contents of a remote directory.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'get_file_info',
    description: 'Get metadata about a remote file or directory.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'create_directory',
    description: 'Create a directory on the remote server (mkdir -p).',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'delete_file',
    description: 'Delete a file on the remote SSH server.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists on the remote server.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
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
      request.params.arguments as Record<string, unknown>,
    )
    return {
      content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
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
