import { describe, it, expect, vi } from 'vitest'
import { defineFileTools } from '../../electron/mcp/tools'
import type { ConnectionManager } from '../../electron/ssh/connection-manager'

vi.mock('../../electron/ssh/sftp-operations', () => ({
  SftpOperations: vi.fn().mockImplementation(() => ({
    readFile: vi.fn().mockResolvedValue('file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([
      { name: 'a.txt', path: '/a.txt', type: 'file', size: 10, modifyTime: 0, accessTime: 0 },
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

function mockManager(): ConnectionManager {
  return {
    isConnected: vi.fn().mockReturnValue(true),
    getSftp: vi.fn().mockResolvedValue({}),
    exec: vi.fn().mockResolvedValue({ command: 'echo hi', stdout: 'hi\n', stderr: '', code: 0, timedOut: false }),
  } as unknown as ConnectionManager
}

describe('MCP file tools', () => {
  it('defines all 12 expected tools', () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'chmod',
        'copy_file',
        'create_directory',
        'delete_directory',
        'delete_file',
        'execute_command',
        'file_exists',
        'get_file_info',
        'list_directory',
        'read_file',
        'rename_or_move',
        'write_file',
      ].sort(),
    )
  })

  it('read_file tool reads remote file content', async () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const readTool = tools.find((t) => t.name === 'read_file')!
    const result = await readTool.handler({ path: '/test.txt' })
    expect(result.content[0].text).toContain('file content')
  })

  it('write_file tool writes and confirms', async () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const writeTool = tools.find((t) => t.name === 'write_file')!
    const result = await writeTool.handler({ path: '/out.txt', content: 'hello' })
    expect(result.content[0].text).toContain('Successfully')
  })

  it('list_directory tool returns entries', async () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const listTool = tools.find((t) => t.name === 'list_directory')!
    const result = await listTool.handler({ path: '/' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].name).toBe('a.txt')
  })

  it('file_exists tool returns boolean', async () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const existsTool = tools.find((t) => t.name === 'file_exists')!
    const result = await existsTool.handler({ path: '/a.txt' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.exists).toBe(true)
  })

  it('execute_command tool returns exec result', async () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const execTool = tools.find((t) => t.name === 'execute_command')!
    const result = await execTool.handler({ command: 'echo hi' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.stdout).toBe('hi\n')
    expect(parsed.code).toBe(0)
  })

  it('returns a clear error when no connection is active', async () => {
    const tools = defineFileTools(mockManager(), null)
    const readTool = tools.find((t) => t.name === 'read_file')!
    const result = await readTool.handler({ path: '/x' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/No active SSH connection/)
  })
})
