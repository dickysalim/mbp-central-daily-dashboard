import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { PinGate } from './components/PinGate'
import { ConsumerGoodsDashboard } from './pages/ConsumerGoodsDashboard'
import { PlatformOverviewPage } from './pages/PlatformOverviewPage'
import { HealthcareDashboard } from './pages/HealthcareDashboard'
import { GeneralOverviewPage } from './pages/GeneralOverviewPage'
import { SalesVelocityDashboard, GOLSalesVelocityDashboard } from './pages/SalesVelocityDashboard'
import { PipelineStatusPage } from './pages/PipelineStatusPage'
import { DOMAIN_PIN, DEFAULT_ROUTE, IS_GOLO } from './config/domainConfig'

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
          <Route element={<PinGate pin={DOMAIN_PIN} brand={IS_GOLO ? 'GOLO' : 'Dashboard'}><AppLayout /></PinGate>}>
            <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />

            {/* GOL routes — always available */}
            <Route path="/gol" element={<ConsumerGoodsDashboard brand="GOL" />} />
            <Route path="/gol-sales-velocity" element={<GOLSalesVelocityDashboard />} />
            <Route path="/platform-overview" element={<PlatformOverviewPage brand={IS_GOLO ? 'GOL' : undefined} />} />

            {/* Non-GOLO routes — only on main domain */}
            {!IS_GOLO && <>
              <Route path="/overview" element={<GeneralOverviewPage />} />
              <Route path="/mnc" element={<ConsumerGoodsDashboard brand="MNC" />} />
              <Route path="/mci" element={<HealthcareDashboard />} />
              <Route path="/sales-velocity" element={<SalesVelocityDashboard />} />
              <Route path="/pipeline-status" element={<PipelineStatusPage />} />
            </>}
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
