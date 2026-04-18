'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

export interface MapZoneEditorProps {
  initialZones?: Zone[]
  initialWalls?: Wall[]
  initialMarkers?: Marker[]
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

export default function MapZoneEditor({
  initialZones = [],
  initialWalls = [],
  initialMarkers = [],
  onSave,
}: MapZoneEditorProps) {
  const [zones,       setZones]       = useState<Zone[]>(initialZones)
  const [walls,       setWalls]       = useState<Wall[]>(initialWalls)
  const [markers,     setMarkers]     = useState<Marker[]>(initialMarkers)
  const [selected,    setSelected]    = useState<Selected>(null)
  const [activeCategory,    setActiveCategory]    = useState<CategoryId>('frozen')
  const [activeLimit,       setActiveLimit]       = useState(3)
  const [activeOrientation, setActiveOrientation] = useState<'H' | 'V'>('H')
  const [ghost,       setGhost]       = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [saved,       setSaved]       = useState(false)
  const [canvasSize,  setCanvasSize]  = useState(700)

  const editorRef  = useRef<HTMLDivElement>(null)
  const canvasRef  = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef    = useRef<DragState>(null)

  const selectedZone   = selected?.kind === 'zone'   ? zones.find(z => z.id === selected.id)   ?? null : null
  const selectedWall   = selected?.kind === 'wall'   ? walls.find(w => w.id === selected.id)   ?? null : null
  const selectedMarker = selected?.kind === 'marker' ? markers.find(m => m.id === selected.id) ?? null : null

  // ----------------------------------------------------------
  // Responsive perfect-square canvas
  // ----------------------------------------------------------
  useEffect(() => {
    const wrapper = wrapperRef.current
    const editor = editorRef.current
    if (!wrapper || !editor) return

    const updateCanvasSize = () => {
      const wrapperWidth = wrapper.getBoundingClientRect().width
      const editorTop = editor.getBoundingClientRect().top
      const viewportHeight = window.innerHeight
      const reservedBottomSpace = 24
      const hintHeight = 32
      const availableHeight = Math.max(320, viewportHeight - editorTop - reservedBottomSpace - hintHeight)
      setCanvasSize(Math.floor(Math.min(wrapperWidth, availableHeight)))
    }

    const ro = new ResizeObserver(() => updateCanvasSize())
    ro.observe(wrapper)
    ro.observe(editor)
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateCanvasSize)
    }
  }, [])

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
    dragRef.current = { type: 'move', itemId: id, kind: 'zone', startX: e.clientX, startY: e.clientY, origX: z.x, origY: z.y }
  }

  function handleMarkerMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const m = markers.find(m => m.id === id)
    if (!m) return
    setSelected({ id, kind: 'marker' })
    dragRef.current = { type: 'move', itemId: id, kind: 'marker', startX: e.clientX, startY: e.clientY, origX: m.x, origY: m.y }
  }

  function handleWallMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const w = walls.find(w => w.id === id)
    if (!w) return
    setSelected({ id, kind: 'wall' })
    dragRef.current = { type: 'move', itemId: id, kind: 'wall', startX: e.clientX, startY: e.clientY, origX: w.x, origY: w.y }
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
    setZones(prev => prev.filter(z => z.id !== id))
    setSelected(null)
  }

  function updateZone(updates: Partial<Zone>) {
    if (selected?.kind !== 'zone') return
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
    setWalls(prev => prev.filter(w => w.id !== id))
    setSelected(null)
  }

  function updateWall(updates: Partial<Wall>) {
    if (selected?.kind !== 'wall') return
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
    onSave({
      sections: zones.map(toSectionPayload),
      markers: markers.map(toMarkerPayload),
      walls: walls.map(toWallPayload),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ----------------------------------------------------------
  // Shared style tokens
  // ----------------------------------------------------------
  const ghostCat = getCat(activeCategory)

  const inputStyle: React.CSSProperties = {
    width: '100%', border: '2px solid #7AAAC8', borderRadius: 4,
    padding: '6px 10px', fontSize: 18, backgroundColor: '#ffffff', color: '#1a2333',
    boxSizing: 'border-box',
  }

  const sectionBox: React.CSSProperties = {
    border: '1px solid #c8d8eb', borderRadius: 8, padding: 14,
    backgroundColor: '#ddeaf6',
    display: 'flex', flexDirection: 'column', gap: 12,
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 15, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: '#1e3452', margin: 0,
  }

  const fieldLabel: React.CSSProperties = {
    fontSize: 17, color: '#4a6080', display: 'block', marginBottom: 4,
  }

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
      style={{ display: 'flex', gap: 24, width: '100%', height: '100%', userSelect: 'none', alignItems: 'flex-start', overflow: 'hidden' }}
    >

      {/* ==================================================
          Canvas column
      ================================================== */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 18, color: '#4a6080', margin: 0 }}>
          Click and drag to draw a shelf zone. Click any element to select and edit it.
        </p>

        <div ref={wrapperRef} style={{ width: '100%', flex: 1, minHeight: 0 }}>
          <div
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            style={{
              position: 'relative',
              width: '100%',
              height: canvasSize,
              // Blueprint-style themed background
              backgroundColor: '#C8DCED',
              border: '4px solid #6B92B6',
              borderRadius: 10,
              overflow: 'hidden',
              // White grid lines on the blue canvas — blueprint feel
              backgroundImage: `
                linear-gradient(to right,  rgba(255,255,255,0.35) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
              cursor: 'crosshair',
              boxShadow: '0 0 0 2px rgba(107,146,182,0.2), 0 8px 28px rgba(49,69,107,0.18)',
            }}
          >

              {/* Shelf zones */}
            {zones.map(z => {
              const cat = getCat(z.catId)
              const isSel = selected?.id === z.id && selected?.kind === 'zone'
                return (
                  <div
                    key={z.id}
                    onMouseDown={e => handleZoneMouseDown(e, z.id)}
                    style={{
                      position: 'absolute',
                      left: z.x, top: z.y, width: z.w, height: z.h,
                      backgroundColor: cat.fill,
                      border: isSel ? '2px solid #6B92B6' : `1.5px solid ${cat.text}55`,
                      borderRadius: 5,
                      cursor: 'move',
                      zIndex: isSel ? 10 : 1,
                      boxShadow: isSel ? '0 0 0 3px #6B92B640' : '0 1px 4px rgba(0,0,0,0.15)',
                      transform: `rotate(${z.rotation}deg)`,
                      transformOrigin: 'center center',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      overflow: 'visible',
                    }}
                  >
                    <span style={{ color: cat.text, fontSize: 15, fontWeight: 600, pointerEvents: 'none', lineHeight: 1.2, textAlign: 'center', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                      {cat.label}
                    </span>
                    <span style={{ color: cat.text, fontSize: 14, opacity: 0.6, pointerEvents: 'none', lineHeight: 1.2 }}>
                      Limit: {z.limit}
                    </span>
                    {z.rotation !== 0 && (
                      <span style={{ color: cat.text, fontSize: 13, opacity: 0.4, pointerEvents: 'none', lineHeight: 1 }}>
                        {z.rotation}°
                      </span>
                    )}
                    {isSel && <ResizeHandleR onDown={e => handleZoneResizeRMouseDown(e, z.id)} />}
                    {isSel && <ResizeHandleB onDown={e => handleZoneResizeBMouseDown(e, z.id)} />}
                    {isSel && <DeleteBtn onClick={() => deleteZone(z.id)} />}
                  </div>
                )
              })}

              {/* Walls */}
              {walls.map(w => {
                const isSel = selected?.id === w.id && selected?.kind === 'wall'
                return (
                  <div
                    key={w.id}
                    onMouseDown={e => handleWallMouseDown(e, w.id)}
                    style={{
                      position: 'absolute',
                      left: w.x, top: w.y, width: w.w, height: w.h,
                    backgroundColor: WALL_FILL,
                      border: isSel ? '2px solid #6B92B6' : `1.5px solid ${WALL_EDGE}`,
                      borderRadius: 4,
                      cursor: 'move',
                      zIndex: isSel ? 12 : 4,
                      boxShadow: isSel ? '0 0 0 3px #6B92B640' : '0 1px 4px rgba(0,0,0,0.18)',
                      transform: `rotate(${w.rotation}deg)`,
                      transformOrigin: 'center center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'visible',
                    }}
                  >
                    <span style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, pointerEvents: 'none', lineHeight: 1, letterSpacing: '0.08em', opacity: 0.85 }}>
                      WALL
                    </span>
                    {w.rotation !== 0 && (
                      <span style={{ position: 'absolute', bottom: 3, right: 6, color: '#ffffff', fontSize: 13, fontWeight: 700, pointerEvents: 'none', lineHeight: 1, opacity: 0.75 }}>
                        {w.rotation}°
                      </span>
                    )}
                    {isSel && <ResizeHandleR onDown={e => handleWallResizeRMouseDown(e, w.id)} />}
                    {isSel && <ResizeHandleB onDown={e => handleWallResizeBMouseDown(e, w.id)} />}
                    {isSel && <DeleteBtn onClick={() => deleteWall(w.id)} />}
                  </div>
                )
              })}

              {/* Markers */}
              {markers.map(m => {
                const cfg = MARKER_CONFIGS[m.type]
                const isSel = selected?.id === m.id && selected?.kind === 'marker'
                const iconSize = Math.max(16, Math.min(m.w, m.h) * 0.38)
                return (
                  <div
                    key={m.id}
                    onMouseDown={e => handleMarkerMouseDown(e, m.id)}
                    style={{
                      position: 'absolute',
                      left: m.x - m.w / 2,
                      top:  m.y - m.h / 2,
                      width: m.w,
                      height: m.h,
                      backgroundColor: cfg.bg,
                      border: isSel ? '2px solid #6B92B6' : `2px solid ${cfg.border}`,
                      borderRadius: 8,
                      cursor: 'move',
                      zIndex: isSel ? 15 : 5,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 3,
                      overflow: 'visible',
                      boxShadow: isSel ? '0 0 0 3px #6B92B630' : `0 2px 8px ${cfg.border}44`,
                    }}
                  >
                    <MarkerIcon type={m.type} color={cfg.arrowColor} size={iconSize} />
                    <span style={{ fontSize: Math.max(11, Math.min(15, m.w / 6.5)), fontWeight: 800, color: cfg.color, letterSpacing: '0.06em', pointerEvents: 'none', lineHeight: 1, textAlign: 'center' }}>
                      {cfg.label}
                    </span>
                    {isSel && <ResizeHandleR onDown={e => handleMarkerResizeRMouseDown(e, m.id)} />}
                    {isSel && <ResizeHandleB onDown={e => handleMarkerResizeBMouseDown(e, m.id)} />}
                    {isSel && <DeleteBtn onClick={() => deleteMarker(m.id)} />}
                  </div>
                )
              })}

              {/* Drawing ghost */}
              {ghost && (
                <div style={{ position: 'absolute', left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, backgroundColor: ghostCat.fill + 'bb', border: `2px dashed ${ghostCat.text}`, borderRadius: 5, pointerEvents: 'none', zIndex: 5 }} />
              )}
            </div>
          </div>
      </div>

      {/* ==================================================
          Sidebar
      ================================================== */}
      <div style={{ width: 560, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: canvasSize + 40, paddingRight: 4 }}>
        {/* 1. New shelf defaults */}
        <div style={sectionBox}>
          <p style={sectionLabel}>New shelf defaults</p>

          <div>
            <p style={fieldLabel}>Category</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    backgroundColor: cat.fill, color: cat.text,
                    border: activeCategory === cat.id ? `2px solid ${cat.text}` : '2px solid transparent',
                    outline: activeCategory === cat.id ? '2px solid #E0B457' : 'none',
                    outlineOffset: 1, borderRadius: 7, padding: '12px 8px',
                    fontSize: 18, fontWeight: 600, cursor: 'pointer', lineHeight: 1.2,
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
                  style={{ flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 20, fontWeight: 600, border: '1.5px solid #31456B', backgroundColor: activeOrientation === o ? '#31456B' : '#fff', color: activeOrientation === o ? '#fff' : '#31456B', cursor: 'pointer' }}>
                  {o === 'H' ? 'Horizontal' : 'Vertical'}
                </button>
              ))}
            </div>
          </div>

          <button onClick={addShelf}
            style={{ width: '100%', padding: '12px 0', borderRadius: 6, backgroundColor: '#31456B', color: '#fff', fontSize: 21, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            + Add shelf
          </button>
        </div>

        {/* 2. Place markers */}
        <div style={sectionBox}>
          <p style={sectionLabel}>Place markers</p>
          {(Object.keys(MARKER_CONFIGS) as MarkerType[]).map(type => {
            const cfg = MARKER_CONFIGS[type]
            return (
              <button key={type} onClick={() => addMarker(type)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 7, backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`, cursor: 'pointer', fontSize: 21, fontWeight: 600, color: cfg.color, textAlign: 'left' }}>
                <MarkerIcon type={type} color={cfg.arrowColor} size={24} />
                Add {MARKER_NICE_NAMES[type]}
              </button>
            )
          })}
          <p style={{ fontSize: 15, color: '#4a6080', margin: 0 }}>Drag to reposition · drag handles to resize</p>
        </div>

        {/* 3. Build walls */}
        <div style={sectionBox}>
          <p style={sectionLabel}>Build walls</p>
          <div>
            <p style={fieldLabel}>Orientation</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['H', 'V'] as const).map(o => (
                <button key={o} onClick={() => setActiveOrientation(o)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 20, fontWeight: 600, border: '1.5px solid #31456B', backgroundColor: activeOrientation === o ? '#31456B' : '#fff', color: activeOrientation === o ? '#fff' : '#31456B', cursor: 'pointer' }}>
                  {o === 'H' ? 'Horizontal wall' : 'Vertical wall'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={addWall}
            style={{ width: '100%', padding: '12px 0', borderRadius: 6, backgroundColor: WALL_COLOR, color: '#fff', fontSize: 21, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            + Add wall
          </button>
          <p style={{ fontSize: 15, color: '#4a6080', margin: 0 }}>Walls can be moved and resized like other elements.</p>
        </div>

        {/* 4a. Selected zone editor */}
        {selectedZone && (
          <div style={{ ...sectionBox, border: '1.5px solid #6B92B6', backgroundColor: '#e8f0fb' }}>
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
                    style={{ flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 20, fontWeight: 600, border: '1.5px solid #6B92B6', backgroundColor: selectedZone.orientation === o ? '#6B92B6' : '#fff', color: selectedZone.orientation === o ? '#fff' : '#6B92B6', cursor: 'pointer' }}>
                    {o === 'H' ? 'Horizontal' : 'Vertical'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ ...fieldLabel, marginBottom: 6 }}>
                Rotation&nbsp;
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#31456B' }}>{selectedZone.rotation}°</span>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[-45, -15, 15, 45].map(delta => (
                  <button key={delta} onClick={() => rotateZone(delta)}
                    style={{ padding: '9px 4px', borderRadius: 6, fontSize: 17, fontWeight: 700, border: '1.5px solid #6B92B6', backgroundColor: '#fff', color: '#6B92B6', cursor: 'pointer' }}>
                    {delta > 0 ? `+${delta}°` : `${delta}°`}
                  </button>
                ))}
              </div>
              <button onClick={() => updateZone({ rotation: 0 })}
                style={{ marginTop: 5, fontSize: 15, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Reset to 0°
              </button>
            </div>

            <p style={{ fontSize: 17, color: '#4a6080', margin: 0 }}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedZone.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedZone.h)}px</span>
            </p>

            <button onClick={() => deleteZone(selectedZone.id)}
              style={{ fontSize: 17, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              Delete zone
            </button>
          </div>
        )}

        {/* 4b. Selected wall editor */}
        {selectedWall && (
          <div style={{ ...sectionBox, border: '1.5px solid #6B92B6', backgroundColor: '#e8f0fb' }}>
            <p style={sectionLabel}>Selected wall</p>

            <div>
              <p style={fieldLabel}>Orientation</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['H', 'V'] as const).map(o => (
                  <button key={o} onClick={() => setSelectedWallOrientation(o)}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 20, fontWeight: 600, border: '1.5px solid #6B92B6', backgroundColor: selectedWall.orientation === o ? '#6B92B6' : '#fff', color: selectedWall.orientation === o ? '#fff' : '#6B92B6', cursor: 'pointer' }}>
                    {o === 'H' ? 'Horizontal' : 'Vertical'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ ...fieldLabel, marginBottom: 6 }}>
                Rotation&nbsp;
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#31456B' }}>{selectedWall.rotation}°</span>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[-5, -1, 1, 5].map(delta => (
                  <button key={delta} onClick={() => rotateWall(delta)}
                    style={{ padding: '9px 4px', borderRadius: 6, fontSize: 17, fontWeight: 700, border: '1.5px solid #6B92B6', backgroundColor: '#fff', color: '#6B92B6', cursor: 'pointer' }}>
                    {delta > 0 ? `+${delta}°` : `${delta}°`}
                  </button>
                ))}
              </div>
              <button onClick={() => updateWall({ rotation: 0 })}
                style={{ marginTop: 5, fontSize: 15, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Reset to 0°
              </button>
            </div>

            <p style={{ fontSize: 17, color: '#4a6080', margin: 0 }}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedWall.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedWall.h)}px</span>
            </p>

            <button onClick={() => deleteWall(selectedWall.id)}
              style={{ fontSize: 17, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              Delete wall
            </button>
          </div>
        )}

        {/* 4c. Selected marker editor */}
        {selectedMarker && (
          <div style={{ ...sectionBox, border: `1.5px solid ${MARKER_CONFIGS[selectedMarker.type].border}`, backgroundColor: MARKER_CONFIGS[selectedMarker.type].bg + 'cc' }}>
            <p style={sectionLabel}>Selected marker</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MarkerIcon type={selectedMarker.type} color={MARKER_CONFIGS[selectedMarker.type].arrowColor} size={24} />
              <span style={{ fontSize: 18, fontWeight: 700, color: MARKER_CONFIGS[selectedMarker.type].color }}>
                {MARKER_CONFIGS[selectedMarker.type].label}
              </span>
            </div>

            <p style={{ fontSize: 17, color: '#4a6080', margin: 0 }}>
              W: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedMarker.w)}px</span>
              &nbsp;&nbsp;
              H: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3452' }}>{Math.round(selectedMarker.h)}px</span>
            </p>

            <p style={{ fontSize: 15, color: '#4a6080', margin: 0 }}>Drag to move · drag handles to resize</p>

            <button onClick={() => deleteMarker(selectedMarker.id)}
              style={{ fontSize: 17, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
              Remove marker
            </button>
          </div>
        )}

        {/* 4. Save */}
        <div style={{ ...sectionBox, marginTop: 'auto' }}>
          <p style={{ fontSize: 17, color: '#4a6080', margin: 0 }}>
            {zones.length} shelf zone{zones.length !== 1 ? 's' : ''}
            {' · '}
            {walls.length} wall{walls.length !== 1 ? 's' : ''}
            {' · '}
            {markers.length} marker{markers.length !== 1 ? 's' : ''}
          </p>
          <button onClick={handleSave}
            style={{ width: '100%', padding: '13px 0', borderRadius: 6, backgroundColor: '#31456B', color: '#fff', fontSize: 21, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Save layout
          </button>
          {saved && <p style={{ fontSize: 17, fontWeight: 600, color: '#16a34a', margin: 0 }}>Saved!</p>}
          <p style={{ fontSize: 15, color: '#7a95b0', margin: 0 }}>
            Coordinates saved as 0–1 floats relative to canvas size
          </p>
        </div>
      </div>
    </div>
  )
}
