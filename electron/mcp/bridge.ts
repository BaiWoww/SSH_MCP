import * as http from 'http'
import type { ConnectionManager } from '../ssh/connection-manager'
import { SftpOperations } from '../ssh/sftp-operations'
import * as crypto from 'crypto'

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
    return new Promise((resolve) => {
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
            let result: unknown
            switch (request.tool) {
              case 'read_file':
                result = await ops.readFile(
                  request.args.path as string,
                  (request.args.encoding as BufferEncoding) ?? 'utf8',
                )
                break
              case 'write_file':
                const content = request.args.encoding === 'base64'
                  ? Buffer.from(request.args.content as string, 'base64')
                  : request.args.content as string
                await ops.writeFile(
                  request.args.path as string,
                  content,
                )
                result = { success: true }
                break
              case 'list_directory':
                result = { entries: await ops.listDirectory(request.args.path as string) }
                break
              case 'get_file_info':
                result = await ops.stat(request.args.path as string)
                break
              case 'create_directory':
                await ops.mkdirp(request.args.path as string)
                result = { success: true }
                break
              case 'delete_file':
                await ops.remove(request.args.path as string)
                result = { success: true }
                break
              case 'file_exists':
                result = { exists: await ops.exists(request.args.path as string) }
                break
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
      const port = parseInt(process.env.AGENTSSH_BRIDGE_PORT ?? '0', 10) || 0
    this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server!.address()
        this.port = typeof addr === 'object' && addr ? addr.port : 0
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
