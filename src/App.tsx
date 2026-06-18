import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { MainPage } from './pages/MainPage'
import { RawPage } from './pages/RawPage'
import { CentralPage } from './pages/CentralPage'
import { SalesReportPage } from './pages/SalesReportPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { StatusPage } from './pages/StatusPage'
import { DynamicPage } from './pages/DynamicPage'

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
            <Route index element={<MainPage />} />
            <Route path="/central" element={<CentralPage />} />
            <Route path="/sales" element={<SalesReportPage />} />
            <Route path="/raw" element={<RawPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/dynamic" element={<DynamicPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
