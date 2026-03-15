import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { BackendManager } from './backend'
import { ModelTreeProvider } from './providers/ModelTreeProvider'
import { DatasetTreeProvider } from './providers/DatasetTreeProvider'
import { TransferTreeProvider, TransferItem } from './providers/TransferTreeProvider'
import { CacheTreeProvider } from './providers/CacheTreeProvider'
import { UploadPanel } from './panels/UploadPanel'
import { TransferLogManager } from './panels/TransferLogPanel'
import { HfApi } from './api'

let backend: BackendManager


// ── Live search + download helper ─────────────────────────────────────────────
async function downloadWithSearch(
  repoType: 'model' | 'dataset',
  api: import('./api').HfApi,
  transferProvider: import('./providers/TransferTreeProvider').TransferTreeProvider,
  prefillRepoId?: string
) {
  // Step 1: Live search QuickPick
  const qp = vscode.window.createQuickPick()
  qp.placeholder = repoType === 'model'
    ? 'Search models (e.g. bert, llama, stable-diffusion)…'
    : 'Search datasets (e.g. squad, wikitext, commoncrawl)…'
  qp.title = repoType === 'model' ? 'Download Model' : 'Download Dataset'
  qp.matchOnDescription = true
  qp.items = [{ label: '$(loading~spin) Type to search…', description: '', alwaysShow: true }]

  let searchTimer: ReturnType<typeof setTimeout> | undefined

  qp.onDidChangeValue(async (q) => {
    if (searchTimer) clearTimeout(searchTimer)
    if (!q.trim()) {
      qp.items = [{ label: '$(loading~spin) Type to search…', alwaysShow: true } as any]
      return
    }
    qp.busy = true
    searchTimer = setTimeout(async () => {
      try {
        let results: any[]
        if (repoType === 'model') {
          const res = await api.searchModels(q, undefined, 15)
          results = res.models ?? []
        } else {
          const res = await api.searchDatasets(q, 15)
          results = res.datasets ?? []
        }
        qp.items = results.length
          ? results.map(r => ({
              label: r.id,
              description: r.pipeline_tag?.replace(/-/g,' ') ?? (r.downloads ? `↓ ${r.downloads.toLocaleString()}` : ''),
              detail: r.tags?.slice(0,4).join(' · '),
            }))
          : [{ label: '$(warning) No results', description: q, alwaysShow: true } as any]
      } catch {
        qp.items = [{ label: '$(error) Search failed', alwaysShow: true } as any]
      } finally {
        qp.busy = false
      }
    }, 350)
  })

  // If a repo ID was passed directly (from clicking a tree item), skip the search picker
  let repoId: string | undefined = prefillRepoId
  if (!repoId) {
    repoId = await new Promise<string | undefined>(resolve => {
      qp.onDidAccept(() => {
        const sel = qp.selectedItems[0]
        qp.hide()
        resolve(sel?.label?.startsWith('$') ? undefined : sel?.label)
      })
      qp.onDidHide(() => resolve(undefined))
      qp.show()
    })
  }

  if (!repoId) return

  // Step 2: Save location
  const locChoice = await vscode.window.showQuickPick([
    { label: '$(folder-opened) Choose a parent folder', description: 'Files saved to <folder>/<repo-name>/', id: 'custom' },
    { label: '$(server) Default HF cache', description: '~/.cache/huggingface/hub — deduplicated, managed by HF', id: 'cache' },
  ], { placeHolder: `Where to save ${repoId}?` })
  if (!locChoice) return

  const repoName = repoId.split('/').pop() ?? repoId
  let localDir: string | undefined
  let useCache = false

  if ((locChoice as any).id === 'custom') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false,
      openLabel: 'Save here', title: `Select parent folder — files go into ${repoName}/`,
    })
    if (!uris?.[0]) return
    localDir = uris[0].fsPath
    vscode.window.showInformationMessage(
      `⬇ Downloading ${repoId} → ${localDir}/${repoName}/`
    )
  } else {
    useCache = true
    vscode.window.showInformationMessage(`⬇ Downloading ${repoId} to HF cache…`)
  }

  try {
    await api.startDownload({ repo_id: repoId, repo_type: repoType, local_dir: localDir, use_cache: useCache })
    transferProvider.refresh()
  } catch (e: any) {
    vscode.window.showErrorMessage(`Download failed: ${e.message}`)
  }
}

