import type { Parcela } from '../types'

interface Props {
  parcele: Parcela[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function Sidebar({ parcele, selectedId, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">Parcele ({parcele.length})</div>
      <ul className="parcela-list">
        {parcele.map((p) => (
          <li
            key={p.id}
            className={`parcela-item${selectedId === p.id ? ' active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <div className="name">{p.naziv}</div>
            <div className="meta">
              {p.kultura ?? 'Ni kulture'} &middot; {p.povrsina} ha
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
