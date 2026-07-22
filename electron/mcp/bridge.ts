import * as http from 'http'
import type { ConnectionManager } from '../ssh/connection-manager'
import { SftpOperations } from '../ssh/sftp-operations'

export const DEFAULT_BRIDGE_PORT = 17539

interface BridgeRequest {
  tool: string
  connectionId: string
  args: Record<string, unknown>
}

export class McpHttpBridge {
  private server: http.Server | null = null
  private port = 0

  constructor(private manager: ConnectionManager) {}

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const request = JSON.parse(body) as BridgeRequest
            const ops = new SftpOperations(this.manager, request.connectionId)
            const a = request.args
            let result: unknown
            switch (request.tool) {
              case 'read_file':
                result = await ops.readFile(
                  a.path as string,
                  (a.encoding as BufferEncoding | 'base64') ?? 'utf8',
                )
                break
              case 'write_file':
                await ops.writeFile(
                  a.path as string,
                  a.encoding === 'base64' ? Buffer.from(a.content as string, 'base64') : (a.content as string),
                )
                result = { success: true }
                break
              case 'list_directory':
                result = { entries: await ops.listDirectory(a.path as string) }
                break
              case 'get_file_info':
                result = await ops.stat(a.path as string)
                break
              case 'create_directory':
                await ops.mkdirp(a.path as string)
                result = { success: true }
                break
              case 'delete_file':
                await ops.remove(a.path as string)
                result = { success: true }
                break
              case 'delete_directory':
                if (a.recursive) {
                  result = await ops.removeDirectoryRecursive(a.path as string)
                } else {
                  await ops.removeDirectory(a.path as string)
                  result = { success: true }
                }
                break
              case 'rename_or_move':
                await ops.rename(a.oldPath as string, a.newPath as string)
                result = { success: true }
                break
              case 'copy_file':
                result = await ops.copy(a.source as string, a.destination as string, (a.recursive as boolean) ?? false)
                break
              case 'file_exists':
                result = { exists: await ops.exists(a.path as string) }
                break
              case 'chmod':
                result = await ops.chmod(a.path as string, a.mode as string, (a.recursive as boolean) ?? false)
                break
              case 'execute':
              case 'execute_command': {
                const timeoutSeconds = (a.timeoutSeconds as number) ?? 60
                result = await ops.execute(a.command as string, {
                  cwd: a.cwd as string | undefined,
                  timeoutMs: Math.min(Math.max(timeoutSeconds, 1), 600) * 1000,
                })
                break
              }
              default:
                res.statusCode = 400
                res.end(JSON.stringify({ error: `Unknown tool: ${request.tool}` }))
                return
            }
            res.end(JSON.stringify({ result }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: (err as Error).message }))
          }
        })
      })
      const port =
        parseInt(process.env.AGENTSSH_BRIDGE_PORT ?? String(DEFAULT_BRIDGE_PORT), 10) ||
        DEFAULT_BRIDGE_PORT
      this.server.on('error', (err: NodeJS.ErrnoException) => {
        this.server = null
        if (err.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Bridge port ${port} is already in use. Another AgentSSH instance may be running, ` +
                `or set AGENTSSH_BRIDGE_PORT to override.`,
            ),
          )
        } else {
          reject(err)
        }
      })
      this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server!.address()
        this.port = typeof addr === 'object' && addr ? addr.port : port
        resolve(this.port)
      })
    })
  }

  getPort(): number {
    return this.port
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
      this.server = null
    }
  }
}
