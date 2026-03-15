import axios from 'axios'

const BASE = '/api'

export const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
})

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authStatus = () => api.get('/auth/status').then(r => r.data)
export const setToken = (token: string) => api.post('/auth/token', { token }).then(r => r.data)
export const clearToken = () => api.delete('/auth/token').then(r => r.data)

// ── Models ────────────────────────────────────────────────────────────────────
export const searchModels = (q?: string, task?: string, limit = 20) =>
  api.get('/models/search', { params: { q, task, limit } }).then(r => r.data)
export const modelInfo = (repoId: string) =>
  api.get(`/models/${repoId}/info`).then(r => r.data)
export const listTasks = () =>
  api.get('/models/tasks').then(r => r.data)

// ── Datasets ──────────────────────────────────────────────────────────────────
export const searchDatasets = (q?: string, limit = 20) =>
  api.get('/datasets/search', { params: { q, limit } }).then(r => r.data)
export const datasetInfo = (repoId: string) =>
  api.get(`/datasets/${repoId}/info`).then(r => r.data)

// ── Spaces ────────────────────────────────────────────────────────────────────
export const searchSpaces = (q?: string, limit = 20) =>
  api.get('/spaces/search', { params: { q, limit } }).then(r => r.data)

// ── My Repos ──────────────────────────────────────────────────────────────────
export const myRepos = () => api.get('/repos/').then(r => r.data)

// ── Downloads ─────────────────────────────────────────────────────────────────
export const startDownload = (params: {
  repo_id: string
  repo_type?: string
  revision?: string
  local_dir?: string
  use_cache?: boolean
}) => api.post('/cache/start', params).then(r => r.data)

// ── Cache ─────────────────────────────────────────────────────────────────────
export const scanCache = () => api.get('/cache/scan').then(r => r.data)
export const deleteRepo = (repoType: string, repoId: string) =>
  api.delete(`/cache/repo/${repoType}/${repoId}`).then(r => r.data)

// ── Uploads ───────────────────────────────────────────────────────────────────
export const uploadFolder = (params: {
  local_path: string
  repo_id: string
  repo_type?: string
  commit_message?: string
  private?: boolean
  create_repo?: boolean
}) => api.post('/uploads/folder', params).then(r => r.data)

export const uploadFile = (params: {
  local_path: string
  repo_id: string
  path_in_repo: string
  repo_type?: string
}) => api.post('/uploads/file', params).then(r => r.data)

export const createRepo = (params: {
  repo_id: string
  repo_type?: string
  private?: boolean
}) => api.post('/uploads/create-repo', params).then(r => r.data)

// ── Transfers ─────────────────────────────────────────────────────────────────
export const listTransfers = () => api.get('/transfers/').then(r => r.data)
export const cancelTransfer = (id: string) => api.delete(`/transfers/${id}`).then(r => r.data)
export const removeTransfer = (id: string) => api.delete(`/transfers/${id}`, { params: { remove: true } }).then(r => r.data)
export const clearTransferHistory = (transferType?: 'upload' | 'download') =>
  api.delete('/transfers/history', { params: transferType ? { transfer_type: transferType } : {} }).then(r => r.data)

export const transferSSE = (onUpdate: (data: any) => void) => {
  const es = new EventSource('/api/transfers/stream/events')
  es.onmessage = (e) => {
    try { onUpdate(JSON.parse(e.data)) } catch {}
  }
  return () => es.close()
}

export const listMyReposFlat = () => api.get('/repos/list').then(r => r.data)
