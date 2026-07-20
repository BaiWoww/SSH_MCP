import { z } from 'zod'
import * as path from 'path'
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

const MAX_OUTPUT = 100_000

function truncate(value: string): string {
  if (value.length <= MAX_OUTPUT) return value
  return value.slice(0, MAX_OUTPUT) + `\n...[truncated, ${value.length - MAX_OUTPUT} more chars]`
}

function parentDir(remotePath: string): string {
  const parent = path.posix.dirname(remotePath)
  return parent === '' ? '/' : parent
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

  function jsonResult(obj: unknown, isError = false) {
    return textResult(JSON.stringify(obj, null, 2), isError)
  }

  const readSchema = z.object({
    path: z.string().describe('Absolute path to the remote file to read'),
    encoding: z.string().optional().describe("Text encoding, e.g. 'utf8' (default) or 'base64' for binary content"),
  })

  const writeSchema = z.object({
    path: z.string().describe('Absolute path of the remote file to write'),
    content: z.string().describe('Text content to write (or base64 when encoding=base64)'),
    encoding: z.string().optional().describe("Set to 'base64' to write binary content from a base64 string"),
    createParents: z.boolean().optional().describe('Create parent directories if missing (default true)'),
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

  const deleteFileSchema = z.object({
    path: z.string().describe('Absolute path of the file to delete'),
  })

  const deleteDirSchema = z.object({
    path: z.string().describe('Absolute path of the directory to delete'),
    recursive: z.boolean().optional().describe('Recursively delete contents (rm -rf). Default false'),
  })

  const renameSchema = z.object({
    oldPath: z.string().describe('Current remote path'),
    newPath: z.string().describe('New remote path'),
  })

  const copySchema = z.object({
    source: z.string().describe('Source remote path'),
    destination: z.string().describe('Destination remote path'),
    recursive: z.boolean().optional().describe('Copy directories recursively (cp -r). Default false'),
  })

  const existsSchema = z.object({
    path: z.string().describe('Absolute path to check for existence'),
  })

  const chmodSchema = z.object({
    path: z.string().describe('Absolute path of the file/directory'),
    mode: z.string().describe('Permission mode, e.g. "755" or "u+x"'),
    recursive: z.boolean().optional().describe('Apply recursively (chmod -R). Default false'),
  })

  const execSchema = z.object({
    command: z.string().describe('Shell command to execute on the remote server'),
    cwd: z.string().optional().describe('Working directory to run the command in'),
    timeoutSeconds: z.number().optional().describe('Kill the command after this many seconds (default 60, max 600)'),
  })

  return [
    {
      name: 'read_file',
      description:
        'Read the full contents of a remote file on the connected SSH server. ' +
        'Returns text (utf8) by default; pass encoding=base64 for binary files.',
      inputSchema: readSchema,
      handler: async (args) => {
        try {
          const parsed = readSchema.parse(args)
          const ops = requireConnection()
          const content = await ops.readFile(parsed.path, (parsed.encoding as 'base64' | BufferEncoding) ?? 'utf8')
          return textResult(content)
        } catch (err) {
          return textResult(`Error reading file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'write_file',
      description:
        'Write content to a remote file, overwriting existing content. Parent directories ' +
        'are created by default. Use encoding=base64 for binary content.',
      inputSchema: writeSchema,
      handler: async (args) => {
        try {
          const parsed = writeSchema.parse(args)
          const ops = requireConnection()
          if (parsed.createParents !== false) await ops.mkdirp(parentDir(parsed.path))
          const data = parsed.encoding === 'base64' ? Buffer.from(parsed.content, 'base64') : parsed.content
          await ops.writeFile(parsed.path, data)
          return textResult(`Successfully wrote ${data.length} bytes to ${parsed.path}`)
        } catch (err) {
          return textResult(`Error writing file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'list_directory',
      description:
        'List the contents of a remote directory. Returns entries with name, type ' +
        '(file/directory/symlink), size, and modification time.',
      inputSchema: listSchema,
      handler: async (args) => {
        try {
          const parsed = listSchema.parse(args)
          const ops = requireConnection()
          const entries = await ops.listDirectory(parsed.path)
          return jsonResult({ path: parsed.path, entries })
        } catch (err) {
          return textResult(`Error listing directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'get_file_info',
      description: 'Get detailed metadata about a remote file or directory: type, size, times, mode.',
      inputSchema: statSchema,
      handler: async (args) => {
        try {
          const parsed = statSchema.parse(args)
          const ops = requireConnection()
          const stat = await ops.stat(parsed.path)
          return jsonResult(stat)
        } catch (err) {
          return textResult(`Error getting file info: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'create_directory',
      description: 'Create a directory on the remote server, including parents (mkdir -p).',
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
      description: 'Delete a file on the remote SSH server. Use with caution — irreversible.',
      inputSchema: deleteFileSchema,
      handler: async (args) => {
        try {
          const parsed = deleteFileSchema.parse(args)
          const ops = requireConnection()
          await ops.remove(parsed.path)
          return textResult(`Successfully deleted ${parsed.path}`)
        } catch (err) {
          return textResult(`Error deleting file: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'delete_directory',
      description:
        'Delete a directory on the remote server. Set recursive=true to remove it with ' +
        'all contents (rm -rf) — extremely dangerous, use with care.',
      inputSchema: deleteDirSchema,
      handler: async (args) => {
        try {
          const parsed = deleteDirSchema.parse(args)
          const ops = requireConnection()
          if (parsed.recursive) {
            const res = await ops.removeDirectoryRecursive(parsed.path)
            return jsonResult({ deleted: true, path: parsed.path, ...res })
          }
          await ops.removeDirectory(parsed.path)
          return textResult(`Successfully removed directory ${parsed.path}`)
        } catch (err) {
          return textResult(`Error deleting directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'rename_or_move',
      description: 'Rename or move a remote file or directory.',
      inputSchema: renameSchema,
      handler: async (args) => {
        try {
          const parsed = renameSchema.parse(args)
          const ops = requireConnection()
          await ops.rename(parsed.oldPath, parsed.newPath)
          return textResult(`Renamed ${parsed.oldPath} → ${parsed.newPath}`)
        } catch (err) {
          return textResult(`Error renaming: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'copy_file',
      description: 'Copy a remote file or directory. Set recursive=true to copy directories.',
      inputSchema: copySchema,
      handler: async (args) => {
        try {
          const parsed = copySchema.parse(args)
          const ops = requireConnection()
          const res = await ops.copy(parsed.source, parsed.destination, parsed.recursive ?? false)
          return jsonResult({ copied: true, source: parsed.source, destination: parsed.destination, ...res })
        } catch (err) {
          return textResult(`Error copying: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'file_exists',
      description: 'Check whether a file or directory exists at the given remote path.',
      inputSchema: existsSchema,
      handler: async (args) => {
        try {
          const parsed = existsSchema.parse(args)
          const ops = requireConnection()
          const exists = await ops.exists(parsed.path)
          return jsonResult({ path: parsed.path, exists })
        } catch (err) {
          return textResult(`Error checking existence: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'chmod',
      description: 'Change permissions of a remote file or directory (e.g. mode "755").',
      inputSchema: chmodSchema,
      handler: async (args) => {
        try {
          const parsed = chmodSchema.parse(args)
          const ops = requireConnection()
          const res = await ops.chmod(parsed.path, parsed.mode, parsed.recursive ?? false)
          return jsonResult({ changed: true, path: parsed.path, mode: parsed.mode, ...res })
        } catch (err) {
          return textResult(`Error changing permissions: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'execute_command',
      description:
        'Execute a shell command on the remote server and return stdout, stderr, and exit ' +
        'code. Optionally set cwd and a timeout. Lets the agent operate the server like a local shell.',
      inputSchema: execSchema,
      handler: async (args) => {
        try {
          const parsed = execSchema.parse(args)
          const ops = requireConnection()
          const timeoutSeconds = parsed.timeoutSeconds
            ? Math.min(Math.max(parsed.timeoutSeconds, 1), 600)
            : 60
          const res = await ops.execute(parsed.command, {
            cwd: parsed.cwd,
            timeoutMs: timeoutSeconds * 1000,
          })
          return jsonResult({
            command: parsed.command,
            stdout: truncate(res.stdout),
            stderr: truncate(res.stderr),
            code: res.code,
            timedOut: res.timedOut,
          })
        } catch (err) {
          return textResult(`Error executing command: ${(err as Error).message}`, true)
        }
      },
    },
  ]
}
