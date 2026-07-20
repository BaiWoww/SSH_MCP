import {
  z,
  ZodBoolean,
  ZodDefault,
  ZodEnum,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodString,
  type ZodTypeAny,
} from 'zod'
import * as path from 'node:path'
import type { ConnectionManager } from '../ssh/connection-manager.js'
import { SftpOperations } from '../ssh/sftp-operations.js'
import type { McpConfig, SshConnectionConfig } from '../types.js'
import { resolveDefaultName } from '../config.js'

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export interface McpTool {
  name: string
  description: string
  inputSchema: ZodTypeAny
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolContext {
  config: McpConfig
  manager: ConnectionManager
  getActiveName(): string | null
  setActiveName(name: string | null): void
}

const MAX_OUTPUT = 100_000 // truncate stdout/stderr beyond this many chars

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError }
}

function jsonResult(obj: unknown, isError = false): ToolResult {
  return textResult(JSON.stringify(obj, null, 2), isError)
}

function truncate(value: string): string {
  if (value.length <= MAX_OUTPUT) return value
  return value.slice(0, MAX_OUTPUT) + `\n...[truncated, ${value.length - MAX_OUTPUT} more chars]`
}

function parentDir(remotePath: string): string {
  const parent = path.posix.dirname(remotePath)
  return parent === '' ? '/' : parent
}

