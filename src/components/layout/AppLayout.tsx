/**
 * AppLayout — Wraps all pages with the sidebar + content area
 */
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-surface-950">
      <Sidebar />
      {/* Main content — offset by sidebar width */}
      <main className="flex-1 ml-56 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
