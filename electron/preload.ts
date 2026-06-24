import { contextBridge, ipcRenderer } from 'electron'

const api = {
  connection: {
    list: () => ipcRenderer.invoke('connection:list'),
    save: (conn: unknown) => ipcRenderer.invoke('connection:save', conn),
    delete: (id: string) => ipcRenderer.invoke('connection:delete', id),
    connect: (id: string) => ipcRenderer.invoke('connection:connect', id),
    disconnect: (id: string) => ipcRenderer.invoke('connection:disconnect', id),
    test: (conn: unknown) => ipcRenderer.invoke('connection:test', conn),
    status: (id: string) => ipcRenderer.invoke('connection:status', id),
  },
  files: {
    list: (connId: string, remotePath: string) =>
      ipcRenderer.invoke('files:list', connId, remotePath),
    read: (connId: string, remotePath: string) =>
      ipcRenderer.invoke('files:read', connId, remotePath),
    write: (connId: string, remotePath: string, content: string) =>
      ipcRenderer.invoke('files:write', connId, remotePath, content),
    stat: (connId: string, remotePath: string) =>
      ipcRenderer.invoke('files:stat', connId, remotePath),
    mkdir: (connId: string, remotePath: string) =>
      ipcRenderer.invoke('files:mkdir', connId, remotePath),
    remove: (connId: string, remotePath: string) =>
      ipcRenderer.invoke('files:remove', connId, remotePath),
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:status'),
    setActiveConnection: (connId: string) =>
      ipcRenderer.invoke('mcp:setActiveConnection', connId),
    getBridgePort: () => ipcRenderer.invoke('mcp:bridgePort'),
    onActivity: (callback: (entry: unknown) => void) => {
      const handler = (_e: unknown, entry: unknown) => callback(entry)
      ipcRenderer.on('mcp:activity', handler)
      return () => ipcRenderer.removeListener('mcp:activity', handler)
    },
  },
  connectionEvents: {
    onStatusChange: (callback: (status: unknown) => void) => {
      const handler = (_e: unknown, status: unknown) => callback(status)
      ipcRenderer.on('connection:statusChange', handler)
      return () => ipcRenderer.removeListener('connection:statusChange', handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
