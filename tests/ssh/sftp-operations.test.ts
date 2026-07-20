import { describe, it, expect, vi } from 'vitest'
import { Readable, Writable } from 'stream'
import { SftpOperations } from '../../src/ssh/sftp-operations'
import type { ConnectionManager } from '../../src/ssh/connection-manager'
import type { ExecResult } from '../../src/types'

interface MockFile {
  content: Buffer
  mtime: number
  atime: number
  mode: number
}

class FakeStats {
  constructor(private file: MockFile | null, private isDir: boolean) {}
  isDirectory(): boolean { return this.isDir }
  isFile(): boolean { return !this.isDir && this.file !== null }
  isSymbolicLink(): boolean { return false }
  get size(): number { return this.file?.content.length ?? 0 }
  get mtime(): number { return this.file?.mtime ?? 0 }
  get atime(): number { return this.file?.atime ?? 0 }
  get mode(): number { return this.file?.mode ?? 0o644 }
}

class FakeSftpWrapper {
  private files = new Map<string, MockFile>()
  private dirs = new Set<string>()

  constructor(initialFiles?: Record<string, string>) {
    this.dirs.add('/')
    if (initialFiles) {
      const now = Date.now() / 1000
      for (const [path, content] of Object.entries(initialFiles)) {
        this.files.set(path, { content: Buffer.from(content), mtime: now, atime: now, mode: 0o644 })
      }
    }
  }

  createReadStream(remotePath: string): Readable {
    const file = this.files.get(remotePath)
    const stream = new Readable({ read() {} })
    if (!file) {
      process.nextTick(() => stream.destroy(new Error(`No such file: ${remotePath}`)))
      return stream
    }
    stream.push(file.content)
    stream.push(null)
    return stream
  }

  createWriteStream(remotePath: string): Writable {
    const chunks: Buffer[] = []
    const self = this
    const stream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        callback()
      },
    })
    stream.on('finish', () => {
      const now = Date.now() / 1000
      self.files.set(remotePath, { content: Buffer.concat(chunks), mtime: now, atime: now, mode: 0o644 })
      stream.emit('close')
    })
    return stream
  }

  stat(remotePath: string, cb: (err: Error | null, stats: FakeStats) => void): void {
    const file = this.files.get(remotePath)
    if (file) {
      cb(null, new FakeStats(file, false))
      return
    }
    if (this.dirs.has(remotePath)) {
      cb(null, new FakeStats(null, true))
      return
    }
    cb(new Error(`No such file or directory: ${remotePath}`), undefined as unknown as FakeStats)
  }

  readdir(
    remotePath: string,
    cb: (err: Error | null, list: Array<{ filename: string; longname: string; attrs: { size: number; mtime: number; atime: number; mode: number } }>) => void,
  ): void {
    if (!this.dirs.has(remotePath)) {
      cb(new Error('No such directory'), [])
      return
    }
    const list: Array<{ filename: string; longname: string; attrs: { size: number; mtime: number; atime: number; mode: number } }> = []
    const prefix = remotePath === '/' ? '/' : remotePath + '/'
    for (const [path, file] of this.files) {
      if (path.startsWith(prefix)) {
        const name = path.slice(prefix.length)
        if (name && !name.includes('/')) {
          list.push({
            filename: name,
            longname: `-rw-r--r-- 1 user group ${file.content.length} Jan 1 00:00 ${name}`,
            attrs: { size: file.content.length, mtime: file.mtime, atime: file.atime, mode: file.mode },
          })
        }
      }
    }
    cb(null, list)
  }

  mkdir(remotePath: string, cb: (err: Error | null) => void): void {
    this.dirs.add(remotePath)
    cb(null)
  }

  unlink(remotePath: string, cb: (err: Error | null) => void): void {
    if (this.files.has(remotePath)) {
      this.files.delete(remotePath)
      cb(null)
    } else {
      cb(new Error(`No such file: ${remotePath}`))
    }
  }

  rmdir(remotePath: string, cb: (err: Error | null) => void): void {
    this.dirs.delete(remotePath)
    cb(null)
  }

  rename(oldPath: string, newPath: string, cb: (err: Error | null) => void): void {
    const file = this.files.get(oldPath)
    if (file) {
      this.files.delete(oldPath)
      this.files.set(newPath, file)
      cb(null)
    } else {
      cb(new Error(`No such file: ${oldPath}`))
    }
  }
}

