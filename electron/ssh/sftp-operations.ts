import type { Stats } from 'ssh2'
import type { ConnectionManager } from './connection-manager'
import type { RemoteFileEntry, RemoteFileStat, FileType } from '../types'

function fileTypeFromStats(stats: Stats): FileType {
  if (stats.isDirectory()) return 'directory'
  if (stats.isFile()) return 'file'
  if (stats.isSymbolicLink()) return 'symlink'
  return 'other'
}

export class SftpOperations {
  constructor(
    private manager: ConnectionManager,
    private connectionId: string,
  ) {}

  private async getSftp() {
    return this.manager.getSftp(this.connectionId)
  }

  async readFile(remotePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    const sftp = await this.getSftp()
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(remotePath)
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)))
      stream.on('error', reject)
    })
  }

  async readFileBuffer(remotePath: string): Promise<Buffer> {
    const sftp = await this.getSftp()
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(remotePath)
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }

  async writeFile(remotePath: string, content: string | Buffer): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(remotePath)
      stream.on('close', () => resolve())
      stream.on('error', reject)
      stream.end(content)
    })
  }

  async stat(remotePath: string): Promise<RemoteFileStat> {
    const sftp = await this.getSftp()
    return new Promise<RemoteFileStat>((resolve, reject) => {
      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err)
          return
        }
        resolve({
          path: remotePath,
          type: fileTypeFromStats(stats),
          size: stats.size,
          modifyTime: stats.mtime * 1000,
          accessTime: stats.atime * 1000,
          mode: stats.mode,
        })
      })
    })
  }

  async listDirectory(remotePath: string): Promise<RemoteFileEntry[]> {
    const sftp = await this.getSftp()
    return new Promise<RemoteFileEntry[]>((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          const code = (err as Error & { code?: number }).code
          if (code === 2 || err.message.includes('No such file')) {
            resolve([])
            return
          }
          reject(err)
          return
        }
        const entries: RemoteFileEntry[] = list.map((item) => {
          const type: FileType = item.longname.startsWith('d')
            ? 'directory'
            : item.longname.startsWith('l')
            ? 'symlink'
            : 'file'
          return {
            name: item.filename,
            path: remotePath.endsWith('/')
              ? `${remotePath}${item.filename}`
              : `${remotePath}/${item.filename}`,
            type,
            size: item.attrs.size,
            modifyTime: item.attrs.mtime * 1000,
            accessTime: item.attrs.atime * 1000,
            mode: item.attrs.mode,
          }
        })
        resolve(entries)
      })
    })
  }

  async mkdir(remotePath: string): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise<void>((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async mkdirp(remotePath: string): Promise<void> {
    const parts = remotePath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      try {
        await this.stat(current)
      } catch {
        await this.mkdir(current)
      }
    }
  }

  async remove(remotePath: string): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise<void>((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async removeDirectory(remotePath: string): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise<void>((resolve, reject) => {
      sftp.rmdir(remotePath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.getSftp()
    return new Promise<void>((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.stat(remotePath)
      return true
    } catch {
      return false
    }
  }
}
