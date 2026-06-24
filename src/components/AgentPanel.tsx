import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { ipc } from '../lib/ipc'

export function AgentPanel() {
  const mcpStatus = useAppStore((s) => s.mcpStatus)
  const mcpActivity = useAppStore((s) => s.mcpActivity)
  const activeConnectionId = useAppStore((s) => s.activeConnectionId)
  const refreshMcpStatus = useAppStore((s) => s.refreshMcpStatus)
  const [bridgePort, setBridgePort] = useState<number | null>(null)

  useEffect(() => {
    refreshMcpStatus()
    ipc.mcp.getBridgePort().then(setBridgePort).catch(() => {})
    const interval = setInterval(refreshMcpStatus, 5000)
    return () => clearInterval(interval)
  }, [refreshMcpStatus])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-agent-border">
        <h2 className="text-lg font-semibold text-gray-200 mb-2">AI 智能体 (MCP)</h2>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              mcpStatus.running ? 'bg-green-500' : 'bg-gray-600'
            }`}
          />
          <span className="text-gray-300">
            {mcpStatus.running ? 'MCP 服务器运行中' : 'MCP 服务器未启动'}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          活动连接:{' '}
          {mcpStatus.activeConnectionId ? (
            <span className="text-agent-primary font-mono">
              {mcpStatus.activeConnectionId}
            </span>
          ) : (
            <span className="text-gray-600">无</span>
          )}
        </div>
      </div>

      <div className="p-3 border-b border-agent-border bg-agent-darker">
        <div className="text-xs text-gray-400 mb-2">Claude Desktop 配置示例</div>
        <pre className="text-xs text-gray-300 font-mono overflow-x-auto bg-black/40 p-2 rounded">
{`{
  "mcpServers": {
    "agentssh": {
      "command": "node",
      "args": ["dist-electron/mcp/standalone.js"],
      "env": {
        "AGENTSSH_BRIDGE_PORT": "${bridgePort ?? '<端口>'}",
        "AGENTSSH_CONNECTION_ID": "${activeConnectionId ?? '<连接ID>'}"
      }
    }
  }
}`}
        </pre>
        <p className="text-xs text-gray-500 mt-2">
          将此配置加入 Claude Desktop 的
          <code className="text-gray-400 mx-1">claude_desktop_config.json</code>
          后，AI 智能体即可通过 MCP 工具读取/编辑远程文件。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 border-b border-agent-border text-sm font-semibold text-gray-300">
          活动日志
        </div>
        {mcpActivity.length === 0 ? (
          <div className="p-4 text-center text-gray-600 text-sm">
            暂无智能体活动。连接并激活一个服务器后，
            AI 智能体的文件操作将显示在此处。
          </div>
        ) : (
          mcpActivity.map((entry, i) => (
            <div
              key={i}
              className="p-2 border-b border-agent-darker text-xs font-mono"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`font-semibold ${
                    entry.error ? 'text-red-400' : 'text-agent-primary'
                  }`}
                >
                  {entry.toolName}
                </span>
                <span className="text-gray-600">{entry.durationMs}ms</span>
              </div>
              <div className="text-gray-500 mt-0.5">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
              {Object.keys(entry.args).length > 0 && (
                <div className="text-gray-400 mt-1 truncate">
                  args: {JSON.stringify(entry.args)}
                </div>
              )}
              {entry.error && (
                <div className="text-red-400 mt-1 break-all">
                  {entry.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
