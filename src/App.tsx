import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { ConnectionList } from './components/ConnectionList'
import { ConnectionForm } from './components/ConnectionForm'
import { QuickConnectForm } from './components/QuickConnectForm'

export default function App() {
  const formModal = useAppStore((s) => s.formModal)
  const closeFormModal = useAppStore((s) => s.closeFormModal)
  const quickConnectModal = useAppStore((s) => s.quickConnectModal)
  const closeQuickConnectModal = useAppStore((s) => s.closeQuickConnectModal)
  const initEventListeners = useAppStore((s) => s.initEventListeners)
  const loadConnections = useAppStore((s) => s.loadConnections)
  const error = useAppStore((s) => s.error)
  const mcpStatus = useAppStore((s) => s.mcpStatus)

  useEffect(() => {
    loadConnections()
    const cleanup = initEventListeners()
    return cleanup
  }, [loadConnections, initEventListeners])

  return (
    <div className="flex flex-col h-screen bg-agent-dark">
      <header className="flex items-center justify-between px-4 h-12 bg-agent-darker border-b border-agent-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-agent-primary font-bold text-lg">AgentSSH</span>
          <span className="text-xs text-gray-600">SSH 连接管理 · 供 MCP 智能体使用</span>
        </div>
        <div className="text-xs text-gray-500">
          MCP：{mcpStatus.running ? `运行中（活动连接 ${mcpStatus.activeConnectionId ?? '—'}）` : '未运行'}
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-900/40 text-red-300 text-sm border-b border-red-900">
          {error}
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        <div className="w-full max-w-2xl mx-auto">
          <ConnectionList />
        </div>
      </main>

      {formModal.open && (
        <ConnectionForm editing={formModal.editing} onClose={closeFormModal} />
      )}

      {quickConnectModal.open && (
        <QuickConnectForm onClose={closeQuickConnectModal} />
      )}
    </div>
  )
}
