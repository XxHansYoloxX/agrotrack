import { useRef } from 'react'
import type { Parcela } from '../types'

interface Props {
  parcele: Parcela[]
  selectedId: string | null
  onSelect: (id: string) => void
  onUvozGeojson: (data: unknown) => Promise<void>
  uvozStanje: { loading: boolean; sporocilo: string | null; napaka: boolean }
}

export default function Sidebar({ parcele, selectedId, onSelect, onUvozGeojson, uvozStanje }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        onUvozGeojson(data)
      } catch {
        onUvozGeojson(null)
      }
    }
    reader.readAsText(file)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Parcele ({parcele.length})</div>

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
