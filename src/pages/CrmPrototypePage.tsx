/**
 * CrmPrototypePage — CDP / CRM data prototype (main domain only)
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtRp } from '../utils/format'

const CDP_WORKER = 'https://cdp-worker.mganik-group.workers.dev'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SegmentRow {
  segment_type: 'activity' | 'ltv'
  segment_name: string
  customer_count: number
  avg_transactions: number
  avg_days_inactive: number
  avg_revenue: number
}

interface CustomerRow {
  // CTS
  phone_number: string | number
  count_order_created: number
  count_order_cancelled: number
  count_order_paid: number
  count_product_check_in: number
  date_first_order_paid: string | null
  date_last_order_paid: string | null
  date_first_product_check_in: string | null
  date_last_product_check_in: string | null
  sum_order_paid_revenue: number
  sum_product_check_in_revenue: number
  first_order_paid_sales_channel: string | null
  last_order_paid_sales_channel: string | null
  segment: string
  ltv_segment: string
  total_transactions: number
  days_since_last: number
  // KTP
  name?: string | null
  name_source?: string | null
  gender?: string | null
  display_gender?: string | null
  loc_province?: string | null
  loc_city?: string | null
  full_address?: string | null
  date_of_birth?: string | null
  age?: number | null
  agama?: string | null
  pekerjaan?: string | null
  joined_community?: number | null
  top_tier?: number | null
  // Product history
  first_purchased_sku?: string | null
  first_purchased_sku_name?: string | null
  last_purchased_sku?: string | null
  last_purchased_sku_name?: string | null
  all_purchased_skus?: string | null
  distinct_sku_count?: number | null
}

interface DemoRow {
  dimension: string
  segment_name: string
  customer_count: number
}

// ── Column definitions ────────────────────────────────────────────────────────
type ColGroup = 'segment' | 'purchases' | 'checkins' | 'identity' | 'products'
interface ColDef {
  id: string
  label: string
  group: ColGroup
  groupLabel: string
  defaultOn: boolean
  render: (row: CustomerRow, fns: RenderFns) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number
}
interface RenderFns {
  fmtRpShort: (v: number) => string
  fmtN: (v: number) => string
  fmtDate: (s: string | null | undefined) => string
  Badge: (props: { label: string; map: Record<string, { color: string; bg: string }> }) => React.ReactElement
}

const ALL_COLS: ColDef[] = [
  // Segments
  { id: 'segment',    label: 'Segment',       group: 'segment',   groupLabel: 'Segments',    defaultOn: true,  align: 'center', render: (r, { Badge }) => <Badge label={r.segment} map={ACTIVITY_COLORS} /> },
  { id: 'ltv',        label: 'LTV',           group: 'segment',   groupLabel: 'Segments',    defaultOn: true,  align: 'center', render: (r, { Badge }) => <Badge label={r.ltv_segment} map={LTV_COLORS} /> },
  // Purchases
  { id: 'paid_orders', label: 'Paid Orders',   group: 'purchases', groupLabel: 'Purchases',   defaultOn: true,  render: (r, { fmtN }) => fmtN(r.count_order_paid) },
  { id: 'cancelled',   label: 'Cancelled',     group: 'purchases', groupLabel: 'Purchases',   defaultOn: true,  render: (r) => r.count_order_cancelled > 0 ? String(r.count_order_cancelled) : '—' },
  { id: 'order_rev',   label: 'Purchase Rev.', group: 'purchases', groupLabel: 'Purchases',   defaultOn: true,  render: (r, { fmtRpShort }) => fmtRpShort(r.sum_order_paid_revenue) },
  { id: 'first_order', label: 'First Order',   group: 'purchases', groupLabel: 'Purchases',   defaultOn: false, render: (r, { fmtDate }) => fmtDate(r.date_first_order_paid) },
  { id: 'last_order',  label: 'Last Order',    group: 'purchases', groupLabel: 'Purchases',   defaultOn: true,  render: (r, { fmtDate }) => fmtDate(r.date_last_order_paid) },
  { id: 'ch_first',    label: 'First Channel', group: 'purchases', groupLabel: 'Purchases',   defaultOn: false, align: 'left', render: (r) => r.first_order_paid_sales_channel ?? '—' },
  { id: 'ch_last',     label: 'Sales Ch.',     group: 'purchases', groupLabel: 'Purchases',   defaultOn: true,  align: 'left', render: (r) => r.last_order_paid_sales_channel ?? '—' },
  // Check-ins
  { id: 'checkins',    label: 'Check-ins',     group: 'checkins',  groupLabel: 'Check-ins',   defaultOn: true,  render: (r, { fmtN }) => r.count_product_check_in > 0 ? fmtN(r.count_product_check_in) : '—' },
  { id: 'checkin_rev', label: 'Check-in Rev.', group: 'checkins',  groupLabel: 'Check-ins',   defaultOn: true,  render: (r, { fmtRpShort }) => r.sum_product_check_in_revenue > 0 ? fmtRpShort(r.sum_product_check_in_revenue) : '—' },
  { id: 'first_ci',   label: 'First Check-in', group: 'checkins', groupLabel: 'Check-ins',   defaultOn: false, render: (r, { fmtDate }) => fmtDate(r.date_first_product_check_in) },
  { id: 'last_ci',    label: 'Last Check-in',  group: 'checkins', groupLabel: 'Check-ins',   defaultOn: false, render: (r, { fmtDate }) => fmtDate(r.date_last_product_check_in) },
  { id: 'inactive',   label: 'Days Inactive',  group: 'checkins', groupLabel: 'Check-ins',   defaultOn: true,  render: (r) => r.days_since_last != null ? `${Math.round(r.days_since_last)}d` : '—' },
  // Identity (KTP)
  { id: 'name',        label: 'Name',          group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'left',   render: (r) => r.name ?? '—' },
  { id: 'gender',      label: 'Gender',        group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'center', render: (r) => r.display_gender ?? '—' },
  { id: 'province',    label: 'Province',      group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'left',   render: (r) => r.loc_province ?? '—' },
  { id: 'city',        label: 'City',          group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'left',   render: (r) => r.loc_city ?? '—' },
  { id: 'dob',         label: 'Date of Birth', group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'center', render: (r) => r.date_of_birth ?? '—' },
  { id: 'age',         label: 'Age',           group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'center', render: (r) => r.age != null ? String(r.age) : '—' },
  { id: 'agama',       label: 'Agama',         group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'left',   render: (r) => r.agama ?? '—' },
  { id: 'pekerjaan',   label: 'Pekerjaan',     group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'left',   render: (r) => r.pekerjaan ?? '—' },
  { id: 'community',   label: 'Community',     group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'center', render: (r) => r.joined_community
      ? <span style={{ color: '#34d399', fontWeight: 700 }}>✓</span>
      : <span style={{ color: '#f87171', fontWeight: 700 }}>✗</span> },
  { id: 'data_tier',   label: 'Data Tier',     group: 'identity',  groupLabel: 'Identity',    defaultOn: false, align: 'center', render: (r) => r.top_tier != null ? `T${r.top_tier}` : '—' },
  // Products
  { id: 'first_sku',   label: 'First SKU',     group: 'products',  groupLabel: 'Products',    defaultOn: false, align: 'left',   render: (r) => r.first_purchased_sku_name ?? r.first_purchased_sku ?? '—' },
  { id: 'last_sku',    label: 'Last SKU',      group: 'products',  groupLabel: 'Products',    defaultOn: false, align: 'left',   render: (r) => r.last_purchased_sku_name ?? r.last_purchased_sku ?? '—' },
  { id: 'all_skus',    label: 'All SKUs',      group: 'products',  groupLabel: 'Products',    defaultOn: false, align: 'left',   width: 220, render: (r) => r.all_purchased_skus ?? '—' },
  { id: 'sku_count',   label: 'Distinct SKUs', group: 'products',  groupLabel: 'Products',    defaultOn: false, render: (r) => r.distinct_sku_count != null ? String(r.distinct_sku_count) : '—' },
]

const DEFAULT_COLS = ALL_COLS.filter(c => c.defaultOn).map(c => c.id)
const GROUPS: { id: ColGroup; label: string; color: string }[] = [
  { id: 'segment',   label: 'Segments',  color: 'rgba(167,139,250,0.7)' },
  { id: 'purchases', label: 'Purchases', color: 'rgba(96,165,250,0.7)'  },
  { id: 'checkins',  label: 'Check-ins', color: 'rgba(52,211,153,0.7)'  },
  { id: 'identity',  label: 'Identity',  color: 'rgba(251,191,36,0.7)'  },
  { id: 'products',  label: 'Products',  color: 'rgba(251,146,60,0.7)'  },
]

// ── Colours ───────────────────────────────────────────────────────────────────
const ACTIVITY_COLORS: Record<string, { color: string; bg: string }> = {
  'New':         { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  'Active':      { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Loyal':       { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  'Churn Risk':  { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  'New Churned': { color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
  'Old Churned': { color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
}
const LTV_COLORS: Record<string, { color: string; bg: string }> = {
  'Starter':      { color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  'Growing':      { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  'Approaching':  { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  'Achieved':     { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Overachiever': { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
}
const ACTIVITY_ORDER = ['New', 'Active', 'Loyal', 'Churn Risk', 'New Churned', 'Old Churned']
const LTV_ORDER      = ['Starter', 'Growing', 'Approaching', 'Achieved', 'Overachiever']

// ── Demographics colours & orders ─────────────────────────────────────────────
const GENDER_COLORS: Record<string, { color: string; bg: string }> = {
  'Laki-laki': { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Perempuan':  { color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  'Unknown':    { color: '#475569', bg: 'rgba(71,85,105,0.15)'   },
}
const TIER_COLORS: Record<string, { color: string; bg: string }> = {
  'T1':      { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  'T2':      { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'T3':      { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  'T4':      { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  'T5':      { color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  'No Data': { color: '#475569', bg: 'rgba(71,85,105,0.15)'   },
}
const AGE_COLORS: Record<string, { color: string; bg: string }> = {
  '< 25':   { color: '#c4b5fd', bg: 'rgba(196,181,253,0.15)' },
  '25-34':  { color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
  '35-44':  { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  '45-54':  { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  '55+':    { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  'Unknown':{ color: '#475569', bg: 'rgba(71,85,105,0.15)'   },
}
const COMMUNITY_COLORS: Record<string, { color: string; bg: string }> = {
  'Member':     { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  'Non-Member': { color: '#475569', bg: 'rgba(71,85,105,0.15)'  },
}
const BEHAVIOR_COLORS: Record<string, { color: string; bg: string }> = {
  'Purchase Only': { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Check-in Only': { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  'Both':          { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
}
const PRODUCT_COLORS: Record<string, { color: string; bg: string }> = {
  'Metafiber':       { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Superfood':       { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  'Multigrain':      { color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
  'Nightsure':       { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  '3Peptide':        { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)'  },
  'Gimmick Only':    { color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
  'Check-in Only':   { color: '#2dd4bf', bg: 'rgba(45,212,191,0.15)' },
}
const SALES_CHANNEL_COLORS: Record<string, { color: string; bg: string }> = {
  'Chatcommerce':   { color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  'Marketplace':    { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  'Check In Only':  { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
}
const TIER_ORDER     = ['T1', 'T2', 'T3', 'T4', 'T5', 'No Data']
const AGE_ORDER      = ['< 25', '25-34', '35-44', '45-54', '55+', 'Unknown']
const BEHAVIOR_ORDER = ['Purchase Only', 'Check-in Only', 'Both']
const PRODUCT_ORDER  = ['Metafiber', 'Superfood', 'Nightsure', '3Peptide', 'Gimmick Only', 'Check-in Only']

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(n: number) { return n.toLocaleString('id-ID') }
function fmtRpShort(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}K`
  return fmtRp(Math.round(n))
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10)
}

function Badge({ label, map }: { label: string; map: Record<string, { color: string; bg: string }> }) {
  const { color, bg } = map[label] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
      background: bg, color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Segment summary card ──────────────────────────────────────────────────────
function SegmentCard({ title, subtitle, rows, colorMap, order, total, flexWeight = 1 }: {
  title: string; subtitle: string
  rows: SegmentRow[]; colorMap: Record<string, { color: string; bg: string }>
  order: string[]; total: number
  flexWeight?: number
}) {
  const sorted = [...rows].sort((a, b) => order.indexOf(a.segment_name) - order.indexOf(b.segment_name))
  const thStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'rgba(255,255,255,0.28)',
    padding: '0 0 8px 0', whiteSpace: 'nowrap',
  }
  return (
    <div style={{
      flex: flexWeight, minWidth: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{subtitle}</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>{fmtN(total)}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>customers total</span>
        </div>
      </div>
      <div style={{ padding: '4px 14px 12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 260 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', paddingTop: 12 }}>Segment</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingTop: 12 }}>Avg. Tx</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingTop: 12 }}>Inactive</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingTop: 12 }}>Avg. LTV</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingTop: 12 }}>Count</th>
              <th style={{ ...thStyle, textAlign: 'right', paddingTop: 12 }}>%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const { color, bg } = colorMap[row.segment_name] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
              const barPct = total > 0 ? (row.customer_count / total) * 100 : 0
              const tdStyle: React.CSSProperties = {
                fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)',
                fontVariantNumeric: 'tabular-nums', padding: '7px 0 3px 0',
                verticalAlign: 'bottom', whiteSpace: 'nowrap',
              }
              return (
                <React.Fragment key={row.segment_name}>
                  <tr key={row.segment_name + '-d'}>
                    <td style={{ ...tdStyle, textAlign: 'left', paddingRight: 10 }}>
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', background: bg, color, whiteSpace: 'nowrap' }}>
                        {row.segment_name}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingLeft: 10 }}>{row.avg_transactions}×</td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingLeft: 10 }}>{row.avg_days_inactive}d</td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingLeft: 10 }}>{fmtRpShort(row.avg_revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingLeft: 10 }}>{fmtN(row.customer_count)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingLeft: 8, color: 'rgba(255,255,255,0.35)' }}>
                      {((row.customer_count / total) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr key={row.segment_name + '-b'}>
                    <td colSpan={6} style={{ padding: '0 0 6px 0' }}>
                      <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Demo segment card (compact) ───────────────────────────────────────────────
function DemoCard({ title, rows, colorMap, order, descriptions, note, collapsedCount, flexWeight = 1 }: {
  title: string
  rows: DemoRow[]
  colorMap: Record<string, { color: string; bg: string }>
  order?: string[]
  descriptions?: Record<string, string>
  note?: string
  collapsedCount?: number
  flexWeight?: number
}) {
  const [expanded, setExpanded] = useState(false)

  const sorted = order
    ? [...rows].sort((a, b) => order.indexOf(a.segment_name) - order.indexOf(b.segment_name))
    : [...rows].sort((a, b) => b.customer_count - a.customer_count)
  const total    = sorted.reduce((s, r) => s + r.customer_count, 0)

  const visible   = collapsedCount && !expanded ? sorted.slice(0, collapsedCount) : sorted
  const hiddenCount = sorted.length - (collapsedCount ?? sorted.length)

  const renderRow = (row: DemoRow) => {
    const { color, bg } = colorMap[row.segment_name] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
    const barPct   = total > 0 ? (row.customer_count / total) * 100 : 0
    const sharePct = total > 0 ? ((row.customer_count / total) * 100).toFixed(1) : '0.0'
    const desc     = descriptions?.[row.segment_name]
    return (
      <div key={row.segment_name}>
        {/* Badge + count row — always single line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', padding: '1px 6px', borderRadius: 3,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
            background: bg, color, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{row.segment_name}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {fmtN(row.customer_count)}
          </span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {sharePct}%
          </span>
        </div>
        {/* Description below badge row */}
        {desc && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2, lineHeight: 1.3, paddingLeft: 1 }}>{desc}</div>
        )}
        {/* Progress bar */}
        <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 4, marginBottom: 2 }}>
          <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 0.4s ease' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '12px 14px',
      flex: flexWeight, minWidth: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {title}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', marginBottom: 8 }}>
        {fmtN(total)}
        <span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>customers</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {visible.map(renderRow)}
      </div>
      {collapsedCount && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '4px 0',
            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
        >
          <span>{expanded ? '▴ Show less' : `▾ Show ${hiddenCount} more`}</span>
        </button>
      )}
      {note && (
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 10, lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
          {note}
        </div>
      )}
    </div>
  )
}

