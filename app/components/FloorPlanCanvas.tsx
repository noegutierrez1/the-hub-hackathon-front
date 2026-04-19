'use client'

import type React from 'react'

export type CategoryId =
  | 'frozen'
  | 'refrigerated'
  | 'produce'
  | 'canned_goods'
  | 'dry_goods'
  | 'misc_non_food'

export type MarkerType = 'entrance' | 'exit' | 'help_desk'

export interface FloorPlanZone {
  id: string
  catId: CategoryId
  limit: number
  rotation: number
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlanWall {
  id: string
  rotation: number
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlanMarker {
  id: string
  type: MarkerType
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlanGhost {
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlanSelection {
  id: string
  kind: 'zone' | 'wall' | 'marker'
}

export const CATEGORIES = [
  { id: 'frozen' as CategoryId,        label: 'Frozen',          fill: '#E6F1FB', text: '#0C447C' },
  { id: 'refrigerated' as CategoryId,  label: 'Refrigerated',    fill: '#E1F5EE', text: '#085041' },
  { id: 'produce' as CategoryId,       label: 'Produce',         fill: '#EAF3DE', text: '#27500A' },
  { id: 'canned_goods' as CategoryId,  label: 'Canned goods',    fill: '#FAEEDA', text: '#633806' },
  { id: 'dry_goods' as CategoryId,     label: 'Dry goods',       fill: '#EEEDFE', text: '#3C3489' },
  { id: 'misc_non_food' as CategoryId, label: 'Misc / non-food', fill: '#F1EFE8', text: '#444441' },
] as const

export const MARKER_CONFIGS: Record<
  MarkerType,
  { label: string; color: string; bg: string; border: string; arrowColor: string }
> = {
  entrance:  { label: 'ENTRANCE',  color: '#166534', bg: '#dcfce7', border: '#689466', arrowColor: '#689466' },
  exit:      { label: 'EXIT',      color: '#991b1b', bg: '#fee2e2', border: '#dc2626', arrowColor: '#dc2626' },
  help_desk: { label: 'HELP DESK', color: '#1e3a8a', bg: '#dbeafe', border: '#2563eb', arrowColor: '#2563eb' },
}

export const FLOORPLAN_CANVAS_SIZE = 902

// Shared hex-border constants — keep in sync with admin panel values
const CUT = 22           // px — cut corner size
const BW  = 5            // px — border width
const BC  = '#31456B'   // Monterey Bay Blue

const WALL_EDGE = '#22304b'
const WALL_FILL = 'rgba(49,69,107,0.88)'

function getCategory(id: CategoryId) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

function hexClipPath(cut: number) {
  const c = `${cut}px`
  return `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`
}

// Builds the same multi-gradient hex border used by admin panel sectionBox/shellCard.
// Returns style properties that draw border lines on BOTH straight edges and diagonal cuts.
function hexBorderOverlayStyle(cut: number, bw: number, bc: string): React.CSSProperties {
  const cutPx = `${cut}px`
  const bwPx  = `${bw}px`
  const half  = 4

  return {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 50,
    clipPath: hexClipPath(cut),
    backgroundImage: [
      // top edge
      `linear-gradient(${bc}, ${bc})`,
      // bottom edge
      `linear-gradient(${bc}, ${bc})`,
      // left edge
      `linear-gradient(${bc}, ${bc})`,
      // right edge
      `linear-gradient(${bc}, ${bc})`,
      // top-left diagonal
      `linear-gradient(135deg, transparent calc(50% - ${half}px), ${bc} calc(50% - ${half}px), ${bc} calc(50% + ${half}px), transparent calc(50% + ${half}px))`,
      // top-right diagonal
      `linear-gradient(225deg, transparent calc(50% - ${half}px), ${bc} calc(50% - ${half}px), ${bc} calc(50% + ${half}px), transparent calc(50% + ${half}px))`,
      // bottom-right diagonal
      `linear-gradient(315deg, transparent calc(50% - ${half}px), ${bc} calc(50% - ${half}px), ${bc} calc(50% + ${half}px), transparent calc(50% + ${half}px))`,
      // bottom-left diagonal
      `linear-gradient(45deg, transparent calc(50% - ${half}px), ${bc} calc(50% - ${half}px), ${bc} calc(50% + ${half}px), transparent calc(50% + ${half}px))`,
    ].join(','),
    backgroundSize: [
      `calc(100% - ${cut * 2}px) ${bwPx}`,    // top
      `calc(100% - ${cut * 2}px) ${bwPx}`,    // bottom
      `${bwPx} calc(100% - ${cut * 2}px)`,    // left
      `${bwPx} calc(100% - ${cut * 2}px)`,    // right
      `${cutPx} ${cutPx}`,                     // corners ×4
      `${cutPx} ${cutPx}`,
      `${cutPx} ${cutPx}`,
      `${cutPx} ${cutPx}`,
    ].join(','),
    backgroundPosition: [
      `${cutPx} 0`,        // top
      `${cutPx} 100%`,     // bottom
      `0 ${cutPx}`,        // left
      `100% ${cutPx}`,     // right
      '0 0',               // top-left
      '100% 0',            // top-right
      '100% 100%',         // bottom-right
      '0 100%',            // bottom-left
    ].join(','),
    backgroundRepeat: 'no-repeat',
  }
}

function ArrowUp({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block', pointerEvents: 'none' }}>
      <path d="M12 3 L22 20 L2 20 Z" />
    </svg>
  )
}

function ArrowDown({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: 'block', pointerEvents: 'none' }}>
      <path d="M12 21 L2 4 L22 4 Z" />
    </svg>
  )
}

function HelpIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block', pointerEvents: 'none' }}>
      <circle cx="12" cy="12" r="10" fill={color} opacity="0.15" />
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
      <text x="12" y="17" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="sans-serif">?</text>
    </svg>
  )
}

