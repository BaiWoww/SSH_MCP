import type { ConnectionConfig, ConnectionStatus, McpStatus } from '../../electron/types'

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
  mcp: {
    getStatus: (): Promise<McpStatus> => window.api.mcp.getStatus(),
    setActiveConnection: (connId: string): Promise<void> =>
      window.api.mcp.setActiveConnection(connId),
    getBridgePort: (): Promise<number> => window.api.mcp.getBridgePort(),
  },
  connectionEvents: {
    onStatusChange: (cb: (status: ConnectionStatus) => void): (() => void) =>
      window.api.connectionEvents.onStatusChange(cb),
  },
}
