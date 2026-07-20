#!/usr/bin/env node
import { loadConfig } from './config.js'
import { ConnectionManager } from './ssh/connection-manager.js'
import { McpServer } from './mcp/server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const manager = new ConnectionManager()
  const server = new McpServer(manager, config)

  // Eagerly connect the default server so tools work immediately. Non-fatal:
  // the agent can still call list_connections / connect after startup.
  await server.startDefaultConnection()

  await server.start()

  const shutdown = async (signal: string): Promise<void> => {
    console.error(`[ssh-mcp] Received ${signal}, shutting down...`)
    try {
      await server.stop()
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
