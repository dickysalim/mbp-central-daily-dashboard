/**
 * Central Daily Dashboard — Ad Performance Types
 * Schema: ads_performance table in Cloudflare D1
 */

export interface AdPerformanceRow {
  unique_key: string
  day: string           // 'YYYY-MM-DD'
  brand: string
  traffic_source: string
  sku: string

  // Spend & Traffic
  ad_spend: number
  impressions: number
  link_clicks: number
  lp_view: number
  view_offer: number

  // Lead Events (raw counts from ad platform)
  lead_event_cc: number   // credit card
  lead_event_dp: number   // direct purchase
  lead_event_mp: number   // marketplace
  lead_event_os: number   // other source

  // Real Leads (qualified)
  real_lead_cc: number
  real_lead_dp: number
  real_lead_mp: number

  // Dispatch
  lead_dispatch_dp: number
  lead_dispatch_mp: number
  agen_dispatch_dp: number

  // Sales
  socr_cc: number
  sale_cc: number
  revenue_cc: number

  // Web
  form_submission: number
  visit: number
}

/**
 * Query parameters sent to the data source.
 */
export interface PerformanceQueryParams {
  from: string            // 'YYYY-MM-DD'
  to: string             // 'YYYY-MM-DD'
  brand?: string[]       // optional filter
  traffic_source?: string[]
  sku?: string[]
}

/**
 * Filter options returned by /filters endpoint
 */
export interface FilterOptions {
  brands: string[]
  traffic_sources: string[]
  skus: string[]
}

/**
 * The shape every data adapter must implement.
 */
export interface DataAdapter {
  getPerformance: (params: PerformanceQueryParams) => Promise<AdPerformanceRow[]>
  getFilters?: (brand?: string) => Promise<FilterOptions>
}
