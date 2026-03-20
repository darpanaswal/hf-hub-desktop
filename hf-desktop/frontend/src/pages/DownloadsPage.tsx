import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { TransferCard } from '@/components/TransferCard'
import { EmptyState, SectionHeader, Button, Card, Input, Spinner } from '@/components/ui'
import { Download, FolderOpen, HardDrive, X, Trash2, CheckSquare, Square, File } from 'lucide-react'
import { startDownload, clearTransferHistory, listRepoFiles } from '@/api/client'
import { formatBytes, clsx } from '@/utils'

const DEFAULT_CACHE_PATH = '~/.cache/huggingface/hub'

// ── File picker ───────────────────────────────────────────────────────────────
const FilePicker: React.FC<{
  repoId: string
  selected: string[]
  onChange: (files: string[]) => void
  onRepoTypeDetected: (t: string) => void
}> = ({ repoId, selected, onChange, onRepoTypeDetected }) => {
  const [files, setFiles]     = useState<{ filename: string; size: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setFiles([]); setError(null)
    if (!repoId.trim() || !repoId.includes('/')) return

    // Debounce — wait 600ms after the user stops typing before hitting the API
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await listRepoFiles(repoId)
        setFiles(data.files ?? [])
        if (data.repo_type) onRepoTypeDetected(data.repo_type)
        setError(null)
      } catch (e: any) {
        const msg = e?.response?.data?.detail ?? e.message ?? 'Not found'
        setError(msg)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }, 600)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [repoId])

  // Reset selection when repo changes
  useEffect(() => { onChange([]) }, [repoId])

  if (!repoId.trim() || !repoId.includes('/')) return null

  const filtered = files.filter(f =>
    !filter || f.filename.toLowerCase().includes(filter.toLowerCase())
  )
  const allSelected = filtered.length > 0 && filtered.every(f => selected.includes(f.filename))

  const toggle = (filename: string) =>
    onChange(selected.includes(filename)
      ? selected.filter(f => f !== filename)
      : [...selected, filename]
    )

  const toggleAll = () => {
    if (allSelected) {
      onChange(selected.filter(f => !filtered.find(ff => ff.filename === f)))
    } else {
      const toAdd = filtered.map(f => f.filename).filter(f => !selected.includes(f))
      onChange([...selected, ...toAdd])
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">
          Select files{' '}
          <span className="text-gray-700">(leave all unchecked to download full repo)</span>
        </label>
        {loading && <Spinner size={12} className="text-gray-500" />}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <div className="border border-white/10 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 bg-white/[0.03] border-b border-white/[0.06]">
            <button onClick={toggleAll} className="flex-shrink-0 text-gray-500 hover:text-gray-300">
              {allSelected
                ? <CheckSquare size={13} className="text-hf-400" />
                : <Square size={13} />}
            </button>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter files…"
              className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none"
            />
            {selected.length > 0 && (
              <span className="text-[10px] text-hf-400 flex-shrink-0">{selected.length} selected</span>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(f => (
              <button
                key={f.filename}
                onClick={() => toggle(f.filename)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors',
                  'hover:bg-white/5 border-b border-white/[0.04] last:border-0',
                  selected.includes(f.filename) && 'bg-hf-500/5'
                )}
              >
                {selected.includes(f.filename)
                  ? <CheckSquare size={12} className="text-hf-400 flex-shrink-0" />
                  : <Square size={12} className="text-gray-600 flex-shrink-0" />}
                <File size={11} className="text-gray-600 flex-shrink-0" />
                <span className="flex-1 text-xs text-gray-300 font-mono truncate">{f.filename}</span>
                <span className="text-[10px] text-gray-600 flex-shrink-0">{formatBytes(f.size)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Download modal ────────────────────────────────────────────────────────────
const DownloadModal: React.FC<{
  initialRepoId?: string
  onClose: () => void
}> = ({ initialRepoId = '', onClose }) => {
  const [repoId, setRepoId]             = useState(initialRepoId)
  const [detectedType, setDetectedType] = useState<string | null>(null)
  const [revision, setRevision]         = useState('main')
  const [localDir, setLocalDir]         = useState('')
  const [saveMode, setSaveMode]         = useState<'cache' | 'custom'>('custom')
  const [createSubfolder, setCreateSubfolder] = useState(true)
  const [selectedFiles, setSelectedFiles]     = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Reset detected type when repo changes
  useEffect(() => { setDetectedType(null) }, [repoId])

  const repoName    = repoId.split('/').pop() || repoId
  const effectiveDest = saveMode === 'custom' && localDir
    ? createSubfolder ? `${localDir}/${repoName}/` : `${localDir}/`
    : DEFAULT_CACHE_PATH

  const handleBrowse = async () => {
    const el = window as any
    if (el.electron?.openFolder) {
      const p = await el.electron.openFolder()
      if (p) { setLocalDir(p); setSaveMode('custom') }
    } else {
      const p = window.prompt('Enter the full path to the parent directory:')
      if (p) { setLocalDir(p); setSaveMode('custom') }
    }
  }

  const handleStart = async () => {
    if (!repoId.trim()) { setError('Repository ID is required'); return }
    if (saveMode === 'custom' && !localDir.trim()) {
      setError('Enter a save directory or switch to HF cache'); return
    }
    setLoading(true); setError(null)
    try {
      await startDownload({
        repo_id:               repoId.trim(),
        revision:              revision || 'main',
        local_dir:             saveMode === 'custom' ? localDir.trim() : undefined,
        create_repo_subfolder: saveMode === 'custom' ? createSubfolder : true,
        filenames:             selectedFiles.length > 0 ? selectedFiles : undefined,
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
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 p-1 rounded">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 max-h-[80vh] overflow-y-auto">

          {/* Repo ID + detected type badge */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Repository ID</label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="owner/repo-name"
                value={repoId}
                onChange={e => setRepoId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                autoFocus
              />
              {detectedType && (
                <span className="flex-shrink-0 text-[10px] px-2 py-1 rounded-full border border-hf-500/30 bg-hf-500/10 text-hf-400 font-medium capitalize">
                  {detectedType}
                </span>
              )}
            </div>
          </div>

          {/* Revision */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Revision / branch</label>
            <Input value={revision} onChange={e => setRevision(e.target.value)} placeholder="main" />
          </div>

          {/* File picker — handles its own loading/error state */}
          <FilePicker
            repoId={repoId}
            selected={selectedFiles}
            onChange={setSelectedFiles}
            onRepoTypeDetected={setDetectedType}
          />

          {/* Save location */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Save location</label>
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

                {/* Subfolder checkbox */}
                <button
                  onClick={() => setCreateSubfolder(v => !v)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {createSubfolder
                    ? <CheckSquare size={13} className="text-hf-400" />
                    : <Square size={13} className="text-gray-600" />}
                  Create subfolder named
                  <span className="font-mono text-gray-300 mx-0.5">{repoName || 'repo-name'}</span>
                </button>

                {/* Path preview */}
                {(localDir || repoId) && (
                  <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                    <div className="text-[10px] text-gray-600 mb-0.5">
                      {selectedFiles.length > 0
                        ? `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''} will be saved to:`
                        : 'All files will be saved to:'}
                    </div>
                    <div className="text-xs text-gray-300 font-mono break-all">{effectiveDest}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                <HardDrive size={13} className="text-gray-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-400 font-mono">{DEFAULT_CACHE_PATH}</div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    Files are deduplicated and managed by HF cache.
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
          <Button
            variant="primary" size="sm"
            onClick={handleStart}
            loading={loading}
            disabled={!repoId || (saveMode === 'custom' && !localDir)}
          >
            <Download size={12} />
            {selectedFiles.length > 0
              ? `Download ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`
              : 'Download'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ── Downloads page ────────────────────────────────────────────────────────────
export const DownloadsPage: React.FC = () => {
  const transfers = useStore(s => s.transfers)
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs text-gray-600 font-medium">
          {active.length > 0
            ? `${active.length} active`
            : all.length > 0 ? `${all.length} transfers` : 'No downloads'}
        </span>
        <div className="flex items-center gap-2">
          {doneCount > 0 && (
            <Button size="sm" variant="ghost" loading={clearing}
              onClick={async () => {
                setClearing(true)
                try { await clearTransferHistory('download') } finally { setClearing(false) }
              }}>
              <Trash2 size={11} /> Clear history
            </Button>
          )}
          <Button variant="primary" size="sm"
            onClick={() => { setModalRepoId(''); setShowModal(true) }}>
            <Download size={12} /> New Download
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!all.length ? (
          <EmptyState
            icon="📥"
            title="No downloads yet"
            sub="Download full repos or pick individual files — repo type is detected automatically"
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
        <DownloadModal initialRepoId={modalRepoId} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
