import { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import type { ConnectionConfig, AuthMethod } from '../../electron/types'

interface Props {
  editing: ConnectionConfig | null
  onClose: () => void
}

const emptyForm: ConnectionConfig = {
  id: '',
  name: '',
  host: '',
  port: 22,
  username: 'root',
  authMethod: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
}

export function ConnectionForm({ editing, onClose }: Props) {
  const saveConnection = useAppStore((s) => s.saveConnection)
  const testConnection = useAppStore((s) => s.testConnection)
  const [form, setForm] = useState<ConnectionConfig>(emptyForm)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (editing) {
      setForm({ ...emptyForm, ...editing, password: '', privateKey: '' })
    } else {
      setForm(emptyForm)
    }
    setTestResult(null)
  }, [editing])

  function update<K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.host || !form.username) {
      alert('请填写名称、主机和用户名')
      return
    }
    const toSave: ConnectionConfig = { ...form }
    if (!toSave.id) {
      toSave.id = ''
    }
    if (toSave.authMethod === 'password' && !toSave.password && editing) {
      delete toSave.password
    }
    if (toSave.authMethod === 'privateKey' && !toSave.privateKey && editing) {
      delete toSave.privateKey
    }
    await saveConnection(toSave)
    onClose()
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection(form)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-agent-dark border border-agent-border rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">
          {editing ? '编辑连接' : '新建连接'}
        </h3>

        <div className="space-y-3">
          <Field label="名称">
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="我的服务器"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="主机">
                <input
                  value={form.host}
                  onChange={(e) => update('host', e.target.value)}
                  placeholder="example.com 或 IP"
                  className="input"
                />
              </Field>
            </div>
            <Field label="端口">
              <input
                type="number"
                value={form.port}
                onChange={(e) => update('port', parseInt(e.target.value) || 22)}
                className="input"
              />
            </Field>
          </div>

          <Field label="用户名">
            <input
              value={form.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder="root"
              className="input"
            />
          </Field>

          <Field label="认证方式">
            <select
              value={form.authMethod}
              onChange={(e) => update('authMethod', e.target.value as AuthMethod)}
              className="input"
            >
              <option value="password">密码</option>
              <option value="privateKey">私钥</option>
              <option value="agent">SSH Agent</option>
            </select>
          </Field>

          {form.authMethod === 'password' && (
            <Field label={editing ? '密码（留空则保持原密码）' : '密码'}>
              <input
                type="password"
                value={form.password ?? ''}
                onChange={(e) => update('password', e.target.value)}
                className="input"
              />
            </Field>
          )}

          {form.authMethod === 'privateKey' && (
            <>
              <Field label={editing ? '私钥（留空则保持原私钥）' : '私钥（PEM格式）'}>
                <textarea
                  value={form.privateKey ?? ''}
                  onChange={(e) => update('privateKey', e.target.value)}
                  rows={5}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  className="input font-mono text-xs"
                />
              </Field>
              <Field label="私钥口令（可选）">
                <input
                  type="password"
                  value={form.passphrase ?? ''}
                  onChange={(e) => update('passphrase', e.target.value)}
                  className="input"
                />
              </Field>
            </>
          )}
        </div>

        {testResult && (
          <div
            className={`mt-4 p-2 rounded text-sm ${
              testResult.ok
                ? 'bg-green-900/40 text-green-300'
                : 'bg-red-900/40 text-red-300'
            }`}
          >
            {testResult.ok ? '连接测试成功' : `连接失败: ${testResult.error}`}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-agent-surface hover:bg-agent-border rounded text-sm transition-colors disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-agent-surface hover:bg-agent-border rounded text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-agent-primary hover:bg-indigo-600 rounded text-sm text-white transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
