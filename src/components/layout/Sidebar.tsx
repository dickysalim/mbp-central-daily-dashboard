/**
 * Sidebar — Main navigation component
 */
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const PAGES: NavItem[] = [
  {
    to: '/director',
    label: 'Product Performance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    to: '/ads-platform',
    label: 'Ads Platform Performance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    to: '/superfood',
    label: 'Product Deep Dive',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    to: '/central',
    label: 'Central (Legacy)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },

]

const RAW_TABLES: NavItem[] = [
  {
    to: '/raw',
    label: 'cdd.v1_ads_performance',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v4H3z" /><path d="M3 10h18v4H3z" /><path d="M3 17h18v4H3z" />
      </svg>
    ),
  },
  {
    to: '/sales',
    label: 'cdd.v1_sales_report',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
  },
  {
    to: '/changelog',
    label: 'cdd.v1_changelog',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
]

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
            : 'text-surface-200/50 hover:text-surface-100 hover:bg-white/5'
        }`
      }
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="font-mono text-xs">{item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const location = useLocation()
  const rawPaths = RAW_TABLES.map(i => i.to)
  const isRawActive = rawPaths.includes(location.pathname)
  const [rawOpen, setRawOpen] = useState(isRawActive)

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-surface-900 border-r border-white/5 flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
            C
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-surface-100 leading-none truncate">Central Daily</p>
            <p className="text-[10px] text-surface-200/40 mt-0.5 leading-none">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Pages section */}
        <p className="px-2 mb-2 text-[10px] font-semibold text-surface-200/25 uppercase tracking-widest">
          Pages
        </p>
        {PAGES.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
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

        {/* Raw D1 Data Table section */}
        <div className="pt-4">
          <button
            onClick={() => setRawOpen(!rawOpen)}
            className="flex items-center gap-2 px-2 mb-2 w-full text-left group cursor-pointer"
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-150 text-surface-200/25 ${rawOpen ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[10px] font-semibold text-surface-200/25 uppercase tracking-widest group-hover:text-surface-200/40 transition-colors">
              Raw D1 Data Table
            </span>
          </button>

          {rawOpen && (
            <div className="space-y-0.5 ml-1">
              {RAW_TABLES.map((item) => (
                <NavItemLink key={item.to} item={item} />
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/5">
        <p className="text-[10px] text-surface-200/20 leading-relaxed">
          Source: <span className="text-brand-400/60 font-mono">D1</span>
        </p>
      </div>
    </aside>
  )
}
