import { ipcMain } from 'electron'

export function registerIpcHandlers(): void {
  ipcMain.handle('connection:list', async () => {
    return []
  })
  ipcMain.handle('connection:save', async (_event, _conn) => {
    throw new Error('connection:save not yet implemented')
  })
  ipcMain.handle('connection:delete', async (_event, _id) => {
    throw new Error('connection:delete not yet implemented')
  })
  ipcMain.handle('connection:connect', async (_event, _id) => {
    throw new Error('connection:connect not yet implemented')
  })
  ipcMain.handle('connection:disconnect', async (_event, _id) => {
    throw new Error('connection:disconnect not yet implemented')
  })
  ipcMain.handle('connection:test', async (_event, _conn) => {
    throw new Error('connection:test not yet implemented')
  })
  ipcMain.handle('connection:status', async (_event, _id) => {
    return { id: _id, connected: false }
  })
  ipcMain.handle('files:list', async (_e, _connId, _remotePath) => {
    throw new Error('files:list not yet implemented')
  })
  ipcMain.handle('files:read', async (_e, _connId, _remotePath) => {
    throw new Error('files:read not yet implemented')
  })
  ipcMain.handle('files:write', async (_e, _connId, _remotePath, _content) => {
    throw new Error('files:write not yet implemented')
  })
  ipcMain.handle('files:stat', async (_e, _connId, _remotePath) => {
    throw new Error('files:stat not yet implemented')
  })
  ipcMain.handle('files:mkdir', async (_e, _connId, _remotePath) => {
    throw new Error('files:mkdir not yet implemented')
  })
  ipcMain.handle('files:remove', async (_e, _connId, _remotePath) => {
    throw new Error('files:remove not yet implemented')
  })
  ipcMain.handle('mcp:status', async () => {
    return { running: false, activeConnectionId: null }
  })
  ipcMain.handle('mcp:setActiveConnection', async (_event, _connId) => {
    throw new Error('mcp:setActiveConnection not yet implemented')
  })
}
