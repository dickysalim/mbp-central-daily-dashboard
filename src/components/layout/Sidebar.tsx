import { NavLink } from 'react-router-dom'
import { ALLOWED_ROUTES } from '../../config/domainConfig'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const PAGES: NavItem[] = [
  {
    to: '/overview',
    label: 'General Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: '/mnc',
    label: 'MNC Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/gol',
    label: 'GOL Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/mci',
    label: 'MCI Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    to: '/platform-overview',
    label: 'Platform Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    to: '/sales-velocity',
    label: 'MNC Sales Velocity',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    to: '/gol-sales-velocity',
    label: 'GOL Sales Velocity',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
]

const VISIBLE_PAGES = PAGES.filter(p => ALLOWED_ROUTES.includes(p.to))

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-36 bg-surface-900 border-r border-white/5 flex flex-col z-50">
      {/* Logo */}
      <div className="px-3 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand-gradient flex items-center justify-center text-white font-bold text-[9px] shrink-0">
            C
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-surface-100 leading-none truncate">Central Daily</p>
            <p className="text-[7px] text-surface-200/40 mt-0.5 leading-none">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <p className="px-1.5 mb-1.5 text-[6px] font-semibold text-surface-200/25 uppercase tracking-widest">
          Pages
        </p>
        {VISIBLE_PAGES.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-[9px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                  : 'text-surface-200/50 hover:text-surface-100 hover:bg-white/5'
              }`
            }
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-white/5">
        <p className="text-[6px] text-surface-200/20 leading-relaxed">
          Source: <span className="text-brand-400/60 font-mono">D1</span>
        </p>
      </div>
    </aside>
  )
}
