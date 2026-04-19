'use client'

import { useEffect, useState } from 'react'
import { QueryFetchPolicy } from 'firebase/data-connect'
import FloorPlanCanvas, { CATEGORIES, FLOORPLAN_CANVAS_SIZE, MARKER_CONFIGS, MarkerIcon, type CategoryId } from '../components/FloorPlanCanvas'
import HexPanel from '../components/HexPanel'
import LoadingAnimation from '@/components/LoadingAnimation'
import { dataConnect } from '../../src/lib/firebase'
import { getAllFloorPlans } from '../../src/dataconnect-generated'

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
  const [shelves,              setShelves]              = useState<ShelfRow[]>([])
  const [walls,                setWalls]                = useState<WallPayload[]>([])
  const [markers,              setMarkers]              = useState<MarkerPayload[]>([])
  const [loading,              setLoading]              = useState(true)
  const [error,                setError]                = useState<string | null>(null)
  const [highlightedCategory,  setHighlightedCategory]  = useState<CategoryId | null>(null)
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
      <HexPanel
        style={{ width: 'fit-content', alignSelf: 'center', marginBottom: 16 }}
        contentStyle={{ textAlign: 'center', padding: '14px 22px' }}
      >
        <h1 style={{ color: 'var(--fp-text-primary)', fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 800, margin: '0 0 4px' }}>
          The Hub — Floor Map
        </h1>
        <p style={{ color: 'var(--fp-text-muted)', fontSize: 'clamp(13px, 3vw, 15px)', margin: 0 }}>
          Find what you need before you arrive
        </p>
      </HexPanel>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
          <LoadingAnimation
            message="Loading floor plan…"
            className="py-2"
            iconClassName="h-20 w-20"
            messageClassName="mt-2 text-sm font-medium text-slate-300"
          />
        </div>
      )}
      {error && (
        <HexPanel style={{ width: 'fit-content', alignSelf: 'center', marginTop: 24 }} contentStyle={{ textAlign: 'center', color: 'var(--fp-danger)', fontSize: 15, fontWeight: 700, padding: '12px 18px' }}>
          {error}
        </HexPanel>
      )}
      {!loading && !error && shelves.length === 0 && markers.length === 0 && walls.length === 0 && (
        <HexPanel style={{ width: 'fit-content', alignSelf: 'center', marginTop: 24 }} contentStyle={{ textAlign: 'center', color: 'var(--fp-text-subtle)', fontSize: 15, fontWeight: 600, padding: '12px 18px' }}>
          No floor plan has been published yet. Check back soon!
        </HexPanel>
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
          {highlightedCategory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, border: '1px solid var(--fp-panel-border)', background: 'var(--fp-surface-secondary)' }}>
              <span style={{ fontSize: 14, color: 'var(--fp-text-secondary)', fontWeight: 600 }}>
                Highlighting: <strong style={{ color: 'var(--fp-text-primary)' }}>{CATEGORIES.find(c => c.id === highlightedCategory)?.label ?? highlightedCategory}</strong>
              </span>
              <button
                type="button"
                onClick={() => setHighlightedCategory(null)}
                style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--fp-panel-border)', background: 'var(--fp-input-bg)', color: 'var(--fp-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          )}
          <FloorPlanCanvas
            canvasSize={canvasSize}
            zones={renderedZones}
            walls={renderedWalls}
            markers={renderedMarkers}
            highlightedCategoryId={highlightedCategory}
            onZoneClick={(catId) => setHighlightedCategory(prev => prev === catId ? null : catId)}
            style={{ width: canvasSize, height: canvasSize, flexShrink: 0 }}
          />
          {!highlightedCategory && (
            <p style={{ fontSize: 13, color: 'var(--fp-text-muted)', margin: 0 }}>
              Tap a zone to highlight its location
            </p>
          )}

          {/* Legend — compact horizontal grid below canvas */}
          <HexPanel
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
          </HexPanel>
        </div>
      )}
    </main>
  )
}
