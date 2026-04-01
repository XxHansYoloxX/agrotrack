import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
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
  onMapClick: (bbox: [number, number, number, number]) => void
  onGerkSelect: (p: GerkParcela) => void
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

function MapClickHandler({ onMapClick }: { onMapClick: (bbox: [number, number, number, number]) => void }) {
  const map = useMapEvents({
    click() {
      const b = map.getBounds()
      onMapClick([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
    },
  })
  void map
  return null
}

export default function ParcelaMap({ parcele, gerkParcele, selectedId, onSelect, onMapClick, onGerkSelect }: Props) {
  return (
    <MapContainer
      center={[46.38, 15.12]}
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
      <MapClickHandler onMapClick={onMapClick} />

      {/* GERK kandidati — modri */}
      {gerkParcele.map((gp) => (
        <GeoJSON
          key={`gerk-${gp.gerk_pid}`}
          data={gp.geometry}
          style={{
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.25,
            weight: 1.5,
            dashArray: '4 3',
          }}
          onEachFeature={(_feature, layer: Layer) => {
            layer.on('click', (e) => {
              L.DomEvent.stopPropagation(e)
              onGerkSelect(gp)
            })
            layer.bindTooltip(
              `<strong>GERK ${gp.gerk_pid}</strong><br/>` +
              `${gp.opis_rabe ?? '—'}<br/>` +
              `${(gp.area_m2 / 10000).toFixed(2)} ha`,
              { sticky: true }
            )
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
            onEachFeature={(_feature, layer: Layer) => {
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
