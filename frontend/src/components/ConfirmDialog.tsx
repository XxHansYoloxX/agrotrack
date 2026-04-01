import type { GerkParcela } from '../types'

interface Props {
  parcela: GerkParcela
  onPotrdi: () => void
  onZapri: () => void
  loading: boolean
}

export default function ConfirmDialog({ parcela, onPotrdi, onZapri, loading }: Props) {
  const areaHa = (parcela.area_m2 / 10000).toFixed(2)

  return (
    <div className="dialog-overlay" onClick={onZapri}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Dodaj parcelo na kmetijo?</div>
        <div className="dialog-body">
          <div className="dialog-row">
            <span className="dialog-label">GERK PID</span>
            <span className="dialog-value">{parcela.gerk_pid}</span>
          </div>
          <div className="dialog-row">
            <span className="dialog-label">Vrsta rabe</span>
            <span className="dialog-value">{parcela.opis_rabe ?? '—'}</span>
          </div>
          <div className="dialog-row">
            <span className="dialog-label">Površina</span>
            <span className="dialog-value">{areaHa} ha</span>
          </div>
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onZapri} disabled={loading}>
            Prekliči
          </button>
          <button className="dialog-btn confirm" onClick={onPotrdi} disabled={loading}>
            {loading ? 'Shranjujem…' : 'Dodaj parcelo'}
          </button>
        </div>
      </div>
    </div>
  )
}
