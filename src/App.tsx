import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { AppLayout } from './components/layout/AppLayout'
import { RawPage } from './pages/RawPage'
import { CentralPage } from './pages/CentralPage'
import { SalesReportPage } from './pages/SalesReportPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { DirectorPage } from './pages/DirectorPage'
import { SuperfoodDeepdivePage } from './pages/SuperfoodDeepdivePage'
import { AdsPlatformPage } from './pages/AdsPlatformPage'

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
            <Route index element={<DirectorPage />} />
            <Route path="/director" element={<DirectorPage />} />
            <Route path="/ads-platform" element={<AdsPlatformPage />} />
            <Route path="/superfood" element={<SuperfoodDeepdivePage />} />
            <Route path="/central" element={<CentralPage />} />
            <Route path="/central/:brand" element={<CentralPage />} />
            <Route path="/sales" element={<SalesReportPage />} />
            <Route path="/raw" element={<RawPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />

          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}

export default App
