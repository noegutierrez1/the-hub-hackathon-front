'use client'

import type React from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import FloorPlanCanvas, { FLOORPLAN_CANVAS_SIZE } from '../../../components/FloorPlanCanvas'

// ============================================================
// Types
// ============================================================

type CategoryId =
  | 'frozen'
  | 'refrigerated'
  | 'produce'
  | 'canned_goods'
  | 'dry_goods'
  | 'misc_non_food'

type MarkerType = 'entrance' | 'exit' | 'help_desk'

interface Zone {
  id: string
  catId: CategoryId
  limit: number
  orientation: 'H' | 'V'
  rotation: number
  x: number
  y: number
  w: number
  h: number
}

interface Wall {
  id: string
  orientation: 'H' | 'V'
  rotation: number
  x: number
  y: number
  w: number
  h: number
}

interface Marker {
  id: string
  type: MarkerType
  x: number  // center px from canvas left
  y: number  // center px from canvas top
  w: number  // px
  h: number  // px
}

interface SectionPayload {
  cat_id: CategoryId
  limit_per_student: number
  orientation: 'H' | 'V'
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
  orientation: 'H' | 'V'
  rotation: number
  map_x: number
  map_y: number
  map_w: number
  map_h: number
}

export interface SavePayload {
  sections: SectionPayload[]
  markers: MarkerPayload[]
  walls: WallPayload[]
}

export interface MapZoneEditorRef {
  triggerSave: () => void
  getPayload: () => SavePayload
}

export interface MapZoneEditorProps {
  initialZones?: Zone[]
  initialWalls?: Wall[]
  initialMarkers?: Marker[]
  initialPayload?: SavePayload
  onSave: (payload: SavePayload) => void
}

type Selected = { id: string; kind: 'zone' | 'wall' | 'marker' } | null

type DragState = {
  type: 'draw' | 'move' | 'resize-r' | 'resize-b'
  itemId?: string
  kind?: 'zone' | 'wall' | 'marker'
  startX: number
  startY: number
  origX?: number
  origY?: number
  origW?: number
  origH?: number
} | null

// ============================================================
// Constants
// ============================================================

const MIN_W        = 50
const MIN_H        = 35
const MIN_MARKER_W = 50
const MIN_MARKER_H = 40
const DRAW_MIN_W   = 40
const DRAW_MIN_H   = 30
const HANDLE_SIZE  = 8
const DEFAULT_MARKER_W = 90
const DEFAULT_MARKER_H = 70
const DEFAULT_WALL_W = 180
const DEFAULT_WALL_H = 16
const WALL_COLOR = '#31456B'
const WALL_EDGE = '#22304b'
const WALL_FILL = 'rgba(49,69,107,0.88)'
const CUT_CORNER_SIZE = 22
const PANEL_BORDER_WIDTH = 3

function hexClip(cut: number) {
  return `polygon(${cut}px 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, ${cut}px 100%, 0 calc(100% - ${cut}px), 0 ${cut}px)`
}

interface HexPanelProps {
  children: React.ReactNode
  fill?: string
  borderColor?: string
  style?: React.CSSProperties
  contentStyle?: React.CSSProperties
}

function HexPanel({
  children,
  fill = 'var(--fp-surface-primary)',
  borderColor = 'var(--fp-panel-border)',
  style,
  contentStyle,
}: HexPanelProps) {
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

const CATEGORIES = [
  { id: 'frozen' as CategoryId,        label: 'Frozen',         fill: '#E6F1FB', text: '#0C447C' },
  { id: 'refrigerated' as CategoryId,  label: 'Refrigerated',   fill: '#E1F5EE', text: '#085041' },
  { id: 'produce' as CategoryId,       label: 'Produce',        fill: '#EAF3DE', text: '#27500A' },
  { id: 'canned_goods' as CategoryId,  label: 'Canned goods',   fill: '#FAEEDA', text: '#633806' },
  { id: 'dry_goods' as CategoryId,     label: 'Dry goods',      fill: '#EEEDFE', text: '#3C3489' },
  { id: 'misc_non_food' as CategoryId, label: 'Misc / non-food',fill: '#F1EFE8', text: '#444441' },
] as const

const MARKER_CONFIGS: Record<
  MarkerType,
  { label: string; color: string; bg: string; border: string; arrowColor: string }
> = {
  entrance: { label: 'ENTRANCE', color: '#166534', bg: '#dcfce7', border: '#689466', arrowColor: '#689466' },
  exit:     { label: 'EXIT',     color: '#991b1b', bg: '#fee2e2', border: '#dc2626', arrowColor: '#dc2626' },
  help_desk:{ label: 'HELP DESK',color: '#1e3a8a', bg: '#dbeafe', border: '#2563eb', arrowColor: '#2563eb' },
}

const MARKER_NICE_NAMES: Record<MarkerType, string> = {
  entrance:  'entrance',
  exit:      'exit',
  help_desk: 'help desk',
}

function getCat(id: CategoryId) {
  return CATEGORIES.find(c => c.id === id)!
}

function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

// ============================================================
// SVG icons
// ============================================================

function ArrowUp({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ pointerEvents: 'none', display: 'block' }}>
      <path d="M12 3 L22 20 L2 20 Z" />
    </svg>
  )
}

