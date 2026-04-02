import { useState, useEffect } from 'react'
import type { Parcela, KolobarPosevek, VrstaPosevka } from '../types'
import { VRSTA_POSEVKA_LABELS } from '../types'
import './Kolobar.css'

interface Props {
  parcele: Parcela[]
}

const KULTURE = [
  'Pšenica ozimna',
  'Pšenica jara',
  'Koruza',
  'Soja',
  'Ječmen',
  'Sladki krompir',
  'Hmelj',
  'Oljna ogrščica',
  'Sončnica',
  'Travna mešanica',
  'Lucerna',
  'Tritikala',
  'Oves',
  'Grah',
  'Bob',
  'Leča',
  'Ajda',
  'Proso',
]

const LETA = [2021, 2022, 2023, 2024, 2025, 2026]

type TipRabe = 'Vse' | 'Njive' | 'Travniki' | 'Hmeljišča'

export default function Kolobar({ parcele }: Props) {
  const [filter, setFilter] = useState<TipRabe>('Vse')
  const [selectedParcele, setSelectedParcele] = useState<Set<string>>(new Set())
  const [showBulkPanel, setShowBulkPanel] = useState(false)
  const [kolobarData, setKolobarData] = useState<Map<string, KolobarPosevek[]>>(new Map())
  const [loading, setLoading] = useState(false)

  // Bulk form
  const [bulkKultura, setBulkKultura] = useState('')
  const [bulkLeto, setBulkLeto] = useState(new Date().getFullYear())
  const [bulkVrsta, setBulkVrsta] = useState<VrstaPosevka>('glavni_jarni')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [kulturaInput, setKulturaInput] = useState('')
  const [showKulturaSuggestions, setShowKulturaSuggestions] = useState(false)

  // Edit form
  const [editingPosevek, setEditingPosevek] = useState<KolobarPosevek | null>(null)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [editKultura, setEditKultura] = useState('')
  const [editVrsta, setEditVrsta] = useState<VrstaPosevka>('glavni_jarni')
  const [editDatumSetve, setEditDatumSetve] = useState('')
  const [editDatumSpravila, setEditDatumSpravila] = useState('')
  const [editPridelek, setEditPridelek] = useState('')
  const [editOpomba, setEditOpomba] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const filteredParcele = parcele.filter((p) => {
    if (filter === 'Vse') return true
    if (filter === 'Njive') return p.kultura?.toLowerCase().includes('njiv') || p.kultura?.toLowerCase().includes('1100')
    if (filter === 'Travniki') return p.kultura?.toLowerCase().includes('trav') || p.kultura?.toLowerCase().includes('1300')
    if (filter === 'Hmeljišča') return p.kultura?.toLowerCase().includes('hmelj') || p.kultura?.toLowerCase().includes('1221')
    return true
  })

  useEffect(() => {
    loadKolobarData()
  }, [parcele])

  const loadKolobarData = async () => {
    if (parcele.length === 0) {
      setKolobarData(new Map())
      return
    }

    setLoading(true)
    try {
      // Bulk fetch - en sam klic za vse parcele
      const ids = parcele.map((p) => p.id).join(',')
      const res = await fetch(`/api/kolobar?parcela_ids=${ids}`)

      if (res.ok) {
        const grouped = await res.json() as Record<string, KolobarPosevek[]>
        const data = new Map<string, KolobarPosevek[]>()
        Object.entries(grouped).forEach(([parcelaId, posevki]) => {
          data.set(parcelaId, posevki)
        })
        setKolobarData(data)
      }
    } catch (e) {
      console.error('Napaka pri nalaganju kolobarja:', e)
    } finally {
      setLoading(false)
    }
  }

  const toggleParcela = (id: string) => {
    const newSet = new Set(selectedParcele)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedParcele(newSet)
  }

  const selectAllNjive = () => {
    const njive = parcele.filter((p) => p.kultura?.toLowerCase().includes('njiv') || p.kultura?.toLowerCase().includes('1100'))
    setSelectedParcele(new Set(njive.map((p) => p.id)))
  }

  const selectAllTravniki = () => {
    const travniki = parcele.filter((p) => p.kultura?.toLowerCase().includes('trav') || p.kultura?.toLowerCase().includes('1300'))
    setSelectedParcele(new Set(travniki.map((p) => p.id)))
  }

  const clearSelection = () => {
    setSelectedParcele(new Set())
  }

  const handleBulkSave = async () => {
    if (!bulkKultura.trim() || selectedParcele.size === 0) return
    setBulkSaving(true)
    try {
      const res = await fetch('/api/kolobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcela_ids: Array.from(selectedParcele),
          leto: bulkLeto,
          vrsta_posevka: bulkVrsta,
          kultura: bulkKultura.trim(),
        }),
      })
      if (res.ok) {
        setBulkKultura('')
        setKulturaInput('')
        setSelectedParcele(new Set())
        setShowBulkPanel(false)
        loadKolobarData()
      }
    } catch {
      // tiha napaka
    } finally {
      setBulkSaving(false)
    }
  }

  const handleKulturaInputChange = (val: string) => {
    setKulturaInput(val)
    setBulkKultura(val)
    setShowKulturaSuggestions(val.length > 0)
  }

  const selectKultura = (k: string) => {
    setBulkKultura(k)
    setKulturaInput(k)
    setShowKulturaSuggestions(false)
  }

  const kulturaSuggestions = KULTURE.filter((k) =>
    k.toLowerCase().includes(kulturaInput.toLowerCase())
  ).slice(0, 8)

  const getPosevekForLetoAndParcela = (parcelaId: string, leto: number): KolobarPosevek | null => {
    const posevki = kolobarData.get(parcelaId) ?? []
    return posevki.find((p) => p.leto === leto) ?? null
  }

  const handleQuickAdd = async (parcelaId: string, leto: number) => {
    const kultura = prompt('Vnesite kulturo:')
    if (!kultura?.trim()) return
    try {
      const res = await fetch('/api/kolobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parcela_id: parcelaId,
          leto,
          vrsta_posevka: 'glavni_jarni',
          kultura: kultura.trim(),
        }),
      })
      if (res.ok) loadKolobarData()
    } catch {
      // tiha napaka
    }
  }

  const handleDeletePosevek = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Izbriši posevek?')) return
    try {
      const res = await fetch(`/api/kolobar/${id}`, { method: 'DELETE' })
      if (res.ok) loadKolobarData()
    } catch {
      // tiha napaka
    }
  }

  const openEditPanel = (posevek: KolobarPosevek) => {
    setEditingPosevek(posevek)
    setEditKultura(posevek.kultura)
    setEditVrsta(posevek.vrstaPosevka)
    setEditDatumSetve(posevek.datumSetve?.slice(0, 10) ?? '')
    setEditDatumSpravila(posevek.datumSpravila?.slice(0, 10) ?? '')
    setEditPridelek(posevek.pridelekTha != null ? String(posevek.pridelekTha) : '')
    setEditOpomba(posevek.opomba ?? '')
    setShowEditPanel(true)
    setShowBulkPanel(false)
  }

  const handleEditSave = async () => {
    if (!editingPosevek || !editKultura.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/kolobar/${editingPosevek.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kultura: editKultura.trim(),
          vrsta_posevka: editVrsta,
          datum_setve: editDatumSetve || undefined,
          datum_spravila: editDatumSpravila || undefined,
          pridelek_tha: editPridelek ? parseFloat(editPridelek) : undefined,
          opomba: editOpomba || undefined,
        }),
      })
      if (res.ok) {
        setShowEditPanel(false)
        setEditingPosevek(null)
        loadKolobarData()
      }
    } catch {
      // tiha napaka
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="kolobar-page">
      {/* Leva stran - seznam parcel */}
      <aside className="kolobar-sidebar">
        <div className="kolobar-sidebar-header">
          <h3>Parcele ({filteredParcele.length})</h3>
          <div className="filter-buttons">
            {(['Vse', 'Njive', 'Travniki', 'Hmeljišča'] as TipRabe[]).map((f) => (
              <button
                key={f}
                className={filter === f ? 'active' : ''}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <ul className="kolobar-parcele-list">
          {filteredParcele.map((p) => (
            <li key={p.id} className={selectedParcele.has(p.id) ? 'selected' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedParcele.has(p.id)}
                  onChange={() => toggleParcela(p.id)}
                />
                <div>
                  <div className="parcela-naziv">{p.naziv}</div>
                  <div className="parcela-meta">
                    {p.kultura ?? 'Ni rabe'} · {Number(p.povrsina).toFixed(2)} ha
                  </div>
                </div>
              </label>
            </li>
          ))}
        </ul>
      </aside>

      {/* Desna stran - tabela kolobarja */}
      <div className="kolobar-main">
        <div className="kolobar-toolbar">
          <div className="leto-filter">
            {LETA.map((l) => (
              <button key={l} className="leto-btn">{l}</button>
            ))}
          </div>
          <button
            className="bulk-btn"
            onClick={() => setShowBulkPanel(!showBulkPanel)}
            disabled={selectedParcele.size === 0}
          >
            Bulk vnos za označene parcele ({selectedParcele.size})
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Nalagam kolobar...</div>
        ) : (
          <div className="kolobar-table-wrap">
            <table className="kolobar-table">
              <thead>
                <tr>
                  <th style={{ width: '200px' }}>Parcela</th>
                  {LETA.map((l) => (
                    <th key={l}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredParcele.map((p) => (
                  <tr key={p.id} className={selectedParcele.has(p.id) ? 'highlighted' : ''}>
                    <td className="parcela-col">
                      <div className="parcela-naziv">{p.naziv}</div>
                      <div className="parcela-meta">{Number(p.povrsina).toFixed(2)} ha</div>
                    </td>
                    {LETA.map((leto) => {
                      const posevek = getPosevekForLetoAndParcela(p.id, leto)
                      return (
                        <td key={leto} className="posevek-cell">
                          {posevek ? (
                            <div className="posevek-card" onClick={() => openEditPanel(posevek)}>
                              <div className="posevek-kultura">{posevek.kultura}</div>
                              <div className="posevek-vrsta">{VRSTA_POSEVKA_LABELS[posevek.vrstaPosevka]}</div>
                              <button
                                className="posevek-delete"
                                onClick={(e) => handleDeletePosevek(posevek.id, e)}
                                title="Izbriši"
                              >
                                &times;
                              </button>
                            </div>
                          ) : (
                            <button
                              className="posevek-add"
                              onClick={() => handleQuickAdd(p.id, leto)}
                              title="Dodaj posevek"
                            >
                              +
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit panel */}
        {showEditPanel && editingPosevek && (
          <div className="edit-panel">
            <div className="edit-panel-header">
              <h3>Uredi posevek</h3>
              <button onClick={() => setShowEditPanel(false)}>&times;</button>
            </div>

            <div className="edit-form">
              <div className="form-row">
                <label>Kultura *</label>
                <input
                  type="text"
                  value={editKultura}
                  onChange={(e) => setEditKultura(e.target.value)}
                  placeholder="npr. Koruza"
                />
              </div>

              <div className="form-row">
                <label>Vrsta posevka *</label>
                <select value={editVrsta} onChange={(e) => setEditVrsta(e.target.value as VrstaPosevka)}>
                  {Object.entries(VRSTA_POSEVKA_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label>Datum setve</label>
                <input
                  type="date"
                  value={editDatumSetve}
                  onChange={(e) => setEditDatumSetve(e.target.value)}
                />
              </div>

              <div className="form-row">
                <label>Datum spravila</label>
                <input
                  type="date"
                  value={editDatumSpravila}
                  onChange={(e) => setEditDatumSpravila(e.target.value)}
                />
              </div>

              <div className="form-row">
                <label>Pridelek (t/ha)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editPridelek}
                  onChange={(e) => setEditPridelek(e.target.value)}
                  placeholder="npr. 8.5"
                />
              </div>

              <div className="form-row">
                <label>Opomba</label>
                <textarea
                  value={editOpomba}
                  onChange={(e) => setEditOpomba(e.target.value)}
                  rows={3}
                  placeholder="Dodatne opombe..."
                />
              </div>

              <div className="edit-buttons">
                <button
                  className="edit-cancel-btn"
                  onClick={() => setShowEditPanel(false)}
                >
                  Prekliči
                </button>
                <button
                  className="edit-save-btn"
                  onClick={handleEditSave}
                  disabled={editSaving || !editKultura.trim()}
                >
                  {editSaving ? 'Shranjujem...' : 'Shrani spremembe'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk vnos panel */}
        {showBulkPanel && (
          <div className="bulk-panel">
            <div className="bulk-panel-header">
              <h3>Bulk vnos posevka</h3>
              <button onClick={() => setShowBulkPanel(false)}>&times;</button>
            </div>

            <div className="bulk-form">
              <div className="form-row">
                <label>Kultura</label>
                <div className="autocomplete-wrap">
                  <input
                    type="text"
                    value={kulturaInput}
                    onChange={(e) => handleKulturaInputChange(e.target.value)}
                    onFocus={() => setShowKulturaSuggestions(kulturaInput.length > 0)}
                    placeholder="npr. Koruza"
                  />
                  {showKulturaSuggestions && kulturaSuggestions.length > 0 && (
                    <ul className="autocomplete-list">
                      {kulturaSuggestions.map((k) => (
                        <li key={k} onClick={() => selectKultura(k)}>
                          {k}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="form-row">
                <label>Leto</label>
                <input
                  type="number"
                  value={bulkLeto}
                  onChange={(e) => setBulkLeto(+e.target.value)}
                />
              </div>

              <div className="form-row">
                <label>Vrsta posevka</label>
                <select value={bulkVrsta} onChange={(e) => setBulkVrsta(e.target.value as VrstaPosevka)}>
                  {Object.entries(VRSTA_POSEVKA_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="bulk-selection-tools">
                <button onClick={selectAllNjive}>Vse njive</button>
                <button onClick={selectAllTravniki}>Vse travnike</button>
                <button onClick={clearSelection}>Počisti</button>
              </div>

              <div className="bulk-parcele-list">
                {parcele.map((p) => (
                  <label key={p.id} className={selectedParcele.has(p.id) ? 'checked' : ''}>
                    <input
                      type="checkbox"
                      checked={selectedParcele.has(p.id)}
                      onChange={() => toggleParcela(p.id)}
                    />
                    <span>{p.naziv}</span>
                  </label>
                ))}
              </div>

              <button
                className="bulk-save-btn"
                onClick={handleBulkSave}
                disabled={bulkSaving || !bulkKultura.trim() || selectedParcele.size === 0}
              >
                {bulkSaving ? 'Shranjujem...' : `Shrani za ${selectedParcele.size} parcel`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
