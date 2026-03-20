import React, { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/Sidebar'
import { ModelsPage } from '@/pages/ModelsPage'
import { DatasetsPage } from '@/pages/DatasetsPage'
import { UploadsPage } from '@/pages/UploadsPage'
import { DownloadsPage } from '@/pages/DownloadsPage'
import { CachePage } from '@/pages/CachePage'
import { SpacesPage, MyReposPage } from '@/pages/OtherPages'
import { AuthGate } from '@/pages/AuthPage'
import { useStore } from '@/store'
import { authStatus } from '@/api/client'
import { TransferCard } from '@/components/TransferCard'
import { Spinner } from '@/components/ui'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

const PAGE_MAP: Record<string, React.ReactNode> = {
  models:    <ModelsPage />,
  datasets:  <DatasetsPage />,
  spaces:    <SpacesPage />,
  uploads:   <UploadsPage />,
  downloads: <DownloadsPage />,
  cache:     <CachePage />,
  repos:     <MyReposPage />,
}

function AppInner() {
  const { activeNav, setUser, startSSE, transfers } = useStore()
  const [booting, setBooting] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

  useEffect(() => {
    authStatus()
      .then(res => {
        if (res.authenticated) {
          setUser(res)
          setNeedsAuth(false)
        } else {
          setNeedsAuth(true)
        }
      })
      .catch(() => setNeedsAuth(true))
      .finally(() => setBooting(false))

    startSSE()
    return () => useStore.getState().stopSSE()
  }, [])

  if (booting) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f0f11]">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl">🤗</div>
          <Spinner size={20} className="text-hf-500" />
          <div className="text-xs text-gray-600">Connecting to backend…</div>
        </div>
      </div>
    )
  }

  if (needsAuth) {
    return (
      <div className="h-screen bg-[#0f0f11]">
        <AuthGate onAuth={() => setNeedsAuth(false)} />
      </div>
    )
  }

  const activeTransfers = Object.values(transfers).filter(t => t.status === 'active')

  return (
    <div className="flex h-screen bg-[#0f0f11] overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {/* Titlebar */}
        <div className="titlebar-drag h-9 flex items-center justify-between px-4 border-b border-white/[0.06] bg-[#0d0d11] flex-shrink-0">
          <div className="titlebar-no-drag text-xs text-gray-600 font-mono capitalize">{activeNav}</div>
          {activeTransfers.length > 0 && (
            <div className="titlebar-no-drag flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-hf-500 animate-pulse" />
              <span className="text-[10px] text-gray-600">{activeTransfers.length} active</span>
            </div>
          )}
        </div>

        {/* Page */}
        <div className="flex-1 overflow-hidden animate-fade-in">
          {PAGE_MAP[activeNav] ?? <ModelsPage />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AppInner />
    </QueryClientProvider>
  )
}
