/**
 * IndonesiaMap — SVG-based Indonesia map with province heatmap + agent dots.
 * Simple +/- zoom, no drag, optimized for performance.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react'
import { PROVINCES, SVG_W, SVG_H, projectToSvg } from '../../config/indonesiaGeo'

// ── Types ──────────────────────────────────────────────────────────────────
export interface MapAgent {
  code: string
  name: string
  latLng: [number, number]
  rl_total: number
  ledi_total: number
  agdi: number
  revenue: number
  isStarSeller: boolean
  city: string
  province: string
}

export interface IndonesiaMapProps {
  agents: MapAgent[]
  heatData?: Map<string, number>
  height?: number
}

// ── Dot helpers ────────────────────────────────────────────────────────────
const DOT_R = 1.5

/** Red(0) → Yellow(mid) → Green(25M+) continuous gradient based on revenue */
function dotColor(rev: number): string {
  const t = Math.min(rev / 25_000_000, 1) // 0..1, capped at 25M
  // 0.0 = red(220,50,50)  →  0.5 = yellow(240,180,40)  →  1.0 = green(52,211,153)
  let r: number, g: number, b: number
  if (t < 0.5) {
    const s = t / 0.5 // 0..1 within first half
    r = Math.round(220 + (240 - 220) * s)
    g = Math.round(50 + (180 - 50) * s)
    b = Math.round(50 + (40 - 50) * s)
  } else {
    const s = (t - 0.5) / 0.5 // 0..1 within second half
    r = Math.round(240 + (52 - 240) * s)
    g = Math.round(180 + (211 - 180) * s)
    b = Math.round(40 + (153 - 40) * s)
  }
  return `rgb(${r},${g},${b})`
}

function heatColor(value: number, max: number, min: number): string {
  if (max === 0 || value === 0) return 'rgba(255,255,255,0.03)'
  const logMin = Math.log(Math.max(min, 1))
  const logMax = Math.log(max)
  const t = logMax === logMin ? 1 : (Math.log(value) - logMin) / (logMax - logMin)
  // Blue(30,80,200) → Yellow(240,200,40) → Red(220,40,40)
  let r: number, g: number, b: number
  if (t < 0.5) {
    const s = t / 0.5
    r = Math.round(30 + (240 - 30) * s)
    g = Math.round(80 + (200 - 80) * s)
    b = Math.round(200 + (40 - 200) * s)
  } else {
    const s = (t - 0.5) / 0.5
    r = Math.round(240 + (220 - 240) * s)
    g = Math.round(200 + (40 - 200) * s)
    b = Math.round(40 + (40 - 40) * s)
  }
  const opacity = 0.2 + t * 0.55
  return `rgba(${r},${g},${b},${opacity})`
}

// Zoom levels (discrete steps)
const ZOOM_LEVELS = [1, 1.5, 2.2, 3.5]

