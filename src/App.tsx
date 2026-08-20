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
import { CampaignExplorerPage, GolCampaignExplorerPage } from './pages/CampaignExplorerPage'
import { DOMAIN_PIN, DEFAULT_ROUTE, IS_GOLO, IS_MNC } from './config/domainConfig'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

const brandLabel = IS_GOLO ? 'GOLO' : IS_MNC ? 'MNC' : 'Dashboard'
const platformBrand = IS_GOLO ? 'GOL' : IS_MNC ? 'MNC' : undefined

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<PinGate pin={DOMAIN_PIN} brand={brandLabel}><AppLayout /></PinGate>}>
            <Route index element={<Navigate to={DEFAULT_ROUTE} replace />} />

            {/* GOL routes — available on GOLO + main domain */}
            {!IS_MNC && <>
              <Route path="/gol" element={<ConsumerGoodsDashboard brand="GOL" />} />
              <Route path="/gol-sales-velocity" element={<GOLSalesVelocityDashboard />} />
              <Route path="/gol-campaigns" element={<GolCampaignExplorerPage />} />
            </>}

            {/* Shared routes */}
            <Route path="/platform-overview" element={<PlatformOverviewPage brand={platformBrand} />} />

            {/* MNC routes — available on MNC + main domain */}
            {!IS_GOLO && <>
              <Route path="/mnc" element={<ConsumerGoodsDashboard brand="MNC" />} />
              <Route path="/sales-velocity" element={<SalesVelocityDashboard />} />
              <Route path="/campaign-explorer" element={<CampaignExplorerPage />} />
            </>}

            {/* Main domain only routes */}
            {!IS_GOLO && !IS_MNC && <>
              <Route path="/overview" element={<GeneralOverviewPage />} />
              <Route path="/mci" element={<HealthcareDashboard />} />
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
