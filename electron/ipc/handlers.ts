import { ipcMain, BrowserWindow } from 'electron'
import { CredentialStore } from '../ssh/credential-store'
import { ConnectionManager } from '../ssh/connection-manager'
import { SftpOperations } from '../ssh/sftp-operations'
import { McpServerController } from '../mcp/server'
import { McpHttpBridge } from '../mcp/bridge'
import * as crypto from 'crypto'
import type { ConnectionConfig, McpActivityEntry } from '../types'

const credentialStore = new CredentialStore()
const connectionManager = new ConnectionManager()
const mcpServer = new McpServerController(connectionManager)
const mcpBridge = new McpHttpBridge(connectionManager)
let bridgeStarted = false

function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, data)
  }
}

connectionManager.on('statusChange', (status) => {
  sendToRenderer('connection:statusChange', status)
})

mcpServer.on('activity', (entry: McpActivityEntry) => {
  sendToRenderer('mcp:activity', entry)
})

export function registerIpcHandlers(): void {
  ipcMain.handle('connection:list', async () => {
    return credentialStore.listConnections()
  })

  ipcMain.handle('connection:save', async (_event, conn: ConnectionConfig) => {
    const id = conn.id || crypto.randomUUID()
    const toSave: ConnectionConfig = { ...conn, id }
    await credentialStore.saveConnection(toSave)
    return toSave
  })

  ipcMain.handle('connection:delete', async (_event, id: string) => {
    if (connectionManager.isConnected(id)) {
      await connectionManager.disconnect(id)
    }
    await credentialStore.deleteConnection(id)
  })

  ipcMain.handle('connection:connect', async (_event, id: string) => {
    const config = await credentialStore.getConnection(id)
    if (!config) throw new Error(`Connection ${id} not found`)
    await connectionManager.connect(config)
  })

  ipcMain.handle('connection:disconnect', async (_event, id: string) => {
    if (mcpServer.getActiveConnectionId() === id) {
      mcpServer.setActiveConnection(null)
    }
    await connectionManager.disconnect(id)
  })

  ipcMain.handle('connection:test', async (_event, conn: ConnectionConfig) => {
    try {
      await connectionManager.connect(conn)
      await connectionManager.disconnect(conn.id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('connection:quickConnect', async (_event, conn: ConnectionConfig) => {
    const existing = await credentialStore.listConnections()
    const match = existing.find(
      (c) => c.host === conn.host && c.port === conn.port && c.username === conn.username,
    )
    const id = match?.id ?? crypto.randomUUID()
    const name = match?.name ?? `${conn.username}@${conn.host}:${conn.port}`
    const toSave: ConnectionConfig = { ...conn, id, name }
    await credentialStore.saveConnection(toSave)
    await connectionManager.connect(toSave)
    return toSave
  })

  ipcMain.handle('connection:status', async (_event, id: string) => {
    return connectionManager.getStatus(id)
  })

  ipcMain.handle('files:list', async (_e, connId: string, remotePath: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    return ops.listDirectory(remotePath)
  })

  ipcMain.handle('files:read', async (_e, connId: string, remotePath: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    return ops.readFile(remotePath)
  })

  ipcMain.handle('files:write', async (_e, connId: string, remotePath: string, content: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    await ops.writeFile(remotePath, content)
  })

  ipcMain.handle('files:stat', async (_e, connId: string, remotePath: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    return ops.stat(remotePath)
  })

  ipcMain.handle('files:mkdir', async (_e, connId: string, remotePath: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    await ops.mkdirp(remotePath)
  })

  ipcMain.handle('files:remove', async (_e, connId: string, remotePath: string) => {
    const ops = new SftpOperations(connectionManager, connId)
    await ops.remove(remotePath)
  })

  ipcMain.handle('mcp:status', async () => {
    return {
      running: mcpServer.isRunning(),
      activeConnectionId: mcpServer.getActiveConnectionId(),
      transport: 'stdio' as const,
    }
  })

  ipcMain.handle('mcp:setActiveConnection', async (_event, connId: string) => {
    if (!connectionManager.isConnected(connId)) {
      throw new Error(`Connection ${connId} is not active`)
    }
    mcpServer.setActiveConnection(connId)
    if (!mcpServer.isRunning()) {
      await mcpServer.start()
    }
    if (!bridgeStarted) {
      await mcpBridge.start()
      bridgeStarted = true
    }
  })

  ipcMain.handle('mcp:bridgePort', async () => {
    if (!bridgeStarted) {
      await mcpBridge.start()
      bridgeStarted = true
    }
    return mcpBridge.getPort()
  })
}
