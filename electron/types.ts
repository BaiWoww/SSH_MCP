export type AuthMethod = 'password' | 'privateKey' | 'agent'

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  password?: string
  privateKey?: string
  passphrase?: string
  readyTimeout?: number
  keepaliveInterval?: number
}

export interface ConnectionStatus {
  id: string
  connected: boolean
  error?: string
  lastConnectedAt?: string
}

export type FileType = 'file' | 'directory' | 'symlink' | 'other'

export interface RemoteFileEntry {
  name: string
  path: string
  type: FileType
  size: number
  modifyTime: number
  accessTime: number
  rights?: { user: string; group: string; other: string }
  owner?: number
  group?: number
}

export interface RemoteFileStat {
  path: string
  type: FileType
  size: number
  modifyTime: number
  accessTime: number
  mode: number
}

export interface McpActivityEntry {
  timestamp: string
  toolName: string
  connectionId: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  durationMs: number
}

export interface McpStatus {
  running: boolean
  activeConnectionId: string | null
  transport: 'stdio' | 'sse' | 'none'
}

export interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}
