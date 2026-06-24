import type {
  ConnectionConfig,
  ConnectionStatus,
  RemoteFileEntry,
  RemoteFileStat,
  McpActivityEntry,
  McpStatus,
} from '../../electron/types'

export const ipc = {
  connection: {
    list: (): Promise<ConnectionConfig[]> => window.api.connection.list(),
    save: (conn: ConnectionConfig): Promise<ConnectionConfig> =>
      window.api.connection.save(conn),
    delete: (id: string): Promise<void> => window.api.connection.delete(id),
    connect: (id: string): Promise<void> => window.api.connection.connect(id),
    disconnect: (id: string): Promise<void> => window.api.connection.disconnect(id),
    test: (conn: ConnectionConfig): Promise<{ ok: boolean; error?: string }> =>
      window.api.connection.test(conn),
    quickConnect: (conn: ConnectionConfig): Promise<ConnectionConfig> =>
      window.api.connection.quickConnect(conn),
    status: (id: string): Promise<ConnectionStatus> =>
      window.api.connection.status(id),
  },
  files: {
    list: (connId: string, remotePath: string): Promise<RemoteFileEntry[]> =>
      window.api.files.list(connId, remotePath),
    read: (connId: string, remotePath: string): Promise<string> =>
      window.api.files.read(connId, remotePath),
    write: (connId: string, remotePath: string, content: string): Promise<void> =>
      window.api.files.write(connId, remotePath, content),
    stat: (connId: string, remotePath: string): Promise<RemoteFileStat> =>
      window.api.files.stat(connId, remotePath),
    mkdir: (connId: string, remotePath: string): Promise<void> =>
      window.api.files.mkdir(connId, remotePath),
    remove: (connId: string, remotePath: string): Promise<void> =>
      window.api.files.remove(connId, remotePath),
  },
  mcp: {
    getStatus: (): Promise<McpStatus> => window.api.mcp.getStatus(),
    setActiveConnection: (connId: string): Promise<void> =>
      window.api.mcp.setActiveConnection(connId),
    getBridgePort: (): Promise<number> => window.api.mcp.getBridgePort(),
    onActivity: (cb: (entry: McpActivityEntry) => void): (() => void) =>
      window.api.mcp.onActivity(cb),
  },
  connectionEvents: {
    onStatusChange: (cb: (status: ConnectionStatus) => void): (() => void) =>
      window.api.connectionEvents.onStatusChange(cb),
  },
}
