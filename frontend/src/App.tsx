import { useState } from 'react'
import { useParcele } from './hooks/useParcele'
import ParcelaMap from './components/ParcelaMap'
import Sidebar from './components/Sidebar'
import type { GerkParcela, KmgParcela } from './types'

export default function App() {
  const { parcele, loading, error, refetch } = useParcele()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // GeoJSON upload
  const [uvozLoading, setUvozLoading] = useState(false)
  const [uvozSporocilo, setUvozSporocilo] = useState<string | null>(null)
  const [uvozNapaka, setUvozNapaka] = useState(false)

  // GERK iskanje
  const [gerkParcele, setGerkParcele] = useState<GerkParcela[]>([])
  const [gerkIskanje, setGerkIskanje] = useState(false)
  const [searchTrigger, setSearchTrigger] = useState(0)

  // KMG-MID iskanje
  const [kmgParcele, setKmgParcele] = useState<KmgParcela[]>([])
  const [kmgGeometries, setKmgGeometries] = useState<GerkParcela[]>([])
  const [kmgIskanje, setKmgIskanje] = useState(false)
  const [kmgNapaka, setKmgNapaka] = useState<string | null>(null)
  const [kmgDodajanje, setKmgDodajanje] = useState(false)

  // ── GeoJSON datoteka uvoz ──────────────────────────────────────────────────
  const handleUvozGeojson = async (data: unknown) => {
    setUvozLoading(true)
    setUvozSporocilo(null)
    setUvozNapaka(false)
    try {
      if (!data) throw new Error('Datoteka ni veljavna JSON.')
      const res = await fetch('/api/parcele/uvoz-geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json() as { uvozene?: number; preskocene?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const preskocene = json.preskocene ? `, preskočenih: ${json.preskocene}` : ''
      setUvozSporocilo(`Uvoženo ${json.uvozene} parcel${preskocene}.`)
      if ((json.uvozene ?? 0) > 0) refetch()
    } catch (e) {
      setUvozSporocilo((e as Error).message)
      setUvozNapaka(true)
    } finally {
      setUvozLoading(false)
    }
  }

  // ── Gumb "Uvozi GERK parcele" → sproži bbox iskanje ───────────────────────
  const handleGerkUvoz = () => setSearchTrigger((t) => t + 1)

  // ── Klic iz ParcelaMap ko dobi bbox (po triggerju) ─────────────────────────
  const handleBbox = async (bbox: [number, number, number, number]) => {
    setGerkIskanje(true)
    try {
      const bboxStr = bbox.map((v) => v.toFixed(6)).join(',')
      const res = await fetch(`/api/gerk/iskanje?bbox=${bboxStr}`)
      if (!res.ok) return
      const fc = await res.json() as {
        features: Array<{
          properties: Omit<GerkParcela, 'geometry'>
          geometry: GerkParcela['geometry']
        }>
      }
      const obstojeciGmidi = new Set(parcele.map((p) => p.gmid).filter(Boolean))
      const kandidati = fc.features
        .map((f) => ({ ...f.properties, geometry: f.geometry }))
        .filter((k) => !obstojeciGmidi.has(k.gerk_pid))
      setGerkParcele(kandidati)
    } catch {
      // tiha napaka — iskanje je opcijsko
    } finally {
      setGerkIskanje(false)
    }
  }

  // ── Potrdi dodajanje GERK parcele na kmetijo ──────────────────────────────
  const handleGerkDodaj = async (gp: GerkParcela) => {
    const res = await fetch('/api/parcele/iz-gerk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gerk_pid: gp.gerk_pid }),
    })
    if (!res.ok) {
      const err = await res.json() as { error?: string }
      throw new Error(err.error ?? `HTTP ${res.status}`)
    }
    setGerkParcele((prev) => prev.filter((p) => p.gerk_pid !== gp.gerk_pid))
    refetch()
  }

  // ── KMG-MID iskanje parcel ─────────────────────────────────────────────────
  const handleKmgSearch = async (kmgMid: string) => {
    setKmgIskanje(true)
    setKmgNapaka(null)
    setKmgParcele([])
    setKmgGeometries([])
    try {
      const res = await fetch(`/api/gerk/po-kmg-mid?kmg_mid=${encodeURIComponent(kmgMid)}`)
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as KmgParcela[]
      if (!data.length) { setKmgNapaka('Za ta KMG-MID ni najdenih parcel.'); return }
      setKmgParcele(data)

      // Naloži geometrije iz lokalne baze
      const pids = data.map((p) => p.gerk_pid).join(',')
      const geoRes = await fetch(`/api/gerk/iskanje?gerk_pids=${pids}`)
      if (geoRes.ok) {
        const fc = await geoRes.json() as {
          features: Array<{ properties: Omit<GerkParcela, 'geometry'>; geometry: GerkParcela['geometry'] }>
        }
        setKmgGeometries(fc.features.map((f) => ({ ...f.properties, geometry: f.geometry })))
      }
    } catch (e) {
      setKmgNapaka((e as Error).message)
    } finally {
      setKmgIskanje(false)
    }
  }

  // ── Dodaj vse KMG parcele naenkrat ────────────────────────────────────────
  const handleKmgDodajVse = async () => {
    setKmgDodajanje(true)
    try {
      let dodanih = 0
      for (const p of kmgParcele) {
        const res = await fetch('/api/parcele/iz-gerk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gerk_pid: p.gerk_pid, domace_ime: p.domace_ime }),
        })
        if (res.ok) dodanih++
      }
      if (dodanih > 0) refetch()
      setKmgParcele([])
      setKmgGeometries([])
    } catch {
      // tiha napaka
    } finally {
      setKmgDodajanje(false)
    }
  }

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
            <Sidebar
              parcele={parcele}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onGerkUvoz={handleGerkUvoz}
              gerkIskanje={gerkIskanje}
              gerkCount={gerkParcele.length}
              onUvozGeojson={handleUvozGeojson}
              uvozStanje={{ loading: uvozLoading, sporocilo: uvozSporocilo, napaka: uvozNapaka }}
              onKmgSearch={handleKmgSearch}
              kmgIskanje={kmgIskanje}
              kmgNapaka={kmgNapaka}
              kmgParcele={kmgParcele}
              kmgDodajanje={kmgDodajanje}
              onKmgDodajVse={handleKmgDodajVse}
            />
            <div className="map-container">
              <ParcelaMap
                parcele={parcele}
                gerkParcele={gerkParcele}
                kmgGeometries={kmgGeometries}
                kmgParcele={kmgParcele}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onGerkDodaj={handleGerkDodaj}
                searchTrigger={searchTrigger}
                onBbox={handleBbox}
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
        <span>Moje parcele: {parcele.length}</span>
        {gerkParcele.length > 0 && (
          <span style={{ color: '#93c5fd' }}>GERK: {gerkParcele.length} na karti</span>
        )}
        {kmgParcele.length > 0 && (
          <span style={{ color: '#fca5a5' }}>KMG: {kmgParcele.length} parcel</span>
        )}
        <span>Sprint 2 &mdash; AgroTrack v0.2</span>
      </div>
    </div>
  )
}
