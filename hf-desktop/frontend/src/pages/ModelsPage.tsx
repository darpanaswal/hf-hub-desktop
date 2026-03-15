import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Brain, Download, Star, TrendingDown } from 'lucide-react'
import { searchModels, listTasks } from '@/api/client'
import { Input, Button, Badge, Card, Select, EmptyState, Spinner, SectionHeader } from '@/components/ui'
import { formatNumber, pipelineLabel } from '@/utils'
import { useStore } from '@/store'
import { useDebounce } from '@/hooks/useDebounce'

const PIPELINE_COLORS: Record<string, 'blue'|'green'|'amber'|'purple'|'hf'> = {
  'text-generation': 'hf',
  'text-classification': 'blue',
  'image-classification': 'purple',
  'automatic-speech-recognition': 'green',
  'text-to-image': 'amber',
}

export const ModelsPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const [task, setTask] = useState('')
  const setActiveNav = useStore(s => s.setActiveNav)

  const debouncedQuery = useDebounce(query, 400)
  const debouncedTask = useDebounce(task, 200)

  const { data: taskData } = useQuery({ queryKey: ['tasks'], queryFn: listTasks, staleTime: Infinity })

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['models', debouncedQuery, debouncedTask],
    queryFn: () => searchModels(debouncedQuery || undefined, debouncedTask || undefined, 30),
    staleTime: 60_000,
  })

  const setPendingDownloadRepoId = useStore(s => s.setPendingDownloadRepoId)

  const handleDownload = useCallback((repoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPendingDownloadRepoId(repoId)
    setActiveNav('downloads')
  }, [setActiveNav, setPendingDownloadRepoId])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-white/[0.06]">
        <Input
          icon={<Brain size={13} />}
          placeholder="Search models…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1"
        />
        <Select value={task} onChange={e => setTask(e.target.value)} className="w-52">
          <option value="">All tasks</option>
          {taskData?.tasks?.map((t: string) => (
            <option key={t} value={t}>{pipelineLabel(t)}</option>
          ))}
        </Select>
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
            title="Failed to load models"
            sub={(error as any)?.response?.data?.detail ?? (error as Error).message}
          />
        ) : !data?.models?.length ? (
          <EmptyState
            icon="🤖"
            title="No models found"
            sub={query ? `No results for "${query}"` : 'Try a search query or change the task filter'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 animate-fade-in">
            <SectionHeader
              title={`${data.total} models`}
              action={
                <div className="flex items-center gap-1 text-[10px] text-gray-600">
                  <TrendingDown size={10} /> sorted by downloads
                </div>
              }
            />
            {data.models.map((model: any) => (
              <Card key={model.id} hover className="group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-hf-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Brain size={14} className="text-hf-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-200 font-mono truncate">{model.id}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {model.pipeline_tag && (
                            <Badge
                              label={pipelineLabel(model.pipeline_tag)}
                              color={PIPELINE_COLORS[model.pipeline_tag] ?? 'gray'}
                            />
                          )}
                          {model.library_name && <Badge label={model.library_name} color="gray" />}
                          {model.private && <Badge label="private" color="amber" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleDownload(model.id, e)}
                          
                        >
                          <Download size={12} /> Download
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                      <span className="flex items-center gap-1">
                        <Download size={10} /> {formatNumber(model.downloads ?? 0)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star size={10} /> {formatNumber(model.likes ?? 0)}
                      </span>
                      {model.last_modified && (
                        <span className="text-gray-700 truncate">{model.last_modified.slice(0, 10)}</span>
                      )}
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
