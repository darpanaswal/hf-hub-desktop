import React from 'react'
import { clsx } from '@/utils'

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary', size = 'md', loading, children, className, disabled, ...rest
}) => {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg border transition-all duration-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-1.5 text-sm' }
  const variants = {
    primary: 'bg-hf-500 border-hf-600 text-white hover:bg-hf-600 active:scale-[0.98]',
    secondary: 'bg-transparent border-white/10 text-gray-300 hover:bg-white/5 active:scale-[0.98]',
    ghost: 'bg-transparent border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5',
    danger: 'bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10',
  }
  return (
    <button
      className={clsx(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />}
      {children}
    </button>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps { label: string; color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'hf' }
export const Badge: React.FC<BadgeProps> = ({ label, color = 'gray' }) => {
  const colors = {
    blue:   'bg-blue-500/15 text-blue-300 border-blue-500/20',
    green:  'bg-green-500/15 text-green-300 border-green-500/20',
    amber:  'bg-amber-500/15 text-amber-300 border-amber-500/20',
    red:    'bg-red-500/15 text-red-300 border-red-500/20',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/20',
    gray:   'bg-white/5 text-gray-400 border-white/10',
    hf:     'bg-hf-500/15 text-hf-400 border-hf-500/20',
  }
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', colors[color])}>
      {label}
    </span>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
interface ProgressProps { value: number; color?: string; className?: string }
export const ProgressBar: React.FC<ProgressProps> = ({ value, color = 'bg-hf-500', className }) => (
  <div className={clsx('h-1 rounded-full bg-white/10 overflow-hidden', className)}>
    <div
      className={clsx('h-full rounded-full transition-all duration-300', color)}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
)

// ── Input ─────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}
export const Input: React.FC<InputProps> = ({ icon, className, ...rest }) => (
  <div className="relative flex items-center">
    {icon && <span className="absolute left-3 text-gray-500 pointer-events-none">{icon}</span>}
    <input
      className={clsx(
        'w-full bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600',
        'focus:outline-none focus:border-hf-500/60 focus:bg-white/8 transition-colors',
        icon ? 'pl-9 pr-3 py-2' : 'px-3 py-2',
        className
      )}
      {...rest}
    />
  </div>
)

// ── Select ────────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
export const Select: React.FC<SelectProps> = ({ className, children, ...rest }) => (
  <select
    className={clsx(
      'bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200',
      'focus:outline-none focus:border-hf-500/60 px-3 py-2 cursor-pointer',
      className
    )}
    {...rest}
  >
    {children}
  </select>
)

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; onClick?: () => void; hover?: boolean }
export const Card: React.FC<CardProps> = ({ children, className, onClick, hover = !!onClick }) => (
  <div
    onClick={onClick}
    className={clsx(
      'bg-[#18181f] border border-white/[0.07] rounded-xl p-4',
      hover && 'cursor-pointer hover:border-white/15 hover:bg-[#1e1e28] transition-all duration-150',
      className
    )}
  >
    {children}
  </div>
)

// ── Spinner ───────────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={clsx('animate-spin', className)}
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

// ── EmptyState ────────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{ icon?: string; title: string; sub?: string; action?: React.ReactNode }> = ({
  icon, title, sub, action
}) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center animate-fade-in">
    {icon && <div className="text-4xl opacity-40">{icon}</div>}
    <div className="text-gray-400 font-medium">{title}</div>
    {sub && <div className="text-gray-600 text-xs max-w-xs">{sub}</div>}
    {action && <div className="mt-2">{action}</div>}
  </div>
)

// ── Tooltip ───────────────────────────────────────────────────────────────────
export const Tooltip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group inline-flex">
    {children}
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] bg-[#2a2a36] border border-white/10 rounded-md whitespace-nowrap text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
      {label}
    </span>
  </div>
)

// ── SectionHeader ─────────────────────────────────────────────────────────────
export const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</h3>
    {action}
  </div>
)

// ── Divider ───────────────────────────────────────────────────────────────────
export const Divider: React.FC = () => <div className="border-t border-white/[0.06] my-3" />
