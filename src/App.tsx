import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { PinGate } from './components/PinGate'
import { ConsumerGoodsDashboard } from './pages/ConsumerGoodsDashboard'
import { PlatformOverviewPage } from './pages/PlatformOverviewPage'
import { HealthcareDashboard } from './pages/HealthcareDashboard'
import { GeneralOverviewPage } from './pages/GeneralOverviewPage'
import { SalesVelocityDashboard } from './pages/SalesVelocityDashboard'

const GLOBAL_PIN = '232345'

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
          <Route element={<PinGate pin={GLOBAL_PIN} brand="Dashboard"><AppLayout /></PinGate>}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<GeneralOverviewPage />} />
            <Route path="/mnc" element={<ConsumerGoodsDashboard brand="MNC" />} />
            <Route path="/gol" element={<ConsumerGoodsDashboard brand="GOL" />} />
            <Route path="/mci" element={<HealthcareDashboard />} />
            <Route path="/platform-overview" element={<PlatformOverviewPage />} />
            <Route path="/sales-velocity" element={<SalesVelocityDashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
