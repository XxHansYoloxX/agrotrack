import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import type { Layer } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Parcela, GerkParcela } from '../types'

// Fix Leaflet default icon paths broken by Vite bundling
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

interface Props {
  parcele: Parcela[]
  gerkParcele: GerkParcela[]
  selectedId: string | null
  onSelect: (id: string) => void
  onGerkDodaj: (p: GerkParcela) => Promise<void>
  searchTrigger: number
  onBbox: (bbox: [number, number, number, number]) => void
}

function FitBounds({ parcele }: { parcele: Parcela[] }) {
  const map = useMap()
  useEffect(() => {
    const withMeja = parcele.filter((p) => p.meja)
    if (!withMeja.length) return
    const allCoords = withMeja.flatMap((p) =>
      p.meja!.coordinates.flat().map(([lng, lat]) => [lat, lng] as [number, number])
    )
    if (allCoords.length) map.fitBounds(allCoords, { padding: [40, 40] })
  }, [parcele, map])
  return null
}

// Ko se searchTrigger povečа → vrne trenutni viewport kot bbox
function SearchOnTrigger({
  trigger,
  onBbox,
}: {
  trigger: number
  onBbox: (bbox: [number, number, number, number]) => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!trigger) return
    const b = map.getBounds()
    onBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
  }, [trigger]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function buildGerkPopup(gp: GerkParcela, onGerkDodaj: (p: GerkParcela) => Promise<void>): HTMLElement {
  const ha = (gp.area_m2 / 10000).toFixed(2)
  const wrap = L.DomUtil.create('div', 'gerk-popup')
  wrap.innerHTML = `
    <div class="gerk-popup-title">${gp.opis_rabe ?? '—'}</div>
    <div class="gerk-popup-ha">Površina: <b>${ha} ha</b></div>
  `
  const btn = L.DomUtil.create('button', 'gerk-popup-btn', wrap)
  btn.textContent = 'Dodaj na mojo kmetijo'
  L.DomEvent.on(btn, 'click', async () => {
    ;(btn as HTMLButtonElement).disabled = true
    btn.textContent = 'Dodajam…'
    try {
      await onGerkDodaj(gp)
    } catch (e) {
      ;(btn as HTMLButtonElement).disabled = false
      btn.textContent = 'Dodaj na mojo kmetijo'
      console.error(e)
    }
  })
  return wrap
}

export default function ParcelaMap({
  parcele, gerkParcele, selectedId, onSelect, onGerkDodaj, searchTrigger, onBbox,
}: Props) {
  return (
    <MapContainer
      center={[46.41, 16.15]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <FitBounds parcele={parcele} />
      <SearchOnTrigger trigger={searchTrigger} onBbox={onBbox} />

      {/* GERK kandidati — modri, s popupom */}
      {gerkParcele.map((gp) => (
        <GeoJSON
          key={`gerk-${gp.gerk_pid}`}
          data={gp.geometry}
          style={{
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.25,
            weight: 1.5,
            dashArray: '5 4',
          }}
          onEachFeature={(_f, layer: Layer) => {
            layer.on('click', (e) => L.DomEvent.stopPropagation(e))
            layer.bindPopup(buildGerkPopup(gp, onGerkDodaj), { minWidth: 180 })
          }}
        />
      ))}

      {/* Kmetove parcele — zelene */}
      {parcele
        .filter((p) => p.meja)
        .map((p) => (
          <GeoJSON
            key={p.id}
            data={p.meja!}
            style={{
              color: selectedId === p.id ? '#14532d' : '#166534',
              fillColor: selectedId === p.id ? '#16a34a' : '#22c55e',
              fillOpacity: selectedId === p.id ? 0.65 : 0.45,
              weight: selectedId === p.id ? 3 : 1.5,
            }}
            onEachFeature={(_f, layer: Layer) => {
              layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e)
                onSelect(p.id)
              })
              layer.bindPopup(
                `<strong>${p.naziv}</strong><br/>` +
                `Površina: <b>${Number(p.povrsina).toFixed(2)} ha</b><br/>` +
                `Vrsta rabe: ${p.kultura ?? '—'}`
              )
            }}
          />
        ))}
    </MapContainer>
  )
}
