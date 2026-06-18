/**
 * Central Daily Dashboard — Data Source Configuration
 *
 * Single source of truth for all env vars.
 * Adapters and services import from here — never from import.meta.env directly.
 */

export type DataSourceType = 'n8n' | 'd1worker' | 'supabase'

export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE ?? 'd1worker') as DataSourceType

// Phase 1 — Cloudflare Worker in front of D1
export const D1_WORKER_URL = import.meta.env.VITE_D1_WORKER_URL as string | undefined

// Legacy Phase 1 — n8n webhook
export const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined

// Phase 2 — Supabase (future)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Warn in dev if the active adapter is missing its URL
if (import.meta.env.DEV) {
  if (DATA_SOURCE === 'd1worker' && !D1_WORKER_URL) {
    console.warn('[CDD] VITE_D1_WORKER_URL is not set. Set it in .env.local to the deployed Worker URL.')
  }
  if (DATA_SOURCE === 'n8n' && !N8N_WEBHOOK_URL) {
    console.warn('[CDD] VITE_N8N_WEBHOOK_URL is not set.')
  }
}
