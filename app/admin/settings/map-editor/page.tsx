'use client'

import MapZoneEditor from '../components/MapZoneEditor';

export default function MapEditorPage() {
  return (
    <main
      className="h-screen overflow-hidden px-6 pt-2 pb-5"
      style={{ backgroundColor: '#f0f0f0' }}
    >
      <h1 className="font-bold mb-2" style={{ color: '#31456B', fontSize: 32, textAlign: 'center' }}>
        Floorplan Editor
      </h1>
      <div className="h-[calc(100vh-5.5rem)] overflow-hidden">
        <MapZoneEditor
          onSave={(payload) => {
            console.log('Saved payload:', payload)
            alert(`Saved ${payload.sections.length} zone(s) and ${payload.markers.length} marker(s) — check console for full payload`)
          }}
        />
      </div>
    </main>
  )
}
