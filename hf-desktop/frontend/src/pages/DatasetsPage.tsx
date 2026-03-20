import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Download, Star } from 'lucide-react'
import { searchDatasets } from '@/api/client'
import { Input, Button, Badge, Card, EmptyState, Spinner, SectionHeader } from '@/components/ui'
import { formatNumber } from '@/utils'
import { useStore } from '@/store'
import { useDebounce } from '@/hooks/useDebounce'

export const DatasetsPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const setActiveNav = useStore(s => s.setActiveNav)

  const debouncedQuery = useDebounce(query, 400)

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['datasets', debouncedQuery],
    queryFn: () => searchDatasets(debouncedQuery || undefined, 30),
    staleTime: 60_000,
  })

  const setPendingDownloadRepoId = useStore(s => s.setPendingDownloadRepoId)

  const handleDownload = (repoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPendingDownloadRepoId(repoId)
    setActiveNav('downloads')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-white/[0.06]">
        <Input
          icon={<Database size={13} />}
          placeholder="Search datasets…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1"
        />
        {isFetching && !isLoading && <Spinner size={14} className="text-gray-500" />}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size={24} className="text-hf-500" />
          </div>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title="Failed to load datasets"
            sub={(error as any)?.response?.data?.detail ?? (error as Error).message}
          />
        ) : !data?.datasets?.length ? (
          <EmptyState
            icon="📦"
            title="No datasets found"
            sub={query ? `No results for "${query}"` : 'Search for a dataset to get started'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 animate-fade-in">
            <SectionHeader title={`${data.total} datasets`} />
            {data.datasets.map((ds: any) => (
              <Card key={ds.id} hover className="group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Database size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-200 font-mono truncate">{ds.id}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {(ds.tags ?? []).slice(0, 4).map((tag: string) => (
                            <Badge key={tag} label={tag} color="gray" />
                          ))}
                          {ds.private && <Badge label="private" color="amber" />}
                        </div>
                      </div>
                      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleDownload(ds.id, e)}
                                                  >
                          <Download size={12} /> Download
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                      <span className="flex items-center gap-1">
                        <Download size={10} /> {formatNumber(ds.downloads ?? 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star size={10} /> {formatNumber(ds.likes ?? 0)}
                      </span>
                    </div>
                    {ds.description && (
                      <p className="mt-2 text-xs text-gray-600 line-clamp-2">{ds.description}</p>
                    )}
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