export function MarkerIcon({ type, color, size }: { type: MarkerType; color: string; size?: number }) {
  if (type === 'entrance') return <ArrowUp color={color} size={size} />
  if (type === 'exit')     return <ArrowDown color={color} size={size} />
  return <HelpIcon color={color} size={size} />
}

interface FloorPlanCanvasProps {
  canvasRef?: React.Ref<HTMLDivElement>
  canvasSize: number
  zones: FloorPlanZone[]
  walls: FloorPlanWall[]
  markers: FloorPlanMarker[]
  selected?: FloorPlanSelection | null
  ghost?: FloorPlanGhost | null
  ghostCategoryId?: CategoryId
  onCanvasMouseDown?: React.MouseEventHandler<HTMLDivElement>
  onZoneMouseDown?: (event: React.MouseEvent, id: string) => void
  onWallMouseDown?: (event: React.MouseEvent, id: string) => void
  onMarkerMouseDown?: (event: React.MouseEvent, id: string) => void
  renderZoneExtras?: (zone: FloorPlanZone, isSelected: boolean) => React.ReactNode
  renderWallExtras?: (wall: FloorPlanWall, isSelected: boolean) => React.ReactNode
  renderMarkerExtras?: (marker: FloorPlanMarker, isSelected: boolean) => React.ReactNode
  style?: React.CSSProperties
}

