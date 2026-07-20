import { contextBridge, ipcRenderer } from 'electron'

const api = {
  connection: {
    list: () => ipcRenderer.invoke('connection:list'),
    save: (conn: unknown) => ipcRenderer.invoke('connection:save', conn),
    delete: (id: string) => ipcRenderer.invoke('connection:delete', id),
    connect: (id: string) => ipcRenderer.invoke('connection:connect', id),
    disconnect: (id: string) => ipcRenderer.invoke('connection:disconnect', id),
    test: (conn: unknown) => ipcRenderer.invoke('connection:test', conn),
    quickConnect: (conn: unknown) => ipcRenderer.invoke('connection:quickConnect', conn),
    status: (id: string) => ipcRenderer.invoke('connection:status', id),
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:status'),
    setActiveConnection: (connId: string) =>
      ipcRenderer.invoke('mcp:setActiveConnection', connId),
    getBridgePort: () => ipcRenderer.invoke('mcp:bridgePort'),
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
