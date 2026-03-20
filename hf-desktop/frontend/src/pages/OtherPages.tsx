import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, Star, ExternalLink, Brain, Database, GitBranch, Download } from 'lucide-react'
import { searchSpaces, myRepos } from '@/api/client'
import { Input, Card, Badge, EmptyState, Spinner, SectionHeader, Button } from '@/components/ui'
import { formatNumber, clsx } from '@/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useStore } from '@/store'

// ── Spaces page ───────────────────────────────────────────────────────────────
export const SpacesPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 400)

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['spaces', debouncedQuery],
    queryFn: () => searchSpaces(debouncedQuery || undefined, 30),
    staleTime: 60_000,
  })

  const SDK_COLORS: Record<string, 'blue' | 'green' | 'purple' | 'amber'> = {
    gradio: 'blue',
    streamlit: 'green',
    docker: 'purple',
    static: 'amber',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-white/[0.06]">
        <Input
          icon={<Layers size={13} />}
          placeholder="Search spaces…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1"
        />
        {isFetching && !isLoading && <Spinner size={14} className="text-gray-500" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size={24} className="text-hf-500" /></div>
        ) : error ? (
          <EmptyState icon="⚠️" title="Failed to load spaces" sub={(error as Error).message} />
        ) : !data?.spaces?.length ? (
          <EmptyState icon="🚀" title="No spaces found" sub={query ? `No results for "${query}"` : 'Search for a Space'} />
        ) : (
          <div className="grid grid-cols-1 gap-2 animate-fade-in">
            <SectionHeader title={`${data.total} spaces`} />
            {data.spaces.map((s: any) => (
              <Card key={s.id} hover className="group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Layers size={14} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-200 font-mono truncate">{s.id}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {s.sdk && <Badge label={s.sdk} color={SDK_COLORS[s.sdk] ?? 'gray'} />}
                          {s.private && <Badge label="private" color="amber" />}
                          {(s.tags ?? []).slice(0, 3).map((t: string) => (
                            <Badge key={t} label={t} color="gray" />
                          ))}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(`https://huggingface.co/spaces/${s.id}`, '_blank')}
                        >
                          <ExternalLink size={11} /> Open
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                      <span className="flex items-center gap-1"><Star size={10} /> {formatNumber(s.likes ?? 0)}</span>
                      {s.last_modified && <span>{s.last_modified.slice(0, 10)}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── My Repos page ─────────────────────────────────────────────────────────────
const REPO_TYPE_ICON = { model: Brain, dataset: Database, space: Layers }
const REPO_TYPE_COLOR: Record<string, 'hf' | 'blue' | 'purple'> = { model: 'hf', dataset: 'blue', space: 'purple' }

export const MyReposPage: React.FC = () => {
  const [tab, setTab] = useState<'model' | 'dataset' | 'space'>('model')
  const setActiveNav = useStore(s => s.setActiveNav)
  const setPendingDownloadRepoId = useStore(s => s.setPendingDownloadRepoId)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-repos'],
    queryFn: myRepos,
    staleTime: 30_000,
    retry: false,
  })

  const handleDownload = (repoId: string, repoType: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPendingDownloadRepoId(repoId)
    setActiveNav('downloads')
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} className="text-hf-500" /></div>
  }

  if (error) {
    const msg = (error as any)?.response?.data?.detail ?? (error as Error).message
    const isAuth = msg?.toLowerCase().includes('auth') || (error as any)?.response?.status === 401
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <EmptyState
          icon={isAuth ? '🔑' : '⚠️'}
          title={isAuth ? 'Not authenticated' : 'Failed to load repos'}
          sub={isAuth ? 'Set your Hugging Face token to view your repositories' : msg}
        />
      </div>
    )
  }

  const repos: any[] = tab === 'model' ? (data?.models ?? [])
    : tab === 'dataset' ? (data?.datasets ?? [])
    : (data?.spaces ?? [])

  const counts = {
    model: data?.models?.length ?? 0,
    dataset: data?.datasets?.length ?? 0,
    space: data?.spaces?.length ?? 0,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-0">
        <div className="w-7 h-7 rounded-full bg-hf-500/20 flex items-center justify-center text-sm font-semibold text-hf-400">
          {data?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-sm font-medium text-gray-300">{data?.username}</span>
        <span className="text-xs text-gray-600">· {counts.model + counts.dataset + counts.space} repos</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4 mt-3">
        {(['model', 'dataset', 'space'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors capitalize',
              tab === t
                ? 'border-hf-500 text-hf-400 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            {t === 'model' ? <Brain size={11} /> : t === 'dataset' ? <Database size={11} /> : <Layers size={11} />}
            {t}s
            <span className={clsx(
              'text-[10px] rounded-full px-1.5 py-0.5',
              tab === t ? 'bg-hf-500/20 text-hf-400' : 'bg-white/5 text-gray-600'
            )}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {repos.length === 0 ? (
          <EmptyState
            icon="📭"
            title={`No ${tab}s yet`}
            sub={`You haven't created any ${tab} repositories`}
          />
        ) : (
          <div className="space-y-2 animate-fade-in">
            {repos.map((r: any) => {
              const Icon = REPO_TYPE_ICON[r.type as keyof typeof REPO_TYPE_ICON] ?? Brain
              return (
                <Card key={r.id} hover className="group">
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      tab === 'model' ? 'bg-hf-500/10' : tab === 'dataset' ? 'bg-blue-500/10' : 'bg-purple-500/10'
                    )}>
                      <Icon size={14} className={tab === 'model' ? 'text-hf-400' : tab === 'dataset' ? 'text-blue-400' : 'text-purple-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-200 font-mono truncate">{r.id}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {r.private && <Badge label="private" color="amber" />}
                            {r.pipeline_tag && <Badge label={r.pipeline_tag.replace(/-/g, ' ')} color={REPO_TYPE_COLOR[r.type]} />}
                            {r.sdk && <Badge label={r.sdk} color="gray" />}
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5 flex-shrink-0">
                          {tab !== 'space' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => handleDownload(r.id, r.type, e)}
                                                          >
                              <Download size={11} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const base = r.type === 'dataset' ? 'datasets' : r.type === 'space' ? 'spaces' : ''
                              const url = base ? `https://huggingface.co/${base}/${r.id}` : `https://huggingface.co/${r.id}`
                              window.open(url, '_blank')
                            }}
                          >
                            <ExternalLink size={11} />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-600">
                        {r.downloads != null && (
                          <span className="flex items-center gap-1"><Download size={10} /> {formatNumber(r.downloads)}</span>
                        )}
                        {r.likes != null && (
                          <span className="flex items-center gap-1"><Star size={10} /> {formatNumber(r.likes)}</span>
                        )}
                        {r.last_modified && <span>{r.last_modified.slice(0, 10)}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
