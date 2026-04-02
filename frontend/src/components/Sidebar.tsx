import { useRef, useState } from 'react'
import type { Parcela, KmgParcela } from '../types'

interface Props {
  parcele: Parcela[]
  selectedId: string | null
  onSelect: (id: string) => void
  onGerkUvoz: () => void
  gerkIskanje: boolean
  gerkCount: number
  onUvozGeojson: (data: unknown) => Promise<void>
  uvozStanje: { loading: boolean; sporocilo: string | null; napaka: boolean }
  onKmgSearch: (kmgMid: string) => Promise<void>
  kmgIskanje: boolean
  kmgNapaka: string | null
  kmgParcele: KmgParcela[]
  kmgDodajanje: boolean
  onKmgDodajVse: () => Promise<void>
}

export default function Sidebar({
  parcele, selectedId, onSelect,
  onGerkUvoz, gerkIskanje, gerkCount,
  onUvozGeojson, uvozStanje,
  onKmgSearch, kmgIskanje, kmgNapaka, kmgParcele, kmgDodajanje, onKmgDodajVse,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [kmgMid, setKmgMid] = useState('')
  const selectedParcela = parcele.find((p) => p.id === selectedId) ?? null

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

      {/* ── KMG-MID iskanje ── */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #fecaca', background: '#fef2f2' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#991b1b' }}>
          Moje parcele (KMG-MID)
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (kmgMid.trim()) onKmgSearch(kmgMid.trim()) }}
          style={{ display: 'flex', gap: '0.4rem' }}
        >
          <input
            type="text"
            placeholder="npr. 100315960"
            value={kmgMid}
            onChange={(e) => setKmgMid(e.target.value)}
            style={{
              flex: 1, padding: '0.5rem 0.6rem',
              border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem',
            }}
          />
          <button
            type="submit"
            disabled={kmgIskanje || !kmgMid.trim()}
            style={{
              background: kmgIskanje ? '#f87171' : '#dc2626',
              color: '#fff', border: 'none', borderRadius: '6px',
              padding: '0.5rem 0.8rem', fontSize: '0.82rem', fontWeight: 700,
              cursor: kmgIskanje || !kmgMid.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {kmgIskanje ? 'Iščem…' : 'Poišči moje parcele'}
          </button>
        </form>
        {kmgNapaka && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#b91c1c' }}>{kmgNapaka}</div>
        )}
        {kmgParcele.length > 0 && (
          <div style={{ marginTop: '0.4rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>
              {kmgParcele.length} parcel prikazanih na karti
            </div>
            <button
              onClick={onKmgDodajVse}
              disabled={kmgDodajanje}
              style={{
                marginTop: '0.35rem', width: '100%',
                background: kmgDodajanje ? '#f87171' : '#16a34a',
                color: '#fff', border: 'none', borderRadius: '6px',
                padding: '0.5rem 0.8rem', fontSize: '0.82rem', fontWeight: 700,
                cursor: kmgDodajanje ? 'not-allowed' : 'pointer',
              }}
            >
              {kmgDodajanje ? 'Dodajam…' : `Dodaj vse moje parcele (${kmgParcele.length})`}
            </button>
          </div>
        )}
      </div>

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