function ArrowDown({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ pointerEvents: 'none', display: 'block' }}>
      <path d="M12 21 L2 4 L22 4 Z" />
    </svg>
  )
}

function HelpIcon({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ pointerEvents: 'none', display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill={color} opacity="0.15" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <text x="12" y="17" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="sans-serif">?</text>
    </svg>
  )
}

function MarkerIcon({ type, color, size }: { type: MarkerType; color: string; size?: number }) {
  if (type === 'entrance') return <ArrowUp color={color} size={size} />
  if (type === 'exit')     return <ArrowDown color={color} size={size} />
  return <HelpIcon color={color} size={size} />
}

// ============================================================
// Component
// ============================================================

const MapZoneEditor = forwardRef<MapZoneEditorRef, MapZoneEditorProps>(function MapZoneEditor({
  initialZones = [],
  initialWalls = [],
  initialMarkers = [],
  initialPayload,
  onSave,
}: MapZoneEditorProps, ref) {
  const [zones,       setZones]       = useState<Zone[]>(initialZones)
  const [walls,       setWalls]       = useState<Wall[]>(initialWalls)
  const [markers,     setMarkers]     = useState<Marker[]>(initialMarkers)
  const [selected,    setSelected]    = useState<Selected>(null)
  const [activeCategory,    setActiveCategory]    = useState<CategoryId>('frozen')
  const [activeLimit,       setActiveLimit]       = useState(3)
  const [activeOrientation, setActiveOrientation] = useState<'H' | 'V'>('H')
  const [ghost,       setGhost]       = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [saved,       setSaved]       = useState(false)

  const editorRef         = useRef<HTMLDivElement>(null)
  const canvasRef         = useRef<HTMLDivElement>(null)
  const dragRef           = useRef<DragState>(null)
  const hasLoadedPayload  = useRef(false)
  const hydratedCanvasRef = useRef(0)
  const hasUserEditedRef  = useRef(false)
  const canvasSize = FLOORPLAN_CANVAS_SIZE

  const selectedZone   = selected?.kind === 'zone'   ? zones.find(z => z.id === selected.id)   ?? null : null
  const selectedWall   = selected?.kind === 'wall'   ? walls.find(w => w.id === selected.id)   ?? null : null
  const selectedMarker = selected?.kind === 'marker' ? markers.find(m => m.id === selected.id) ?? null : null

  // ----------------------------------------------------------
  // Load initialPayload into editor once canvas size is known
  // ----------------------------------------------------------
  function hydratePayload(payload: SavePayload, s: number) {
    setZones(payload.sections.map(sec => ({
      id: uid(),
      catId: sec.cat_id as CategoryId,
      limit: sec.limit_per_student,
      orientation: sec.orientation as 'H' | 'V',
      rotation: sec.rotation,
      x: sec.map_x * s,
      y: sec.map_y * s,
      w: sec.map_w * s,
      h: sec.map_h * s,
    })))
    setWalls(payload.walls.map(w => ({
      id: uid(),
      orientation: w.orientation as 'H' | 'V',
      rotation: w.rotation,
      x: w.map_x * s,
      y: w.map_y * s,
      w: w.map_w * s,
      h: w.map_h * s,
    })))
    setMarkers(payload.markers.map(m => ({
      id: uid(),
      type: m.type as MarkerType,
      x: m.map_x * s,
      y: m.map_y * s,
      w: m.map_w * s,
      h: m.map_h * s,
    })))
  }

  useEffect(() => {
    if (!initialPayload || canvasSize <= 0) return

    const shouldHydrateInitially = !hasLoadedPayload.current
    const shouldRehydrateForSettledSize =
      hasLoadedPayload.current &&
      !hasUserEditedRef.current &&
      hydratedCanvasRef.current !== canvasSize

    if (!shouldHydrateInitially && !shouldRehydrateForSettledSize) return

    hasLoadedPayload.current = true
    hydratedCanvasRef.current = canvasSize
    hydratePayload(initialPayload, canvasSize)
  }, [canvasSize, initialPayload])

  function markUserEdited() {
    hasUserEditedRef.current = true
  }

  // ----------------------------------------------------------
  // Window mouse handlers
  // ----------------------------------------------------------
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const b = canvasRef.current?.getBoundingClientRect()
    if (!b) return
    const mx = e.clientX - b.left
    const my = e.clientY - b.top
    const cw = b.width
    const ch = b.height

    // Drawing ghost
    if (d.type === 'draw') {
      setGhost({
        x: Math.min(d.startX, mx),
        y: Math.min(d.startY, my),
        w: Math.abs(mx - d.startX),
        h: Math.abs(my - d.startY),
      })
      return
    }

    // Move — works for zones, walls, and markers
    if (d.type === 'move') {
      markUserEdited()
      const dx = mx - d.startX
      const dy = my - d.startY
      if (d.kind === 'zone' && d.itemId) {
        setZones(prev => prev.map(z => {
          if (z.id !== d.itemId) return z
          return {
            ...z,
            x: Math.max(0, Math.min((d.origX ?? z.x) + dx, cw - z.w)),
            y: Math.max(0, Math.min((d.origY ?? z.y) + dy, ch - z.h)),
          }
        }))
      } else if (d.kind === 'wall' && d.itemId) {
        setWalls(prev => prev.map(w => {
          if (w.id !== d.itemId) return w
          return {
            ...w,
            x: Math.max(0, Math.min((d.origX ?? w.x) + dx, cw - w.w)),
            y: Math.max(0, Math.min((d.origY ?? w.y) + dy, ch - w.h)),
          }
        }))
      } else if (d.kind === 'marker' && d.itemId) {
        setMarkers(prev => prev.map(m => {
          if (m.id !== d.itemId) return m
          return {
            ...m,
            x: Math.max(m.w / 2, Math.min((d.origX ?? m.x) + dx, cw - m.w / 2)),
            y: Math.max(m.h / 2, Math.min((d.origY ?? m.y) + dy, ch - m.h / 2)),
          }
        }))
      }
      return
    }

    // Resize right — zones, walls, and markers
    if (d.type === 'resize-r' && d.itemId) {
      markUserEdited()
      if (d.kind === 'marker') {
        // origX holds the marker's left edge at drag-start
        const left = d.origX!
        const newW = Math.max(MIN_MARKER_W, Math.min(mx - left, cw - left))
        setMarkers(prev => prev.map(m =>
          m.id !== d.itemId ? m : { ...m, w: newW, x: left + newW / 2 }
        ))
      } else if (d.kind === 'wall') {
        const ox = d.origX!
        setWalls(prev => prev.map(w =>
          w.id !== d.itemId ? w : { ...w, w: Math.max(MIN_W, Math.min(mx - ox, cw - ox)) }
        ))
      } else {
        const ox = d.origX!
        setZones(prev => prev.map(z =>
          z.id !== d.itemId ? z : { ...z, w: Math.max(MIN_W, Math.min(mx - ox, cw - ox)) }
        ))
      }
      return
    }

    // Resize bottom — zones, walls, and markers
    if (d.type === 'resize-b' && d.itemId) {
      markUserEdited()
      if (d.kind === 'marker') {
        // origY holds the marker's top edge at drag-start
        const top = d.origY!
        const newH = Math.max(MIN_MARKER_H, Math.min(my - top, ch - top))
        setMarkers(prev => prev.map(m =>
          m.id !== d.itemId ? m : { ...m, h: newH, y: top + newH / 2 }
        ))
      } else if (d.kind === 'wall') {
        const oy = d.origY!
        setWalls(prev => prev.map(w =>
          w.id !== d.itemId ? w : { ...w, h: Math.max(MIN_H, Math.min(my - oy, ch - oy)) }
        ))
      } else {
        const oy = d.origY!
        setZones(prev => prev.map(z =>
          z.id !== d.itemId ? z : { ...z, h: Math.max(MIN_H, Math.min(my - oy, ch - oy)) }
        ))
      }
    }
  }, [])

  // Refs so handleMouseUp reads current active* without stale closure
  const activeCatRef    = useRef(activeCategory)
  const activeLimitRef  = useRef(activeLimit)
  const activeOrientRef = useRef(activeOrientation)
  useEffect(() => { activeCatRef.current    = activeCategory },    [activeCategory])
  useEffect(() => { activeLimitRef.current  = activeLimit },       [activeLimit])
  useEffect(() => { activeOrientRef.current = activeOrientation }, [activeOrientation])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    if (d.type === 'draw') {
      const b = canvasRef.current?.getBoundingClientRect()
      if (b) {
        const mx = e.clientX - b.left
        const my = e.clientY - b.top
        const rawW = Math.abs(mx - d.startX)
        const rawH = Math.abs(my - d.startY)
        if (rawW >= DRAW_MIN_W && rawH >= DRAW_MIN_H) {
          markUserEdited()
          const nz: Zone = {
            id: uid(),
            catId: activeCatRef.current,
            limit: activeLimitRef.current,
            orientation: activeOrientRef.current,
            rotation: 0,
            x: Math.min(d.startX, mx),
            y: Math.min(d.startY, my),
            w: rawW,
            h: rawH,
          }
          setZones(prev => [...prev, nz])
          setSelected({ id: nz.id, kind: 'zone' })
        }
      }
      setGhost(null)
    }
    dragRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // ----------------------------------------------------------
  // Mouse-down starters
  // ----------------------------------------------------------
  function handleCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== canvasRef.current) return
    const b = canvasRef.current!.getBoundingClientRect()
    setSelected(null)
    dragRef.current = { type: 'draw', startX: e.clientX - b.left, startY: e.clientY - b.top }
  }

  function handleZoneMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const z = zones.find(z => z.id === id)
    if (!z) return
    setSelected({ id, kind: 'zone' })
    const b = canvasRef.current?.getBoundingClientRect()
    dragRef.current = { type: 'move', itemId: id, kind: 'zone', startX: e.clientX - (b?.left ?? 0), startY: e.clientY - (b?.top ?? 0), origX: z.x, origY: z.y }
  }

  function handleMarkerMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const m = markers.find(m => m.id === id)
    if (!m) return
    setSelected({ id, kind: 'marker' })
    const b = canvasRef.current?.getBoundingClientRect()
    dragRef.current = { type: 'move', itemId: id, kind: 'marker', startX: e.clientX - (b?.left ?? 0), startY: e.clientY - (b?.top ?? 0), origX: m.x, origY: m.y }
  }

  function handleWallMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const w = walls.find(w => w.id === id)
    if (!w) return
    setSelected({ id, kind: 'wall' })
    const b = canvasRef.current?.getBoundingClientRect()
    dragRef.current = { type: 'move', itemId: id, kind: 'wall', startX: e.clientX - (b?.left ?? 0), startY: e.clientY - (b?.top ?? 0), origX: w.x, origY: w.y }
  }

  function handleZoneResizeRMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const z = zones.find(z => z.id === id)
    if (!z) return
    dragRef.current = { type: 'resize-r', itemId: id, kind: 'zone', startX: e.clientX, startY: e.clientY, origX: z.x, origY: z.y, origW: z.w, origH: z.h }
  }

  function handleZoneResizeBMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const z = zones.find(z => z.id === id)
    if (!z) return
    dragRef.current = { type: 'resize-b', itemId: id, kind: 'zone', startX: e.clientX, startY: e.clientY, origX: z.x, origY: z.y, origW: z.w, origH: z.h }
  }

  function handleWallResizeRMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const w = walls.find(w => w.id === id)
    if (!w) return
    dragRef.current = { type: 'resize-r', itemId: id, kind: 'wall', startX: e.clientX, startY: e.clientY, origX: w.x, origY: w.y, origW: w.w, origH: w.h }
  }

  function handleWallResizeBMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const w = walls.find(w => w.id === id)
    if (!w) return
    dragRef.current = { type: 'resize-b', itemId: id, kind: 'wall', startX: e.clientX, startY: e.clientY, origX: w.x, origY: w.y, origW: w.w, origH: w.h }
  }

  // For markers: origX = left edge, origY = top edge
  function handleMarkerResizeRMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const m = markers.find(m => m.id === id)
    if (!m) return
    dragRef.current = { type: 'resize-r', itemId: id, kind: 'marker', startX: e.clientX, startY: e.clientY, origX: m.x - m.w / 2, origY: m.y - m.h / 2, origW: m.w, origH: m.h }
  }

  function handleMarkerResizeBMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const m = markers.find(m => m.id === id)
    if (!m) return
    dragRef.current = { type: 'resize-b', itemId: id, kind: 'marker', startX: e.clientX, startY: e.clientY, origX: m.x - m.w / 2, origY: m.y - m.h / 2, origW: m.w, origH: m.h }
  }

  // ----------------------------------------------------------
  // Zone actions
  // ----------------------------------------------------------
  function addShelf() {
    markUserEdited()
    const w = activeOrientation === 'H' ? 180 : 55
    const h = activeOrientation === 'H' ? 55 : 140
    const nz: Zone = {
      id: uid(),
      catId: activeCategory,
      limit: activeLimit,
      orientation: activeOrientation,
      rotation: 0,
      x: Math.max(0, canvasSize / 2 - w / 2),
      y: Math.max(0, canvasSize / 2 - h / 2),
      w,
      h,
    }
    setZones(prev => [...prev, nz])
    setSelected({ id: nz.id, kind: 'zone' })
  }

  function deleteZone(id: string) {
    markUserEdited()
    setZones(prev => prev.filter(z => z.id !== id))
    setSelected(null)
  }

  function updateZone(updates: Partial<Zone>) {
    if (selected?.kind !== 'zone') return
    markUserEdited()
    setZones(prev => prev.map(z => (z.id === selected.id ? { ...z, ...updates } : z)))
  }

  function rotateZone(delta: number) {
    if (!selectedZone) return
    updateZone({ rotation: ((selectedZone.rotation + delta) % 360 + 360) % 360 })
  }

  function setSelectedOrientation(o: 'H' | 'V') {
    if (!selectedZone || selectedZone.orientation === o) return
    updateZone({ orientation: o, w: selectedZone.h, h: selectedZone.w })
  }

  // ----------------------------------------------------------
  // Wall actions
  // ----------------------------------------------------------
  function addWall() {
    markUserEdited()
    const w = activeOrientation === 'H' ? DEFAULT_WALL_W : DEFAULT_WALL_H
    const h = activeOrientation === 'H' ? DEFAULT_WALL_H : DEFAULT_WALL_W
    const nw: Wall = {
      id: uid(),
      orientation: activeOrientation,
      rotation: 0,
      x: Math.max(0, canvasSize / 2 - w / 2),
      y: Math.max(0, canvasSize / 2 - h / 2),
      w,
      h,
    }
    setWalls(prev => [...prev, nw])
    setSelected({ id: nw.id, kind: 'wall' })
  }

  function deleteWall(id: string) {
    markUserEdited()
    setWalls(prev => prev.filter(w => w.id !== id))
    setSelected(null)
  }

  function updateWall(updates: Partial<Wall>) {
    if (selected?.kind !== 'wall') return
    markUserEdited()
    setWalls(prev => prev.map(w => (w.id === selected.id ? { ...w, ...updates } : w)))
  }

  function setSelectedWallOrientation(o: 'H' | 'V') {
    if (!selectedWall || selectedWall.orientation === o) return
    updateWall({ orientation: o, w: selectedWall.h, h: selectedWall.w })
  }

  function rotateWall(delta: number) {
    if (!selectedWall) return
    updateWall({ rotation: ((selectedWall.rotation + delta) % 360 + 360) % 360 })
  }

  // ----------------------------------------------------------
  // Marker actions
  // ----------------------------------------------------------
  function addMarker(type: MarkerType) {
    markUserEdited()
    const nm: Marker = {
      id: uid(),
      type,
      x: canvasSize / 2,
      y: canvasSize / 2,
      w: DEFAULT_MARKER_W,
      h: DEFAULT_MARKER_H,
    }
    setMarkers(prev => [...prev, nm])
    setSelected({ id: nm.id, kind: 'marker' })
  }

  function deleteMarker(id: string) {
    markUserEdited()
    setMarkers(prev => prev.filter(m => m.id !== id))
    setSelected(null)
  }

  // ----------------------------------------------------------
  // Save
  // ----------------------------------------------------------
  function toSectionPayload(z: Zone): SectionPayload {
    const s = canvasSize || 1
    return {
      cat_id: z.catId,
      limit_per_student: z.limit,
      orientation: z.orientation,
      rotation: z.rotation,
      map_x: parseFloat((z.x / s).toFixed(4)),
      map_y: parseFloat((z.y / s).toFixed(4)),
      map_w: parseFloat((z.w / s).toFixed(4)),
      map_h: parseFloat((z.h / s).toFixed(4)),
    }
  }

  function toMarkerPayload(m: Marker): MarkerPayload {
    const s = canvasSize || 1
    return {
      type:  m.type,
      map_x: parseFloat((m.x / s).toFixed(4)),
      map_y: parseFloat((m.y / s).toFixed(4)),
      map_w: parseFloat((m.w / s).toFixed(4)),
      map_h: parseFloat((m.h / s).toFixed(4)),
    }
  }

  function toWallPayload(w: Wall): WallPayload {
    const s = canvasSize || 1
    return {
      orientation: w.orientation,
      rotation: w.rotation,
      map_x: parseFloat((w.x / s).toFixed(4)),
      map_y: parseFloat((w.y / s).toFixed(4)),
      map_w: parseFloat((w.w / s).toFixed(4)),
      map_h: parseFloat((w.h / s).toFixed(4)),
    }
  }

  function handleSave() {
    onSave(buildPayload())
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function buildPayload(): SavePayload {
    return {
      sections: zones.map(toSectionPayload),
      markers: markers.map(toMarkerPayload),
      walls: walls.map(toWallPayload),
    }
  }

  useImperativeHandle(ref, () => ({
    triggerSave: handleSave,
    getPayload: buildPayload,
  }))

  // ----------------------------------------------------------
  // Shared style tokens
  // ----------------------------------------------------------
  const ghostCat = getCat(activeCategory)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 50,
    border: '1.5px solid var(--fp-input-border)',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 17,
    backgroundColor: 'var(--fp-input-bg)',
    color: 'var(--fp-text-primary)',
    boxSizing: 'border-box',
    boxShadow: 'var(--fp-input-shadow)',
    outline: 'none',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--fp-text-muted)',
    margin: 0,
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--fp-text-secondary)',
    display: 'block',
    marginBottom: 8,
  }

  const helperText: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--fp-text-subtle)',
    margin: 0,
    lineHeight: 1.45,
  }

  const metricText: React.CSSProperties = {
    fontSize: 15,
    color: 'var(--fp-text-muted)',
    margin: 0,
    lineHeight: 1.45,
  }

  const subtleResetButton: React.CSSProperties = {
    marginTop: 6,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--fp-text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  }

  const dangerTextButton: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: '#dc2626',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
  }

  function panelButton(active: boolean, palette: { activeBg: string; activeText: string; border: string }) {
    return {
      flex: 1,
      minHeight: 46,
      padding: '10px 12px',
      borderRadius: 12,
      fontSize: 17,
      fontWeight: 700,
      border: `1px solid ${palette.border}`,
      backgroundColor: active ? palette.activeBg : 'var(--fp-input-bg)',
      color: active ? palette.activeText : 'var(--fp-text-muted)',
      cursor: 'pointer',
      boxShadow: 'var(--fp-input-shadow)',
    } satisfies React.CSSProperties
  }

  const primaryPanelButton: React.CSSProperties = {
    width: '100%',
    minHeight: 52,
    padding: '12px 16px',
    borderRadius: 14,
    background: 'linear-gradient(180deg, var(--fp-button-primary) 0%, #263855 100%)',
    color: '#fff',
    fontSize: 19,
    fontWeight: 800,
    border: 'none',
    cursor: 'pointer',
    boxShadow: 'var(--fp-input-shadow)',
  }

  const actionRowPalette = { activeBg: 'var(--fp-button-primary)', activeText: '#ffffff', border: 'var(--fp-button-primary)' }
  const accentRowPalette = { activeBg: 'var(--fp-button-accent)', activeText: '#ffffff', border: 'var(--fp-button-accent)' }

  // ----------------------------------------------------------
  // Shared resize handle renderer
  // ----------------------------------------------------------
  function ResizeHandleR({ onDown }: { onDown: (e: React.MouseEvent) => void }) {
    return (
      <div
        onMouseDown={onDown}
        style={{ position: 'absolute', right: -(HANDLE_SIZE / 2 + 1), top: '50%', transform: 'translateY(-50%)', width: HANDLE_SIZE, height: 28, backgroundColor: '#6B92B6', borderRadius: 4, cursor: 'ew-resize', zIndex: 20 }}
      />
    )
  }

  function ResizeHandleB({ onDown }: { onDown: (e: React.MouseEvent) => void }) {
    return (
      <div
        onMouseDown={onDown}
        style={{ position: 'absolute', bottom: -(HANDLE_SIZE / 2 + 1), left: '50%', transform: 'translateX(-50%)', width: 28, height: HANDLE_SIZE, backgroundColor: '#6B92B6', borderRadius: 4, cursor: 'ns-resize', zIndex: 20 }}
      />
    )
  }

  function DeleteBtn({ onClick }: { onClick: () => void }) {
    return (
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={onClick}
        style={{ position: 'absolute', top: -9, right: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', fontSize: 20, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, zIndex: 30, padding: 0 }}
      >
        ×
      </button>
    )
  }

  // ----------------------------------------------------------
  // JSX
  // ----------------------------------------------------------
  return (
    <div
      ref={editorRef}
      style={{ display: 'flex', gap: 24, width: '100%', height: '100%', userSelect: 'none', alignItems: 'flex-start', overflow: 'visible' }}
    >

      {/* ==================================================
          Canvas column
      ================================================== */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: canvasSize, height: canvasSize, flexShrink: 0 }}>
          <FloorPlanCanvas
            canvasRef={canvasRef}
            canvasSize={canvasSize}
            zones={zones}
            walls={walls}
            markers={markers}
            selected={selected}
            ghost={ghost}
            ghostCategoryId={activeCategory}
            onCanvasMouseDown={handleCanvasMouseDown}
            onZoneMouseDown={handleZoneMouseDown}
            onWallMouseDown={handleWallMouseDown}
            onMarkerMouseDown={handleMarkerMouseDown}
            renderZoneExtras={(zone, isSelected) => (
              <>
                {isSelected && <ResizeHandleR onDown={e => handleZoneResizeRMouseDown(e, zone.id)} />}
                {isSelected && <ResizeHandleB onDown={e => handleZoneResizeBMouseDown(e, zone.id)} />}
                {isSelected && <DeleteBtn onClick={() => deleteZone(zone.id)} />}
              </>
            )}
            renderWallExtras={(wall, isSelected) => (
              <>
                {isSelected && <ResizeHandleR onDown={e => handleWallResizeRMouseDown(e, wall.id)} />}
                {isSelected && <ResizeHandleB onDown={e => handleWallResizeBMouseDown(e, wall.id)} />}
                {isSelected && <DeleteBtn onClick={() => deleteWall(wall.id)} />}
              </>
            )}
            renderMarkerExtras={(marker, isSelected) => (
              <>
                {isSelected && <ResizeHandleR onDown={e => handleMarkerResizeRMouseDown(e, marker.id)} />}
                {isSelected && <ResizeHandleB onDown={e => handleMarkerResizeBMouseDown(e, marker.id)} />}
                {isSelected && <DeleteBtn onClick={() => deleteMarker(marker.id)} />}
              </>
            )}
          />
        </div>
      </div>

      {/* ==================================================
          Sidebar
      ================================================== */}
      <div style={{ width: 700, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%', padding: '6px 16px 24px 6px' }}>
        {/* 1. New shelf defaults */}
        <HexPanel contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={sectionLabel}>New shelf defaults</p>

          <div>
            <p style={fieldLabel}>Category</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    backgroundColor: activeCategory === cat.id ? cat.fill : 'var(--fp-input-bg)',
                    color: activeCategory === cat.id ? cat.text : 'var(--fp-text-muted)',
                    border: activeCategory === cat.id ? `1px solid ${cat.text}` : '1px solid var(--fp-input-border)',
                    outline: activeCategory === cat.id ? '2px solid #E0B457' : 'none',
                    outlineOffset: 1,
                    borderRadius: 12,
                    padding: '14px 10px',
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: 'pointer',
                    lineHeight: 1.25,
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Item limit per student</label>
            <input type="number" min={1} max={20} value={activeLimit}
              onChange={e => setActiveLimit(Math.max(1, Math.min(20, Number(e.target.value))))}
              style={inputStyle} />
          </div>

          <div>
            <p style={fieldLabel}>Orientation</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['H', 'V'] as const).map(o => (
                <button key={o} onClick={() => setActiveOrientation(o)}
                  style={panelButton(activeOrientation === o, actionRowPalette)}>
                  {o === 'H' ? 'Horizontal' : 'Vertical'}
                </button>
              ))}
            </div>
          </div>

          <button onClick={addShelf}
            style={primaryPanelButton}>
            + Add shelf
          </button>
        </HexPanel>

        {/* 2. Place markers */}
        <HexPanel contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={sectionLabel}>Place markers</p>
          {(Object.keys(MARKER_CONFIGS) as MarkerType[]).map(type => {
            const cfg = MARKER_CONFIGS[type]
            return (
              <button key={type} onClick={() => addMarker(type)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, cursor: 'pointer', fontSize: 18, fontWeight: 700, color: cfg.color, textAlign: 'left', boxShadow: 'var(--fp-input-shadow)' }}>
                <MarkerIcon type={type} color={cfg.arrowColor} size={24} />
                Add {MARKER_NICE_NAMES[type]}
              </button>
            )
          })}
          <p style={helperText}>Drag to reposition · drag handles to resize</p>
        </HexPanel>

        {/* 3. Build walls */}
        <HexPanel contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={sectionLabel}>Build walls</p>
          <div>
            <p style={fieldLabel}>Orientation</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['H', 'V'] as const).map(o => (
                <button key={o} onClick={() => setActiveOrientation(o)}
                  style={panelButton(activeOrientation === o, actionRowPalette)}>
                  {o === 'H' ? 'Horizontal wall' : 'Vertical wall'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={addWall}
            style={primaryPanelButton}>
            + Add wall
          </button>
          <p style={helperText}>Walls can be moved and resized like other elements.</p>
        </HexPanel>

        {/* 4a. Selected zone editor */}
        {selectedZone && (
          <HexPanel fill="var(--fp-surface-accent)" contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={sectionLabel}>Selected shelf</p>

            <div>
              <label style={fieldLabel}>Category</label>
              <select value={selectedZone.catId} onChange={e => updateZone({ catId: e.target.value as CategoryId })} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label style={fieldLabel}>Item limit per student</label>
              <input type="number" min={1} max={20} value={selectedZone.limit}
                onChange={e => updateZone({ limit: Math.max(1, Math.min(20, Number(e.target.value))) })}
                style={inputStyle} />
            </div>

            <div>
              <p style={fieldLabel}>Orientation</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['H', 'V'] as const).map(o => (
                  <button key={o} onClick={() => setSelectedOrientation(o)}
                    style={panelButton(selectedZone.orientation === o, accentRowPalette)}>
                    {o === 'H' ? 'Horizontal' : 'Vertical'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ ...fieldLabel, marginBottom: 6 }}>
                Rotation&nbsp;
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--fp-button-primary)' }}>{selectedZone.rotation}°</span>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[-45, -15, 15, 45].map(delta => (
                  <button key={delta} onClick={() => rotateZone(delta)}
                    style={{ ...panelButton(false, accentRowPalette), minHeight: 42, padding: '8px 4px', fontSize: 15 }}>
                    {delta > 0 ? `+${delta}°` : `${delta}°`}
                  </button>
                ))}
              </div>
              <button onClick={() => updateZone({ rotation: 0 })}
                style={subtleResetButton}>
                Reset to 0°
              </button>
            </div>

            <p style={metricText}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedZone.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedZone.h)}px</span>
            </p>

            <button onClick={() => deleteZone(selectedZone.id)}
              style={dangerTextButton}>
              Delete zone
            </button>
          </HexPanel>
        )}

        {/* 4b. Selected wall editor */}
        {selectedWall && (
          <HexPanel fill="var(--fp-surface-accent)" contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={sectionLabel}>Selected wall</p>

            <div>
              <p style={fieldLabel}>Orientation</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['H', 'V'] as const).map(o => (
                  <button key={o} onClick={() => setSelectedWallOrientation(o)}
                    style={panelButton(selectedWall.orientation === o, accentRowPalette)}>
                    {o === 'H' ? 'Horizontal' : 'Vertical'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ ...fieldLabel, marginBottom: 6 }}>
                Rotation&nbsp;
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--fp-button-primary)' }}>{selectedWall.rotation}°</span>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[-5, -1, 1, 5].map(delta => (
                  <button key={delta} onClick={() => rotateWall(delta)}
                    style={{ ...panelButton(false, accentRowPalette), minHeight: 42, padding: '8px 4px', fontSize: 15 }}>
                    {delta > 0 ? `+${delta}°` : `${delta}°`}
                  </button>
                ))}
              </div>
              <button onClick={() => updateWall({ rotation: 0 })}
                style={subtleResetButton}>
                Reset to 0°
              </button>
            </div>

            <p style={metricText}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedWall.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedWall.h)}px</span>
            </p>

            <button onClick={() => deleteWall(selectedWall.id)}
              style={dangerTextButton}>
              Delete wall
            </button>
          </HexPanel>
        )}

        {/* 4c. Selected marker editor */}
        {selectedMarker && (
          <HexPanel fill="linear-gradient(180deg, rgba(88,126,166,0.3) 0%, rgba(52,80,116,0.4) 100%)" borderColor={`${MARKER_CONFIGS[selectedMarker.type].border}ee`} contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={sectionLabel}>Selected marker</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MarkerIcon type={selectedMarker.type} color={MARKER_CONFIGS[selectedMarker.type].arrowColor} size={24} />
              <span style={{ fontSize: 17, fontWeight: 800, color: '#17324f', letterSpacing: '0.04em' }}>
                {MARKER_CONFIGS[selectedMarker.type].label}
              </span>
            </div>

            <p style={metricText}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedMarker.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedMarker.h)}px</span>
            </p>

            <p style={helperText}>Drag to move · drag handles to resize</p>

            <button onClick={() => deleteMarker(selectedMarker.id)}
              style={dangerTextButton}>
              Remove marker
            </button>
          </HexPanel>
        )}

        {/* 4. Save */}
        <HexPanel fill="linear-gradient(180deg, rgba(90,129,169,0.28) 0%, rgba(51,78,112,0.38) 100%)" style={{ marginTop: 'auto' }} contentStyle={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--fp-text-secondary)', fontWeight: 700, margin: 0, lineHeight: 1.45, textAlign: 'center' }}>
            {zones.length} shelf zone{zones.length !== 1 ? 's' : ''}
            {' · '}
            {walls.length} wall{walls.length !== 1 ? 's' : ''}
            {' · '}
            {markers.length} marker{markers.length !== 1 ? 's' : ''}
          </p>
          <button onClick={handleSave}
            style={{ ...primaryPanelButton, width: '100%' }}>
            Save layout
          </button>
          {saved && <p style={{ fontSize: 15, fontWeight: 800, color: '#14532d', margin: 0, textAlign: 'center' }}>Saved!</p>}
        </HexPanel>
      </div>
    </div>
  )
})

export default MapZoneEditor
