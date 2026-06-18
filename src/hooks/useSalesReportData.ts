import { useQuery } from '@tanstack/react-query'
import type { SalesReportRow } from '../types/salesReport'

const WORKER_URL = import.meta.env.VITE_D1_WORKER_URL as string

interface Params {
  from: string
  to: string
  brand?: string[]
}

async function fetchSalesReport(params: Params): Promise<SalesReportRow[]> {
  const url = new URL(`${WORKER_URL}/sales-report`)
  url.searchParams.set('from', params.from)
  url.searchParams.set('to', params.to)
  if (params.brand?.length) url.searchParams.set('brand', params.brand.join(','))

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useSalesReportData(params: Params) {
  return useQuery({
    queryKey: ['sales-report', params.from, params.to, params.brand],
    queryFn: () => fetchSalesReport(params),
    staleTime: 5 * 60 * 1000,
  })
}
