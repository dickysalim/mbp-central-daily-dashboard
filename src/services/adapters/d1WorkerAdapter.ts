/**
 * D1 Worker Adapter — Phase 1
 *
 * Calls the Cloudflare Worker which queries D1 on behalf of the browser.
 * The Worker handles auth — this adapter just hits the public Worker URL.
 */

import { D1_WORKER_URL } from '../../config/dataSource'
import type { DataAdapter, AdPerformanceRow, FilterOptions, PerformanceQueryParams } from '../../types/performance'

export const d1WorkerAdapter: DataAdapter = {
  getPerformance: async (params: PerformanceQueryParams): Promise<AdPerformanceRow[]> => {
    if (!D1_WORKER_URL) {
      throw new Error(
        '[d1WorkerAdapter] VITE_D1_WORKER_URL is not set. Add it to your .env.local file.'
      )
    }

    const url = new URL(`${D1_WORKER_URL}/performance`)
    url.searchParams.set('from', params.from)
    url.searchParams.set('to', params.to)

    if (params.brand?.length)          url.searchParams.set('brand', params.brand.join(','))
    if (params.traffic_source?.length) url.searchParams.set('traffic_source', params.traffic_source.join(','))
    if (params.sku?.length)            url.searchParams.set('sku', params.sku.join(','))

    const res = await fetch(url.toString())

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`[d1WorkerAdapter] Worker responded ${res.status}: ${body}`)
    }

    return res.json() as Promise<AdPerformanceRow[]>
  },

  getFilters: async (brand?: string): Promise<FilterOptions> => {
    if (!D1_WORKER_URL) {
      throw new Error('[d1WorkerAdapter] VITE_D1_WORKER_URL is not set.')
    }

    const url = new URL(`${D1_WORKER_URL}/filters`)
    if (brand) url.searchParams.set('brand', brand)

    const res = await fetch(url.toString())

    if (!res.ok) {
      throw new Error(`[d1WorkerAdapter] Failed to fetch filters: ${res.status}`)
    }

    return res.json() as Promise<FilterOptions>
  },
}
