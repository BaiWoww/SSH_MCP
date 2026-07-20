export type AuthMethod = 'password' | 'privateKey' | 'agent'

export type FileType = 'file' | 'directory' | 'symlink' | 'other'

/**
 * A configured SSH target. `name` is the unique identifier used by the MCP
 * layer (it doubles as the connection id inside the connection manager).
 */
export interface SshConnectionConfig {
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  password?: string
  /** Inline private key contents (PEM). */
  privateKey?: string
  /** Path to a private key file. Resolved and read at config load time. */
  privateKeyPath?: string
  passphrase?: string
  readyTimeout?: number
  keepaliveInterval?: number
  /** Mark this connection as the default target. */
  default?: boolean
}

export interface McpConfig {
  connections: SshConnectionConfig[]
  /** Name of the connection to activate on startup. Falls back to default/first. */
  defaultConnection?: string
}

export interface ConnectionStatus {
  name: string
  connected: boolean
  error?: string
  lastConnectedAt?: string
}

export interface RemoteFileEntry {
  name: string
  path: string
  type: FileType
  size: number
  modifyTime: number
  accessTime: number
  mode: number
}

export interface RemoteFileStat {
  path: string
  type: FileType
  size: number
  modifyTime: number
  accessTime: number
  mode: number
}

export interface ExecResult {
  command: string
  stdout: string
  stderr: string
  code: number
  timedOut: boolean
}

/** Public view of a connection — secrets stripped, safe to return to agents. */
export interface ConnectionInfo {
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  default: boolean
  connected: boolean
  lastConnectedAt?: string
}
