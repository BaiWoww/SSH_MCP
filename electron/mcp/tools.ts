import { z } from 'zod'
import type { ConnectionManager } from '../ssh/connection-manager'
import { SftpOperations } from '../ssh/sftp-operations'

export interface McpTool {
  name: string
  description: string
  inputSchema: z.ZodType
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: 'text'; text: string }[]
    isError?: boolean
  }>
}

export function defineFileTools(
  manager: ConnectionManager,
  activeConnectionId: string | null,
): McpTool[] {
  function requireConnection(): SftpOperations {
    if (!activeConnectionId) {
      throw new Error('No active SSH connection. Ask the user to connect first.')
    }
    if (!manager.isConnected(activeConnectionId)) {
      throw new Error(`SSH connection ${activeConnectionId} is not active.`)
    }
    return new SftpOperations(manager, activeConnectionId)
  }

  function textResult(text: string, isError = false) {
    return { content: [{ type: 'text' as const, text }], isError }
  }

  const readSchema = z.object({
    path: z.string().describe('Absolute path to the remote file to read'),
    encoding: z.string().optional().describe('Text encoding, defaults to utf8'),
  })

  const writeSchema = z.object({
    path: z.string().describe('Absolute path to the remote file to write'),
    content: z.string().describe('Text content to write to the file'),
  })

  const listSchema = z.object({
    path: z.string().describe('Absolute path to the remote directory to list'),
  })

  const statSchema = z.object({
    path: z.string().describe('Absolute path to stat'),
  })

  const mkdirSchema = z.object({
    path: z.string().describe('Absolute path of the directory to create'),
  })

  const removeSchema = z.object({
    path: z.string().describe('Absolute path of the file to delete'),
  })

  const existsSchema = z.object({
    path: z.string().describe('Absolute path to check for existence'),
  })

  return [
    {
      name: 'read_file',
      description:
        'Read the full contents of a remote file on the connected SSH server. ' +
        'Returns the file content as text. Use this to view configuration files, ' +
        'source code, logs, or any text file on the cloud server.',
      inputSchema: readSchema,
      handler: async (args) => {
        try {
          const parsed = readSchema.parse(args)
          const ops = requireConnection()
          const content = await ops.readFile(parsed.path, (parsed.encoding as BufferEncoding) ?? 'utf8')
          return textResult(content)
        } catch (err) {
          return textResult(`Error reading file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'write_file',
      description:
        'Write text content to a remote file on the connected SSH server, ' +
        'overwriting any existing content. Use this to edit configuration, ' +
        'create scripts, or update source code on the cloud server.',
      inputSchema: writeSchema,
      handler: async (args) => {
        try {
          const parsed = writeSchema.parse(args)
          const ops = requireConnection()
          await ops.writeFile(parsed.path, parsed.content)
          return textResult(`Successfully wrote ${parsed.content.length} bytes to ${parsed.path}`)
        } catch (err) {
          return textResult(`Error writing file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'list_directory',
      description:
        'List the contents of a remote directory on the connected SSH server. ' +
        'Returns an array of entries with name, type (file/directory/symlink), ' +
        'size, and modification time. Use this to explore the remote filesystem.',
      inputSchema: listSchema,
      handler: async (args) => {
        try {
          const parsed = listSchema.parse(args)
          const ops = requireConnection()
          const entries = await ops.listDirectory(parsed.path)
          return textResult(JSON.stringify({ path: parsed.path, entries }, null, 2))
        } catch (err) {
          return textResult(`Error listing directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'get_file_info',
      description:
        'Get detailed metadata about a remote file or directory: type, size, ' +
        'modification time, access time, and permission mode.',
      inputSchema: statSchema,
      handler: async (args) => {
        try {
          const parsed = statSchema.parse(args)
          const ops = requireConnection()
          const stat = await ops.stat(parsed.path)
          return textResult(JSON.stringify(stat, null, 2))
        } catch (err) {
          return textResult(`Error getting file info: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'create_directory',
      description:
        'Create a new directory on the remote SSH server. Creates parent ' +
        'directories as needed (like mkdir -p).',
      inputSchema: mkdirSchema,
      handler: async (args) => {
        try {
          const parsed = mkdirSchema.parse(args)
          const ops = requireConnection()
          await ops.mkdirp(parsed.path)
          return textResult(`Successfully created directory ${parsed.path}`)
        } catch (err) {
          return textResult(`Error creating directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'delete_file',
      description:
        'Delete a file on the remote SSH server. Use with caution — this ' +
        'operation is irreversible.',
      inputSchema: removeSchema,
      handler: async (args) => {
        try {
          const parsed = removeSchema.parse(args)
          const ops = requireConnection()
          await ops.remove(parsed.path)
          return textResult(`Successfully deleted ${parsed.path}`)
        } catch (err) {
          return textResult(`Error deleting file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'file_exists',
      description:
        'Check whether a file or directory exists at the given path on the ' +
        'remote SSH server. Returns { exists: boolean }.',
      inputSchema: existsSchema,
      handler: async (args) => {
        try {
          const parsed = existsSchema.parse(args)
          const ops = requireConnection()
          const exists = await ops.exists(parsed.path)
          return textResult(JSON.stringify({ path: parsed.path, exists }))
        } catch (err) {
          return textResult(`Error checking existence: ${(err as Error).message}`, true)
        }
      },
    },
  ]
}
