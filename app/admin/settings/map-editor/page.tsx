'use client'

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { QueryFetchPolicy } from 'firebase/data-connect'
import MapZoneEditor, { SavePayload, MapZoneEditorRef } from '../components/MapZoneEditor'
import { dataConnect } from '../../../../src/lib/firebase'
import {
  insertNamedFloorPlan,
  updateFloorPlanData,
  setFloorPlanDeployed,
  deleteFloorPlanById,
  getAllFloorPlansMeta,
  getFloorPlanById,
} from '../../../../src/dataconnect-generated'

interface PlanMeta {
  id: string
  name?: string | null
  isDeployed?: boolean | null
  updatedAt?: string | null
}

type Mode = 'idle' | 'editing' | 'creating'
type Status = 'idle' | 'saved' | 'deployed' | 'deleted' | 'error'

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

export default function MapEditorPage() {

  const [plans,          setPlans]          = useState<PlanMeta[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [livePlanId,     setLivePlanId]     = useState<string | null>(null)
  const [editorPayload,  setEditorPayload]  = useState<SavePayload | null>(null)
  const [editorKey,      setEditorKey]      = useState(0)
  const [mode,           setMode]           = useState<Mode>('idle')
  const [newPlanName,    setNewPlanName]    = useState('')
  const [saving,         setSaving]         = useState(false)
  const [deploying,      setDeploying]      = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [status,         setStatus]         = useState<Status>('idle')
  const [loadingPlans,   setLoadingPlans]   = useState(true)
  const [loadingPlan,    setLoadingPlan]    = useState(false)

  const newNameInputRef = useRef<HTMLInputElement>(null)
  const editorRef       = useRef<MapZoneEditorRef>(null)

  useEffect(() => { loadPlanList(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'creating') newNameInputRef.current?.focus() }, [mode])

  function flash(s: Status) {
    setStatus(s)
    setTimeout(() => setStatus('idle'), 3000)
  }

  function byUpdatedAtDesc(a: PlanMeta, b: PlanMeta) {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bTime - aTime
  }

  function getLatestPlan(plans: PlanMeta[]) {
    return [...plans].sort(byUpdatedAtDesc)[0] ?? null
  }

  async function fetchLatestPlans() {
    const res = await getAllFloorPlansMeta(
      dataConnect,
      { fetchPolicy: QueryFetchPolicy.SERVER_ONLY }
    )
    return res.data.floorPlans as PlanMeta[]
  }

  async function reconcileLivePlans(preferredLiveId?: string) {
    let fetched = await fetchLatestPlans()
    const initiallyDeployed = fetched.filter(plan => plan.isDeployed)

    const keepId =
      preferredLiveId ??
      initiallyDeployed.sort(byUpdatedAtDesc)[0]?.id ??
      null

    const needsNormalization = (plansToCheck: PlanMeta[]) => {
      const deployed = plansToCheck.filter(plan => plan.isDeployed)
      if (keepId === null) return deployed.length > 1
      return deployed.length !== 1 || !deployed.some(plan => plan.id === keepId)
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (!needsNormalization(fetched)) {
        return fetched.sort(byUpdatedAtDesc)
      }

      if (keepId !== null) {
        // Write the intended live version first so reconciliation never settles at zero live plans.
        await setFloorPlanDeployed(dataConnect, { id: keepId, isDeployed: true })
      }

      for (const plan of fetched) {
        if (keepId !== null && plan.id === keepId) continue
        if (plan.isDeployed) {
          await setFloorPlanDeployed(dataConnect, { id: plan.id, isDeployed: false })
        }
      }

      fetched = await fetchLatestPlans()
    }

    if (keepId !== null) {
      const deployed = fetched.filter(plan => plan.isDeployed)
      const hasExactlyOneLive = deployed.length === 1 && deployed[0]?.id === keepId
      if (!hasExactlyOneLive) {
        await setFloorPlanDeployed(dataConnect, { id: keepId, isDeployed: true })
        fetched = await fetchLatestPlans()
      }
    }

    return fetched.sort(byUpdatedAtDesc)
  }

  async function loadPlanList(autoSelectLatest = false) {
    setLoadingPlans(true)
    try {
      const fetched = await reconcileLivePlans()
      setPlans(fetched)
      setLivePlanId(fetched.find(plan => plan.isDeployed)?.id ?? null)
      if (autoSelectLatest && fetched.length > 0) {
        const latest = getLatestPlan(fetched)
        if (latest) await selectPlan(latest.id)
      }
    } catch (e) { console.error(e) }
    finally { setLoadingPlans(false) }
  }

  async function selectPlan(id: string) {
    setLoadingPlan(true)
    setSelectedPlanId(id)
    setMode('editing')
    try {
      const res = await getFloorPlanById(
        dataConnect,
        { id },
        { fetchPolicy: QueryFetchPolicy.SERVER_ONLY }
      )
      const plan = res.data.floorPlan
      if (!plan) return
      if (plan.isDeployed) {
        setLivePlanId(id)
      }
      setPlans(prev => prev.map(p => (
        p.id === id
          ? {
              ...p,
              name: plan.name ?? p.name,
              isDeployed: plan.isDeployed ?? p.isDeployed,
              updatedAt: plan.updatedAt ?? p.updatedAt,
            }
          : p
      )))
      setEditorPayload({
        sections: (plan.shelves as SavePayload['sections']) ?? [],
        walls:    (plan.walls    as SavePayload['walls'])    ?? [],
        markers:  (plan.markers  as SavePayload['markers'])  ?? [],
      })
      setEditorKey(k => k + 1)
    } catch (e) { console.error(e) }
    finally { setLoadingPlan(false) }
  }

  function startCreate() {
    setMode('creating')
    setNewPlanName('')
    setSelectedPlanId(null)
    setEditorPayload(null)
    setEditorKey(k => k + 1)
  }

  function cancelCreate() {
    setMode('idle')
    setNewPlanName('')
  }

  async function confirmCreate() {
    if (!newPlanName.trim()) return
    setSaving(true)
    try {
      const res = await insertNamedFloorPlan(dataConnect, {
        name: newPlanName.trim(),
        shelves: [],
        walls: [],
        markers: [],
      })
      const newId = res.data.floorPlan_insert.id
      const newPlan: PlanMeta = { id: newId, name: newPlanName.trim(), isDeployed: false, updatedAt: null }
      setPlans(prev => [...prev, newPlan])   // optimistic — no re-fetch needed
      setSelectedPlanId(newId)
      setNewPlanName('')
      setMode('editing')
    } catch (e) {
      console.error(e)
      flash('error')
    } finally { setSaving(false) }
  }

  // Save — stores layout, stays on page
  async function handleSave(payload: SavePayload) {
    if (!selectedPlanId) return
    setSaving(true)
    try {
      await updateFloorPlanData(dataConnect, {
        id: selectedPlanId,
        shelves: payload.sections,
        walls: payload.walls,
        markers: payload.markers,
      })
      setEditorPayload(payload)
      flash('saved')
    } catch (e) {
      console.error(e)
      flash('error')
    } finally { setSaving(false) }
  }

  // Deploy — marks this plan as deployed and redirects to student view
  async function handleDeploy() {
    if (!selectedPlanId) return
    setDeploying(true)
    try {
      const currentPayload = editorRef.current?.getPayload()
      if (currentPayload) {
        await updateFloorPlanData(dataConnect, {
          id: selectedPlanId,
          shelves: currentPayload.sections,
          walls: currentPayload.walls,
          markers: currentPayload.markers,
        })
        setEditorPayload(currentPayload)
      }
      const normalizedPlans = await reconcileLivePlans(selectedPlanId)
      setPlans(normalizedPlans)
      setLivePlanId(selectedPlanId)
      flash('deployed')
    } catch (e) {
      console.error(e)
      flash('error')
    } finally { setDeploying(false) }
  }

  // Delete — removes plan from DB and clears editor
  async function handleDelete() {
    if (!selectedPlanId) return
    setDeleting(true)
    try {
      await deleteFloorPlanById(dataConnect, { id: selectedPlanId })
      // Optimistic update — remove from local state immediately
      setPlans(prev => prev.filter(p => p.id !== selectedPlanId))
      if (livePlanId === selectedPlanId) {
        setLivePlanId(null)
      }
      setSelectedPlanId(null)
      setEditorPayload(null)
      setEditorKey(k => k + 1)
      setMode('idle')
      flash('deleted')
    } catch (e) {
      console.error(e)
      flash('error')
    } finally { setDeleting(false) }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    minHeight: 48,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid var(--fp-input-border)',
    backgroundColor: 'var(--fp-input-bg)',
    color: 'var(--fp-text-primary)',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 220,
    boxShadow: 'var(--fp-input-shadow)',
  }

  const btn = (bg: string, color = '#fff', disabled = false): React.CSSProperties => ({
    minHeight: 48,
    padding: '10px 16px',
    borderRadius: 12,
    border: '1px solid rgba(49,69,107,0.6)',
    background: disabled ? '#d1d5db' : `linear-gradient(180deg, ${bg}, ${bg})`,
    color: disabled ? '#9ca3af' : color,
    fontSize: 16,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap' as const,
    boxShadow: disabled ? 'none' : '0 0 0 3px rgba(49,69,107,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    letterSpacing: '0.01em',
  })

  const actionTile: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
  }

  const currentPlan = plans.find(p => p.id === selectedPlanId)
  const isDeployed  = !!selectedPlanId && livePlanId === selectedPlanId
  const busy        = saving || deploying || deleting
  const canSave     = (!!selectedPlanId || !!newPlanName.trim()) && mode === 'editing' && !busy
  const canAct      = !!selectedPlanId && !busy
  const canEdit     = mode === 'editing' && (!!selectedPlanId || !!newPlanName.trim())

  const statusMsg: Record<Status, { text: string; color: string }> = {
    idle:     { text: '', color: '' },
    saved:    { text: 'Layout saved!', color: '#4ade80' },
    deployed: { text: 'Deployed! Redirecting to student view…', color: '#93c5fd' },
    deleted:  { text: 'Layout deleted.', color: '#94a3b8' },
    error:    { text: 'Something went wrong — check console.', color: '#f87171' },
  }

  return (
    <main
      className="theme-floorplan-admin h-screen overflow-hidden px-6 pt-5 pb-4"
      style={{
        background: 'var(--fp-page-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >

      {/* ── Header ── */}
      <HexPanel contentStyle={{ display: 'flex', alignItems: 'center', gap: 16, padding: 18, flexWrap: 'wrap' }}>

        <div style={{ minWidth: 220, maxWidth: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fp-text-muted)' }}>
            Admin workspace
          </p>
          <h1 style={{ color: 'var(--fp-text-primary)', fontSize: 34, fontWeight: 800, lineHeight: 1.05, margin: 0 }}>
            Floorplan Editor
          </h1>
        </div>

        <HexPanel
          fill="var(--fp-surface-secondary)"
          style={{ flex: 1, minWidth: 320 }}
          contentStyle={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 12 }}
        >
          {/* Plan selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flex: 1,
              minWidth: 220,
            }}
          >
            {mode !== 'creating' ? (
              <>
                {loadingPlans ? (
                  <span style={{ fontSize: 15, color: 'var(--fp-text-muted)', fontWeight: 700 }}>Loading…</span>
                ) : (
                  <select
                    style={selectStyle}
                    value={selectedPlanId ?? ''}
                    onChange={e => {
                      if (e.target.value === '__new__') { startCreate(); return }
                      selectPlan(e.target.value)
                    }}
                  >
                    <option value="" disabled>
                      {plans.length === 0 ? 'No layouts yet' : '— Select a layout —'}
                    </option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {livePlanId === p.id ? '▶ ' : ''}{p.name ?? 'Untitled'}
                      </option>
                    ))}
                    {plans.length < 5 && <option value="__new__">+ Create New Floor Plan</option>}
                  </select>
                )}
                {plans.length === 0 && !loadingPlans && (
                  <button style={btn('#31456B')} onClick={startCreate}>+ Create New Floor Plan</button>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 15, fontWeight: 700, color: 'var(--fp-text-muted)' }}>New plan name:</label>
                <input
                  ref={newNameInputRef}
                  value={newPlanName}
                  onChange={e => setNewPlanName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') cancelCreate() }}
                  placeholder="e.g. Main Hall"
                  style={{ ...selectStyle, minWidth: 220 }}
                />
                <button style={btn(newPlanName.trim() ? '#689466' : '#9ca3af')} onClick={confirmCreate} disabled={!newPlanName.trim()}>Create</button>
                <button style={btn('#e5e7eb', '#4a6080')} onClick={cancelCreate}>Cancel</button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
          <button
            style={{ ...btn('#689466', '#fff', !canSave), ...actionTile }}
            onClick={() => editorRef.current?.triggerSave()}
            disabled={!canSave}
            title="Save this layout"
          >
            {saving ? 'Saving…' : 'Save layout'}
          </button>

          {isDeployed ? (
            <span style={{
              ...actionTile,
              minHeight: 48,
              padding: '10px 16px',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 800,
              background: 'linear-gradient(180deg, #166534, #14532d)',
              color: '#fff',
              letterSpacing: '0.06em',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 10px 20px rgba(22,101,52,0.22)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4ade80', display: 'inline-block', boxShadow: '0 0 6px #4ade80' }} />
              LIVE
            </span>
          ) : (
            <button
              style={{ ...btn('#2563eb', '#fff', !canAct || deploying), ...actionTile }}
              onClick={handleDeploy}
              disabled={!canAct || deploying}
              title="Publish to student view"
            >
              {deploying ? 'Deploying…' : 'Deploy'}
            </button>
          )}

          <button
            style={{ ...btn('#dc2626', '#fff', !canAct), ...actionTile }}
            onClick={handleDelete}
            disabled={!canAct}
            title="Delete this layout"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>

          <a
            href="/map"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btn('#6B92B6'), ...actionTile, textDecoration: 'none' }}
          >
            Student view
          </a>
          </div>
        </HexPanel>
      </HexPanel>

      {/* ── Status bar ── */}
      {status !== 'idle' && (
        <HexPanel contentStyle={{ textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '10px 14px', color: statusMsg[status].color }}>
          {statusMsg[status].text}
        </HexPanel>
      )}
      {mode === 'idle' && status === 'idle' && !loadingPlans && (
        <HexPanel contentStyle={{ textAlign: 'center', color: 'var(--fp-text-muted)', fontSize: 13, fontWeight: 600, padding: '10px 14px' }}>
          Select a layout to edit, or create a new one. Hit <strong style={{ color: 'var(--fp-text-primary)' }}>Save layout</strong> to store changes. Hit <strong style={{ color: 'var(--fp-text-primary)' }}>Deploy</strong> to publish to students.
        </HexPanel>
      )}
      {mode === 'creating' && newPlanName.trim() && status === 'idle' && (
        <HexPanel contentStyle={{ textAlign: 'center', color: 'var(--fp-text-muted)', fontSize: 13, fontWeight: 700, padding: '10px 14px' }}>
          New plan: <strong style={{ color: 'var(--fp-text-primary)' }}>{newPlanName}</strong> — draw your layout then hit Save layout.
        </HexPanel>
      )}
      {loadingPlan && (
        <HexPanel contentStyle={{ textAlign: 'center', color: 'var(--fp-text-muted)', fontSize: 13, fontWeight: 700, padding: '10px 14px' }}>Loading layout…</HexPanel>
      )}

      {/* ── Editor ── */}
      <HexPanel style={{ flex: 1, minHeight: 0, display: 'flex' }} contentStyle={{ flex: 1, minHeight: 0, overflow: 'visible', padding: 18 }}>
        {canEdit && !loadingPlan && (
          <MapZoneEditor
            key={editorKey}
            ref={editorRef}
            initialPayload={editorPayload ?? undefined}
            onSave={handleSave}
          />
        )}
      </HexPanel>

    </main>
  )
}
