import React, { useState } from 'react'
import { Upload, Download, X, CheckCircle, AlertCircle, Clock, FolderOpen } from 'lucide-react'
import { Transfer } from '@/store'
import { ProgressBar, Tooltip } from './ui'
import { formatBytes, formatSpeed, clsx } from '@/utils'
import { cancelTransfer, removeTransfer } from '@/api/client'

interface Props { transfer: Transfer; compact?: boolean }

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:    <Clock size={12} className="text-gray-500" />,
  active:    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />,
  completed: <CheckCircle size={12} className="text-green-400" />,
  error:     <AlertCircle size={12} className="text-red-400" />,
  cancelled: <X size={12} className="text-gray-600" />,
}

const TERMINAL = new Set(['completed', 'error', 'cancelled'])

export const TransferCard: React.FC<Props> = ({ transfer, compact }) => {
  const isActive   = transfer.status === 'active' || transfer.status === 'queued'
  const isTerminal = TERMINAL.has(transfer.status)
  const isUpload   = transfer.type === 'upload'
  const localPath: string | undefined = transfer.meta?.local_path
  const localDir:  string | undefined = transfer.meta?.local_dir
  const [busy, setBusy] = useState(false)

  const handleAction = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    try {
      if (isTerminal) {
        await removeTransfer(transfer.id)
      } else {
        await cancelTransfer(transfer.id)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
    const path = localPath || localDir
    if (path && (window as any).electron?.openPath) {
      ;(window as any).electron.openPath(path)
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-lg transition-colors group">
        <div className={clsx('p-1 rounded', isUpload ? 'bg-hf-500/15' : 'bg-blue-500/15')}>
          {isUpload
            ? <Upload size={11} className="text-hf-400" />
            : <Download size={11} className="text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-300 truncate font-medium">{transfer.repo_id}</div>
          <ProgressBar value={transfer.progress} className="mt-1" color={isUpload ? 'bg-hf-500' : 'bg-blue-400'} />
        </div>
        <div className="text-[10px] text-gray-600 flex-shrink-0">{Math.round(transfer.progress)}%</div>
        <button
          onClick={handleAction}
          disabled={busy}
          className="text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          title={isTerminal ? 'Remove' : 'Cancel'}
        >
          <X size={11} />
        </button>
      </div>
    )
  }

  return (
    <div className={clsx(
      'relative border rounded-xl p-4 transition-all group',
      transfer.status === 'error'     ? 'bg-red-500/5 border-red-500/20' :
      transfer.status === 'completed' ? 'bg-green-500/5 border-green-500/15' :
      transfer.status === 'cancelled' ? 'bg-white/[0.02] border-white/[0.05]' :
      'bg-[#18181f] border-white/[0.07]'
    )}>
      {/* ✕ button — top-right corner, visible on hover */}
      <Tooltip label={isTerminal ? 'Remove from history' : 'Cancel'}>
        <button
          onClick={handleAction}
          disabled={busy}
          className={clsx(
            'absolute top-3 right-3 p-1 rounded-md transition-all',
            'opacity-0 group-hover:opacity-100',
            isTerminal
              ? 'text-gray-600 hover:text-gray-300 hover:bg-white/8'
              : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
          )}
        >
          <X size={13} />
        </button>
      </Tooltip>

      <div className="flex items-start gap-3 pr-6">
        <div className={clsx('p-2 rounded-lg flex-shrink-0', isUpload ? 'bg-hf-500/15' : 'bg-blue-500/15')}>
          {isUpload
            ? <Upload size={14} className="text-hf-400" />
            : <Download size={14} className="text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-gray-200 font-mono truncate">{transfer.repo_id}</span>
            <span className="flex-shrink-0">{STATUS_ICON[transfer.status]}</span>
          </div>
          <div className="text-xs text-gray-600">
            {transfer.status === 'active' && transfer.current_file
              ? <span className="truncate block max-w-xs font-mono text-[10px]">{transfer.current_file}</span>
              : <span className="capitalize">{transfer.status}</span>}
          </div>

          {(isActive || transfer.status === 'completed') && (
            <div className="mt-2.5 space-y-1.5">
              <ProgressBar
                value={transfer.progress}
                color={isUpload ? 'bg-hf-500' : transfer.status === 'completed' ? 'bg-green-500' : 'bg-blue-400'}
              />
              <div className="flex items-center justify-between text-[10px] text-gray-600">
                <span>
                  {formatBytes(transfer.transferred_bytes)} / {formatBytes(transfer.total_bytes)}
                  {transfer.total_files > 1 && (
                    <span className="ml-2">{transfer.completed_files}/{transfer.total_files} files</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {isActive && transfer.speed_bps > 0 && (
                    <span className={isUpload ? 'text-hf-400' : 'text-blue-400'}>{formatSpeed(transfer.speed_bps)}</span>
                  )}
                  <span className="font-medium text-gray-400">{Math.round(transfer.progress)}%</span>
                </span>
              </div>
            </div>
          )}

          {/* Saved path for completed downloads */}
          {transfer.status === 'completed' && !isUpload && (localPath || localDir) && (
            <div className="mt-2 flex items-center gap-1.5">
              <FolderOpen size={11} className="text-gray-600 flex-shrink-0" />
              <span className="text-[10px] text-gray-600 font-mono truncate">{localPath || localDir}</span>
              <button onClick={handleOpenFolder} className="text-[10px] text-blue-400 hover:text-blue-300 flex-shrink-0 underline">
                Open
              </button>
            </div>
          )}
          {transfer.status === 'completed' && !isUpload && !localPath && !localDir && (
            <div className="mt-2 flex items-center gap-1.5">
              <FolderOpen size={11} className="text-gray-600" />
              <span className="text-[10px] text-gray-600">Saved to default HF cache (~/.cache/huggingface/hub)</span>
            </div>
          )}

          {transfer.status === 'error' && (
            <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5 break-all">
              {transfer.error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