export function defineTools(ctx: ToolContext): McpTool[] {
  function requireOps(): SftpOperations {
    const name = ctx.getActiveName()
    if (!name) {
      throw new Error(
        'No active SSH connection. Call the "connect" tool first (or configure a default connection).',
      )
    }
    if (!ctx.manager.isConnected(name)) {
      throw new Error(`SSH connection "${name}" is not active. Call "connect" to re-establish it.`)
    }
    return new SftpOperations(ctx.manager, name)
  }

  function resolveName(name?: string): string {
    const resolved = name ?? resolveDefaultName(ctx.config)
    if (!resolved) {
      throw new Error('No connection name given and no default connection configured.')
    }
    return resolved
  }

  function findConfig(name: string): SshConnectionConfig {
    const cfg = ctx.config.connections.find((c) => c.name === name)
    if (!cfg) {
      throw new Error(
        `Connection "${name}" not found. Use "list_connections" to see configured connections.`,
      )
    }
    return cfg
  }

  // --- Schemas ---
  const connectSchema = z.object({
    name: z.string().optional().describe('Name of the configured connection to activate. Defaults to the default connection.'),
  })

  const disconnectSchema = z.object({
    name: z.string().optional().describe('Connection to disconnect. Defaults to the active connection.'),
  })

  const readSchema = z.object({
    path: z.string().describe('Absolute path to the remote file to read.'),
    encoding: z
      .string()
      .optional()
      .describe("Text encoding, e.g. 'utf8' (default) or 'base64' for binary content."),
  })

  const writeSchema = z.object({
    path: z.string().describe('Absolute path of the remote file to write.'),
    content: z.string().describe('Text content to write (or base64 when encoding=base64).'),
    encoding: z
      .string()
      .optional()
      .describe("Set to 'base64' to write binary content from a base64 string."),
    createParents: z
      .boolean()
      .optional()
      .describe('Create parent directories if missing (default true).'),
  })

  const listSchema = z.object({
    path: z.string().describe('Absolute path to the remote directory to list.'),
  })

  const statSchema = z.object({
    path: z.string().describe('Absolute path to stat.'),
  })

  const mkdirSchema = z.object({
    path: z.string().describe('Absolute path of the directory to create.'),
  })

  const deleteFileSchema = z.object({
    path: z.string().describe('Absolute path of the file to delete.'),
  })

  const deleteDirSchema = z.object({
    path: z.string().describe('Absolute path of the directory to delete.'),
    recursive: z
      .boolean()
      .optional()
      .describe('Recursively delete contents (rm -rf). Default false.'),
  })

  const renameSchema = z.object({
    oldPath: z.string().describe('Current remote path.'),
    newPath: z.string().describe('New remote path.'),
  })

  const copySchema = z.object({
    source: z.string().describe('Source remote path.'),
    destination: z.string().describe('Destination remote path.'),
    recursive: z.boolean().optional().describe('Copy directories recursively (cp -r). Default false.'),
  })

  const existsSchema = z.object({
    path: z.string().describe('Absolute path to check for existence.'),
  })

  const chmodSchema = z.object({
    path: z.string().describe('Absolute path of the file/directory.'),
    mode: z.string().describe('Permission mode, e.g. "755" or "u+x".'),
    recursive: z.boolean().optional().describe('Apply recursively (chmod -R). Default false.'),
  })

  const execSchema = z.object({
    command: z.string().describe('Shell command to execute on the remote server.'),
    cwd: z.string().optional().describe('Working directory to run the command in.'),
    timeoutSeconds: z
      .number()
      .optional()
      .describe('Kill the command after this many seconds (default 60, max 600).'),
  })

  // --- Tools ---
  const tools: McpTool[] = [
    {
      name: 'list_connections',
      description:
        'List all configured SSH connections and their current connected status. ' +
        'Secrets are never returned.',
      inputSchema: z.object({}),
      handler: async () => {
        const active = ctx.getActiveName()
        const defaultName = resolveDefaultName(ctx.config)
        const info = ctx.config.connections.map((c) => {
          const status = ctx.manager.getStatus(c.name)
          return {
            name: c.name,
            host: c.host,
            port: c.port,
            username: c.username,
            authMethod: c.authMethod,
            default: c.name === defaultName,
            active: c.name === active,
            connected: status.connected,
            lastConnectedAt: status.lastConnectedAt,
          }
        })
        return jsonResult({ active, connections: info })
      },
    },
    {
      name: 'connect',
      description:
        'Connect to a configured SSH server by name and set it as the active connection. ' +
        'If the connection is already up, it is simply activated.',
      inputSchema: connectSchema,
      handler: async (args) => {
        try {
          const parsed = connectSchema.parse(args)
          const name = resolveName(parsed.name)
          const cfg = findConfig(name)
          if (!ctx.manager.isConnected(name)) {
            await ctx.manager.connect(cfg)
          }
          ctx.setActiveName(name)
          const status = ctx.manager.getStatus(name)
          return jsonResult({
            name,
            connected: status.connected,
            host: cfg.host,
            port: cfg.port,
            username: cfg.username,
            lastConnectedAt: status.lastConnectedAt,
          })
        } catch (err) {
          return textResult(`Error connecting: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'disconnect',
      description:
        'Disconnect an SSH connection. Defaults to the active connection. Clears the active ' +
        'connection if it matches.',
      inputSchema: disconnectSchema,
      handler: async (args) => {
        try {
          const parsed = disconnectSchema.parse(args)
          const name = parsed.name ?? ctx.getActiveName() ?? resolveDefaultName(ctx.config)
          if (!name) return textResult('No connection to disconnect.', true)
          await ctx.manager.disconnect(name)
          if (ctx.getActiveName() === name) ctx.setActiveName(null)
          return jsonResult({ disconnected: true, name })
        } catch (err) {
          return textResult(`Error disconnecting: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'connection_status',
      description:
        'Report the active connection and the status of all managed connections.',
      inputSchema: z.object({}),
      handler: async () => {
        const active = ctx.getActiveName()
        return jsonResult({
          active,
          statuses: ctx.manager.getAllStatuses(),
        })
      },
    },
    {
      name: 'read_file',
      description:
        'Read the full contents of a remote file on the active SSH server. Returns text ' +
        '(utf8) by default; pass encoding=base64 for binary files.',
      inputSchema: readSchema,
      handler: async (args) => {
        try {
          const parsed = readSchema.parse(args)
          const ops = requireOps()
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
        'Write content to a remote file on the active SSH server, overwriting existing ' +
        'content. Parent directories are created by default. Use encoding=base64 for binary.',
      inputSchema: writeSchema,
      handler: async (args) => {
        try {
          const parsed = writeSchema.parse(args)
          const ops = requireOps()
          const createParents = parsed.createParents !== false
          if (createParents) await ops.mkdirp(parentDir(parsed.path))
          const data = parsed.encoding === 'base64'
            ? Buffer.from(parsed.content, 'base64')
            : parsed.content
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
          const ops = requireOps()
          const entries = await ops.listDirectory(parsed.path)
          return jsonResult({ path: parsed.path, entries })
        } catch (err) {
          return textResult(`Error listing directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'get_file_info',
      description:
        'Get detailed metadata about a remote file or directory: type, size, modification ' +
        'time, access time, and permission mode.',
      inputSchema: statSchema,
      handler: async (args) => {
        try {
          const parsed = statSchema.parse(args)
          const ops = requireOps()
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
          const ops = requireOps()
          await ops.mkdirp(parsed.path)
          return textResult(`Successfully created directory ${parsed.path}`)
        } catch (err) {
          return textResult(`Error creating directory: ${(err as Error).message}`, true)
        }
      },
    },
    {
      name: 'delete_file',
      description: 'Delete a file on the remote server. Use with caution — irreversible.',
      inputSchema: deleteFileSchema,
      handler: async (args) => {
        try {
          const parsed = deleteFileSchema.parse(args)
          const ops = requireOps()
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
          const ops = requireOps()
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
          const ops = requireOps()
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
          const ops = requireOps()
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
          const ops = requireOps()
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
          const ops = requireOps()
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
        'code. Optionally set cwd and a timeout. Lets the agent operate the server like a ' +
        'local shell.',
      inputSchema: execSchema,
      handler: async (args) => {
        try {
          const parsed = execSchema.parse(args)
          const ops = requireOps()
          const timeoutSeconds = parsed.timeoutSeconds
            ? Math.min(Math.max(parsed.timeoutSeconds, 1), 600)
            : 60
          const res = await ops.execute(parsed.command, {
            cwd: parsed.cwd,
            timeoutMs: timeoutSeconds * 1000,
          })
          return jsonResult({
            command: res.command,
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

  return tools
}

/**
 * Convert a zod object schema into a JSON Schema descriptor suitable for the
 * MCP tool inputSchema. Handles string/number/boolean, enums, optionals, and
 * descriptions.
 */
export function zodToJsonSchema(schema: ZodTypeAny): {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
} {
  if (!(schema instanceof ZodObject)) {
    return { type: 'object', properties: {} }
  }
  const shape = schema.shape as Record<string, ZodTypeAny>
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, field] of Object.entries(shape)) {
    const { type, description, optional } = describeField(field)
    const prop: Record<string, unknown> = { type }
    if (description) prop.description = description
    properties[key] = prop
    if (!optional) required.push(key)
  }

  return {
    type: 'object',
    properties,
    required: required.length ? required : undefined,
  }
}

function describeField(field: ZodTypeAny): {
  type: string
  description?: string
  optional: boolean
} {
  let unwrapped = field
  let optional = false

  if (unwrapped instanceof ZodOptional) {
    optional = true
    unwrapped = unwrapped.unwrap()
  } else if (unwrapped instanceof ZodDefault) {
    optional = true
    unwrapped = unwrapped.removeDefault()
  }

  let type = 'string'
  if (unwrapped instanceof ZodString) type = 'string'
  else if (unwrapped instanceof ZodNumber) type = 'number'
  else if (unwrapped instanceof ZodBoolean) type = 'boolean'
  else if (unwrapped instanceof ZodEnum) type = 'string'

  const description = (field as { description?: string }).description
  return { type, description, optional }
}