function fakeExecResult(command: string): ExecResult {
  return { command, stdout: '', stderr: '', code: 0, timedOut: false }
}

function createFakeManager(files?: Record<string, string>): ConnectionManager {
  const sftp = new FakeSftpWrapper(files)
  return {
    getSftp: vi.fn().mockResolvedValue(sftp),
    isConnected: vi.fn().mockReturnValue(true),
    exec: vi.fn().mockImplementation((_name: string, command: string) =>
      Promise.resolve(fakeExecResult(command)),
    ),
  } as unknown as ConnectionManager
}

describe('SftpOperations', () => {
  it('reads a file', async () => {
    const ops = new SftpOperations(createFakeManager({ '/test.txt': 'hello world' }), 'conn-1')
    const content = await ops.readFile('/test.txt')
    expect(content).toBe('hello world')
  })

  it('reads a file as base64', async () => {
    const ops = new SftpOperations(createFakeManager({ '/test.txt': 'hi' }), 'conn-1')
    const content = await ops.readFile('/test.txt', 'base64')
    expect(content).toBe(Buffer.from('hi').toString('base64'))
  })

  it('writes a file', async () => {
    const ops = new SftpOperations(createFakeManager(), 'conn-1')
    await ops.writeFile('/output.txt', 'written content')
    const content = await ops.readFile('/output.txt')
    expect(content).toBe('written content')
  })

  it('stats a file', async () => {
    const ops = new SftpOperations(createFakeManager({ '/statme.txt': 'data' }), 'conn-1')
    const stat = await ops.stat('/statme.txt')
    expect(stat.path).toBe('/statme.txt')
    expect(stat.type).toBe('file')
  })

  it('makes a directory', async () => {
    const ops = new SftpOperations(createFakeManager(), 'conn-1')
    await ops.mkdir('/newdir')
    const stat = await ops.stat('/newdir')
    expect(stat.type).toBe('directory')
  })

  it('removes a file', async () => {
    const ops = new SftpOperations(createFakeManager({ '/rm.txt': 'temp' }), 'conn-1')
    await ops.remove('/rm.txt')
    await expect(ops.readFile('/rm.txt')).rejects.toThrow()
  })

  it('lists a directory (returns array)', async () => {
    const ops = new SftpOperations(createFakeManager({ '/a.txt': 'a', '/b.txt': 'b' }), 'conn-1')
    const entries = await ops.listDirectory('/')
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBe(2)
    expect(entries.map((e) => e.name).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('copy delegates to exec with cp', async () => {
    const mgr = createFakeManager()
    const ops = new SftpOperations(mgr, 'conn-1')
    await ops.copy('/a', '/b', true)
    expect(mgr.exec).toHaveBeenCalledWith('conn-1', expect.stringContaining('cp -r'), undefined)
  })

  it('chmod delegates to exec with chmod -R when recursive', async () => {
    const mgr = createFakeManager()
    const ops = new SftpOperations(mgr, 'conn-1')
    await ops.chmod('/dir', '755', true)
    expect(mgr.exec).toHaveBeenCalledWith('conn-1', expect.stringContaining('chmod -R 755'), undefined)
  })

  it('removeDirectoryRecursive delegates to exec with rm -rf', async () => {
    const mgr = createFakeManager()
    const ops = new SftpOperations(mgr, 'conn-1')
    await ops.removeDirectoryRecursive('/dir')
    expect(mgr.exec).toHaveBeenCalledWith('conn-1', expect.stringContaining('rm -rf'), undefined)
  })

  it('execute wraps cwd via cd && command', async () => {
    const mgr = createFakeManager()
    const ops = new SftpOperations(mgr, 'conn-1')
    await ops.execute('ls', { cwd: '/var', timeoutMs: 5000 })
    expect(mgr.exec).toHaveBeenCalledWith('conn-1', expect.stringContaining('cd'), 5000)
  })
})
