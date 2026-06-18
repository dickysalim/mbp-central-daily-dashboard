/**
 * n8n Adapter — Phase 1
 *
 * Fetches data from an n8n webhook URL with date range query params.
 * n8n is responsible for reading Google Sheets, filtering/aggregating,
 * and returning a clean JSON array of PerformanceRow objects.
 *
 * Expected webhook response: PerformanceRow[]
 */

import { N8N_WEBHOOK_URL } from '../../config/dataSource'
import type { DataAdapter, PerformanceQueryParams, PerformanceRow } from '../../types/performance'

export const n8nAdapter: DataAdapter = {
  getPerformance: async ({ from, to }: PerformanceQueryParams): Promise<PerformanceRow[]> => {
    if (!N8N_WEBHOOK_URL) {
      throw new Error(
        '[n8nAdapter] VITE_N8N_WEBHOOK_URL is not configured. Set it in your .env.local file.'
      )
    }

    const url = new URL(N8N_WEBHOOK_URL)
    url.searchParams.set('from', from)
    url.searchParams.set('to', to)

    const response = await fetch(url.toString())

    if (!response.ok) {
      throw new Error(
        `[n8nAdapter] Webhook responded with ${response.status}: ${response.statusText}`
      )
    }

    const data = await response.json()

    // n8n sometimes wraps the response — unwrap if needed
    return Array.isArray(data) ? data : (data?.data ?? data?.rows ?? [])
  },
}
