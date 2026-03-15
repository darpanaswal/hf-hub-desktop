import * as vscode from 'vscode'
import { HfApi } from '../api'

class DatasetItem extends vscode.TreeItem {
  constructor(public readonly repoId: string, public readonly repoType = 'dataset', meta?: any) {
    super(repoId, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'datasetItem'
    this.description = meta?.downloads != null ? `↓ ${(meta.downloads ?? 0).toLocaleString()}` : ''
    this.iconPath = new vscode.ThemeIcon('database')
    this.tooltip = new vscode.MarkdownString(
      `**${repoId}**\n\n` +
      (meta?.downloads != null ? `Downloads: ${(meta.downloads ?? 0).toLocaleString()}\n\n` : '') +
      (meta?.description ? meta.description.slice(0, 120) + '…\n\n' : '') +
      `*Click to download · right-click for more options*`
    )
    // Clicking triggers download
    this.command = {
      command: 'hfHub.downloadDataset',
      title: 'Download Dataset',
      arguments: [repoId],
    }
  }
}

export class DatasetTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  private datasets: any[] = []
  private loading = false
  private currentQuery = ''

  constructor(private api: HfApi) { this.load() }

  refresh(query?: string): void {
    if (query !== undefined) this.currentQuery = query
    this.load()
  }

  private async load() {
    this.loading = true
    this._onDidChangeTreeData.fire()
    try {
      const res = await this.api.searchDatasets(this.currentQuery || undefined, 25)
      this.datasets = res.datasets ?? []
    } catch { this.datasets = [] }
    finally { this.loading = false; this._onDidChangeTreeData.fire() }
  }

  getTreeItem(e: vscode.TreeItem) { return e }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return []
    if (this.loading) {
      const i = new vscode.TreeItem('Loading…')
      i.iconPath = new vscode.ThemeIcon('loading~spin')
      return [i]
    }
    const si = new vscode.TreeItem(
      this.currentQuery ? `Search: "${this.currentQuery}"` : 'Search datasets…'
    )
    si.iconPath = new vscode.ThemeIcon('search')
    si.description = this.currentQuery ? 'click to change' : 'trending by default'
    si.command = { command: 'hfHub.searchDatasets', title: 'Search Datasets', arguments: [] }
    si.contextValue = 'searchItem'

    return [si, ...this.datasets.map(d => new DatasetItem(d.id, 'dataset', d))]
  }
}
