import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HardDrive, Trash2, FolderOpen, RefreshCw } from 'lucide-react'
import { scanCache, deleteRepo } from '@/api/client'
import { Button, Card, Badge, EmptyState, Spinner, SectionHeader } from '@/components/ui'
import { formatBytes, clsx } from '@/utils'

export const CachePage: React.FC = () => {
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cache'],
    queryFn: scanCache,
    staleTime: 30_000,
  })

  const handleDelete = async (repoType: string, repoId: string) => {
    const key = `${repoType}/${repoId}`
    if (!confirm(`Delete cached files for ${repoId}?`)) return
    setDeleting(key)
    try {
      await deleteRepo(repoType, repoId)
      qc.invalidateQueries({ queryKey: ['cache'] })
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? e.message)
    } finally {
      setDeleting(null)
    }
  }

  const typeColor = (t: string) => t === 'model' ? 'hf' : t === 'dataset' ? 'blue' : 'purple'

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Size', value: formatBytes(data.total_size ?? 0) },
            { label: 'Cached Repos', value: String(data.total_repos ?? 0) },
            { label: 'Warnings', value: String(data.warnings?.length ?? 0) },
          ].map(s => (
            <Card key={s.label} className="!p-3">
              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">{s.label}</div>
              <div className="text-lg font-semibold text-gray-200">{s.value}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <SectionHeader title="Cached Repos" />
        <Button size="sm" variant="ghost" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw size={11} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size={24} className="text-hf-500" />
        </div>
      ) : !data?.repos?.length ? (
        <EmptyState
          icon="💾"
          title="Cache is empty"
          sub="Downloaded models and datasets will appear here"
        />
      ) : (
        <div className="space-y-2 animate-fade-in">
          {data.repos.map((repo: any) => {
            const key = `${repo.repo_type}/${repo.repo_id}`
            return (
              <Card key={key} className="group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <HardDrive size={14} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-200 font-mono truncate">{repo.repo_id}</span>
                      <Badge label={repo.repo_type} color={typeColor(repo.repo_type)} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-600">
                      <span>{formatBytes(repo.size_on_disk)}</span>
                      <span>{repo.nb_files} files</span>
                      <span>{repo.revisions?.length ?? 0} revision{repo.revisions?.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="text-[10px] text-gray-700 mt-1 font-mono truncate">{repo.repo_path}</div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(repo.repo_type, repo.repo_id)}
                      loading={deleting === key}
                    >
                      <Trash2 size={11} /> Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {data?.warnings?.length > 0 && (
        <div className="space-y-1">
          <SectionHeader title="Warnings" />
          {data.warnings.map((w: string, i: number) => (
            <div key={i} className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
