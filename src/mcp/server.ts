import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ConnectionManager } from '../ssh/connection-manager.js'
import type { McpConfig } from '../types.js'
import { resolveDefaultName } from '../config.js'
import { defineTools, zodToJsonSchema, type McpTool, type ToolContext } from './tools.js'

/**
 * Stdio MCP server. Reads connection config, manages the active connection,
 * and exposes SSH file/exec tools to AI agents over the MCP stdio transport.
 *
 * NOTE: all diagnostic logging goes to stderr — stdout is reserved for the MCP
 * protocol and must not be polluted.
 */
export class McpServer {
  private server: Server | null = null
  private transport: StdioServerTransport | null = null
  private tools: McpTool[]
  private activeName: string | null = null
  private running = false

  private readonly ctx: ToolContext

  constructor(
    private manager: ConnectionManager,
    private config: McpConfig,
  ) {
    this.ctx = {
      config,
      manager,
      getActiveName: () => this.activeName,
      setActiveName: (name) => {
        this.activeName = name
      },
    }
    this.tools = defineTools(this.ctx)
  }

  getActiveName(): string | null {
    return this.activeName
  }

  isRunning(): boolean {
    return this.running
  }

  /** Connect the default connection (if any) and mark it active. Non-fatal. */
  async startDefaultConnection(): Promise<void> {
    const name = resolveDefaultName(this.config)
    if (!name) return
    const cfg = this.config.connections.find((c) => c.name === name)
    if (!cfg) return
    try {
      if (!this.manager.isConnected(name)) {
        await this.manager.connect(cfg)
      }
      this.activeName = name
      console.error(`[ssh-mcp] Connected to default server "${name}" (${cfg.host}:${cfg.port})`)
    } catch (err) {
      console.error(`[ssh-mcp] Failed to connect to "${name}": ${(err as Error).message}`)
    }
  }

  async start(): Promise<void> {
    if (this.running) return

    this.server = new Server(
      { name: 'ssh-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    )

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: zodToJsonSchema(t.inputSchema),
        })),
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const toolName = request.params.name
      const args = (request.params.arguments as Record<string, unknown>) ?? {}
      const tool = this.tools.find((t) => t.name === toolName)
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
          isError: true,
        }
      }
      try {
        return (await tool.handler(args)) as unknown as CallToolResult
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Tool error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    })

    this.transport = new StdioServerTransport()
    await this.server.connect(this.transport)
    this.running = true
    console.error('[ssh-mcp] MCP server ready on stdio')
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close()
      this.transport = null
    }
    this.server = null
    this.running = false
  }
}
