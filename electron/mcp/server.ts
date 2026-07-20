import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { defineFileTools, McpTool } from './tools'
import type { ConnectionManager } from '../ssh/connection-manager'
import type { McpActivityEntry } from '../types'
import { EventEmitter } from 'events'

export class McpServerController extends EventEmitter {
  private server: Server | null = null
  private transport: StdioServerTransport | null = null
  private tools: McpTool[] = []
  private activeConnectionId: string | null = null
  private running = false

  constructor(private manager: ConnectionManager) {
    super()
  }

  setActiveConnection(connectionId: string | null): void {
    this.activeConnectionId = connectionId
    this.tools = defineFileTools(this.manager, this.activeConnectionId)
  }

  isRunning(): boolean {
    return this.running
  }

  getActiveConnectionId(): string | null {
    return this.activeConnectionId
  }

  async start(): Promise<void> {
    if (this.running) return

    this.server = new Server(
      {
        name: 'agentssh',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    )

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: {
            type: 'object' as const,
            properties: this.zodToProperties(t.inputSchema),
          },
        })),
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name
      const args = request.params.arguments as Record<string, unknown>
      const tool = this.tools.find((t) => t.name === toolName)
      if (!tool) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
          isError: true,
        }
      }
      const start = Date.now()
      const entry: McpActivityEntry = {
        timestamp: new Date().toISOString(),
        toolName,
        connectionId: this.activeConnectionId ?? '',
        args,
        durationMs: 0,
      }
      try {
        const result = await tool.handler(args)
        entry.result = result.content[0]?.text
        if (result.isError) {
          entry.error = result.content[0]?.text
        }
        this.emit('activity', entry)
        return result
      } catch (err) {
        entry.error = (err as Error).message
        entry.durationMs = Date.now() - start
        this.emit('activity', entry)
        return {
          content: [{ type: 'text' as const, text: `Tool error: ${(err as Error).message}` }],
          isError: true,
        }
      } finally {
        entry.durationMs = Date.now() - start
      }
    })

    this.transport = new StdioServerTransport()
    await this.server.connect(this.transport)
    this.running = true
  }

  async stop(): Promise<void> {
    if (!this.running) return
    if (this.transport) {
      await this.transport.close()
      this.transport = null
    }
    this.server = null
    this.running = false
  }

  private zodToProperties(schema: unknown): Record<string, unknown> {
    if (schema && typeof schema === 'object' && 'shape' in schema) {
      const shape = (schema as { shape: Record<string, unknown> }).shape
      const properties: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = { type: 'string' }
        if (value && typeof value === 'object' && 'description' in value) {
          properties[key] = {
            type: 'string',
            description: (value as { description: string }).description,
          }
        }
      }
      return properties
    }
    return {}
  }
}
