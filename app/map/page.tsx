'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import { QueryFetchPolicy } from 'firebase/data-connect'
import FloorPlanCanvas, { CATEGORIES, FLOORPLAN_CANVAS_SIZE, MARKER_CONFIGS, MarkerIcon, type CategoryId } from '../components/FloorPlanCanvas'
import { dataConnect } from '../../src/lib/firebase'
import { getAllFloorPlans } from '../../src/dataconnect-generated'

const CUT_CORNER_SIZE = 22
const PANEL_BORDER_WIDTH = 3

function hexClip(cut: number) {
  return `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`
}

function StudentHexPanel({
  children,
  fill = 'var(--fp-surface-primary)',
  borderColor = 'var(--fp-panel-border)',
  style,
  contentStyle,
}: {
  children: React.ReactNode
  fill?: string
  borderColor?: string
  style?: React.CSSProperties
  contentStyle?: React.CSSProperties
}) {
  const innerCut = Math.max(0, CUT_CORNER_SIZE - PANEL_BORDER_WIDTH)

  return (
    <div style={{ position: 'relative', overflow: 'visible', ...style }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: hexClip(CUT_CORNER_SIZE),
          background: borderColor,
          boxShadow: '0 0 0 1px var(--fp-panel-glow-1), 0 0 14px var(--fp-panel-glow-2), 0 0 30px var(--fp-panel-glow-2), 0 0 52px var(--fp-panel-glow-3)',
          filter: 'drop-shadow(0 0 8px var(--fp-panel-drop-1)) drop-shadow(0 0 18px var(--fp-panel-drop-2)) drop-shadow(0 0 34px var(--fp-panel-drop-3)) drop-shadow(0 8px 14px rgba(0,0,0,0.45))',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          margin: PANEL_BORDER_WIDTH,
          clipPath: hexClip(innerCut),
          background: fill,
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MarkerType = 'entrance' | 'exit' | 'help_desk'

interface ShelfRow {
  cat_id: string
  limit_per_student: number
  orientation: string
  rotation: number
  map_x: number
  map_y: number
  map_w: number
  map_h: number
}

interface MarkerPayload {
  type: MarkerType
  map_x: number
  map_y: number
  map_w: number
  map_h: number
}

interface WallPayload {
  orientation: string
  rotation: number
  map_x: number
  map_y: number
  map_w: number
  map_h: number
}

interface FloorPlanRecord {
  id: string
  name?: string | null
  isDeployed?: boolean | null
  shelves?: unknown | null
  walls?: unknown | null
  markers?: unknown | null
  updatedAt?: string | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [shelves,    setShelves]    = useState<ShelfRow[]>([])
  const [walls,      setWalls]      = useState<WallPayload[]>([])
  const [markers,    setMarkers]    = useState<MarkerPayload[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const canvasSize = FLOORPLAN_CANVAS_SIZE

  // Fetch deployed plan
  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await getAllFloorPlans(
          dataConnect,
          { fetchPolicy: QueryFetchPolicy.SERVER_ONLY }
        )
        if (!active) return

        const deployedPlans = (res.data.floorPlans as FloorPlanRecord[])
          .filter(plan => plan.isDeployed)
          .sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
            return bTime - aTime
          })

        const plan = deployedPlans[0]
        if (plan) {
          const nextShelves = (plan.shelves as ShelfRow[]) ?? []
          const nextWalls = (plan.walls as WallPayload[]) ?? []
          const nextMarkers = (plan.markers as MarkerPayload[]) ?? []

          setShelves(nextShelves)
          setWalls(nextWalls)
          setMarkers(nextMarkers)
          setError(null)
        } else {
          setShelves([])
          setWalls([])
          setMarkers([])
        }
      } catch (e) {
        if (!active) return
        setError('Could not load the floor plan. Please try again later.')
        console.error(e)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const intervalId = window.setInterval(load, 3000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  const s = canvasSize || 1
  const renderedZones = shelves.map((shelf, index) => ({
    id: `zone-${index}`,
    catId: shelf.cat_id as CategoryId,
    limit: shelf.limit_per_student,
    rotation: shelf.rotation,
    x: shelf.map_x * s,
    y: shelf.map_y * s,
    w: shelf.map_w * s,
    h: shelf.map_h * s,
  }))
  const renderedWalls = walls.map((wall, index) => ({
    id: `wall-${index}`,
    rotation: wall.rotation,
    x: wall.map_x * s,
    y: wall.map_y * s,
    w: wall.map_w * s,
    h: wall.map_h * s,
  }))
  const renderedMarkers = markers.map((marker, index) => ({
    id: `marker-${index}`,
    type: marker.type,
    x: marker.map_x * s,
    y: marker.map_y * s,
    w: marker.map_w * s,
    h: marker.map_h * s,
  }))

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <main
      className="theme-floorplan-admin"
      style={{
        minHeight: '100dvh',
        background: 'var(--fp-page-bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 16px 24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <StudentHexPanel
        style={{ width: 'fit-content', alignSelf: 'center', marginBottom: 16 }}
        contentStyle={{ textAlign: 'center', padding: '14px 22px' }}
      >
        <h1 style={{ color: 'var(--fp-text-primary)', fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 800, margin: '0 0 4px' }}>
          The Hub — Floor Map
        </h1>
        <p style={{ color: 'var(--fp-text-muted)', fontSize: 'clamp(13px, 3vw, 15px)', margin: 0 }}>
          Find what you need before you arrive
        </p>
      </StudentHexPanel>

      {loading && (
        <StudentHexPanel style={{ width: 'fit-content', alignSelf: 'center', marginTop: 24 }} contentStyle={{ textAlign: 'center', color: 'var(--fp-text-muted)', fontSize: 16, fontWeight: 700, padding: '12px 18px' }}>
          Loading floor plan…
        </StudentHexPanel>
      )}
      {error && (
        <StudentHexPanel style={{ width: 'fit-content', alignSelf: 'center', marginTop: 24 }} contentStyle={{ textAlign: 'center', color: 'var(--fp-danger)', fontSize: 15, fontWeight: 700, padding: '12px 18px' }}>
          {error}
        </StudentHexPanel>
      )}
      {!loading && !error && shelves.length === 0 && markers.length === 0 && walls.length === 0 && (
        <StudentHexPanel style={{ width: 'fit-content', alignSelf: 'center', marginTop: 24 }} contentStyle={{ textAlign: 'center', color: 'var(--fp-text-subtle)', fontSize: 15, fontWeight: 600, padding: '12px 18px' }}>
          No floor plan has been published yet. Check back soon!
        </StudentHexPanel>
      )}

      {!loading && !error && (shelves.length > 0 || markers.length > 0 || walls.length > 0) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          width: '100%',
          margin: '0 auto',
        }}>
          <FloorPlanCanvas
            canvasSize={canvasSize}
            zones={renderedZones}
            walls={renderedWalls}
            markers={renderedMarkers}
            style={{ width: canvasSize, height: canvasSize, flexShrink: 0 }}
          />

          {/* Legend — compact horizontal grid below canvas */}
          <StudentHexPanel
            style={{ width: canvasSize }}
            fill="#ffffff"
            contentStyle={{ padding: '18px 22px' }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fp-text-muted)', margin: '0 0 14px' }}>
              Legend
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px' }}>
              {CATEGORIES.map(cat => (
                <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: cat.fill, border: `1.5px solid ${cat.text}55`, flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: cat.text, fontWeight: 600 }}>{cat.label}</span>
                </div>
              ))}
              {(Object.entries(MARKER_CONFIGS) as [MarkerType, typeof MARKER_CONFIGS[MarkerType]][]).map(([type, cfg]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <MarkerIcon type={type} color={cfg.arrowColor} size={20} />
                  <span style={{ fontSize: 16, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 14, borderRadius: 3, backgroundColor: 'rgba(49,69,107,0.88)', border: '1.5px solid #22304b', flexShrink: 0 }} />
                <span style={{ fontSize: 16, color: 'var(--fp-text-secondary)', fontWeight: 600 }}>Wall</span>
              </div>
            </div>
          </StudentHexPanel>
        </div>
      )}
    </main>
  )
}
