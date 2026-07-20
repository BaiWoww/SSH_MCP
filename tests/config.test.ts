import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { loadConfig } from '../src/config'

const ENV_KEYS = [
  'SSH_HOST',
  'SSH_PORT',
  'SSH_USER',
  'SSH_USERNAME',
  'SSH_AUTH_METHOD',
  'SSH_PASSWORD',
  'SSH_PRIVATE_KEY',
  'SSH_PRIVATE_KEY_PATH',
  'SSH_PASSPHRASE',
  'SSH_CONNECTION_NAME',
  'SSH_DEFAULT',
  'SSH_MCP_CONFIG',
]

const saved: Record<string, string | undefined> = {}
const tempFiles: string[] = []

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  for (const f of tempFiles) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
  tempFiles.length = 0
})

function tmpFile(content: string): string {
  const p = path.join(os.tmpdir(), `ssh-mcp-test-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(p, content)
  tempFiles.push(p)
  return p
}

describe('loadConfig', () => {
  it('builds a default connection from env vars', () => {
    process.env.SSH_HOST = '1.2.3.4'
    process.env.SSH_USER = 'ubuntu'
    process.env.SSH_PASSWORD = 'pw'
    process.env.SSH_MCP_CONFIG = path.join(os.tmpdir(), 'does-not-exist.json')

    const config = loadConfig()
    expect(config.connections).toHaveLength(1)
    const conn = config.connections[0]
    expect(conn.name).toBe('default')
    expect(conn.host).toBe('1.2.3.4')
    expect(conn.username).toBe('ubuntu')
    expect(conn.authMethod).toBe('password')
    expect(conn.password).toBe('pw')
    expect(config.defaultConnection).toBe('default')
  })

  it('loads connections from a config file', () => {
    const file = tmpFile(
      JSON.stringify({
        defaultConnection: 'prod',
        connections: [
          { name: 'prod', host: 'p.example', port: 22, username: 'u', authMethod: 'password', password: 'p', default: true },
          { name: 'stg', host: 's.example', port: 22, username: 'u', authMethod: 'password', password: 's' },
        ],
      }),
    )
    process.env.SSH_MCP_CONFIG = file

    const config = loadConfig()
    expect(config.connections.map((c) => c.name).sort()).toEqual(['prod', 'stg'])
    expect(config.defaultConnection).toBe('prod')
  })

  it('resolves privateKeyPath into inline privateKey', () => {
    const keyPath = path.join(os.tmpdir(), `key-${Math.random().toString(36).slice(2)}`)
    fs.writeFileSync(keyPath, '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----\n')
    tempFiles.push(keyPath)
    const file = tmpFile(
      JSON.stringify({
        connections: [
          { name: 'k', host: 'h', port: 22, username: 'u', authMethod: 'privateKey', privateKeyPath: keyPath },
        ],
      }),
    )
    process.env.SSH_MCP_CONFIG = file

    const config = loadConfig()
    const conn = config.connections[0]
    expect(conn.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY')
    expect(conn.privateKeyPath).toBeUndefined()
  })

  it('env connection overrides a file entry with the same name', () => {
    const file = tmpFile(
      JSON.stringify({
        connections: [
          { name: 'default', host: 'file-host', port: 22, username: 'u', authMethod: 'password', password: 'fp' },
        ],
      }),
    )
    process.env.SSH_MCP_CONFIG = file
    process.env.SSH_HOST = 'env-host'
    process.env.SSH_USER = 'eu'
    process.env.SSH_PASSWORD = 'ep'

    const config = loadConfig()
    expect(config.connections).toHaveLength(1)
    expect(config.connections[0].host).toBe('env-host')
    expect(config.connections[0].password).toBe('ep')
  })

  it('throws on duplicate connection names in a file', () => {
    const file = tmpFile(
      JSON.stringify({
        connections: [
          { name: 'dup', host: 'a', port: 22, username: 'u', authMethod: 'password', password: 'p' },
          { name: 'dup', host: 'b', port: 22, username: 'u', authMethod: 'password', password: 'p' },
        ],
      }),
    )
    process.env.SSH_MCP_CONFIG = file
    expect(() => loadConfig()).toThrow(/Duplicate connection name/)
  })
})
