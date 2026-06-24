import { describe, it, expect, vi } from 'vitest'
import { defineFileTools } from '../../electron/mcp/tools'
import type { ConnectionManager } from '../../electron/ssh/connection-manager'
import { SftpOperations } from '../../electron/ssh/sftp-operations'

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
    remove: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
  })),
}))

function mockManager(): ConnectionManager {
  return {
    isConnected: vi.fn().mockReturnValue(true),
    getSftp: vi.fn().mockResolvedValue({}),
  } as unknown as ConnectionManager
}

describe('MCP file tools', () => {
  it('defines all expected tools', () => {
    const tools = defineFileTools(mockManager(), 'conn-1')
    const names = tools.map((t) => t.name)
    expect(names).toContain('read_file')
    expect(names).toContain('write_file')
    expect(names).toContain('list_directory')
    expect(names).toContain('get_file_info')
    expect(names).toContain('create_directory')
    expect(names).toContain('delete_file')
    expect(names).toContain('file_exists')
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
})
