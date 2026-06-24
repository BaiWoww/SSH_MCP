import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../store/app-store'

interface OpenFile {
  path: string
  content: string
  original: string
  dirty: boolean
}

export function FileEditor() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId)
  const openFilePath = useAppStore((s) => s.openFilePath)
  const clearOpenFile = useAppStore((s) => s.clearOpenFile)
  const [file, setFile] = useState<OpenFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!openFilePath || !activeConnectionId) {
      setFile(null)
      return
    }
    setLoading(true)
    setError(null)
    ipc.files
      .read(activeConnectionId, openFilePath)
      .then((content) => {
        setFile({
          path: openFilePath,
          content,
          original: content,
          dirty: false,
        })
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [openFilePath, activeConnectionId])

  async function handleSave() {
    if (!file || !activeConnectionId) return
    setSaving(true)
    setError(null)
    try {
      await ipc.files.write(activeConnectionId, file.path, file.content)
      setFile({ ...file, original: file.content, dirty: false })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function getLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      json: 'json', py: 'python', go: 'go', rs: 'rust', java: 'java',
      c: 'c', cpp: 'cpp', h: 'c', sh: 'shell', yml: 'yaml', yaml: 'yaml',
      md: 'markdown', html: 'html', css: 'css', xml: 'xml', sql: 'sql',
      conf: 'ini', ini: 'ini', env: 'ini', txt: 'plaintext',
    }
    return map[ext ?? ''] ?? 'plaintext'
  }

  if (!activeConnectionId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        请先激活一个 SSH 连接
      </div>
    )
  }

  if (!openFilePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        在左侧文件树中选择一个文件以查看或编辑
      </div>
    )
  }

  if (loading) {
    return <div className="p-4 text-gray-500 text-sm">加载文件中...</div>
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-sm">
        加载失败: {error}
        <button onClick={clearOpenFile} className="ml-2 underline">
          关闭
        </button>
      </div>
    )
  }

  if (!file) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b border-agent-border">
        <span className="text-sm font-mono text-gray-300 truncate">
          {file.path}
          {file.dirty && <span className="text-yellow-500 ml-1">●</span>}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !file.dirty}
          className="px-3 py-1 bg-agent-primary hover:bg-indigo-600 rounded text-xs text-white transition-colors disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存到远程'}
        </button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language={getLanguage(file.path)}
          value={file.content}
          onChange={(value) =>
            setFile({
              ...file,
              content: value ?? '',
              dirty: (value ?? '') !== file.original,
            })
          }
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  )
}
