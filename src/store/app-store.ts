import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type {
  ConnectionConfig,
  ConnectionStatus,
  McpActivityEntry,
  McpStatus,
} from '../../electron/types'

type TabId = 'connections' | 'files' | 'agent'

interface AppState {
  connections: ConnectionConfig[]
  statuses: Record<string, ConnectionStatus>
  activeConnectionId: string | null
  activeTab: TabId
  mcpStatus: McpStatus
  mcpActivity: McpActivityEntry[]
  loading: boolean
  error: string | null
  formModal: { open: boolean; editing: ConnectionConfig | null }
  onAddConnection: () => void
  onEditConnection: (conn: ConnectionConfig) => void
  closeFormModal: () => void
  quickConnectModal: { open: boolean }
  onQuickConnect: () => void
  closeQuickConnectModal: () => void
  openFilePath: string | null
  openFile: (path: string) => void
  clearOpenFile: () => void

  loadConnections: () => Promise<void>
  saveConnection: (conn: ConnectionConfig) => Promise<void>
  deleteConnection: (id: string) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  testConnection: (conn: ConnectionConfig) => Promise<{ ok: boolean; error?: string }>
  quickConnect: (conn: ConnectionConfig) => Promise<ConnectionConfig | null>
  setActiveConnection: (id: string | null) => void
  setActiveTab: (tab: TabId) => void
  refreshMcpStatus: () => Promise<void>
  pushActivity: (entry: McpActivityEntry) => void
  updateStatus: (status: ConnectionStatus) => void
  initEventListeners: () => () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  statuses: {},
  activeConnectionId: null,
  activeTab: 'connections',
  mcpStatus: { running: false, activeConnectionId: null, transport: 'none' },
  mcpActivity: [],
  loading: false,
  error: null,
  formModal: { open: false, editing: null },
  onAddConnection: () => set({ formModal: { open: true, editing: null } }),
  onEditConnection: (conn) => set({ formModal: { open: true, editing: conn } }),
  closeFormModal: () => set({ formModal: { open: false, editing: null } }),
  quickConnectModal: { open: false },
  onQuickConnect: () => set({ quickConnectModal: { open: true } }),
  closeQuickConnectModal: () => set({ quickConnectModal: { open: false } }),
  openFilePath: null,

  openFile: (path) => set({ openFilePath: path, activeTab: 'files' }),

  clearOpenFile: () => set({ openFilePath: null }),

  loadConnections: async () => {
    set({ loading: true, error: null })
    try {
      const list = await ipc.connection.list()
      set({ connections: list, loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  saveConnection: async (conn) => {
    set({ loading: true, error: null })
    try {
      await ipc.connection.save(conn)
      await get().loadConnections()
      set({ loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  deleteConnection: async (id) => {
    set({ loading: true, error: null })
    try {
      await ipc.connection.delete(id)
      await get().loadConnections()
      set({ loading: false })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  connect: async (id) => {
    set({ loading: true, error: null })
    try {
      await ipc.connection.connect(id)
      const status = await ipc.connection.status(id)
      set((state) => ({
        loading: false,
        statuses: { ...state.statuses, [id]: status },
      }))
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  disconnect: async (id) => {
    try {
      await ipc.connection.disconnect(id)
      const status = await ipc.connection.status(id)
      set((state) => ({
        statuses: { ...state.statuses, [id]: status },
        activeConnectionId:
          state.activeConnectionId === id ? null : state.activeConnectionId,
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  testConnection: async (conn) => {
    return ipc.connection.test(conn)
  },

  quickConnect: async (conn) => {
    set({ loading: true, error: null })
    try {
      const saved = await ipc.connection.quickConnect(conn)
      await get().loadConnections()
      const status = await ipc.connection.status(saved.id)
      set((state) => ({
        loading: false,
        statuses: { ...state.statuses, [saved.id]: status },
      }))
      return saved
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
      return null
    }
  },

  setActiveConnection: (id) => {
    set({ activeConnectionId: id })
    if (id) {
      ipc.mcp.setActiveConnection(id).then(() => get().refreshMcpStatus())
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  refreshMcpStatus: async () => {
    try {
      const status = await ipc.mcp.getStatus()
      set({ mcpStatus: status })
    } catch {
      /* ignore */
    }
  },

  pushActivity: (entry) =>
    set((state) => ({
      mcpActivity: [entry, ...state.mcpActivity].slice(0, 200),
    })),

  updateStatus: (status) =>
    set((state) => ({
      statuses: { ...state.statuses, [status.id]: status },
    })),

  initEventListeners: () => {
    const offStatus = ipc.connectionEvents.onStatusChange((status) => {
      get().updateStatus(status)
    })
    const offActivity = ipc.mcp.onActivity((entry) => {
      get().pushActivity(entry)
    })
    return () => {
      offStatus()
      offActivity()
    }
  },
}))
