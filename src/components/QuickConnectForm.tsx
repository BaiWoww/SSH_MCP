import { useState } from 'react'
import { useAppStore } from '../store/app-store'
import type { ConnectionConfig } from '../../electron/types'

interface Props {
  onClose: () => void
}

interface QuickForm {
  host: string
  port: number
  username: string
  password: string
}

const emptyForm: QuickForm = {
  host: '',
  port: 22,
  username: 'root',
  password: '',
}

export function QuickConnectForm({ onClose }: Props) {
  const quickConnect = useAppStore((s) => s.quickConnect)
  const [form, setForm] = useState<QuickForm>(emptyForm)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof QuickForm>(key: K, value: QuickForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleConnect() {
    if (!form.host || !form.username || !form.password) {
      setError('请填写地址、用户名和密码')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const conn: ConnectionConfig = {
        id: '',
        name: '',
        host: form.host,
        port: form.port,
        username: form.username,
        authMethod: 'password',
        password: form.password,
      }
      const saved = await quickConnect(conn)
      if (saved) {
        onClose()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !connecting) {
      handleConnect()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className="bg-agent-dark border border-agent-border rounded-lg p-6 w-[420px]"
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-lg font-semibold text-gray-200 mb-1">快速连接</h3>
        <p className="text-xs text-gray-500 mb-4">
          输入地址、端口、账号和密码，一键连接 SSH 服务器
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">地址</label>
              <input
                value={form.host}
                onChange={(e) => update('host', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="example.com 或 IP 地址"
                className="input"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">端口</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => update('port', parseInt(e.target.value) || 22)}
                onKeyDown={handleKeyDown}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">账号</label>
            <input
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="root"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">密码</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="SSH 登录密码"
              className="input"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-2 rounded text-sm bg-red-900/40 text-red-300">
            连接失败: {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-agent-surface hover:bg-agent-border rounded text-sm transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-agent-primary hover:bg-indigo-600 rounded text-sm text-white transition-colors disabled:opacity-50"
          >
            {connecting ? '连接中...' : '连接'}
          </button>
        </div>
      </div>
    </div>
  )
}
