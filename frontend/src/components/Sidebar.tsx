import { useRef } from 'react'
import type { Parcela } from '../types'

interface Props {
  parcele: Parcela[]
  selectedId: string | null
  onSelect: (id: string) => void
  onGerkUvoz: () => void
  gerkIskanje: boolean
  gerkCount: number
  onUvozGeojson: (data: unknown) => Promise<void>
  uvozStanje: { loading: boolean; sporocilo: string | null; napaka: boolean }
}

export default function Sidebar({
  parcele, selectedId, onSelect,
  onGerkUvoz, gerkIskanje, gerkCount,
  onUvozGeojson, uvozStanje,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      try { onUvozGeojson(JSON.parse(reader.result as string)) }
      catch { onUvozGeojson(null) }
    }
    reader.readAsText(file)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Parcele ({parcele.length})</div>

      {/* ── GERK uvoz ── */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #bfdbfe', background: '#eff6ff' }}>
        <button
          onClick={onGerkUvoz}
          disabled={gerkIskanje}
          style={{
            width: '100%',
            background: gerkIskanje ? '#6b9de8' : '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.65rem 1rem',
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: gerkIskanje ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 6px rgba(29,78,216,0.3)',
          }}
        >
          {gerkIskanje ? 'Iščem parcele…' : '🗺 Uvozi GERK parcele'}
        </button>
        {gerkCount > 0 && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8' }}>
            {gerkCount} GERK parcel prikazanih na karti
          </div>
        )}
      </div>

      {/* ── GeoJSON datoteka ── */}
      <div className="uvoz-section">
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="uvoz-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uvozStanje.loading}
        >
          {uvozStanje.loading ? 'Uvažam…' : 'Naloži GeoJSON datoteko'}
        </button>
        {uvozStanje.sporocilo && (
          <div className={`uvoz-msg${uvozStanje.napaka ? ' napaka' : ' ok'}`}>
            {uvozStanje.sporocilo}
          </div>
        )}
      </div>

      <ul className="parcela-list">
        {parcele.map((p) => (
          <li
            key={p.id}
            className={`parcela-item${selectedId === p.id ? ' active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <div className="name">{p.naziv}</div>
            <div className="meta">
              {p.kultura ?? 'Ni rabe'} &middot; {Number(p.povrsina).toFixed(2)} ha
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
