/**
 * useFilters — Fetches available filter options (brands, skus, traffic_sources)
 * Scoped to a brand when provided — SKUs and sources will only contain
 * values that exist for that brand.
 */

import { useQuery } from '@tanstack/react-query'
import { dataService } from '../services/dataService'
import type { FilterOptions } from '../types/performance'

export function useFilters(brand?: string) {
  return useQuery<FilterOptions, Error>({
    queryKey: ['filters', brand ?? '__all__'],
    queryFn: () => dataService.getFilters!(brand),
    staleTime: 10 * 60 * 1000,
    gcTime:    20 * 60 * 1000,
    enabled: Boolean(dataService.getFilters),
  })
}