// ── Component ──────────────────────────────────────────────────────────────
export function IndonesiaMap({ agents, heatData, height = 420 }: IndonesiaMapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; content: React.ReactNode
  } | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [showDots, setShowDots] = useState(true)
  const [showHeat, setShowHeat] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const zoom = ZOOM_LEVELS[zoomIdx]
  const vbW = SVG_W / zoom
  const vbH = SVG_H / zoom
  const vbX = (SVG_W - vbW) / 2 + pan.x
  const vbY = (SVG_H - vbH) / 2 + pan.y

  const zoomIn = useCallback(() => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1)), [])
  const zoomOut = useCallback(() => setZoomIdx(i => Math.max(i - 1, 0)), [])
  const resetView = useCallback(() => { setZoomIdx(0); setPan({ x: 0, y: 0 }) }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    setDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [pan.x, pan.y])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (e.clientX - dragRef.current.startX) / rect.width * (SVG_W / zoom)
    const dy = (e.clientY - dragRef.current.startY) / rect.height * (SVG_H / zoom)
    setPan({ x: dragRef.current.panX - dx, y: dragRef.current.panY - dy })
    setTooltip(null)
  }, [dragging, zoom])

  const onPointerUp = useCallback(() => {
    setDragging(false)
    dragRef.current = null
  }, [])

  const isZoomed = zoomIdx > 0 || pan.x !== 0 || pan.y !== 0

  const { heatMin, heatMax } = useMemo(() => {
    if (!heatData) return { heatMin: 0, heatMax: 0 }
    let min = Infinity, max = 0
    heatData.forEach(v => { if (v > 0 && v < min) min = v; if (v > max) max = v })
    return { heatMin: min === Infinity ? 0 : min, heatMax: max }
  }, [heatData])

  const provinceStats = useMemo(() => {
    const m = new Map<string, { count: number; rl: number }>()
    for (const a of agents) {
      const cur = m.get(a.province) || { count: 0, rl: 0 }
      cur.count++
      cur.rl += a.rl_total
      m.set(a.province, cur)
    }
    return m
  }, [agents])

  const projected = useMemo(() =>
    agents.map(a => {
      const [x, y] = projectToSvg(a.latLng[1], a.latLng[0])
      return { ...a, x, y }
    }).sort((a, b) => a.revenue - b.revenue),
    [agents]
  )

  const fmtNum = (n: number) => n.toLocaleString('id-ID')

  const btnStyle: React.CSSProperties = {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 5, color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', lineHeight: 1,
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', height, borderRadius: 10, overflow: 'hidden',
        background: '#060709', border: '1px solid rgba(255,255,255,0.08)',
        cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { onPointerUp(); setTooltip(null) }}
    >
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        style={{ width: '100%', height: '100%', transition: 'all 0.3s ease' }}
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Province regions */}
        {PROVINCES.map(prov => {
          const heat = heatData?.get(prov.cmsName) ?? 0
          const stats = provinceStats.get(prov.cmsName)
          return (
            <path
              key={prov.code + prov.name}
              d={prov.path}
              fill={heatData && showHeat ? heatColor(heat, heatMax, heatMin) : 'rgba(255,255,255,0.06)'}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={0.5}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                setTooltip({
                  x: e.clientX - rect.left, y: e.clientY - rect.top,
                  content: (
                    <div>
                      <strong>{prov.cmsName}</strong><br />
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{stats?.count ?? 0} agents · {fmtNum(stats?.rl ?? 0)} RL</span>
                      {heatData && heat > 0 && <><br /><span style={{ color: '#818cf8' }}>Page Views: {fmtNum(heat)}</span></>}
                    </div>
                  ),
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}

        {showDots && <>
        {/* Glow — starts at 10M+ revenue, grows with revenue */}
        {projected.filter(a => a.revenue >= 10_000_000).map((a, i) => {
          const excess = Math.min((a.revenue - 10_000_000) / 90_000_000, 1)
          const glowR = DOT_R * (2 + excess * 4)
          const glowO = 0.06 + excess * 0.2
          return (
            <circle key={`g-${i}`} cx={a.x} cy={a.y} r={glowR}
              fill="rgb(52,211,153)" opacity={glowO} />
          )
        })}

        {/* Agent dots */}
        {projected.map((a, i) => (
          <circle
            key={`d-${i}`}
            cx={a.x} cy={a.y}
            r={DOT_R}
            fill={dotColor(a.revenue)}
            opacity={1}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({
                x: e.clientX - rect.left, y: e.clientY - rect.top - 10,
                content: (
                  <div>
                    <strong>{a.name}</strong>{a.isStarSeller && <span style={{ color: '#fbbf24' }}> ⭐</span>}<br />
                    <span style={{ color: '#888' }}>{a.code}</span><br />
                    {a.city}, {a.province}<br />
                    <span style={{ color: '#34d399' }}>Rev: Rp {fmtNum(a.revenue)}</span><br />
                    <span style={{ color: '#818cf8' }}>RL: {fmtNum(a.rl_total)}</span>{' · '}
                    <span style={{ color: '#a78bfa' }}>LEDI: {fmtNum(a.ledi_total)}</span>
                  </div>
                ),
              })
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        </>}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div ref={el => {
          if (!el || !containerRef.current) return
          const cr = containerRef.current.getBoundingClientRect()
          const tr = el.getBoundingClientRect()
          let left = tooltip.x + 12
          let top = tooltip.y - 8
          // Clamp right
          if (left + tr.width > cr.width) left = tooltip.x - tr.width - 12
          // Clamp bottom
          if (top + tr.height > cr.height) top = cr.height - tr.height - 4
          // Clamp left/top
          if (left < 4) left = 4
          if (top < 4) top = 4
          el.style.left = left + 'px'
          el.style.top = top + 'px'
        }} style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 8,
          background: 'rgba(17,17,20,0.95)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6, padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
          color: '#e0e2e6', fontFamily: 'Inter, system-ui, sans-serif',
          pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {tooltip.content}
        </div>
      )}

      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 8, left: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button onClick={zoomIn} disabled={zoomIdx >= ZOOM_LEVELS.length - 1} style={{ ...btnStyle, opacity: zoomIdx >= ZOOM_LEVELS.length - 1 ? 0.3 : 1 }}>+</button>
        <button onClick={zoomOut} disabled={zoomIdx <= 0} style={{ ...btnStyle, opacity: zoomIdx <= 0 ? 0.3 : 1 }}>−</button>
        {isZoomed && (
          <button onClick={resetView} style={{ ...btnStyle, fontSize: 9, fontWeight: 600, marginTop: 2 }}>⟲</button>
        )}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 4, marginTop: 6,
          fontSize: 9, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', userSelect: 'none',
        }}>
          <input type="checkbox" checked={showDots} onChange={e => setShowDots(e.target.checked)}
            style={{ width: 12, height: 12, accentColor: '#34d399', cursor: 'pointer' }} />
          Agents
        </label>
        {heatData && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 9, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', userSelect: 'none',
          }}>
            <input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)}
              style={{ width: 12, height: 12, accentColor: '#818cf8', cursor: 'pointer' }} />
            Page View
          </label>
        )}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 8, right: 12, display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter, sans-serif',
      }}>
        <span>Rp 0</span>
        <span style={{
          width: 60, height: 6, borderRadius: 3, display: 'inline-block',
          background: 'linear-gradient(to right, rgb(220,50,50), rgb(240,180,40), rgb(52,211,153))',
        }} />
        <span>Rp 25M+</span>
      </div>
    </div>
  )
}
