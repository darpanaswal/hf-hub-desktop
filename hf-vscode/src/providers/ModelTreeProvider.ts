import * as vscode from 'vscode'
import { HfApi } from '../api'

class ModelItem extends vscode.TreeItem {
  constructor(public readonly repoId: string, public readonly repoType = 'model', meta?: any) {
    super(repoId, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'modelItem'
    this.description = meta?.pipeline_tag?.replace(/-/g, ' ') ?? ''
    this.iconPath = new vscode.ThemeIcon(
      meta?.pipeline_tag?.includes('image') ? 'symbol-color' :
      meta?.pipeline_tag?.includes('speech') ? 'symbol-event' : 'circuit-board'
    )
    this.tooltip = new vscode.MarkdownString(
      `**${repoId}**\n\n` +
      (meta?.pipeline_tag ? `Task: ${meta.pipeline_tag}\n\n` : '') +
      (meta?.downloads != null ? `Downloads: ${(meta.downloads ?? 0).toLocaleString()}\n\n` : '') +
      (meta?.likes != null ? `Likes: ${(meta.likes ?? 0).toLocaleString()}\n\n` : '') +
      `*Click to download · right-click for more options*`
    )
    // Clicking a model item triggers download (the primary action on a cluster)
    this.command = {
      command: 'hfHub.downloadModel',
      title: 'Download Model',
      arguments: [repoId],
    }
  }
}

export class ModelTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event
  private models: any[] = []
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
      const res = await this.api.searchModels(this.currentQuery || undefined, undefined, 25)
      this.models = res.models ?? []
    } catch { this.models = [] }
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
    // Search item
    const si = new vscode.TreeItem(
      this.currentQuery ? `Search: "${this.currentQuery}"` : 'Search models…'
    )
    si.iconPath = new vscode.ThemeIcon('search')
    si.description = this.currentQuery ? 'click to change' : 'trending by default'
    si.command = { command: 'hfHub.searchModels', title: 'Search Models', arguments: [] }
    si.contextValue = 'searchItem'

    return [si, ...this.models.map(m => new ModelItem(m.id, 'model', m))]
  }
}
