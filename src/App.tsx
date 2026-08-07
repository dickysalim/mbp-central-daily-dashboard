import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { SandboxPage } from './pages/SandboxPage'
import { HealthcareDashboardPage } from './pages/HealthcareDashboardPage'
import { PlatformOverviewPage } from './pages/PlatformOverviewPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<SandboxPage />} />
            <Route path="/b2c" element={<SandboxPage />} />
            <Route path="/healthcare" element={<HealthcareDashboardPage />} />
            <Route path="/platform-overview" element={<PlatformOverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
