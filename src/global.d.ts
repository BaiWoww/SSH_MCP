import type {
  ConnectionConfig,
  ConnectionStatus,
  RemoteFileEntry,
  RemoteFileStat,
  McpActivityEntry,
  McpStatus,
} from '../electron/types'

declare global {
  interface Window {
    api: {
      connection: {
        list: () => Promise<ConnectionConfig[]>
        save: (conn: ConnectionConfig) => Promise<ConnectionConfig>
        delete: (id: string) => Promise<void>
        connect: (id: string) => Promise<void>
        disconnect: (id: string) => Promise<void>
        test: (conn: ConnectionConfig) => Promise<{ ok: boolean; error?: string }>
        status: (id: string) => Promise<ConnectionStatus>
      }
      files: {
        list: (connId: string, remotePath: string) => Promise<RemoteFileEntry[]>
        read: (connId: string, remotePath: string) => Promise<string>
        write: (connId: string, remotePath: string, content: string) => Promise<void>
        stat: (connId: string, remotePath: string) => Promise<RemoteFileStat>
        mkdir: (connId: string, remotePath: string) => Promise<void>
        remove: (connId: string, remotePath: string) => Promise<void>
      }
      mcp: {
        getStatus: () => Promise<McpStatus>
        setActiveConnection: (connId: string) => Promise<void>
        onActivity: (callback: (entry: McpActivityEntry) => void) => () => void
      }
      connectionEvents: {
        onStatusChange: (callback: (status: ConnectionStatus) => void) => () => void
      }
    }
  }
}

export {}
