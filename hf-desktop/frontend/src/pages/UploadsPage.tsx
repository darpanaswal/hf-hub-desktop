import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQuery } from '@tanstack/react-query'
import {
  Upload, FolderOpen, Plus, Globe, Lock, AlertTriangle, X,
  Activity, Clock, CheckCircle, AlertCircle, Zap, Trash2,
  ChevronDown, Search, GitBranch, Brain, Database, Layers, Files,
} from 'lucide-react'
import { uploadFolder, createRepo, cancelTransfer, removeTransfer, clearTransferHistory, listMyReposFlat } from '@/api/client'
import { Button, Input, Select, Card, Badge, SectionHeader, ProgressBar } from '@/components/ui'
import { useStore, Transfer } from '@/store'
import { formatBytes, formatSpeed, clsx } from '@/utils'

type RepoType = 'model' | 'dataset' | 'space'
const REPO_TYPE_ICON: Record<string, React.ElementType> = { model: Brain, dataset: Database, space: Layers }

const SIZE_LIMITS = {
  private: 50 * 1024 * 1024 * 1024,
  public: 300 * 1024 * 1024 * 1024,
}

// ── Repo Picker ───────────────────────────────────────────────────────────────
const RepoPicker: React.FC<{
  value: string
  onChange: (id: string, isNew: boolean) => void
  repoType: RepoType
  onTypeChange: (t: RepoType) => void
  isPrivate: boolean
  onPrivateChange: (v: boolean) => void
}> = ({ value, onChange, repoType, onTypeChange, isPrivate, onPrivateChange }) => {
  const [mode, setMode] = useState<'existing' | 'new'>('new')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const user = useStore(s => s.user)

  const { data: reposData } = useQuery({
    queryKey: ['my-repos-flat'],
    queryFn: listMyReposFlat,
    staleTime: 60_000,
    enabled: !!user?.authenticated,
  })

  const filtered = (reposData?.repos ?? []).filter((r: any) =>
    (repoType === r.type) &&
    (!search || r.id.toLowerCase().includes(search.toLowerCase()))
  )

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        {(['existing', 'new'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); onChange('', m === 'new') }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              mode === m
                ? 'bg-hf-500/20 text-hf-400'
                : 'bg-white/[0.02] text-gray-500 hover:text-gray-300 hover:bg-white/5'
            )}
          >
            {m === 'existing' ? <GitBranch size={11} /> : <Plus size={11} />}
            {m === 'existing' ? 'Existing repo' : 'New repo'}
          </button>
        ))}
      </div>

      {/* Type + privacy row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Repo type</label>
          <Select value={repoType} onChange={e => onTypeChange(e.target.value as RepoType)} className="w-full">
            <option value="model">Model</option>
            <option value="dataset">Dataset</option>
            <option value="space">Space</option>
          </Select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1 block">Visibility</label>
          <button
            onClick={() => onPrivateChange(!isPrivate)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
              isPrivate
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'
            )}
          >
            {isPrivate ? <Lock size={11} /> : <Globe size={11} />}
            {isPrivate ? `Private · 50 GB limit` : `Public · ~300 GB limit`}
          </button>
        </div>
      </div>

      {/* Repo ID — existing picker or new input */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Repository ID</label>
        {mode === 'existing' ? (
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setOpen(v => !v)}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors',
                'bg-white/5 border-white/10 hover:border-white/20 text-left',
                open && 'border-hf-500/60'
              )}
            >
              <span className={value ? 'text-gray-200 font-mono text-xs' : 'text-gray-600'}>
                {value || 'Select a repository…'}
              </span>
              <ChevronDown size={13} className={clsx('text-gray-600 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <div className="absolute z-50 top-full mt-1 w-full bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-white/[0.06]">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                    <input
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Filter repos…"
                      className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-hf-500/50"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {!user?.authenticated ? (
                    <div className="px-3 py-4 text-xs text-gray-600 text-center">Sign in to see your repos</div>
                  ) : filtered.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-600 text-center">
                      {search ? `No ${repoType}s matching "${search}"` : `No ${repoType}s found`}
                    </div>
                  ) : (
                    filtered.map((r: any) => {
                      const Icon = REPO_TYPE_ICON[r.type] ?? Brain
                      return (
                        <button
                          key={r.id}
                          onClick={() => { onChange(r.id, false); setOpen(false); setSearch('') }}
                          className={clsx(
                            'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors',
                            value === r.id && 'bg-hf-500/10'
                          )}
                        >
                          <Icon size={12} className="text-gray-500 flex-shrink-0" />
                          <span className="text-xs text-gray-300 font-mono truncate flex-1">{r.id}</span>
                          {r.private && <Lock size={9} className="text-amber-500 flex-shrink-0" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Input
            placeholder={`${user?.username ?? 'username'}/my-${repoType}`}
            value={value}
            onChange={e => onChange(e.target.value, true)}
          />
        )}
      </div>
    </div>
  )
}

// ── Upload form ───────────────────────────────────────────────────────────────
const UploadForm: React.FC<{ onStarted: () => void }> = ({ onStarted }) => {
  const [repoId, setRepoId]     = useState('')
  const [isNewRepo, setIsNewRepo] = useState(true)
  const [repoType, setRepoType]  = useState<RepoType>('model')
  const [isPrivate, setIsPrivate] = useState(false)
  const [commitMsg, setCommitMsg] = useState('Upload via HF Hub Desktop')
  const [loading, setLoading]    = useState(false)
  const [status, setStatus]      = useState<string | null>(null)
  const [error, setError]        = useState<string | null>(null)
  const [localPath, setLocalPath] = useState('')
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; size: number; path: string }[]>([])
  const [totalDropSize, setTotalDropSize] = useState(0)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return
    const items = acceptedFiles.map(f => ({ name: f.name, path: (f as any).path ?? f.name, size: f.size }))
    setDroppedFiles(items)
    setTotalDropSize(items.reduce((s, f) => s + f.size, 0))
    setError(null)
    const fp = (acceptedFiles[0] as any).path
    if (fp && fp !== acceptedFiles[0].name) {
      setLocalPath(acceptedFiles.length > 1 ? fp.split('/').slice(0, -1).join('/') : fp)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true })

  const sizeWarning = () => {
    if (!totalDropSize) return null
    const limit = isPrivate ? SIZE_LIMITS.private : SIZE_LIMITS.public
    if (totalDropSize > limit) {
      return `Size ${formatBytes(totalDropSize)} exceeds the ${isPrivate ? 'private' : 'public'} limit (${formatBytes(limit)}). ` +
        (isPrivate ? `Try switching to public (${formatBytes(SIZE_LIMITS.public)} limit) or split across multiple repos.`
                   : `Split across multiple repos or contact HF about large file hosting.`)
    }
    return null
  }

  const handleUpload = async () => {
    setError(null); setStatus(null)
    if (!repoId.trim()) { setError('Repository ID required'); return }
    if (!localPath.trim()) { setError('Local path required — drop files or type a path'); return }
    const warn = sizeWarning()
    if (warn) { setError(warn); return }
    setLoading(true)
    try {
      const multipleFiles = droppedFiles.length > 1 && droppedFiles[0].path && droppedFiles[0].path !== droppedFiles[0].name
      await uploadFolder({
        local_path: localPath,
        local_paths: multipleFiles ? droppedFiles.map(f => f.path) : undefined,
        repo_id: repoId.trim(),
        repo_type: repoType,
        commit_message: commitMsg,
        private: isPrivate,
        create_repo: true,
      })
      setStatus('Upload started!')
      setTimeout(onStarted, 700)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message)
    } finally { setLoading(false) }
  }

  const warn = sizeWarning()

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-xl transition-all cursor-pointer',
          isDragActive ? 'border-hf-500/70 bg-hf-500/8' :
          droppedFiles.length ? 'border-green-500/40 bg-green-500/5' :
          'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
        )}
      >
        <input {...getInputProps()} />
        {droppedFiles.length === 0 ? (
          <div className="p-7 text-center">
            <Upload size={22} className="mx-auto mb-2 text-gray-600" />
            <div className="text-sm text-gray-400 font-medium">
              {isDragActive ? 'Drop here…' : 'Drag & drop files or a folder'}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              .safetensors · .bin · .gguf · .pt · .parquet · .json and more · Files &gt; 10 MB use Git LFS
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-400">
                {droppedFiles.length} file{droppedFiles.length !== 1 ? 's' : ''} · {formatBytes(totalDropSize)}
              </span>
              <button onClick={e => { e.stopPropagation(); setDroppedFiles([]); setTotalDropSize(0); setLocalPath('') }}
                className="text-gray-600 hover:text-gray-300"><X size={13} /></button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto">
              {droppedFiles.slice(0, 8).map(f => (
                <span key={f.path} className="text-[10px] bg-white/5 text-gray-400 border border-white/10 rounded px-1.5 py-0.5 truncate max-w-[140px]">{f.name}</span>
              ))}
              {droppedFiles.length > 8 && <span className="text-[10px] text-gray-600">+{droppedFiles.length - 8} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Local path */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Local path (auto-filled from drop)</label>
        <div className="flex gap-2">
          <Input
            placeholder="/path/to/folder-or-file"
            value={localPath}
            onChange={e => setLocalPath(e.target.value)}
            className="flex-1 font-mono text-xs"
            icon={<FolderOpen size={13} />}
          />
          <Button size="sm" variant="secondary" onClick={async () => {
            const el = window as any
            if (el.electron?.openFolder) {
              const p = await el.electron.openFolder()
              if (p) { setLocalPath(p); setDroppedFiles([]); setTotalDropSize(0) }
            } else if (el.electron?.openFile) {
              const files = await el.electron.openFile()
              if (files?.[0]) setLocalPath(files[0])
            }
          }}>Browse</Button>
        </div>
      </div>

      {/* Repo picker */}
      <Card className="!p-3">
        <RepoPicker
          value={repoId}
          onChange={(id, isNew) => { setRepoId(id); setIsNewRepo(isNew) }}
          repoType={repoType}
          onTypeChange={setRepoType}
          isPrivate={isPrivate}
          onPrivateChange={setIsPrivate}
        />
      </Card>

      {/* Commit message */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Commit message</label>
        <Input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} />
      </div>

      {warn && (
        <div className="flex gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /><span>{warn}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="primary" onClick={handleUpload} loading={loading} disabled={!repoId || !localPath}>
          <Upload size={13} /> Upload
        </Button>
        <Button variant="secondary" loading={loading} disabled={!repoId} onClick={async () => {
          if (!repoId.trim()) { setError('Repository ID required'); return }
          setLoading(true); setError(null)
          try {
            const res = await createRepo({ repo_id: repoId.trim(), repo_type: repoType, private: isPrivate })
            setStatus(`Repo created: ${res.url}`)
          } catch (e: any) {
            setError(e?.response?.data?.detail ?? e.message)
          } finally { setLoading(false) }
        }}>
          <Plus size={13} /> Create Repo Only
        </Button>
      </div>

      {status && <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">✓ {status}</div>}
      {error && (
        <div className="flex gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ── Upload progress card ──────────────────────────────────────────────────────
const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:    <Clock size={13} className="text-gray-500" />,
  active:    <Zap size={13} className="text-hf-400 animate-pulse" />,
  completed: <CheckCircle size={13} className="text-green-400" />,
  error:     <AlertCircle size={13} className="text-red-400" />,
  cancelled: <X size={13} className="text-gray-600" />,
}

const UploadProgressCard: React.FC<{ transfer: Transfer }> = ({ transfer }) => {
  const isActive   = transfer.status === 'active' || transfer.status === 'queued'
  const isTerminal = ['completed', 'error', 'cancelled'].includes(transfer.status)
  const [cancelling, setCancelling] = useState(false)
  const [removing,   setRemoving]   = useState(false)

  return (
    <div className={clsx(
      'relative rounded-xl border p-4 transition-all group',
      transfer.status === 'error' ? 'bg-red-500/5 border-red-500/20' :
      transfer.status === 'completed' ? 'bg-green-500/5 border-green-500/15' :
      transfer.status === 'cancelled' ? 'bg-white/[0.02] border-white/[0.05]' :
      'bg-[#18181f] border-white/[0.07]'
    )}>
      {isTerminal && (
        <button
          onClick={async () => { setRemoving(true); try { await removeTransfer(transfer.id) } finally { setRemoving(false) } }}
          disabled={removing}
          className="absolute top-2.5 right-2.5 p-1 rounded-md text-gray-700 hover:text-gray-300 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
          title="Remove from history"
        >
          <X size={12} />
        </button>
      )}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-hf-500/15 flex-shrink-0">
            <Upload size={13} className="text-hf-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-200 font-mono truncate">{transfer.repo_id}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {STATUS_ICON[transfer.status]}
              <span className="text-xs text-gray-500 capitalize">{transfer.status}</span>
              {transfer.meta?.repo_type && <Badge label={transfer.meta.repo_type} color="gray" />}
            </div>
          </div>
        </div>
        {isActive && (
          <Button size="sm" variant="danger" loading={cancelling}
            onClick={async () => { setCancelling(true); try { await cancelTransfer(transfer.id) } finally { setCancelling(false) } }}>
            <X size={11} /> Cancel
          </Button>
        )}
      </div>

      {(isActive || transfer.status === 'completed') && (
        <div className="space-y-2">
          <ProgressBar value={transfer.progress} color={transfer.status === 'completed' ? 'bg-green-500' : 'bg-hf-500'} className="h-1.5" />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500">
              {formatBytes(transfer.transferred_bytes)} / {formatBytes(transfer.total_bytes)}
              {transfer.total_files > 1 && <span className="ml-2 text-gray-600">{transfer.completed_files}/{transfer.total_files} files</span>}
            </span>
            <span className="flex items-center gap-2 text-gray-400">
              {isActive && transfer.speed_bps > 0 && <span className="text-hf-400 font-medium">{formatSpeed(transfer.speed_bps)}</span>}
              <span className="font-semibold">{Math.round(transfer.progress)}%</span>
            </span>
          </div>
        </div>
      )}

      {isActive && transfer.current_file && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-hf-500 animate-pulse flex-shrink-0" />
          <span className="font-mono truncate">{transfer.current_file}</span>
        </div>
      )}

      {transfer.status === 'error' && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5 break-all">{transfer.error}</div>
      )}
    </div>
  )
}

// ── Upload progress panel ─────────────────────────────────────────────────────
const UploadProgressPanel: React.FC = () => {
  const transfers = useStore(s => s.transfers)
  const uploads = Object.values(transfers).filter(t => t.type === 'upload')
  const active = uploads.filter(t => t.status === 'active' || t.status === 'queued')
  const done   = uploads.filter(t => ['completed', 'error', 'cancelled'].includes(t.status))
  const [clearing, setClearing] = useState(false)

  const handleClearHistory = async () => {
    setClearing(true)
    try { await clearTransferHistory('upload') } finally { setClearing(false) }
  }

  if (!uploads.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Activity size={28} className="text-gray-700" />
        <div className="text-gray-500 text-sm font-medium">No uploads yet</div>
        <div className="text-gray-700 text-xs">Start an upload from the New Upload tab</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <SectionHeader title={`In progress (${active.length})`} />
          <div className="space-y-3">{active.map(t => <UploadProgressCard key={t.id} transfer={t} />)}</div>
        </div>
      )}
      {done.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Finished ({done.length})</h3>
            <Button size="sm" variant="ghost" loading={clearing} onClick={handleClearHistory}>
              <Trash2 size={11} /> Clear history
            </Button>
          </div>
          <div className="space-y-2">{done.map(t => <UploadProgressCard key={t.id} transfer={t} />)}</div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export const UploadsPage: React.FC = () => {
  const [tab, setTab] = useState<'new' | 'progress'>('new')
  const transfers = useStore(s => s.transfers)
  const activeCount = Object.values(transfers).filter(t => t.type === 'upload' && (t.status === 'active' || t.status === 'queued')).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-white/[0.06] px-4">
        {([
          { id: 'new' as const, label: 'New Upload', Icon: Upload },
          { id: 'progress' as const, label: 'Progress', Icon: Activity, badge: activeCount },
        ]).map(({ id, label, Icon, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-3 text-xs border-b-2 transition-colors',
              tab === id ? 'border-hf-500 text-hf-400 font-medium' : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            <Icon size={12} />
            {label}
            {badge != null && badge > 0 && (
              <span className="text-[10px] bg-hf-500/20 text-hf-400 rounded-full px-1.5 py-0.5 font-medium">{badge}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'new' ? <UploadForm onStarted={() => setTab('progress')} /> : <UploadProgressPanel />}
      </div>
    </div>
  )
}
