/**
 * DynamicPage — Dynamic Sidebar (placeholder)
 */

export function DynamicPage() {
  return (
    <div className="min-h-screen flex flex-col text-surface-100">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/90 backdrop-blur-md">
        <div className="px-6 py-4">
          <h1 className="text-sm font-semibold text-surface-100">Dynamic Sidebar</h1>
          <p className="text-[10px] text-surface-200/40 mt-0.5">Work in progress</p>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="text-surface-200/30" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-surface-100">Dynamic Sidebar</p>
          <p className="text-[11px] text-surface-200/30">Coming soon</p>
        </div>
      </div>
    </div>
  )
}
