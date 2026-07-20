import { describe, it, expect, vi } from 'vitest'
import { defineTools, type ToolContext } from '../../src/mcp/tools'
import type { ConnectionManager } from '../../src/ssh/connection-manager'
import type { McpConfig } from '../../src/types'

vi.mock('../../src/ssh/sftp-operations', () => ({
  SftpOperations: vi.fn().mockImplementation(() => ({
    readFile: vi.fn().mockResolvedValue('file content'),
    readFileBuffer: vi.fn().mockResolvedValue(Buffer.from('file content')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([
      { name: 'a.txt', path: '/a.txt', type: 'file', size: 10, modifyTime: 0, accessTime: 0, mode: 0o644 },
    ]),
    stat: vi.fn().mockResolvedValue({
      path: '/a.txt', type: 'file', size: 10, modifyTime: 0, accessTime: 0, mode: 0o644,
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    mkdirp: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    removeDirectoryRecursive: vi.fn().mockResolvedValue({ command: 'rm -rf /d', stdout: '', stderr: '', code: 0, timedOut: false }),
    rename: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue({ command: 'cp', stdout: '', stderr: '', code: 0, timedOut: false }),
    chmod: vi.fn().mockResolvedValue({ command: 'chmod', stdout: '', stderr: '', code: 0, timedOut: false }),
    exists: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue({ command: 'echo hi', stdout: 'hi\n', stderr: '', code: 0, timedOut: false }),
  })),
}))

function makeContext(): ToolContext {
  const config: McpConfig = {
    defaultConnection: 'default',
    connections: [
      {
        name: 'default',
        host: 'example.com',
        port: 22,
        username: 'root',
        authMethod: 'password',
        password: 'secret',
        default: true,
      },
    ],
  }
  let activeName: string | null = 'default'
  const manager = {
    isConnected: vi.fn().mockReturnValue(true),
    getSftp: vi.fn().mockResolvedValue({}),
    exec: vi.fn().mockResolvedValue({ command: 'echo hi', stdout: 'hi\n', stderr: '', code: 0, timedOut: false }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ name: 'default', connected: true }),
    getAllStatuses: vi.fn().mockReturnValue([{ name: 'default', connected: true }]),
  } as unknown as ConnectionManager
  return {
    config,
    manager,
    getActiveName: () => activeName,
    setActiveName: (n) => {
      activeName = n
    },
  }
}

describe('MCP tools', () => {
  it('defines all expected tools', () => {
    const tools = defineTools(makeContext())
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'chmod',
        'connect',
        'connection_status',
        'copy_file',
        'create_directory',
        'delete_directory',
        'delete_file',
        'disconnect',
        'execute_command',
        'file_exists',
        'get_file_info',
        'list_connections',
        'list_directory',
        'read_file',
        'rename_or_move',
        'write_file',
      ].sort(),
    )
  })

  it('read_file tool reads remote file content', async () => {
    const tools = defineTools(makeContext())
    const readTool = tools.find((t) => t.name === 'read_file')!
    const result = await readTool.handler({ path: '/test.txt' })
    expect(result.content[0].text).toContain('file content')
  })

  it('write_file tool writes and confirms', async () => {
    const tools = defineTools(makeContext())
    const writeTool = tools.find((t) => t.name === 'write_file')!
    const result = await writeTool.handler({ path: '/out.txt', content: 'hello' })
    expect(result.content[0].text).toContain('Successfully')
  })

  it('list_directory tool returns entries', async () => {
    const tools = defineTools(makeContext())
    const listTool = tools.find((t) => t.name === 'list_directory')!
    const result = await listTool.handler({ path: '/' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].name).toBe('a.txt')
  })

  it('file_exists tool returns boolean', async () => {
    const tools = defineTools(makeContext())
    const existsTool = tools.find((t) => t.name === 'file_exists')!
    const result = await existsTool.handler({ path: '/a.txt' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.exists).toBe(true)
  })

  it('execute_command tool returns exec result', async () => {
    const tools = defineTools(makeContext())
    const execTool = tools.find((t) => t.name === 'execute_command')!
    const result = await execTool.handler({ command: 'echo hi' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.stdout).toBe('hi\n')
    expect(parsed.code).toBe(0)
  })

  it('list_connections does not leak secrets', async () => {
    const tools = defineTools(makeContext())
    const listTool = tools.find((t) => t.name === 'list_connections')!
    const result = await listTool.handler({})
    expect(result.content[0].text).not.toContain('secret')
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.connections[0].name).toBe('default')
  })

  it('returns a clear error when no connection is active', async () => {
    const ctx = makeContext()
    ctx.setActiveName(null)
    const tools = defineTools(ctx)
    const readTool = tools.find((t) => t.name === 'read_file')!
    const result = await readTool.handler({ path: '/x' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/No active SSH connection/)
  })
})
