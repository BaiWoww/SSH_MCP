import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import { ConnectionList } from './components/ConnectionList'
import { ConnectionForm } from './components/ConnectionForm'
import { QuickConnectForm } from './components/QuickConnectForm'
import { FileExplorer } from './components/FileExplorer'
import { FileEditor } from './components/FileEditor'
import { AgentPanel } from './components/AgentPanel'

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const formModal = useAppStore((s) => s.formModal)
  const closeFormModal = useAppStore((s) => s.closeFormModal)
  const quickConnectModal = useAppStore((s) => s.quickConnectModal)
  const closeQuickConnectModal = useAppStore((s) => s.closeQuickConnectModal)
  const initEventListeners = useAppStore((s) => s.initEventListeners)
  const loadConnections = useAppStore((s) => s.loadConnections)
  const error = useAppStore((s) => s.error)

  useEffect(() => {
    loadConnections()
    const cleanup = initEventListeners()
    return cleanup
  }, [loadConnections, initEventListeners])

  const tabs: { id: 'connections' | 'files' | 'agent'; label: string }[] = [
    { id: 'connections', label: '连接' },
    { id: 'files', label: '文件' },
    { id: 'agent', label: '智能体' },
  ]

  return (
    <div className="flex flex-col h-screen bg-agent-dark">
      <header className="flex items-center justify-between px-4 h-12 bg-agent-darker border-b border-agent-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-agent-primary font-bold text-lg">AgentSSH</span>
          <span className="text-xs text-gray-600">AI智能体SSH客户端</span>
        </div>
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-agent-primary text-white'
                  : 'text-gray-400 hover:bg-agent-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-900/40 text-red-300 text-sm border-b border-red-900">
          {error}
        </div>
      )}

      <main className="flex flex-1 overflow-hidden">
        {activeTab === 'connections' && (
          <div className="w-full max-w-md border-r border-agent-border">
            <ConnectionList />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex w-full">
            <div className="w-64 border-r border-agent-border flex-shrink-0">
              <FileExplorer />
            </div>
            <div className="flex-1">
              <FileEditor />
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="w-full max-w-2xl">
            <AgentPanel />
          </div>
        )}
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
