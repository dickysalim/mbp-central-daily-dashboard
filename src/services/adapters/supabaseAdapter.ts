/**
 * Supabase Adapter — Phase 2 Stub
 *
 * This adapter is intentionally not implemented yet.
 * When Phase 2 is ready:
 *   1. Install @supabase/supabase-js
 *   2. Initialise the Supabase client here using SUPABASE_URL + SUPABASE_ANON_KEY
 *   3. Replace the throw below with a real query
 *   4. Set VITE_DATA_SOURCE=supabase in .env.local
 *
 * Zero changes to components, hooks, or dataService.ts required.
 */

import type { DataAdapter, PerformanceQueryParams, PerformanceRow } from '../../types/performance'
// import { createClient } from '@supabase/supabase-js'
// import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/dataSource'

// const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

export const supabaseAdapter: DataAdapter = {
  getPerformance: async (_params: PerformanceQueryParams): Promise<PerformanceRow[]> => {
    // TODO Phase 2:
    // const { data, error } = await supabase
    //   .from('performance')
    //   .select('*')
    //   .gte('day', params.from)
    //   .lte('day', params.to)
    //   .order('day', { ascending: true })
    // if (error) throw error
    // return data ?? []

    throw new Error(
      '[supabaseAdapter] Not yet implemented. Set VITE_DATA_SOURCE=n8n to use the n8n adapter.'
    )
  },
}
