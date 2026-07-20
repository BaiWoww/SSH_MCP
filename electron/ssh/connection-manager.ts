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

  /**
   * Execute a shell command on the remote host. On timeout the stream is
   * signalled KILL and the partial output is returned with timedOut=true.
   */
  async exec(
    id: string,
    command: string,
    timeoutMs?: number,
  ): Promise<{ stdout: string; stderr: string; code: number; timedOut: boolean }> {
    const conn = this.connections.get(id)
    if (!conn || !conn.connected) {
      throw new Error(`Connection ${id} is not active`)
    }
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let exitCode: number | null = null
      let timedOut = false
      let settled = false
      let timer: NodeJS.Timeout | undefined

      const finish = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        resolve({ stdout, stderr, code: exitCode ?? (timedOut ? -1 : 0), timedOut })
      }

      conn.client.exec(command, (err, stream) => {
        if (err) {
          resolve({ stdout: '', stderr: err.message, code: -1, timedOut: false })
          return
        }
        stream.on('data', (data: Buffer) => { stdout += data.toString() })
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
        stream.on('exit', (code: number | null) => { exitCode = code })
        stream.on('close', () => finish())
        stream.on('error', (err: Error) => {
          stderr += `\n${err.message}`
          finish()
        })
        if (timeoutMs && timeoutMs > 0) {
          timer = setTimeout(() => {
            timedOut = true
            try {
              ;(stream as { signal?: (s: string) => void }).signal?.('KILL')
            } catch {
              /* ignore */
            }
            try {
              stream.destroy()
            } catch {
              /* ignore */
            }
            setTimeout(finish, 500)
          }, timeoutMs)
        }
      })
    })
  }
}
