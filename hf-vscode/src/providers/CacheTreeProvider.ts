import * as vscode from 'vscode'
import { HfApi } from '../api'

function formatBytes(b: number): string {
  if (!b) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

class CacheRepoItem extends vscode.TreeItem {
  constructor(
    public readonly repo: any,
    public readonly repoId: string,
    public readonly repoType: string
  ) {
    super(repo.repo_id, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'cacheItem'
    this.description = formatBytes(repo.size_on_disk)
    this.iconPath = new vscode.ThemeIcon(
      repo.repo_type === 'dataset' ? 'database' :
      repo.repo_type === 'space' ? 'rocket' : 'circuit-board'
    )
    this.tooltip = new vscode.MarkdownString(
      `**${repo.repo_id}**\n\n` +
      `Type: ${repo.repo_type}\n\n` +
      `Size: ${formatBytes(repo.size_on_disk)}\n\n` +
      `Files: ${repo.nb_files}\n\n` +
      `Path: \`${repo.repo_path}\``
    )
  }
}

export class CacheTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private cacheData: any = null
  private loading = false

  constructor(private api: HfApi) {
    this.load()
  }

  refresh(): void { this.load() }

  private async load() {
    this.loading = true
    this._onDidChangeTreeData.fire()
    try {
      this.cacheData = await this.api.scanCache()
    } catch {
      this.cacheData = null
    } finally {
      this.loading = false
      this._onDidChangeTreeData.fire()
    }
  }

  getTreeItem(e: vscode.TreeItem) { return e }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) return []

    if (this.loading) {
      const item = new vscode.TreeItem('Scanning cache…')
      item.iconPath = new vscode.ThemeIcon('loading~spin')
      return [item]
    }

    if (!this.cacheData?.repos?.length) {
      const item = new vscode.TreeItem('Cache is empty')
      item.iconPath = new vscode.ThemeIcon('inbox')
      return [item]
    }

    // Summary item
    const summary = new vscode.TreeItem(
      `Total: ${formatBytes(this.cacheData.total_size)} (${this.cacheData.total_repos} repos)`
    )
    summary.iconPath = new vscode.ThemeIcon('server')

    const repoItems = this.cacheData.repos.map((r: any) =>
      new CacheRepoItem(r, r.repo_id, r.repo_type)
    )

    return [summary, ...repoItems]
  }
}
