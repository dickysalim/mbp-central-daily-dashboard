/**
 * Central Daily Dashboard — Data Service
 *
 * Selects the correct adapter based on VITE_DATA_SOURCE env var.
 *
 * d1worker  → Cloudflare Worker → D1 (current)
 * n8n       → n8n webhook → Google Sheets (legacy)
 * supabase  → Supabase REST API (future)
 */

import { DATA_SOURCE } from '../config/dataSource'
import { d1WorkerAdapter } from './adapters/d1WorkerAdapter'
import { n8nAdapter } from './adapters/n8nAdapter'
import { supabaseAdapter } from './adapters/supabaseAdapter'
import type { DataAdapter } from '../types/performance'

const adapters: Record<string, DataAdapter> = {
  d1worker: d1WorkerAdapter,
  n8n: n8nAdapter,
  supabase: supabaseAdapter,
}

export const dataService: DataAdapter = adapters[DATA_SOURCE] ?? d1WorkerAdapter
