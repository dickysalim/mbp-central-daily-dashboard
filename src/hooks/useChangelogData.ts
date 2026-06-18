import { useQuery } from '@tanstack/react-query'
import type { ChangelogRow } from '../types/changelog'

const WORKER_URL = import.meta.env.VITE_D1_WORKER_URL as string

export function useChangelogData() {
  return useQuery<ChangelogRow[]>({
    queryKey: ['changelog'],
    queryFn: async () => {
      const url = new URL('/changelog', WORKER_URL)
      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}
