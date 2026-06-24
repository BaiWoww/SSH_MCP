import { Client, SFTPWrapper } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import type { ConnectionConfig, ConnectionStatus } from '../types'
import { EventEmitter } from 'events'

interface ManagedConnection {
  config: ConnectionConfig
  client: Client
  sftp: SFTPWrapper | null
  connected: boolean
  lastConnectedAt: string | null
}

export class ConnectionManager extends EventEmitter {
  private connections = new Map<string, ManagedConnection>()

  async connect(config: ConnectionConfig): Promise<void> {
    if (this.connections.has(config.id) && this.connections.get(config.id)!.connected) {
      return
    }

    const client = new Client()

    const connectOptions: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: config.readyTimeout ?? 20000,
      keepaliveInterval: config.keepaliveInterval ?? 30000,
    }

    if (config.authMethod === 'password') {
      connectOptions.password = config.password
    } else if (config.authMethod === 'privateKey') {
      connectOptions.privateKey = config.privateKey
      if (config.passphrase) {
        connectOptions.passphrase = config.passphrase
      }
    } else if (config.authMethod === 'agent') {
      connectOptions.agent = process.env.SSH_AUTH_SOCK
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }
      const cleanup = () => {
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.connect(connectOptions)
    })

    const managed: ManagedConnection = {
      config,
      client,
      sftp: null,
      connected: true,
      lastConnectedAt: new Date().toISOString(),
    }
    this.connections.set(config.id, managed)

    client.on('close', () => {
      const m = this.connections.get(config.id)
      if (m) {
        m.connected = false
        m.sftp = null
        this.emit('statusChange', {
          id: config.id,
          connected: false,
          lastConnectedAt: m.lastConnectedAt ?? undefined,
        } satisfies ConnectionStatus)
      }
    })

    client.on('error', (err) => {
      this.emit('statusChange', {
        id: config.id,
        connected: false,
        error: err.message,
      } satisfies ConnectionStatus)
    })

    this.emit('statusChange', {
      id: config.id,
      connected: true,
      lastConnectedAt: managed.lastConnectedAt ?? undefined,
    } satisfies ConnectionStatus)
  }

  async disconnect(id: string): Promise<void> {
    const conn = this.connections.get(id)
    if (!conn) return
    if (conn.sftp) {
      conn.sftp.end()
      conn.sftp = null
    }
    conn.client.end()
    conn.connected = false
    this.connections.delete(id)
    this.emit('statusChange', {
      id,
      connected: false,
    } satisfies ConnectionStatus)
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.connections.keys())
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }

  isConnected(id: string): boolean {
    const conn = this.connections.get(id)
    return conn?.connected ?? false
  }

  getStatus(id: string): ConnectionStatus {
    const conn = this.connections.get(id)
    if (!conn) {
      return { id, connected: false }
    }
    return {
      id,
      connected: conn.connected,
      lastConnectedAt: conn.lastConnectedAt ?? undefined,
    }
  }

  getAllStatuses(): ConnectionStatus[] {
    return Array.from(this.connections.keys()).map((id) => this.getStatus(id))
  }

  async getSftp(id: string): Promise<SFTPWrapper> {
    const conn = this.connections.get(id)
    if (!conn || !conn.connected) {
      throw new Error(`Connection ${id} is not active`)
    }
    if (conn.sftp) {
      return conn.sftp
    }
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      conn.client.sftp((err, sftpWrapper) => {
        if (err) reject(err)
        else resolve(sftpWrapper)
      })
    })
    conn.sftp = sftp
    return sftp
  }

  getConfig(id: string): ConnectionConfig | undefined {
    return this.connections.get(id)?.config
  }
}
