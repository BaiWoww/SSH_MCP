import { useState, useEffect, useCallback } from 'react'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../store/app-store'
import type { RemoteFileEntry } from '../../electron/types'

interface TreeNode {
  entry: RemoteFileEntry
  children: TreeNode[] | null
  expanded: boolean
  loading: boolean
}

export function FileExplorer() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId)
  const openFile = useAppStore((s) => s.openFile)
  const [root, setRoot] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPath, setCurrentPath] = useState('/')

  const loadChildren = useCallback(
    async (path: string): Promise<RemoteFileEntry[]> => {
      if (!activeConnectionId) return []
      return ipc.files.list(activeConnectionId, path)
    },
    [activeConnectionId],
  )

  useEffect(() => {
    if (!activeConnectionId) {
      setRoot([])
      return
    }
    setLoading(true)
    loadChildren('/')
      .then((entries) => {
        setRoot(
          entries.map((e) => ({
            entry: e,
            children: e.type === 'directory' ? null : [],
            expanded: false,
            loading: false,
          })),
        )
      })
      .finally(() => setLoading(false))
  }, [activeConnectionId, loadChildren])

  async function toggleNode(node: TreeNode) {
    if (node.entry.type !== 'directory') {
      if (node.entry.type === 'file') {
        openFile(node.entry.path)
      }
      return
    }
    node.expanded = !node.expanded
    if (node.expanded && node.children === null) {
      node.loading = true
      setRoot([...root])
      const entries = await loadChildren(node.entry.path)
      node.children = entries.map((e) => ({
        entry: e,
        children: e.type === 'directory' ? null : [],
        expanded: false,
        loading: false,
      }))
      node.loading = false
    }
    setRoot([...root])
  }

  if (!activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        请先在「连接」标签页中激活一个 SSH 连接
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-agent-border text-xs text-gray-400 font-mono truncate">
        {currentPath}
      </div>
      {loading ? (
        <div className="p-4 text-gray-500 text-sm">加载中...</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {root.map((node) => (
            <FileTreeRow
              key={node.entry.path}
              node={node}
              depth={0}
              onToggle={toggleNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileTreeRow({
  node,
  depth,
  onToggle,
}: {
  node: TreeNode
  depth: number
  onToggle: (node: TreeNode) => void
}) {
  const icon =
    node.entry.type === 'directory'
      ? node.expanded
        ? '📂'
        : '📁'
      : node.entry.type === 'symlink'
      ? '🔗'
      : '📄'

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1 hover:bg-agent-surface cursor-pointer text-sm"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onToggle(node)}
      >
        <span>{node.loading ? '⏳' : icon}</span>
        <span className="truncate">{node.entry.name}</span>
      </div>
      {node.expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeRow
              key={child.entry.path}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
