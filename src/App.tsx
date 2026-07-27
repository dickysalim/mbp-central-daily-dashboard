import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { CentralPage } from './pages/CentralPage'
import { ProductPerformancePage } from './pages/ProductPerformancePage'
import { ProductDeepDivePage } from './pages/ProductDeepDivePage'
import { PlatformPerformancePage } from './pages/PlatformPerformancePage'
import { OverviewPage } from './pages/OverviewPage'
import { BudgetOptimizerPage } from './pages/BudgetOptimizerPage'

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
            <Route index element={<OverviewPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/product-performance" element={<ProductPerformancePage />} />
            <Route path="/platform-performance" element={<PlatformPerformancePage />} />
            <Route path="/product-deep-dive" element={<ProductDeepDivePage />} />
            <Route path="/budget-optimizer" element={<BudgetOptimizerPage />} />
            <Route path="/central" element={<CentralPage />} />
            <Route path="/central/:brand" element={<CentralPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
