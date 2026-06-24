import * as crypto from 'crypto'
import * as path from 'path'
import { app } from 'electron'
import Store from 'electron-store'
import keytar from 'keytar'
import type { ConnectionConfig } from '../types'

const SERVICE_NAME = 'AgentSSH'
const KEYCHAIN_KEY = 'master-encryption-key'
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16

interface StoredConnectionMetadata {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey' | 'agent'
  readyTimeout?: number
  keepaliveInterval?: number
  encryptedSecret: string
  iv: string
  authTag: string
}

function getOrCreateMasterKey(): Buffer {
  const existing = keytar.getPasswordSync(SERVICE_NAME, KEYCHAIN_KEY)
  if (existing) {
    return Buffer.from(existing, 'base64')
  }
  const newKey = crypto.randomBytes(KEY_LENGTH)
  keytar.setPasswordSync(SERVICE_NAME, KEYCHAIN_KEY, newKey.toString('base64'))
  return newKey
}

function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

function decrypt(ciphertext: string, iv: string, authTag: string, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export class CredentialStore {
  private store: Store<{ connections: Record<string, StoredConnectionMetadata> }>
  private masterKey: Buffer

  constructor() {
    const userDataPath = app?.getPath('userData') ?? path.join(process.cwd(), '.agentssh-data')
    this.store = new Store<{ connections: Record<string, StoredConnectionMetadata> }>({
      name: 'agentssh-credentials',
      cwd: userDataPath,
      defaults: { connections: {} },
    })
    this.masterKey = getOrCreateMasterKey()
  }

  async saveConnection(conn: ConnectionConfig): Promise<void> {
    const secret = conn.authMethod === 'password'
      ? (conn.password ?? '')
      : (conn.privateKey ?? '')
    const { ciphertext, iv, authTag } = encrypt(secret, this.masterKey)
    const metadata: StoredConnectionMetadata = {
      id: conn.id,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      authMethod: conn.authMethod,
      readyTimeout: conn.readyTimeout,
      keepaliveInterval: conn.keepaliveInterval,
      encryptedSecret: ciphertext,
      iv,
      authTag,
    }
    const connections = this.store.get('connections', {})
    connections[conn.id] = metadata
    this.store.set('connections', connections)
  }

  async getConnection(id: string): Promise<ConnectionConfig | undefined> {
    const connections = this.store.get('connections', {})
    const meta = connections[id]
    if (!meta) return undefined
    const secret = decrypt(meta.encryptedSecret, meta.iv, meta.authTag, this.masterKey)
    const conn: ConnectionConfig = {
      id: meta.id,
      name: meta.name,
      host: meta.host,
      port: meta.port,
      username: meta.username,
      authMethod: meta.authMethod,
      readyTimeout: meta.readyTimeout,
      keepaliveInterval: meta.keepaliveInterval,
    }
    if (meta.authMethod === 'password') {
      conn.password = secret
    } else if (meta.authMethod === 'privateKey') {
      conn.privateKey = secret
      conn.passphrase = conn.passphrase
    }
    return conn
  }

  async listConnections(): Promise<ConnectionConfig[]> {
    const connections = this.store.get('connections', {})
    const result: ConnectionConfig[] = []
    for (const id of Object.keys(connections)) {
      const conn = await this.getConnection(id)
      if (conn) result.push(conn)
    }
    return result
  }

  async deleteConnection(id: string): Promise<void> {
    const connections = this.store.get('connections', {})
    delete connections[id]
    this.store.set('connections', connections)
  }

  getRawMetadata(id: string): StoredConnectionMetadata | undefined {
    return this.store.get('connections', {})[id]
  }
}
