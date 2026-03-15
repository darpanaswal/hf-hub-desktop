import * as http from 'http'
import { BackendManager } from './backend'

export class HfApi {
  constructor(private backend: BackendManager) {}

  private get base(): string {
    return `http://127.0.0.1:${this.backend.port}`
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.backend.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      }

      const req = http.request(options, (res) => {
        let raw = ''
        res.on('data', (chunk) => raw += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.detail ?? `HTTP ${res.statusCode}`))
            } else {
              resolve(parsed as T)
            }
          } catch {
            reject(new Error(`Invalid JSON: ${raw.slice(0, 100)}`))
          }
        })
      })

      req.on('error', reject)
      if (data) req.write(data)
      req.end()
    })
  }

  async setToken(token: string): Promise<{ username: string }> {
    return this.request('POST', '/auth/token', { token })
  }

  async authStatus(): Promise<any> {
    return this.request('GET', '/auth/status')
  }

  async searchModels(q?: string, task?: string, limit = 20): Promise<any> {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (task) params.set('task', task)
    params.set('limit', String(limit))
    return this.request('GET', `/models/search?${params}`)
  }

  async searchDatasets(q?: string, limit = 20): Promise<any> {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('limit', String(limit))
    return this.request('GET', `/datasets/search?${params}`)
  }

  async startDownload(params: { repo_id: string; repo_type?: string; revision?: string; local_dir?: string; use_cache?: boolean }): Promise<any> {
    return this.request('POST', '/cache/start', params)
  }

  async scanCache(): Promise<any> {
    return this.request('GET', '/cache/scan')
  }

  async deleteRepo(repoType: string, repoId: string): Promise<any> {
    return this.request('DELETE', `/cache/repo/${repoType}/${repoId}`)
  }

  async uploadFolder(params: {
    local_path: string
    repo_id: string
    repo_type?: string
    commit_message?: string
    private?: boolean
    create_repo?: boolean
  }): Promise<any> {
    return this.request('POST', '/uploads/folder', params)
  }

  async listTransfers(): Promise<any> {
    return this.request('GET', '/transfers/')
  }

  async cancelTransfer(id: string): Promise<any> {
    return this.request('DELETE', `/transfers/${id}`)
  }

  startSSE(onData: (data: any) => void): () => void {
    let active = true
    let currentReq: import('http').ClientRequest | null = null

    const connect = () => {
      if (!active) return

      const url = new URL(`${this.base}/transfers/stream/events`)
      const options = {
        hostname: url.hostname,
        port: parseInt(url.port || '80'),
        path: url.pathname,
        method: 'GET',
        headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
      }

      const req = http.request(options, (res) => {
        // Disable socket timeout so the long-lived SSE connection isn't killed
        res.socket?.setTimeout(0)
        res.socket?.setKeepAlive(true, 5000)

        let buf = ''
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString()
          // SSE lines are separated by double newlines
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (line.startsWith('data: ')) {
                try { onData(JSON.parse(line.slice(6))) } catch {}
              }
            }
          }
        })
        res.on('end', () => {
          currentReq = null
          if (active) setTimeout(connect, 1000)
        })
        res.on('error', () => {
          currentReq = null
          if (active) setTimeout(connect, 2000)
        })
      })

      req.on('error', () => {
        currentReq = null
        if (active) setTimeout(connect, 3000)
      })

      req.setTimeout(0) // no timeout on the request itself
      req.end()
      currentReq = req
    }

    connect()
    return () => {
      active = false
      currentReq?.destroy()
    }
  }

  async listMyReposFlat(): Promise<any> {
    return this.request('GET', '/repos/list')
  }

  async removeTransfer(id: string): Promise<any> {
    return this.request('DELETE', `/transfers/${id}?remove=true`)
  }

  async clearTransferHistory(transferType?: string): Promise<any> {
    const qs = transferType ? `?transfer_type=${transferType}` : ''
    return this.request('DELETE', `/transfers/history${qs}`)
  }


  async createRepo(params: { repo_id: string; repo_type?: string; private?: boolean }): Promise<any> {
    return this.request('POST', '/uploads/create-repo', params)
  }

}