// ── Customer table ────────────────────────────────────────────────────────────
const PAGE_SIZE = 100


const PROVINCES = [
  'Aceh','Bali','Banten','Bengkulu','DI Yogyakarta','DKI Jakarta',
  'Gorontalo','Jambi','Jawa Barat','Jawa Tengah','Jawa Timur',
  'Kalimantan Barat','Kalimantan Selatan','Kalimantan Tengah','Kalimantan Timur','Kalimantan Utara',
  'Kepulauan Bangka Belitung','Kepulauan Riau','Lampung','Maluku','Maluku Utara',
  'Nusa Tenggara Barat','Nusa Tenggara Timur','Papua','Papua Barat','Papua Barat Daya',
  'Papua Pegunungan','Papua Selatan','Papua Tengah',
  'Riau','Sulawesi Barat','Sulawesi Selatan','Sulawesi Tengah','Sulawesi Tenggara','Sulawesi Utara',
  'Sumatera Barat','Sumatera Selatan','Sumatera Utara',
]

const AGE_GROUPS = [
  { value: 'under_25',  label: '< 25' },
  { value: '25_34',     label: '25–34' },
  { value: '35_44',     label: '35–44' },
  { value: '45_54',     label: '45–54' },
  { value: '55_plus',   label: '55+' },
  { value: 'unknown',   label: 'Unknown' },
]

