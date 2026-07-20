import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { AuthMethod, McpConfig, SshConnectionConfig } from './types.js'

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.ssh-mcp', 'config.json')

/**
 * Load MCP configuration. Connections may come from a JSON config file and/or
 * environment variables. Environment variables define a single connection named
 * "default" (overridable via SSH_CONNECTION_NAME) and take precedence over a
 * file entry with the same name; when present it becomes the default target.
 *
 * Config file search order:
 *   1. $SSH_MCP_CONFIG (explicit path)
 *   2. ~/.ssh-mcp/config.json (if it exists)
 */
export function loadConfig(): McpConfig {
  const fileConfig = loadConfigFile()
  const envConnection = loadEnvConnection()

  const connections: SshConnectionConfig[] = fileConfig.connections
    ? structuredClone(fileConfig.connections)
    : []

  if (envConnection) {
    const idx = connections.findIndex((c) => c.name === envConnection.name)
    if (idx >= 0) connections[idx] = envConnection
    else connections.push(envConnection)
  }

  // Resolve private key files into inline key material.
  for (const conn of connections) {
    if (!conn.privateKey && conn.privateKeyPath) {
      conn.privateKey = fs.readFileSync(conn.privateKeyPath, 'utf8')
    }
    delete conn.privateKeyPath
  }

  validateConnections(connections)

  let defaultConnection = fileConfig.defaultConnection
  if (envConnection && process.env.SSH_DEFAULT !== 'false') {
    defaultConnection = envConnection.name
  }
  if (!defaultConnection) {
    const flagged = connections.find((c) => c.default)
    defaultConnection = flagged?.name ?? connections[0]?.name
  }

  if (connections.length === 0) {
    console.error(
      '[ssh-mcp] No SSH connections configured. Provide a config file ' +
        '(~/.ssh-mcp/config.json or $SSH_MCP_CONFIG) or SSH_* environment variables.',
    )
  }

  return { connections, defaultConnection }
}

function loadConfigFile(): Partial<McpConfig> {
  const configPath = process.env.SSH_MCP_CONFIG ?? DEFAULT_CONFIG_PATH
  if (!fs.existsSync(configPath)) return {}
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<McpConfig>
    return parsed
  } catch (err) {
    throw new Error(`Failed to parse config file ${configPath}: ${(err as Error).message}`)
  }
}

function loadEnvConnection(): SshConnectionConfig | null {
  const host = process.env.SSH_HOST
  if (!host) return null

  const authMethod = (process.env.SSH_AUTH_METHOD as AuthMethod | undefined) ?? 'password'
  const name = process.env.SSH_CONNECTION_NAME ?? 'default'

  const conn: SshConnectionConfig = {
    name,
    host,
    port: parseInt(process.env.SSH_PORT ?? '22', 10),
    username: process.env.SSH_USER ?? process.env.SSH_USERNAME ?? 'root',
    authMethod,
    default: process.env.SSH_DEFAULT !== 'false',
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
    conn.privateKey = process.env.SSH_PRIVATE_KEY
    conn.privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH
    conn.passphrase = process.env.SSH_PASSPHRASE
    if (!conn.privateKey && !conn.privateKeyPath) {
      throw new Error('SSH_AUTH_METHOD=privateKey requires SSH_PRIVATE_KEY or SSH_PRIVATE_KEY_PATH')
    }
  }

  return conn
}

function validateConnections(connections: SshConnectionConfig[]): void {
  const seen = new Set<string>()
  for (const conn of connections) {
    if (!conn.name) throw new Error('Each connection must have a name')
    if (seen.has(conn.name)) throw new Error(`Duplicate connection name: ${conn.name}`)
    seen.add(conn.name)
    if (!conn.host) throw new Error(`Connection "${conn.name}" is missing host`)
    if (!conn.username) throw new Error(`Connection "${conn.name}" is missing username`)
    if (conn.authMethod === 'password' && !conn.password) {
      throw new Error(`Connection "${conn.name}" (password auth) is missing password`)
    }
    if (conn.authMethod === 'privateKey' && !conn.privateKey) {
      throw new Error(`Connection "${conn.name}" (privateKey auth) is missing privateKey`)
    }
  }
}

export function findConnection(
  config: McpConfig,
  name?: string,
): SshConnectionConfig | undefined {
  if (!name) return undefined
  return config.connections.find((c) => c.name === name)
}

export function resolveDefaultName(config: McpConfig): string | undefined {
  return config.defaultConnection ?? config.connections.find((c) => c.default)?.name ?? config.connections[0]?.name
}
