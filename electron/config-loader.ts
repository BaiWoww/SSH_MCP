import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { AuthMethod, ConnectionConfig } from './types'

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.ssh-mcp', 'config.json')

export interface HeadlessConfig {
  connections: ConnectionConfig[]
  defaultConnection?: string
}

interface RawConnection {
  name: string
  host: string
  port?: number
  username: string
  authMethod: AuthMethod
  password?: string
  privateKey?: string
  privateKeyPath?: string
  passphrase?: string
  readyTimeout?: number
  keepaliveInterval?: number
  default?: boolean
}

interface RawConfigFile {
  defaultConnection?: string
  connections?: RawConnection[]
}

function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
  return p
}

/**
 * Load headless MCP config. Connections may come from a JSON config file
 * ($SSH_MCP_CONFIG or ~/.ssh-mcp/config.json) and/or SSH_* env vars. The env
 * connection is named "default" (overridable via SSH_CONNECTION_NAME) and
 * overrides a file entry with the same name. Connection `id` is set to `name`.
 */
export function loadHeadlessConfig(): HeadlessConfig {
  const raw = loadRawConfig()
  const connections: ConnectionConfig[] = []

  for (const r of raw.connections ?? []) {
    let privateKey = r.privateKey
    if (!privateKey && r.privateKeyPath) {
      privateKey = fs.readFileSync(expandHome(r.privateKeyPath), 'utf8')
    }
    connections.push({
      id: r.name,
      name: r.name,
      host: r.host,
      port: r.port ?? 22,
      username: r.username,
      authMethod: r.authMethod,
      password: r.password,
      privateKey,
      passphrase: r.passphrase,
      readyTimeout: r.readyTimeout,
      keepaliveInterval: r.keepaliveInterval,
    })
  }

  const envConn = loadEnvConnection()
  if (envConn) {
    const idx = connections.findIndex((c) => c.name === envConn.name)
    if (idx >= 0) connections[idx] = envConn
    else connections.push(envConn)
  }

  validate(connections)

  let defaultConnection = raw.defaultConnection
  if (envConn && process.env.SSH_DEFAULT !== 'false') {
    defaultConnection = envConn.name
  }
  if (!defaultConnection) {
    const flagged = raw.connections?.find((r) => r.default)
    if (flagged) defaultConnection = flagged.name
  }
  if (!defaultConnection) {
    defaultConnection = connections[0]?.name
  }

  if (connections.length === 0) {
    console.error(
      '[ssh-mcp] No SSH connections configured. Provide a config file ' +
        '(~/.ssh-mcp/config.json or $SSH_MCP_CONFIG) or SSH_* environment variables.',
    )
  }

  return { connections, defaultConnection }
}

function loadRawConfig(): RawConfigFile {
  const configPath = process.env.SSH_MCP_CONFIG ?? DEFAULT_CONFIG_PATH
  if (!fs.existsSync(configPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as RawConfigFile
  } catch (err) {
    throw new Error(`Failed to parse config file ${configPath}: ${(err as Error).message}`)
  }
}

function loadEnvConnection(): ConnectionConfig | null {
  const host = process.env.SSH_HOST
  if (!host) return null

  const authMethod = (process.env.SSH_AUTH_METHOD as AuthMethod | undefined) ?? 'password'
  const name = process.env.SSH_CONNECTION_NAME ?? 'default'

  const conn: ConnectionConfig = {
    id: name,
    name,
    host,
    port: parseInt(process.env.SSH_PORT ?? '22', 10),
    username: process.env.SSH_USER ?? process.env.SSH_USERNAME ?? 'root',
    authMethod,
  }

  if (process.env.SSH_READY_TIMEOUT) {
    conn.readyTimeout = parseInt(process.env.SSH_READY_TIMEOUT, 10)
  }
  if (process.env.SSH_KEEPALIVE_INTERVAL) {
    conn.keepaliveInterval = parseInt(process.env.SSH_KEEPALIVE_INTERVAL, 10)
  }

  if (authMethod === 'password') {
    conn.password = process.env.SSH_PASSWORD ?? ''
  } else if (authMethod === 'privateKey') {
    if (process.env.SSH_PRIVATE_KEY) {
      conn.privateKey = process.env.SSH_PRIVATE_KEY
    } else if (process.env.SSH_PRIVATE_KEY_PATH) {
      conn.privateKey = fs.readFileSync(expandHome(process.env.SSH_PRIVATE_KEY_PATH), 'utf8')
    } else {
      throw new Error('SSH_AUTH_METHOD=privateKey requires SSH_PRIVATE_KEY or SSH_PRIVATE_KEY_PATH')
    }
    conn.passphrase = process.env.SSH_PASSPHRASE
  }

  return conn
}

function validate(connections: ConnectionConfig[]): void {
  const seen = new Set<string>()
  for (const c of connections) {
    if (!c.name) throw new Error('Each connection must have a name')
    if (seen.has(c.name)) throw new Error(`Duplicate connection name: ${c.name}`)
    seen.add(c.name)
    if (!c.host) throw new Error(`Connection "${c.name}" is missing host`)
    if (!c.username) throw new Error(`Connection "${c.name}" is missing username`)
    if (c.authMethod === 'password' && !c.password) {
      throw new Error(`Connection "${c.name}" (password auth) is missing password`)
    }
    if (c.authMethod === 'privateKey' && !c.privateKey) {
      throw new Error(`Connection "${c.name}" (privateKey auth) is missing privateKey`)
    }
  }
}