// ── Shared Picker style ───────────────────────────────────────────────────────
const SELECT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7, color: '#e0e2e6',
  fontSize: 12, padding: '5px 28px 5px 10px',
  outline: 'none', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none',
}

function Picker({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={SELECT_STYLE}>
        {children}
      </select>
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>▾</span>
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  segment, setSegment,
  ltvSegment, setLtvSegment,
  gender, setGender,
  province, setProvince,
  community, setCommunity,
  ageGroup, setAgeGroup,
  behavior, setBehavior,
  dataTier, setDataTier,
  product, setProduct,
}: {
  segment: string; setSegment: (v: string) => void
  ltvSegment: string; setLtvSegment: (v: string) => void
  gender: string; setGender: (v: string) => void
  province: string; setProvince: (v: string) => void
  community: string; setCommunity: (v: string) => void
  ageGroup: string; setAgeGroup: (v: string) => void
  behavior: string; setBehavior: (v: string) => void
  dataTier: string; setDataTier: (v: string) => void
  product: string; setProduct: (v: string) => void
}) {
  const segmentActive  = segment !== 'all' || ltvSegment !== 'all'
  const identityActive = gender !== 'all' || province !== 'all' || community !== 'all' || ageGroup !== 'all'
  const profileActive  = behavior !== 'all' || dataTier !== 'all' || product !== 'all'
  const anyActive      = segmentActive || identityActive || profileActive

  function clearSegment()  { setSegment('all'); setLtvSegment('all') }
  function clearIdentity() { setGender('all'); setProvince('all'); setCommunity('all'); setAgeGroup('all') }
  function clearProfile()  { setBehavior('all'); setDataTier('all'); setProduct('all') }
  function clearAll()      { clearSegment(); clearIdentity(); clearProfile() }

  const groupLabel = (label: string, active: boolean) => (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
      whiteSpace: 'nowrap', alignSelf: 'center',
    }}>{label}</span>
  )

  const clearBtn = (onClick: () => void, label = 'Clear') => (
    <button onClick={onClick} style={{
      background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)',
      borderRadius: 5, color: '#fb923c', fontSize: 10, padding: '3px 8px',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  const divider = (
    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.07)', margin: '0 6px' }} />
  )

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '10px 16px',
      marginBottom: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Top row: label + clear all */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)' }}>
          Filters
        </span>
        {anyActive && (
          <button onClick={clearAll} style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 5, color: '#f87171', fontSize: 10, padding: '3px 10px',
            cursor: 'pointer',
          }}>✕ Clear all</button>
        )}
      </div>

      {/* Filter rows */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Segment group */}
        {groupLabel('Segment', segmentActive)}
        <Picker value={segment} onChange={setSegment}>
          <option value="all">All Activity</option>
          {ACTIVITY_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </Picker>
        <Picker value={ltvSegment} onChange={setLtvSegment}>
          <option value="all">All LTV</option>
          {LTV_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
        </Picker>
        {segmentActive && clearBtn(clearSegment)}

        {divider}

        {/* Identity group */}
        {groupLabel('Identity', identityActive)}
        <Picker value={gender} onChange={setGender}>
          <option value="all">All Genders</option>
          <option value="Laki-laki">Laki-laki</option>
          <option value="Perempuan">Perempuan</option>
          <option value="unknown">Unknown</option>
        </Picker>
        <Picker value={province} onChange={setProvince}>
          <option value="all">All Provinces</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          <option value="unknown">Unknown</option>
        </Picker>
        <Picker value={community} onChange={setCommunity}>
          <option value="all">All Members</option>
          <option value="1">Community ✓</option>
          <option value="0">Non-Community</option>
        </Picker>
        <Picker value={ageGroup} onChange={setAgeGroup}>
          <option value="all">All Ages</option>
          {AGE_GROUPS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </Picker>
        {identityActive && clearBtn(clearIdentity)}

        {divider}

        {/* Profile group */}
        {groupLabel('Profile', profileActive)}
        <Picker value={behavior} onChange={setBehavior}>
          <option value="all">All Behaviors</option>
          <option value="purchase_only">Purchase Only</option>
          <option value="checkin_only">Check-in Only</option>
          <option value="both">Both</option>
        </Picker>
        <Picker value={dataTier} onChange={setDataTier}>
          <option value="all">All Tiers</option>
          {TIER_ORDER.filter(t => t !== 'No Data').map(t => (
            <option key={t} value={t.replace('T', '')}>{t}</option>
          ))}
          <option value="none">No Data</option>
        </Picker>
        <Picker value={product} onChange={setProduct}>
          <option value="all">All Products</option>
          <option value="Metafiber">Metafiber</option>
          <option value="Superfood">Superfood</option>
          <option value="Nightsure">Nightsure</option>
          <option value="3Peptide">3Peptide</option>
        </Picker>
        {profileActive && clearBtn(clearProfile)}
      </div>
    </div>
  )
}

function CustomerTable({
  segData,
  segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product,
}: {
  segData: SegmentRow[] | undefined
  segment: string; ltvSegment: string
  gender: string; province: string; community: string; ageGroup: string
  behavior: string; dataTier: string; product: string
}) {
  const [page, setPage]                 = useState(0)
  const [selectedCols, setSelectedCols] = useState<string[]>(DEFAULT_COLS)
  const [colPanelOpen, setColPanelOpen] = useState(false)
  const dragItemRef = React.useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Reset to page 0 whenever any filter changes
  React.useEffect(() => { setPage(0) }, [
    segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product,
  ])

  const offset = page * PAGE_SIZE
  // visibleCols respects selectedCols ORDER — crucial for drag reorder
  const visibleCols = selectedCols
    .map(id => ALL_COLS.find(c => c.id === id))
    .filter((c): c is ColDef => c !== undefined)

  const moveColumn = (id: string, dir: -1 | 1) => {
    setSelectedCols(prev => {
      const idx = prev.indexOf(id)
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]; [next[idx], next[newIdx]] = [next[newIdx], next[idx]]; return next
    })
  }
  const handleDragStart = (id: string) => { dragItemRef.current = id }
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id) }
  const handleDragLeave = () => { setDragOverId(null) }
  const handleDrop = (targetId: string) => {
    const srcId = dragItemRef.current
    if (!srcId || srcId === targetId) { setDragOverId(null); return }
    setSelectedCols(prev => {
      const next = prev.filter(id => id !== srcId)
      const targetIdx = next.indexOf(targetId)
      next.splice(targetIdx, 0, srcId)
      return next
    })
    dragItemRef.current = null; setDragOverId(null)
  }
  const handleDragEnd = () => { dragItemRef.current = null; setDragOverId(null) }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cdp-customers', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product,
        limit: String(PAGE_SIZE), offset: String(offset),
        _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-columns?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      return res.json() as Promise<{ data: CustomerRow[]; meta: { rowCount: number } }>
    },
    staleTime: 5 * 60_000,
    placeholderData: prev => prev,
  })

  const rows = data?.data ?? []
  const hasMore = rows.length === PAGE_SIZE

  // Cross-segment count — only needed when BOTH filters are active
  const bothActive = segment !== 'all' && ltvSegment !== 'all'
  const { data: countData, isFetching: countFetching } = useQuery({
    queryKey: ['cdp-count', segment, ltvSegment],
    queryFn: async () => {
      const res = await fetch(
        `${CDP_WORKER}/v3/data/customer-segment-count?segment=${encodeURIComponent(segment)}&ltv_segment=${encodeURIComponent(ltvSegment)}`
      )
      if (!res.ok) throw new Error('count fetch failed')
      const json = await res.json() as { data: { total_count: number }[] }
      return json.data[0]?.total_count ?? null
    },
    enabled: bothActive,
    staleTime: 5 * 60_000,
  })

  // Derive known total from segment summary cards (no extra fetch needed)
  const knownTotal = (() => {
    if (!segData) return null
    const actSeg  = segment    !== 'all' ? segData.find(r => r.segment_type === 'activity' && r.segment_name === segment) : null
    const ltvSeg  = ltvSegment !== 'all' ? segData.find(r => r.segment_type === 'ltv'      && r.segment_name === ltvSegment) : null
    // Both filters active — can't cross-reference from summary alone
    if (actSeg && ltvSeg) return null
    if (actSeg)  return actSeg.customer_count
    if (ltvSeg)  return ltvSeg.customer_count
    // No filter — sum activity totals (= total base)
    return segData.filter(r => r.segment_type === 'activity').reduce((s, r) => s + r.customer_count, 0)
  })()

  const identityFiltered = gender !== 'all' || province !== 'all' || community !== 'all' || ageGroup !== 'all'

  const thStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'rgba(255,255,255,0.28)',
    padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: '#0e0f13',
  }
  const tdStyle: React.CSSProperties = {
    fontSize: 12, fontVariantNumeric: 'tabular-nums',
    color: 'rgba(255,255,255,0.65)',
    padding: '9px 12px', textAlign: 'right',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, overflow: 'hidden',
      marginTop: 20,
    }}>
      {/* Title row */}
      <div style={{
        padding: '12px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Customer List</span>
          {!isLoading && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Showing <span style={{ color: '#e0e2e6', fontWeight: 600 }}>{fmtN(rows.length)}</span> rows
              {!identityFiltered && (bothActive
                ? countFetching
                  ? <> · <span style={{ color: 'rgba(255,255,255,0.25)' }}>counting…</span></>
                  : countData !== null && countData !== undefined
                  ? <> · <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{fmtN(countData)}</span> total in segment</>
                  : null
                : knownTotal !== null
                ? <> · <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{fmtN(knownTotal)}</span> total in segment</>
                : null
              )}
            </span>
          )}
        </div>
        {isFetching && !isLoading && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Refreshing…</span>
        )}
      </div>

      {/* Column selector panel */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setColPanelOpen(o => !o)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8,
            color: 'rgba(255,255,255,0.4)', fontSize: 11,
          }}
        >
          <span style={{ fontSize: 10 }}>{colPanelOpen ? '▾' : '▸'}</span>
          <span>Columns</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span style={{ color: '#e0e2e6' }}>{visibleCols.length}</span>
          <span>of {ALL_COLS.length} selected</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={e => { e.stopPropagation(); setSelectedCols(DEFAULT_COLS) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 10, padding: '2px 6px' }}
          >Reset</button>
        </button>

        {colPanelOpen && (
          <div style={{ padding: '4px 20px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* Left: Group toggles */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', flex: '1 1 auto' }}>
              {GROUPS.map(g => (
                <div key={g.id} style={{ minWidth: 130 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: g.color, marginBottom: 6 }}>
                    {g.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {ALL_COLS.filter(c => c.group === g.id).map(c => {
                      const on = selectedCols.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCols(prev =>
                            on ? prev.filter(id => id !== c.id) : [...prev, c.id]
                          )}
                          style={{
                            background: on ? `${g.color.replace('0.7)', '0.12)')}` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${on ? g.color.replace('0.7)', '0.3)') : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 5, padding: '3px 10px',
                            color: on ? '#e0e2e6' : 'rgba(255,255,255,0.35)',
                            fontSize: 11, cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.1s',
                          }}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Column order (drag to reorder) */}
            <div style={{ minWidth: 200, maxWidth: 260, flex: '0 0 auto' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                Column Order
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleCols.map((c, idx) => {
                  const grp = GROUPS.find(g => g.id === c.group)
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => handleDragStart(c.id)}
                      onDragOver={e => handleDragOver(e, c.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(c.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', borderRadius: 5,
                        background: 'rgba(255,255,255,0.04)',
                        borderTop: dragOverId === c.id ? '2px solid #818cf8' : '2px solid transparent',
                        cursor: 'grab', userSelect: 'none',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, cursor: 'grab' }}>⠿</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', minWidth: 14, textAlign: 'right' }}>{idx + 1}</span>
                      <span style={{ flex: 1, fontSize: 11, color: grp?.color ?? '#e0e2e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </span>
                      <button
                        onClick={() => moveColumn(c.id, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      >↑</button>
                      <button
                        onClick={() => moveColumn(c.id, 1)}
                        disabled={idx === visibleCols.length - 1}
                        title="Move down"
                        style={{ background: 'none', border: 'none', cursor: idx === visibleCols.length - 1 ? 'default' : 'pointer', color: idx === visibleCols.length - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                      >↓</button>
                      <button
                        onClick={() => setSelectedCols(prev => prev.filter(id => id !== c.id))}
                        title="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
                      >×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: Math.max(600, visibleCols.length * 110 + 260) }}>
          <thead>
            {/* Column headers — flat, no grouping */}
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 20, width: 36 }}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>Phone / Name</th>
              {visibleCols.map((c) => (
                <th key={c.id} style={{
                  ...thStyle,
                  textAlign: c.align ?? 'right',
                  ...(c.width ? { width: c.width } : {}),
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                    Loading…
                  </td>
                </tr>
              )
              : rows.length === 0
              ? (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
                    No customers found
                  </td>
                </tr>
              )
              : rows.map((row, i) => {
                const renderFns: RenderFns = { fmtRpShort, fmtN, fmtDate, Badge }
                return (
                  <tr key={String(row.phone_number) + i} style={{ transition: 'background 0.08s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: 20, color: 'rgba(255,255,255,0.2)', width: 36 }}>
                      {offset + i + 1}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', color: '#e0e2e6', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                      {String(row.phone_number)}
                      {(row.name) && (
                        <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500, marginTop: 1 }}>
                          {row.name}
                          {row.display_gender && (
                            <span style={{ marginLeft: 5, fontSize: 9, color: row.display_gender === 'Perempuan' ? 'rgba(248,113,113,0.7)' : 'rgba(96,165,250,0.7)' }}>
                              {row.display_gender === 'Perempuan' ? '♀' : '♂'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.id} style={{
                        ...tdStyle,
                        textAlign: c.align ?? 'right',
                        ...(c.width ? { maxWidth: c.width, overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
                      }}>
                        {c.render(row, renderFns)}
                      </td>
                    ))}
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>


      {/* Pagination */}
      <div style={{
        padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Showing {offset + 1}–{offset + rows.length}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: page === 0 ? 'rgba(255,255,255,0.2)' : '#e0e2e6',
              fontSize: 12, padding: '5px 14px', cursor: page === 0 ? 'default' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '5px 8px' }}>
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: !hasMore ? 'rgba(255,255,255,0.2)' : '#e0e2e6',
              fontSize: 12, padding: '5px 14px', cursor: !hasMore ? 'default' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function CrmPrototypePage() {
  // ── Filter state (lifted so FilterBar + CustomerTable share it) ──────────────
  const [segment,    setSegment]    = useState('all')
  const [ltvSegment, setLtvSegment] = useState('all')
  const [gender,     setGender]     = useState('all')
  const [province,   setProvince]   = useState('all')
  const [community,  setCommunity]  = useState('all')
  const [ageGroup,   setAgeGroup]   = useState('all')
  const [behavior,   setBehavior]   = useState('all')
  const [dataTier,   setDataTier]   = useState('all')
  const [product,    setProduct]    = useState('all')

  const { data: segData, isLoading: segLoading, isError: segError } = useQuery({
    queryKey: ['cdp-segments-filtered', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product, _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-segments-summary-filtered?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json() as { data: SegmentRow[] }
      return json.data
    },
    staleTime: 2 * 60_000,
    placeholderData: prev => prev,
  })

  const { data: demoCore, isLoading: demoCoreLoading } = useQuery({
    queryKey: ['cdp-demographics-filtered', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product, _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-demographics-summary-filtered?${params}`)
      if (!res.ok) throw new Error('demographics fetch failed')
      const json = await res.json() as { data: DemoRow[] }
      return json.data
    },
    staleTime: 2 * 60_000,
    placeholderData: prev => prev,
    retry: false,
  })

  const { data: demoProvince } = useQuery({
    queryKey: ['cdp-province-filtered', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product, _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-province-summary-filtered?${params}`)
      if (!res.ok) throw new Error('province fetch failed')
      const json = await res.json() as { data: DemoRow[] }
      return json.data
    },
    staleTime: 2 * 60_000,
    placeholderData: prev => prev,
    retry: false,
  })

  const { data: demoProduct } = useQuery({
    queryKey: ['cdp-product-filtered', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product, _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-product-summary-filtered?${params}`)
      if (!res.ok) throw new Error('product fetch failed')
      const json = await res.json() as { data: DemoRow[] }
      return json.data
    },
    staleTime: 2 * 60_000,
    placeholderData: prev => prev,
    retry: false,
  })

  const { data: demoSalesChannel } = useQuery({
    queryKey: ['cdp-sales-channel-filtered', segment, ltvSegment, gender, province, community, ageGroup, behavior, dataTier, product],
    queryFn: async () => {
      const params = new URLSearchParams({
        segment, ltv_segment: ltvSegment,
        gender, province, joined_community: community, age_group: ageGroup,
        behavior, data_tier: dataTier, product, _r: '1',
      })
      const res = await fetch(`${CDP_WORKER}/v3/data/customer-sales-channel-summary-filtered?${params}`)
      if (!res.ok) throw new Error('sales channel fetch failed')
      const json = await res.json() as { data: DemoRow[] }
      return json.data.map(r => ({
        ...r,
        segment_name: r.segment_name === 'B2C' ? 'Chatcommerce' : r.segment_name,
      }))
    },
    staleTime: 2 * 60_000,
    placeholderData: prev => prev,
    retry: false,
  })

  // Merge all contracts into one array — same shape DemoCard expects
  const demoLoading = demoCoreLoading
  const demoData = (demoCore || demoProvince || demoProduct || demoSalesChannel)
    ? [
        ...(demoCore         ?? []),
        ...(demoProvince     ?? []),
        ...(demoProduct      ?? []),
        ...(demoSalesChannel ?? []),
      ]
    : null


  const activityRows  = segData?.filter(r => r.segment_type === 'activity') ?? []
  const ltvRows       = segData?.filter(r => r.segment_type === 'ltv') ?? []
  const activityTotal = activityRows.reduce((s, r) => s + r.customer_count, 0)
  const ltvTotal      = ltvRows.reduce((s, r) => s + r.customer_count, 0)

  // Split demographics data by dimension
  const demoBy = (dim: string) => demoData?.filter(r => r.dimension === dim) ?? []

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0e12',
      padding: '32px 32px 80px',
      fontFamily: 'Inter, system-ui, sans-serif', color: '#ffffff',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399aa' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#34d399', textTransform: 'uppercase' }}>
          CRM Prototype
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 4 }}>MNC B2C · CDP Worker</span>
      </div>

      {/* Filters — above the cards */}
      <FilterBar
        segment={segment}       setSegment={setSegment}
        ltvSegment={ltvSegment} setLtvSegment={setLtvSegment}
        gender={gender}         setGender={setGender}
        province={province}     setProvince={setProvince}
        community={community}   setCommunity={setCommunity}
        ageGroup={ageGroup}     setAgeGroup={setAgeGroup}
        behavior={behavior}     setBehavior={setBehavior}
        dataTier={dataTier}     setDataTier={setDataTier}
        product={product}       setProduct={setProduct}
      />

      {/* Row 1: Activity | LTV | Age Group | Province */}
      {(segLoading || demoLoading) && <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, padding: '20px 0' }}>Loading…</div>}
      {segError && <div style={{ color: '#f87171', fontSize: 12, padding: '20px 0' }}>Failed to load segment data</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {segData && (
          <>
            <SegmentCard title="By Activity" subtitle="Based on recency of last purchase or check-in"
              rows={activityRows} colorMap={ACTIVITY_COLORS} order={ACTIVITY_ORDER} total={activityTotal} flexWeight={5} />
            <SegmentCard title="By LTV" subtitle="Based on lifetime transaction value vs target"
              rows={ltvRows} colorMap={LTV_COLORS} order={LTV_ORDER} total={ltvTotal} flexWeight={5} />
          </>
        )}
        {demoData && (
          <>
            <DemoCard title="Age Group" rows={demoBy('age_group')} colorMap={AGE_COLORS} order={AGE_ORDER} flexWeight={2} />
            <DemoCard title="Province"  rows={demoBy('province')}  colorMap={{}} collapsedCount={5} flexWeight={2} />
          </>
        )}
      </div>

      {/* Row 2: Gender | Community | Behavior | Products | Data Tier */}
      {demoData && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, marginBottom: 4, alignItems: 'stretch' }}>
          <DemoCard title="Gender"    rows={demoBy('gender')}    colorMap={GENDER_COLORS} />
          <DemoCard title="Community" rows={demoBy('community')} colorMap={COMMUNITY_COLORS} />
          <DemoCard title="Behavior"  rows={demoBy('behavior')}  colorMap={BEHAVIOR_COLORS}  order={BEHAVIOR_ORDER} />
          <DemoCard title="Products"     rows={demoBy('product')}       colorMap={PRODUCT_COLORS}       order={PRODUCT_ORDER}
            note="Counts unique customers per product line (orders + check-ins). One customer can appear in multiple lines. ~194 gimmick-only customers (GM- items, no supplement) are excluded." />
          <DemoCard title="Sales Channel" rows={demoBy('sales_channel')} colorMap={SALES_CHANNEL_COLORS} />
          <DemoCard title="Data Tier"    rows={demoBy('data_tier')}      colorMap={TIER_COLORS}          order={TIER_ORDER}
            descriptions={{
              'T1': 'Community form submission',
              'T2': 'Loyalty check-in (product scan)',
              'T3': 'OMS Chatcommerce order',
              'T4': 'OMS Marketplace order',
              'T5': 'BSP contact only (no order)',
              'No Data': 'No KTP record found',
            }} />
        </div>
      )}

      {/* Customer table */}
      <CustomerTable
        segData={segData}
        segment={segment}       ltvSegment={ltvSegment}
        gender={gender}         province={province}
        community={community}   ageGroup={ageGroup}
        behavior={behavior}     dataTier={dataTier}
        product={product}
      />
    </div>
  )
}
