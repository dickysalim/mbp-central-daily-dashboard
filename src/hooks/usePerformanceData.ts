/**
 * usePerformanceData — Main data fetching hook
 *
 * Wraps dataService with TanStack Query for caching, loading, and error states.
 * All dashboard components consume this hook — never fetch data directly.
 *
 * Usage:
 *   const { data, isLoading, isError, error } = usePerformanceData({ from, to })
 */

import { useQuery } from '@tanstack/react-query'
import { dataService } from '../services/dataService'
import type { PerformanceQueryParams, PerformanceRow } from '../types/performance'

export const PERFORMANCE_QUERY_KEY = 'performance'

export function usePerformanceData(params: PerformanceQueryParams) {
  return useQuery<PerformanceRow[], Error>({
    queryKey: [
      PERFORMANCE_QUERY_KEY,
      params.from,
      params.to,
      params.brand?.slice().sort().join(',')          ?? '',
      params.traffic_source?.slice().sort().join(',') ?? '',
      params.sku?.slice().sort().join(',')             ?? '',
    ],
    queryFn: () => dataService.getPerformance(params),
    staleTime: 5 * 60 * 1000,      // 5 min — data doesn't change that often
    gcTime: 10 * 60 * 1000,        // 10 min cache
    retry: 2,
    enabled: Boolean(params.from && params.to),
  })
}