export default function FloorPlanCanvas({
  canvasRef,
  canvasSize,
  zones,
  walls,
  markers,
  selected = null,
  ghost = null,
  ghostCategoryId = 'frozen',
  onCanvasMouseDown,
  onZoneMouseDown,
  onWallMouseDown,
  onMarkerMouseDown,
  renderZoneExtras,
  renderWallExtras,
  renderMarkerExtras,
  style,
}: FloorPlanCanvasProps) {
  const ghostCategory = getCategory(ghostCategoryId)

  return (
    // Outer wrapper — sets dimensions and clips the visible shape
    <div
      style={{
        position: 'relative',
        width: canvasSize,
        height: canvasSize,
        flexShrink: 0,
        clipPath: hexClipPath(CUT),
        boxShadow: '0 12px 36px rgba(49,69,107,0.22), 0 2px 8px rgba(49,69,107,0.12)',
        ...style,
      }}
    >
      {/* Blueprint canvas — canvasRef lives here so getBoundingClientRect is correct */}
      <div
        ref={canvasRef}
        onMouseDown={onCanvasMouseDown}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#C8DCED',
          backgroundImage: [
            'linear-gradient(to right, rgba(255,255,255,0.32) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(255,255,255,0.32) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '40px 40px',
          cursor: onCanvasMouseDown ? 'crosshair' : 'default',
          overflow: 'hidden',
        }}
      >
        {zones.map(zone => {
          const category = getCategory(zone.catId)
          const isSelected = selected?.id === zone.id && selected.kind === 'zone'
          return (
            <div
              key={zone.id}
              onMouseDown={onZoneMouseDown ? event => onZoneMouseDown(event, zone.id) : undefined}
              style={{
                position: 'absolute',
                left: zone.x,
                top: zone.y,
                width: zone.w,
                height: zone.h,
                backgroundColor: category.fill,
                border: isSelected ? `2px solid ${category.text}` : `1.5px solid ${category.text}55`,
                borderRadius: 5,
                cursor: onZoneMouseDown ? 'move' : 'default',
                zIndex: isSelected ? 10 : 1,
                boxShadow: isSelected ? `0 0 0 3px ${category.text}30` : '0 1px 4px rgba(0,0,0,0.12)',
                transform: `rotate(${zone.rotation}deg)`,
                transformOrigin: 'center center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
              }}
            >
              <span style={{ color: category.text, fontSize: 15, fontWeight: 600, pointerEvents: 'none', lineHeight: 1.2, textAlign: 'center', padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {category.label}
              </span>
              <span style={{ color: category.text, fontSize: 14, opacity: 0.6, pointerEvents: 'none', lineHeight: 1.2 }}>
                Limit: {zone.limit}
              </span>
              {zone.rotation !== 0 && (
                <span style={{ color: category.text, fontSize: 13, opacity: 0.4, pointerEvents: 'none', lineHeight: 1 }}>
                  {zone.rotation}°
                </span>
              )}
              {renderZoneExtras?.(zone, isSelected)}
            </div>
          )
        })}

        {walls.map(wall => {
          const isSelected = selected?.id === wall.id && selected.kind === 'wall'
          return (
            <div
              key={wall.id}
              onMouseDown={onWallMouseDown ? event => onWallMouseDown(event, wall.id) : undefined}
              style={{
                position: 'absolute',
                left: wall.x,
                top: wall.y,
                width: wall.w,
                height: wall.h,
                backgroundColor: WALL_FILL,
                border: isSelected ? `2px solid ${BC}` : `1.5px solid ${WALL_EDGE}`,
                borderRadius: 4,
                cursor: onWallMouseDown ? 'move' : 'default',
                zIndex: isSelected ? 12 : 4,
                boxShadow: isSelected ? `0 0 0 3px ${BC}40` : '0 1px 4px rgba(0,0,0,0.18)',
                transform: `rotate(${wall.rotation}deg)`,
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
              {wall.rotation !== 0 && (
                <span style={{ position: 'absolute', bottom: 3, right: 6, color: '#ffffff', fontSize: 13, fontWeight: 700, pointerEvents: 'none', lineHeight: 1, opacity: 0.75 }}>
                  {wall.rotation}°
                </span>
              )}
              {renderWallExtras?.(wall, isSelected)}
            </div>
          )
        })}

        {markers.map(marker => {
          const config = MARKER_CONFIGS[marker.type]
          const isSelected = selected?.id === marker.id && selected.kind === 'marker'
          const iconSize = Math.max(16, Math.min(marker.w, marker.h) * 0.38)
          return (
            <div
              key={marker.id}
              onMouseDown={onMarkerMouseDown ? event => onMarkerMouseDown(event, marker.id) : undefined}
              style={{
                position: 'absolute',
                left: marker.x - marker.w / 2,
                top: marker.y - marker.h / 2,
                width: marker.w,
                height: marker.h,
                backgroundColor: config.bg,
                border: isSelected ? `2px solid ${BC}` : `2px solid ${config.border}`,
                borderRadius: 8,
                cursor: onMarkerMouseDown ? 'move' : 'default',
                zIndex: isSelected ? 15 : 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                overflow: 'visible',
                boxShadow: isSelected ? `0 0 0 3px ${BC}30` : `0 2px 8px ${config.border}44`,
              }}
            >
              <MarkerIcon type={marker.type} color={config.arrowColor} size={iconSize} />
              <span style={{ fontSize: Math.max(11, Math.min(15, marker.w / 6.5)), fontWeight: 800, color: config.color, letterSpacing: '0.06em', pointerEvents: 'none', lineHeight: 1, textAlign: 'center' }}>
                {config.label}
              </span>
              {renderMarkerExtras?.(marker, isSelected)}
            </div>
          )
        })}

        {ghost && (
          <div
            style={{
              position: 'absolute',
              left: ghost.x,
              top: ghost.y,
              width: ghost.w,
              height: ghost.h,
              backgroundColor: ghostCategory.fill + 'bb',
              border: `2px dashed ${ghostCategory.text}`,
              borderRadius: 5,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
      </div>

      {/* Hex border overlay — draws gradient lines on BOTH straight and diagonal cut edges */}
      <div style={hexBorderOverlayStyle(CUT, BW, BC)} />
    </div>
  )
}
