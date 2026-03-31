import { useState } from 'react'
import { useParcele } from './hooks/useParcele'
import ParcelaMap from './components/ParcelaMap'
import Sidebar from './components/Sidebar'

export default function App() {
  const { parcele, loading, error } = useParcele()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="app">
      <header className="header">
        <span style={{ fontSize: '1.5rem' }}>🌾</span>
        <div>
          <h1>AgroTrack</h1>
          <div className="subtitle">Sistem za upravljanje kmetije</div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          Napaka pri nalaganju parcel: {error} — preverite, da backend teče na portu 3000.
        </div>
      )}

      <div className="main">
        {loading ? (
          <div className="loading">Nalagam parcele&hellip;</div>
        ) : (
          <>
            <Sidebar parcele={parcele} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="map-container">
              <ParcelaMap
                parcele={parcele}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </>
        )}
      </div>

      <div className="status-bar">
        <span>
          <span className={`status-dot${error ? '' : ' ok'}`} />
          Backend: {error ? 'nedosegljiv' : 'povezan'}
        </span>
        <span>Parcele: {parcele.length}</span>
        <span>Sprint 1 &mdash; AgroTrack v0.1</span>
      </div>
    </div>
  )
}
