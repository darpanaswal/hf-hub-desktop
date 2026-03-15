import * as vscode from 'vscode'
import { HfApi } from '../api'

const STATUS_ICON: Record<string, string> = {
  queued:    'clock',
  active:    'loading~spin',
  completed: 'pass',
  error:     'error',
  cancelled: 'circle-slash',
  paused:    'debug-pause',
}

const TERMINAL = new Set(['completed', 'error', 'cancelled'])

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  const k = 1024, sz = ['B','KB','MB','GB','TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + sz[i]
}
function fmtSpeed(bps: number): string { return fmtBytes(bps) + '/s' }

export class TransferItem extends vscode.TreeItem {
  public readonly transferId: string
  public readonly isTerminal: boolean

  constructor(public readonly transfer: any) {
    super(transfer.repo_id, vscode.TreeItemCollapsibleState.None)
    this.transferId = transfer.id
    this.isTerminal = TERMINAL.has(transfer.status)
    this.contextValue = this.isTerminal ? 'doneTransfer' : 'activeTransfer'
    this.iconPath = new vscode.ThemeIcon(STATUS_ICON[transfer.status] ?? 'circle-outline')

    const dir = transfer.type === 'upload' ? '↑' : '↓'
    const pct = Math.round(transfer.progress)

    if (transfer.status === 'active') {
      const speed = transfer.speed_bps > 0 ? `  ${fmtSpeed(transfer.speed_bps)}` : ''
      const file  = transfer.current_file ? `  ${transfer.current_file}` : ''
      this.description = `${dir} ${pct}%${speed}${file}`
    } else if (transfer.status === 'completed') {
      const size = transfer.total_bytes ? `  ${fmtBytes(transfer.total_bytes)}` : ''
      this.description = `${dir} done${size}`
    } else {
      this.description = `${dir} ${transfer.status}`
    }

    const lines = [
      `**${transfer.repo_id}** (${transfer.type})`,
      `Status: ${transfer.status} · ${pct}%`,
      transfer.total_bytes   ? `Size: ${fmtBytes(transfer.total_bytes)}` : '',
      transfer.speed_bps > 0 ? `Speed: ${fmtSpeed(transfer.speed_bps)}` : '',
      transfer.current_file  ? `File: \`${transfer.current_file}\`` : '',
      transfer.meta?.local_path ? `Path: \`${transfer.meta.local_path}\`` : '',
      transfer.meta?.local_dir  ? `Saved to: \`${transfer.meta.local_dir}\`` : '',
      transfer.error         ? `⚠ ${transfer.error}` : '',
      '',
      '*Click to open full transfer log*',
    ].filter(Boolean)
    this.tooltip = new vscode.MarkdownString(lines.join('\n\n'))

    // Clicking opens the detail log panel
    this.command = {
      command: 'hfHub.openTransferLog',
      title: 'Open Transfer Log',
      arguments: [this],
    }
  }
}

export class TransferTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  // In-memory store updated directly from SSE — no HTTP round-trip on every update
  private transfers: Map<string, any> = new Map()
  private _loaded = false

  constructor(private api: HfApi) {
    this.load()
  }

  /** Called on SSE snapshot — replace entire state */
  applySnapshot(transfers: any[]) {
    this.transfers.clear()
    for (const t of transfers) this.transfers.set(t.id, t)
    this._loaded = true
    this._onDidChangeTreeData.fire()
  }

  /** Called on SSE update — patch a single transfer in place */
  applyUpdate(transfer: any) {
    this.transfers.set(transfer.id, transfer)
    this._loaded = true
    this._onDidChangeTreeData.fire()
  }

  /** Force-fetch from backend (used on explicit refresh command) */
  refresh(): void { this.load() }

  private async load() {
    try {
      const res = await this.api.listTransfers()
      const list: any[] = res.transfers ?? []
      this.transfers.clear()
      for (const t of list) this.transfers.set(t.id, t)
      this._loaded = true
    } catch {
      // keep existing state
    }
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(e: vscode.TreeItem) { return e }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return []

    const list = Array.from(this.transfers.values())
    if (!list.length) {
      const i = new vscode.TreeItem('No transfers yet')
      i.iconPath = new vscode.ThemeIcon('inbox')
      return [i]
    }

    const order: Record<string, number> = { active: 0, queued: 1, paused: 2, completed: 3, error: 4, cancelled: 5 }
    list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))

    const items: vscode.TreeItem[] = list.map(t => new TransferItem(t))

    const hasDone = list.some(t => TERMINAL.has(t.status))
    if (hasDone) {
      const clearItem = new vscode.TreeItem('Clear finished transfers')
      clearItem.iconPath = new vscode.ThemeIcon('trash')
      clearItem.contextValue = 'clearHistory'
      clearItem.command = { command: 'hfHub.clearTransferHistory', title: 'Clear history', arguments: [] }
      items.push(clearItem)
    }

    return items
  }
}
