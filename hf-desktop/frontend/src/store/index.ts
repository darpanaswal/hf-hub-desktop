import { create } from 'zustand'
import { transferSSE } from '@/api/client'

export interface Transfer {
  id: string
  type: 'upload' | 'download'
  repo_id: string
  status: 'queued' | 'active' | 'paused' | 'completed' | 'error' | 'cancelled'
  progress: number
  speed_bps: number
  total_bytes: number
  transferred_bytes: number
  current_file: string
  total_files: number
  completed_files: number
  error?: string
  started_at: number
  completed_at?: number
  meta: Record<string, any>
}

export interface AuthUser {
  authenticated: boolean
  username?: string
  email?: string
  avatar_url?: string
  orgs?: string[]
}

interface AppStore {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void

  transfers: Record<string, Transfer>
  setTransfers: (ts: Transfer[]) => void
  updateTransfer: (t: Transfer) => void

  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  activeNav: string
  setActiveNav: (v: string) => void

  // Pending download: when clicking Download on a model/dataset card,
  // navigate to Downloads page with this pre-filled
  pendingDownloadRepoId: string
  setPendingDownloadRepoId: (id: string) => void

  sseCleanup: (() => void) | null
  startSSE: () => void
  stopSSE: () => void
}

export const useStore = create<AppStore>((set, get) => ({
  user: null,
  setUser: (u) => set({ user: u }),

  transfers: {},
  setTransfers: (ts) => {
    const map: Record<string, Transfer> = {}
    ts.forEach(t => { map[t.id] = t })
    set({ transfers: map })
  },
  updateTransfer: (t) =>
    set(s => ({ transfers: { ...s.transfers, [t.id]: t } })),

  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  activeNav: 'models',
  setActiveNav: (v) => set({ activeNav: v }),

  pendingDownloadRepoId: '',
  setPendingDownloadRepoId: (id) => set({ pendingDownloadRepoId: id }),

  sseCleanup: null,
  startSSE: () => {
    const { sseCleanup } = get()
    if (sseCleanup) sseCleanup()
    const cleanup = transferSSE((data) => {
      if (data.type === 'snapshot') {
        get().setTransfers(data.transfers)
      } else if (data.type === 'update') {
        get().updateTransfer(data.transfer)
      }
    })
    set({ sseCleanup: cleanup })
  },
  stopSSE: () => {
    const { sseCleanup } = get()
    if (sseCleanup) { sseCleanup(); set({ sseCleanup: null }) }
  },
}))
