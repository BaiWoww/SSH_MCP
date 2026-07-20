#!/usr/bin/env node
/**
 * Headless MCP entry point — no GUI. Reads connections from a config file
 * ($SSH_MCP_CONFIG or ~/.ssh-mcp/config.json) and/or SSH_* env vars, connects
 * to the default server, and exposes the 12 MCP tools over stdio.
 *
 * Hosts (WorkBuddy / Claude Desktop) launch this directly:
 *   node dist-electron/headless.js
 */
import { loadHeadlessConfig } from './config-loader'
import { ConnectionManager } from './ssh/connection-manager'
import { McpServerController } from './mcp/server'

async function main(): Promise<void> {
  const config = loadHeadlessConfig()
  const manager = new ConnectionManager()
  const mcp = new McpServerController(manager)

  const defaultName = config.defaultConnection
  let activeId: string | null = null
  if (defaultName) {
    const conn = config.connections.find((c) => c.name === defaultName)
    if (conn) {
      try {
        if (!manager.isConnected(conn.id)) {
          await manager.connect(conn)
        }
        activeId = conn.id
        console.error(`[ssh-mcp] Connected to "${conn.name}" (${conn.host}:${conn.port})`)
      } catch (err) {
        console.error(`[ssh-mcp] Failed to connect to "${conn.name}": ${(err as Error).message}`)
      }
    }
  }
  // Always initialize the tool set so tools/list works even before a
  // connection is established; tool calls without a connection return a
  // clear error guiding the agent to configure one.
  mcp.setActiveConnection(activeId)

  await mcp.start()
  console.error('[ssh-mcp] MCP server ready on stdio')

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[ssh-mcp] Received ${signal}, shutting down...`)
    try {
      await mcp.stop()
      await manager.disconnectAll()
    } catch (err) {
      console.error(`[ssh-mcp] Error during shutdown: ${(err as Error).message}`)
    }
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error(`[ssh-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
