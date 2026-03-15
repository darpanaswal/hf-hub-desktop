import React from 'react'
import { useStore } from '@/store'
import { clsx } from '@/utils'
import {
  Brain, Database, Layers, Upload, Download, HardDrive, GitBranch,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

const NAV_ITEMS = [
  { id: 'models',   label: 'Models',   icon: Brain,     group: 'Browse',  badgeType: null },
  { id: 'datasets', label: 'Datasets', icon: Database,  group: 'Browse',  badgeType: null },
  { id: 'spaces',   label: 'Spaces',   icon: Layers,    group: 'Browse',  badgeType: null },
  { id: 'uploads',  label: 'Uploads',  icon: Upload,    group: 'Manage',  badgeType: 'upload' },
  { id: 'downloads',label: 'Downloads',icon: Download,  group: 'Manage',  badgeType: 'download' },
  { id: 'cache',    label: 'Cache',    icon: HardDrive, group: 'Manage',  badgeType: null },
  { id: 'repos',    label: 'My Repos', icon: GitBranch, group: 'Local',   badgeType: null },
] as const

export const Sidebar: React.FC = () => {
  const { activeNav, setActiveNav, sidebarCollapsed, setSidebarCollapsed, user, transfers } = useStore()

  const uploadCount  = Object.values(transfers).filter(t => t.type === 'upload'   && (t.status === 'active' || t.status === 'queued')).length
  const downloadCount= Object.values(transfers).filter(t => t.type === 'download' && (t.status === 'active' || t.status === 'queued')).length

  const badgeFor = (type: string | null) => {
    if (type === 'upload')   return uploadCount
    if (type === 'download') return downloadCount
    return 0
  }

  const groups = Array.from(new Set(NAV_ITEMS.map(i => i.group)))

  return (
    <aside className={clsx(
      'flex flex-col bg-[#0d0d11] border-r border-white/[0.06] transition-all duration-200 select-none',
      sidebarCollapsed ? 'w-14' : 'w-52'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3.5 py-4 border-b border-white/[0.06]">
        <div className="w-7 h-7 bg-hf-500 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          🤗
        </div>
        {!sidebarCollapsed && (
          <div className="animate-slide-in overflow-hidden">
            <div className="text-sm font-semibold text-white">HF Hub</div>
            <div className="text-[10px] text-gray-600 -mt-0.5">Desktop</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {groups.map(group => (
          <div key={group}>
            {!sidebarCollapsed && (
              <div className="px-2 mb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
                {group}
              </div>
            )}
            <div className="space-y-0.5">
              {NAV_ITEMS.filter(i => i.group === group).map(item => {
                const Icon = item.icon
                const isActive = activeNav === item.id
                const badge = badgeFor(item.badgeType)
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-all duration-100',
                      sidebarCollapsed ? 'justify-center' : '',
                      isActive
                        ? 'bg-hf-500/15 text-hf-400 font-medium'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    )}
                  >
                    <Icon size={15} className="flex-shrink-0" />
                    {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                    {!sidebarCollapsed && badge > 0 && (
                      <span className="text-[10px] bg-hf-500/20 text-hf-400 rounded-full px-1.5 py-0.5 font-medium">
                        {badge}
                      </span>
                    )}
                    {sidebarCollapsed && badge > 0 && (
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-hf-500" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-2">
        {user?.authenticated && !sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 py-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-hf-500/20 flex items-center justify-center text-[10px] text-hf-400 font-semibold flex-shrink-0">
              {user.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-medium text-gray-300 truncate">{user.username}</div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] text-gray-600">Connected</span>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center py-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  )
}
