import React, { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { TransferCard } from '@/components/TransferCard'
import { EmptyState, SectionHeader, Button, Card, Input, Select } from '@/components/ui'
import { Download, FolderOpen, HardDrive, X, Trash2, Info } from 'lucide-react'
import { startDownload, clearTransferHistory } from '@/api/client'
import { clsx } from '@/utils'

const DEFAULT_CACHE_PATH = '~/.cache/huggingface/hub'

// ── Download modal ────────────────────────────────────────────────────────────
const DownloadModal: React.FC<{
  initialRepoId?: string
  onClose: () => void
}> = ({ initialRepoId = '', onClose }) => {
  const [repoId, setRepoId]     = useState(initialRepoId)
  const [repoType, setRepoType] = useState('model')
  const [revision, setRevision] = useState('main')
  const [localDir, setLocalDir] = useState('')
  const [saveMode, setSaveMode] = useState<'cache' | 'custom'>('custom')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const repoName = repoId.split('/').pop() || repoId
  const finalPath = saveMode === 'custom' && localDir
    ? `${localDir}/${repoName}/`
    : DEFAULT_CACHE_PATH

  const handleBrowse = async () => {
    const el = window as any
    if (el.electron?.openFolder) {
      const p = await el.electron.openFolder()
      if (p) { setLocalDir(p); setSaveMode('custom') }
    } else {
      const p = window.prompt('Enter the full path to the parent directory for saving:')
      if (p) { setLocalDir(p); setSaveMode('custom') }
    }
  }

  const handleStart = async () => {
    if (!repoId.trim()) { setError('Repository ID is required'); return }
    if (saveMode === 'custom' && !localDir.trim()) {
      setError('Enter a parent directory or switch to default cache')
      return
    }
    setLoading(true); setError(null)
    try {
      await startDownload({
        repo_id:   repoId.trim(),
        repo_type: repoType,
        revision:  revision || 'main',
        local_dir: saveMode === 'custom' ? localDir.trim() : undefined,
        use_cache: saveMode === 'cache',
      })
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}>
      <Card className="w-full max-w-lg !p-0 overflow-visible shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Download size={14} className="text-blue-400" /> Download from Hub
          </h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 p-1 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Repository ID</label>
            <Input
              placeholder="meta-llama/Llama-3-8B-Instruct"
              value={repoId}
              onChange={e => setRepoId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <Select value={repoType} onChange={e => setRepoType(e.target.value)} className="w-full">
                <option value="model">Model</option>
                <option value="dataset">Dataset</option>
                <option value="space">Space</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Revision / branch</label>
              <Input value={revision} onChange={e => setRevision(e.target.value)} placeholder="main" />
            </div>
          </div>

          {/* Save location */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Save location</label>

            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-white/10 mb-2">
              <button
                onClick={() => setSaveMode('custom')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                  saveMode === 'custom'
                    ? 'bg-hf-500/20 text-hf-400'
                    : 'bg-white/[0.02] text-gray-500 hover:text-gray-300 hover:bg-white/5'
                )}
              >
                <FolderOpen size={11} /> Choose folder
              </button>
              <button
                onClick={() => setSaveMode('cache')}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                  saveMode === 'cache'
                    ? 'bg-hf-500/20 text-hf-400'
                    : 'bg-white/[0.02] text-gray-500 hover:text-gray-300 hover:bg-white/5'
                )}
              >
                <HardDrive size={11} /> HF cache
              </button>
            </div>

            {saveMode === 'custom' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Parent directory (e.g. /home/user/models)"
                    value={localDir}
                    onChange={e => setLocalDir(e.target.value)}
                    className="flex-1 font-mono text-xs"
                    icon={<FolderOpen size={13} />}
                  />
                  <Button size="sm" variant="primary" onClick={handleBrowse}>Browse</Button>
                </div>
                {/* Show the final destination path */}
                {(localDir || repoId) && (
                  <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                    <div className="text-[10px] text-gray-600 mb-0.5">Files will be saved to:</div>
                    <div className="text-xs text-gray-300 font-mono break-all">{finalPath}</div>
                    <div className="text-[10px] text-gray-600 mt-1 flex items-start gap-1">
                      <Info size={9} className="mt-0.5 flex-shrink-0" />
                      A subfolder named <span className="text-gray-400 font-mono mx-0.5">{repoName || 'repo-name'}</span>
                      is created automatically. No .cache directory used.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                  <HardDrive size={13} className="text-gray-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-400 font-mono">{DEFAULT_CACHE_PATH}</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      Files are deduplicated and managed by HF cache.
                      Useful if you use the same model in multiple projects.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.06]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleStart} loading={loading}
            disabled={!repoId || (saveMode === 'custom' && !localDir)}>
            <Download size={12} /> Start Download
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ── Downloads page ────────────────────────────────────────────────────────────
export const DownloadsPage: React.FC = () => {
  const transfers   = useStore(s => s.transfers)
  const pendingRepoId = useStore(s => s.pendingDownloadRepoId)
  const setPendingDownloadRepoId = useStore(s => s.setPendingDownloadRepoId)
  const [showModal, setShowModal] = useState(false)
  const [modalRepoId, setModalRepoId] = useState('')
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (pendingRepoId) {
      setModalRepoId(pendingRepoId)
      setShowModal(true)
      setPendingDownloadRepoId('')
    }
  }, [pendingRepoId, setPendingDownloadRepoId])

  const all       = Object.values(transfers).filter(t => t.type === 'download')
  const active    = all.filter(t => t.status === 'active' || t.status === 'queued')
  const completed = all.filter(t => t.status === 'completed')
  const failed    = all.filter(t => t.status === 'error' || t.status === 'cancelled')
  const doneCount = completed.length + failed.length

  const handleClearHistory = async () => {
    setClearing(true)
    try { await clearTransferHistory('download') } finally { setClearing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs text-gray-600 font-medium">
          {active.length > 0 ? `${active.length} active` : all.length > 0 ? `${all.length} transfers` : 'No downloads'}
        </span>
        <div className="flex items-center gap-2">
          {doneCount > 0 && (
            <Button size="sm" variant="ghost" loading={clearing} onClick={handleClearHistory}>
              <Trash2 size={11} /> Clear history
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => { setModalRepoId(''); setShowModal(true) }}>
            <Download size={12} /> New Download
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!all.length ? (
          <EmptyState
            icon="📥"
            title="No downloads yet"
            sub="Files save directly to your chosen folder — no intermediate .cache needed"
            action={
              <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
                <Download size={12} /> Start a Download
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {active.length > 0 && (
              <div>
                <SectionHeader title={`Active (${active.length})`} />
                <div className="space-y-2">{active.map(t => <TransferCard key={t.id} transfer={t} />)}</div>
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <SectionHeader title={`Completed (${completed.length})`} />
                <div className="space-y-2">{completed.map(t => <TransferCard key={t.id} transfer={t} />)}</div>
              </div>
            )}
            {failed.length > 0 && (
              <div>
                <SectionHeader title={`Failed / Cancelled (${failed.length})`} />
                <div className="space-y-2">{failed.map(t => <TransferCard key={t.id} transfer={t} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <DownloadModal
          initialRepoId={modalRepoId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
