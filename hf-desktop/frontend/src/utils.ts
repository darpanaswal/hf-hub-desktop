export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function formatSpeed(bps: number): string {
  return formatBytes(bps) + '/s'
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function timeAgo(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function pipelineLabel(tag?: string): string {
  if (!tag) return ''
  return tag.replace(/-/g, ' ')
}

export function repoColor(type: string): string {
  switch (type) {
    case 'model': return 'hf'
    case 'dataset': return 'blue'
    case 'space': return 'purple'
    default: return 'gray'
  }
}

export function clsx(...args: (string | undefined | null | false)[]): string {
  return args.filter(Boolean).join(' ')
}
