import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { PinGate } from './components/PinGate'
import { ConsumerGoodsDashboard } from './pages/ConsumerGoodsDashboard'
import { PlatformOverviewPage } from './pages/PlatformOverviewPage'
import { HealthcareDashboard } from './pages/HealthcareDashboard'

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
            <Route index element={<Navigate to="/mnc" replace />} />
            <Route path="/mnc" element={<PinGate key="mnc" pin="168168" brand="MNC"><ConsumerGoodsDashboard brand="MNC" /></PinGate>} />
            <Route path="/gol" element={<PinGate key="gol" pin="321321" brand="GOL"><ConsumerGoodsDashboard brand="GOL" /></PinGate>} />
            <Route path="/mci" element={<HealthcareDashboard />} />
            <Route path="/platform-overview" element={<PlatformOverviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
