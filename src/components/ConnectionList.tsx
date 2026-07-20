import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import type { ConnectionConfig } from '../../electron/types'

export function ConnectionList() {
  const connections = useAppStore((s) => s.connections)
  const statuses = useAppStore((s) => s.statuses)
  const activeConnectionId = useAppStore((s) => s.activeConnectionId)
  const loadConnections = useAppStore((s) => s.loadConnections)
  const connect = useAppStore((s) => s.connect)
  const disconnect = useAppStore((s) => s.disconnect)
  const deleteConnection = useAppStore((s) => s.deleteConnection)
  const setActiveConnection = useAppStore((s) => s.setActiveConnection)
  const onEdit = useAppStore((s) => s.onEditConnection)
  const onAdd = useAppStore((s) => s.onAddConnection)
  const onQuickConnect = useAppStore((s) => s.onQuickConnect)
  const loading = useAppStore((s) => s.loading)

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-agent-border">
        <h2 className="text-lg font-semibold text-gray-200">SSH 连接</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onQuickConnect}
            className="px-3 py-1.5 bg-agent-surface hover:bg-agent-border rounded text-gray-200 text-sm transition-colors"
          >
            快速连接
          </button>
          <button
            onClick={onAdd}
            className="px-3 py-1.5 bg-agent-primary hover:bg-indigo-600 rounded text-white text-sm transition-colors"
          >
            + 新建连接
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 && !loading && (
          <div className="p-4 text-center text-gray-500 text-sm">
            尚未添加任何连接。点击「新建连接」开始。
          </div>
        )}

        {connections.map((conn: ConnectionConfig) => {
          const status = statuses[conn.id]
          const isConnected = status?.connected ?? false
          const isActive = activeConnectionId === conn.id
          return (
            <div
              key={conn.id}
              className={`flex items-center justify-between p-3 border-b border-agent-darker hover:bg-agent-surface transition-colors ${
                isActive ? 'bg-agent-surface' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isConnected ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-200 truncate">
                    {conn.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {conn.username}@{conn.host}:{conn.port}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {!isConnected ? (
                  <button
                    onClick={() => connect(conn.id)}
                    className="px-2 py-1 text-xs bg-agent-surface hover:bg-agent-border rounded transition-colors"
                  >
                    连接
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveConnection(isActive ? null : conn.id)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        isActive
                          ? 'bg-agent-primary text-white'
                          : 'bg-agent-surface hover:bg-agent-border'
                      }`}
                    >
                      {isActive ? '已激活' : '设为活动'}
                    </button>
                    <button
                      onClick={() => disconnect(conn.id)}
                      className="px-2 py-1 text-xs bg-agent-surface hover:bg-red-900 rounded transition-colors"
                    >
                      断开
                    </button>
                  </>
                )}
                <button
                  onClick={() => onEdit(conn)}
                  className="px-2 py-1 text-xs bg-agent-surface hover:bg-agent-border rounded transition-colors"
                >
                  编辑
                </button>
                <button
                  onClick={() => {
                    if (confirm(`确认删除连接「${conn.name}」？`)) {
                      deleteConnection(conn.id)
                    }
                  }}
                  className="px-2 py-1 text-xs bg-agent-surface hover:bg-red-900 rounded transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