export async function activate(ctx: vscode.ExtensionContext) {
  console.log('HF Hub extension activating')

  backend = new BackendManager(ctx)
  const api = new HfApi(backend)

  // Tree providers
  const modelProvider    = new ModelTreeProvider(api)
  const datasetProvider  = new DatasetTreeProvider(api)
  const transferProvider = new TransferTreeProvider(api)
  const cacheProvider    = new CacheTreeProvider(api)

  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('hfHub.models',    modelProvider),
    vscode.window.registerTreeDataProvider('hfHub.datasets',  datasetProvider),
    vscode.window.registerTreeDataProvider('hfHub.transfers', transferProvider),
    vscode.window.registerTreeDataProvider('hfHub.cache',     cacheProvider),
  )

  // SSE — push data directly into the tree provider's in-memory store
  // No HTTP round-trip; every byte-level progress tick updates the tree immediately
  const logManager = new TransferLogManager()
  ctx.subscriptions.push({ dispose: () => logManager.disposeAll() })

  api.startSSE((data) => {
    if (data.type === 'snapshot' && Array.isArray(data.transfers)) {
      transferProvider.applySnapshot(data.transfers)
      // Update any open log channels
      for (const t of data.transfers) logManager.update(t)
    } else if (data.type === 'update' && data.transfer) {
      transferProvider.applyUpdate(data.transfer)
      logManager.update(data.transfer)
    }
  })

  // ── Backend commands ─────────────────────────────────────────────────────────

  ctx.subscriptions.push(
    // Setup: install deps into a venv using the bundled backend
    vscode.commands.registerCommand('hfHub.setupBackend', async () => {
      const script = backend.findScript()
      if (!script) {
        vscode.window.showErrorMessage('HF Hub: Backend files not found. Re-install the extension.')
        return
      }
      const backendDir = path.dirname(script)
      const python = backend.findAnyPython()
      if (!python) {
        vscode.window.showErrorMessage(
          'HF Hub: No Python found on PATH. Install Python 3.8+ first.',
          'Open python.org'
        ).then(c => { if (c === 'Open python.org') vscode.env.openExternal(vscode.Uri.parse('https://python.org/downloads')) })
        return
      }
      const ok = await backend.installDeps(python, backendDir)
      if (ok) {
        // Auto-start after install
        await backend.ensureRunning()
        modelProvider.refresh()
        datasetProvider.refresh()
      }
    }),

    // Set backend path manually (file picker)
    vscode.commands.registerCommand('hfHub.setBackendPath', async () => {
      const action = await vscode.window.showQuickPick([
        { label: '$(folder) Browse for main.py', id: 'file' },
        { label: '$(edit) Type path manually',   id: 'text' },
        { label: '$(python) Set Python path',    id: 'python' },
      ], { placeHolder: 'What do you want to configure?' })

      if (!action) return

      if (action.id === 'file') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          openLabel: 'Select main.py',
          filters: { 'Python': ['py'] },
          title: 'Select HF Hub backend main.py',
        })
        if (uris?.[0]) {
          await vscode.workspace.getConfiguration('hfHub').update('backendScript', uris[0].fsPath, true)
          vscode.window.showInformationMessage(`Backend path set to: ${uris[0].fsPath}`)
          await backend.ensureRunning()
        }
      } else if (action.id === 'text') {
        const p = await vscode.window.showInputBox({
          prompt: 'Full path to hf-desktop/backend/main.py',
          placeHolder: '/home/user/hf-hub-app/hf-desktop/backend/main.py',
          validateInput: v => (!v || fs.existsSync(v)) ? null : 'File not found',
        })
        if (p) {
          await vscode.workspace.getConfiguration('hfHub').update('backendScript', p, true)
          await backend.ensureRunning()
        }
      } else if (action.id === 'python') {
        const p = await vscode.window.showInputBox({
          prompt: 'Path to python or python3 executable',
          placeHolder: '/usr/bin/python3  or  /home/user/.conda/envs/myenv/bin/python',
          validateInput: v => {
            if (!v) return null
            try { require('child_process').execSync(`"${v}" --version`, { stdio: 'pipe' }); return null }
            catch { return 'Python executable not found or not working' }
          },
        })
        if (p) {
          await vscode.workspace.getConfiguration('hfHub').update('backendPythonPath', p, true)
          vscode.window.showInformationMessage(`Python path set to: ${p}`)
          await backend.ensureRunning()
        }
      }
    }),

    // Start backend
    vscode.commands.registerCommand('hfHub.startBackend', async () => {
      backend.updateStatusBar('starting')
      await backend.ensureRunning()
      modelProvider.refresh()
      datasetProvider.refresh()
    }),

    // Stop backend
    vscode.commands.registerCommand('hfHub.stopBackend', () => {
      backend.stop()
      vscode.window.showInformationMessage('HF Hub backend stopped.')
    }),

    // Status / quick actions
    vscode.commands.registerCommand('hfHub.backendStatus', async () => {
      const alive = await backend.ping()
      const choice = await vscode.window.showQuickPick(
        [
          alive
            ? { label: '$(circle-filled) Backend running', description: `port ${backend.port}`, id: 'info' }
            : { label: '$(warning) Backend not running', description: 'Click to start', id: 'start' },
          { label: '$(play) Start backend',        id: 'start' },
          { label: '$(debug-stop) Stop backend',   id: 'stop' },
          { label: '$(tools) Setup / Install deps',id: 'setup' },
          { label: '$(gear) Set backend path',     id: 'path' },
          { label: '$(key) Set HF token',          id: 'token' },
        ],
        { placeHolder: `HF Hub Backend — ${alive ? 'running' : 'stopped'}` }
      )
      if (!choice) return
      const cmds: Record<string, string> = {
        start: 'hfHub.startBackend',
        stop:  'hfHub.stopBackend',
        setup: 'hfHub.setupBackend',
        path:  'hfHub.setBackendPath',
        token: 'hfHub.setToken',
      }
      if (cmds[choice.id]) vscode.commands.executeCommand(cmds[choice.id])
    }),
  )

  // ── Data commands ─────────────────────────────────────────────────────────────

  ctx.subscriptions.push(
    vscode.commands.registerCommand('hfHub.refresh', () => {
      modelProvider.refresh()
      datasetProvider.refresh()
      transferProvider.refresh()
      cacheProvider.refresh()
    }),

    vscode.commands.registerCommand('hfHub.setToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Enter your Hugging Face access token',
        password: true,
        placeHolder: 'hf_...',
        validateInput: v => (!v || v.startsWith('hf_')) ? null : 'Token should start with hf_',
      })
      if (!token) return
      try {
        const res = await api.setToken(token)
        await vscode.workspace.getConfiguration('hfHub').update('token', token, true)
        vscode.window.showInformationMessage(`✓ Connected as ${res.username}`)
        modelProvider.refresh()
        datasetProvider.refresh()
      } catch (e: any) {
        vscode.window.showErrorMessage(`Invalid token: ${e.message}`)
      }
    }),

    vscode.commands.registerCommand('hfHub.downloadModel', async (prefillId?: string) => {
      await downloadWithSearch('model', api, transferProvider, prefillId)
    }),

    vscode.commands.registerCommand('hfHub.searchModels', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search models (leave empty for trending)',
        placeHolder: 'bert, llama, stable-diffusion…',
      })
      if (query === undefined) return
      modelProvider.refresh(query)
    }),

    vscode.commands.registerCommand('hfHub.downloadDataset', async (prefillId?: string) => {
      await downloadWithSearch('dataset', api, transferProvider, prefillId)
    }),

    vscode.commands.registerCommand('hfHub.searchDatasets', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search datasets (leave empty for trending)',
        placeHolder: 'squad, commoncrawl, wikitext…',
      })
      if (query === undefined) return
      datasetProvider.refresh(query)
    }),

    vscode.commands.registerCommand('hfHub.uploadFolder', async (uri?: vscode.Uri) => {
      if (!await backend.ping()) {
        const go = await vscode.window.showWarningMessage('HF Hub backend is not running.', 'Start Backend')
        if (go === 'Start Backend') await vscode.commands.executeCommand('hfHub.startBackend')
        if (!await backend.ping()) return
      }
      UploadPanel.createOrShow(ctx.extensionUri, api, uri?.fsPath)
    }),

    vscode.commands.registerCommand('hfHub.clearCache', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Clear all HF Hub cache? This will delete downloaded files.',
        'Clear All', 'Cancel'
      )
      if (choice !== 'Clear All') return
      try {
        const cacheData = await api.scanCache()
        for (const repo of cacheData.repos ?? []) {
          await api.deleteRepo(repo.repo_type, repo.repo_id)
        }
        vscode.window.showInformationMessage('✓ Cache cleared')
        cacheProvider.refresh()
      } catch (e: any) {
        vscode.window.showErrorMessage(`Cache clear failed: ${e.message}`)
      }
    }),

    vscode.commands.registerCommand('hfHub.openInHub', async (item: any) => {
      const repoId = item?.repoId ?? item?.label
      if (!repoId) return
      const base = item?.repoType === 'dataset' ? 'datasets' : item?.repoType === 'space' ? 'spaces' : ''
      const url = base ? `https://huggingface.co/${base}/${repoId}` : `https://huggingface.co/${repoId}`
      vscode.env.openExternal(vscode.Uri.parse(url))
    }),

    vscode.commands.registerCommand('hfHub.downloadItem', async (item: any) => {
      // item is a ModelItem or DatasetItem with repoId and repoType properties
      const repoId   = item?.repoId   ?? item?.label
      const repoType = item?.repoType ?? 'model'
      if (!repoId) return
      await downloadWithSearch(repoType as 'model' | 'dataset', api, transferProvider, repoId)
    }),

    vscode.commands.registerCommand('hfHub.openTransferLog', (item: TransferItem | any) => {
      // item is a TransferItem — open its log channel
      const transfer = (item as any)?.transfer
      if (transfer) {
        logManager.open(transfer)
      }
    }),

    vscode.commands.registerCommand('hfHub.cancelTransfer', async (item: any) => {
      const id = item?.transferId
      if (!id) return
      await api.cancelTransfer(id)
      transferProvider.refresh()
    }),

    vscode.commands.registerCommand('hfHub.removeTransfer', async (item: any) => {
      const id = item?.transferId
      if (!id) return
      try { await api.removeTransfer(id) } catch {}
      transferProvider.refresh()
    }),

    vscode.commands.registerCommand('hfHub.clearTransferHistory', async () => {
      try { await api.clearTransferHistory() } catch {}
      transferProvider.refresh()
    }),
  )

  // ── Auto-start ────────────────────────────────────────────────────────────────

  const cfg = vscode.workspace.getConfiguration('hfHub')
  if (cfg.get('autoStartBackend')) {
    // Non-blocking — show setup prompt if needed
    backend.ensureRunning().catch(console.error)
  }

  // Welcome on first install
  if (!ctx.globalState.get('hfHub.installed')) {
    ctx.globalState.update('hfHub.installed', true)
    vscode.window.showInformationMessage(
      'HF Hub extension installed! Setup the backend to get started.',
      'Setup Backend', 'Set Token'
    ).then(choice => {
      if (choice === 'Setup Backend') vscode.commands.executeCommand('hfHub.setupBackend')
      else if (choice === 'Set Token') vscode.commands.executeCommand('hfHub.setToken')
    })
  }
}

export function deactivate() {
  if (backend) backend.stop()
}
