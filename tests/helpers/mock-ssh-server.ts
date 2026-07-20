import ssh2 from 'ssh2'
import { generateKeyPairSync } from 'crypto'

export interface MockSshServerOptions {
  port: number
  username: string
  password?: string
  privateKey?: string
  files?: Record<string, string>
}

interface AuthContext {
  username: string
  method: string
  password: string
  accept(): void
  reject(): void
}

interface SftpServer {
  on(event: string, listener: (...args: any[]) => void): this
  handle(reqid: number, handle: Buffer): void
  data(reqid: number, data: Buffer): void
  status(reqid: number, code: number): void
  name(reqid: number, names: unknown[]): void
}

interface ServerSession {
  on(event: 'sftp', listener: (accept: () => SftpServer) => void): this
}

interface ServerClient {
  on(event: 'authentication', listener: (ctx: AuthContext) => void): this
  on(event: 'ready', listener: () => void): this
  on(event: 'session', listener: (accept: () => ServerSession) => void): this
}

export function startMockSshServer(opts: MockSshServerOptions): Promise<{
  server: ssh2.Server
  close: () => Promise<void>
}> {
  return new Promise((resolve) => {
    const files = opts.files ?? {}
    const server = new ssh2.Server(
      {
        hostKeys: [generateMockKey()],
      },
      (client: unknown) => {
        const c = client as ServerClient
        c.on('authentication', (ctx: AuthContext) => {
          if (ctx.username === opts.username) {
            if (ctx.method === 'password' && ctx.password === opts.password) {
              ctx.accept()
              return
            }
            if (ctx.method === 'publickey' && opts.privateKey) {
              ctx.accept()
              return
            }
          }
          ctx.reject()
        })

        c.on('ready', () => {
          c.on('session', (accept: () => ServerSession) => {
            const session = accept()
            session.on('sftp', (acceptSftp: () => SftpServer) => {
              const sftp = acceptSftp()
              sftp.on('open', (reqid: number, filename: string) => {
                const content = files[filename] ?? ''
                sftp.handle(reqid, Buffer.from(filename))
                sftp.on('read', (rid: number) => {
                  sftp.data(rid, Buffer.from(content))
                })
                sftp.on('write', (rid: number, handle: Buffer, _offset: number, data: Buffer) => {
                  files[handle.toString()] = data.toString()
                  sftp.status(rid, 0)
                })
              })
              sftp.on('readdir', (reqid: number, _path: string) => {
                sftp.name(reqid, [])
                sftp.status(reqid, 2)
              })
            })
          })
        })
      },
    )

    server.listen(opts.port, '127.0.0.1', () => {
      resolve({
        server,
        close: () =>
          new Promise((res) => {
            server.close(() => res())
          }),
      })
    })
  })
}

function generateMockKey(): Buffer {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' })
  return typeof pem === 'string' ? Buffer.from(pem) : pem
}
