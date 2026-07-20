import { Client, SFTPWrapper } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { EventEmitter } from 'node:events'
import type {
  ConnectionStatus,
  ExecResult,
  SshConnectionConfig,
} from '../types.js'

interface ManagedConnection {
  config: SshConnectionConfig
  client: Client
  sftp: SFTPWrapper | null
  connected: boolean
  lastConnectedAt: string | null
}

const DEFAULT_READY_TIMEOUT = 20000
const DEFAULT_KEEPALIVE = 30000

/**
 * Manages SSH/SFTP connection lifecycles. Connections are keyed by their
 * `name` (the unique identifier from the config layer).
 */
export class ConnectionManager extends EventEmitter {
  private connections = new Map<string, ManagedConnection>()

  async connect(config: SshConnectionConfig): Promise<void> {
    if (this.connections.has(config.name) && this.connections.get(config.name)!.connected) {
      return
    }

    const client = new Client()
    const connectOptions: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: config.readyTimeout ?? DEFAULT_READY_TIMEOUT,
      keepaliveInterval: config.keepaliveInterval ?? DEFAULT_KEEPALIVE,
    }

    if (config.authMethod === 'password') {
      connectOptions.password = config.password
    } else if (config.authMethod === 'privateKey') {
      connectOptions.privateKey = config.privateKey
      if (config.passphrase) connectOptions.passphrase = config.passphrase
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
    this.connections.set(config.name, managed)

    client.on('close', () => {
      const m = this.connections.get(config.name)
      if (m) {
        m.connected = false
        m.sftp = null
        this.emit('statusChange', {
          name: config.name,
          connected: false,
          lastConnectedAt: m.lastConnectedAt ?? undefined,
        } satisfies ConnectionStatus)
      }
    })

    client.on('error', (err: Error) => {
      this.emit('statusChange', {
        name: config.name,
        connected: false,
        error: err.message,
      } satisfies ConnectionStatus)
    })

    this.emit('statusChange', {
      name: config.name,
      connected: true,
      lastConnectedAt: managed.lastConnectedAt ?? undefined,
    } satisfies ConnectionStatus)
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name)
    if (!conn) return
    if (conn.sftp) {
      conn.sftp.end()
      conn.sftp = null
    }
    conn.client.end()
    conn.connected = false
    this.connections.delete(name)
    this.emit('statusChange', { name, connected: false } satisfies ConnectionStatus)
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this.connections.keys())
    await Promise.all(names.map((name) => this.disconnect(name)))
  }

  isConnected(name: string): boolean {
    return this.connections.get(name)?.connected ?? false
  }

  getStatus(name: string): ConnectionStatus {
    const conn = this.connections.get(name)
    if (!conn) return { name, connected: false }
    return {
      name,
      connected: conn.connected,
      lastConnectedAt: conn.lastConnectedAt ?? undefined,
    }
  }

  getAllStatuses(): ConnectionStatus[] {
    return Array.from(this.connections.keys()).map((name) => this.getStatus(name))
  }

  getConfig(name: string): SshConnectionConfig | undefined {
    return this.connections.get(name)?.config
  }

  async getSftp(name: string): Promise<SFTPWrapper> {
    const conn = this.connections.get(name)
    if (!conn || !conn.connected) {
      throw new Error(`Connection "${name}" is not active`)
    }
    if (conn.sftp) return conn.sftp
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      conn.client.sftp((err, sftpWrapper) => {
        if (err) reject(err)
        else resolve(sftpWrapper)
      })
    })
    conn.sftp = sftp
    return sftp
  }

  /**
   * Execute a shell command on the remote host.
   * @param name     Connection name.
   * @param command  Shell command string.
   * @param timeoutMs  Optional kill timeout. On timeout the stream is signalled
   *                   KILL and the partial output is returned with timedOut=true.
   */
  exec(name: string, command: string, timeoutMs?: number): Promise<ExecResult> {
    const conn = this.connections.get(name)
    if (!conn || !conn.connected) {
      return Promise.reject(new Error(`Connection "${name}" is not active`))
    }
    return new Promise<ExecResult>((resolve) => {
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
        resolve({
          command,
          stdout,
          stderr,
          code: exitCode ?? (timedOut ? -1 : 0),
          timedOut,
        })
      }

      conn.client.exec(command, (err, stream) => {
        if (err) {
          resolve({
            command,
            stdout: '',
            stderr: err.message,
            code: -1,
            timedOut: false,
          })
          return
        }

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
        stream.on('exit', (code: number | null) => {
          exitCode = code
        })
        stream.on('close', () => finish())
        stream.on('error', (err: Error) => {
          stderr += `\n${err.message}`
          finish()
        })

        if (timeoutMs && timeoutMs > 0) {
          timer = setTimeout(() => {
            timedOut = true
            try {
              // Best-effort SIGKILL via the channel request; ignore failures.
              ;(stream as { signal?: (s: string) => void }).signal?.('KILL')
            } catch {
              // fall through to destroy
            }
            try {
              stream.destroy()
            } catch {
              /* ignore */
            }
            // Give the close event a moment; otherwise resolve now.
            setTimeout(finish, 500)
          }, timeoutMs)
        }
      })
    })
  }
}
