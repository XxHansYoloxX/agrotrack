import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import type { Layer, LeafletMouseEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Parcela } from '../types'

// Fix Leaflet default icon paths broken by Vite bundling
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

interface Props {
  parcele: Parcela[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const CULTURE_COLORS: Record<string, string> = {
  Koruza: '#f59e0b',
  Trava: '#22c55e',
  Zelenjava: '#84cc16',
}

function defaultColor(kultura: string | null) {
  return kultura ? (CULTURE_COLORS[kultura] ?? '#3b82f6') : '#6b7280'
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

export default function ParcelaMap({ parcele, selectedId, onSelect }: Props) {
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
      {parcele
        .filter((p) => p.meja)
        .map((p) => (
          <GeoJSON
            key={p.id}
            data={p.meja!}
            style={{
              color: selectedId === p.id ? '#1e3a8a' : '#1a2e10',
              fillColor: defaultColor(p.kultura),
              fillOpacity: selectedId === p.id ? 0.65 : 0.4,
              weight: selectedId === p.id ? 3 : 1.5,
            }}
            onEachFeature={(_feature, layer: Layer) => {
              layer.on('click', (_e: LeafletMouseEvent) => onSelect(p.id))
              layer.bindTooltip(
                `<strong>${p.naziv}</strong><br/>${p.kultura ?? '—'}<br/>${p.povrsina} ha`,
                { sticky: true }
              )
            }}
          />
        ))}
    </MapContainer>
  )
}
