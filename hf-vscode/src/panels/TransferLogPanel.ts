import * as vscode from 'vscode'

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  const k = 1024, sz = ['B','KB','MB','GB','TB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + sz[i]
}
function fmtSpeed(bps: number): string { return fmtBytes(bps) + '/s' }
function bar(pct: number, width = 30): string {
  const filled = Math.round(pct / 100 * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']'
}

/**
 * One OutputChannel per transfer, showing a live ASCII progress display
 * that updates in-place on every SSE tick.
 */
export class TransferLogManager {
  private channels: Map<string, vscode.OutputChannel> = new Map()

  /** Open (or focus) the log channel for this transfer and render its current state */
  open(transfer: any) {
    let ch = this.channels.get(transfer.id)
    if (!ch) {
      const label = `HF Hub: ${transfer.repo_id} (${transfer.type})`
      ch = vscode.window.createOutputChannel(label)
      this.channels.set(transfer.id, ch)
      this.renderFull(ch, transfer)
    }
    ch.show(true) // preserve focus
  }

  /** Called on every SSE update — rewrites the channel content */
  update(transfer: any) {
    const ch = this.channels.get(transfer.id)
    if (!ch) return
    this.renderFull(ch, transfer)
  }

  private renderFull(ch: vscode.OutputChannel, t: any) {
    const pct = Math.round(t.progress ?? 0)
    const lines: string[] = []

    lines.push('═'.repeat(60))
    lines.push(`  HF Hub Transfer Log`)
    lines.push('═'.repeat(60))
    lines.push(`  Repo    : ${t.repo_id}`)
    lines.push(`  Type    : ${t.type}`)
    lines.push(`  Status  : ${t.status.toUpperCase()}`)
    lines.push('')

    if (t.status === 'active' || t.status === 'completed') {
      lines.push(`  Progress: ${bar(pct)} ${pct}%`)
      lines.push(`  Size    : ${fmtBytes(t.transferred_bytes)} / ${fmtBytes(t.total_bytes)}`)
      if (t.total_files > 1) {
        lines.push(`  Files   : ${t.completed_files} / ${t.total_files}`)
      }
      if (t.speed_bps > 0) {
        lines.push(`  Speed   : ${fmtSpeed(t.speed_bps)}`)
        if (t.total_bytes > t.transferred_bytes && t.speed_bps > 0) {
          const remaining = (t.total_bytes - t.transferred_bytes) / t.speed_bps
          lines.push(`  ETA     : ${fmtEta(remaining)}`)
        }
      }
      if (t.current_file) {
        lines.push(`  File    : ${t.current_file}`)
      }
    }

    if (t.status === 'completed') {
      const dest = t.meta?.local_path || t.meta?.local_dir
      if (dest) lines.push(`  Saved to: ${dest}`)
      lines.push('')
      lines.push('  ✓ Transfer completed successfully')
    }

    if (t.status === 'error') {
      lines.push('')
      lines.push(`  ✗ Error: ${t.error ?? 'Unknown error'}`)
      lines.push('')
      lines.push('  Tip: Check that your HF token is set and the repo ID is correct.')
      lines.push('       For large files, ensure you have sufficient disk space.')
    }

    if (t.status === 'cancelled') {
      lines.push('')
      lines.push('  ⊘ Transfer was cancelled')
    }

    if (t.meta?.local_path) {
      lines.push('')
      lines.push(`  Local path : ${t.meta.local_path}`)
    }
    if (t.meta?.local_dir) {
      lines.push(`  Save dir   : ${t.meta.local_dir}`)
    }

    lines.push('')
    lines.push(`  Last update: ${new Date().toLocaleTimeString()}`)
    lines.push('─'.repeat(60))

    ch.clear()
    ch.appendLine(lines.join('\n'))
  }

  dispose(transferId: string) {
    const ch = this.channels.get(transferId)
    if (ch) { ch.dispose(); this.channels.delete(transferId) }
  }

  disposeAll() {
    for (const ch of this.channels.values()) ch.dispose()
    this.channels.clear()
  }
}

function fmtEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
