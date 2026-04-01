export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface Parcela {
  id: string
  naziv: string
  gmid: string | null
  povrsina: number
  kultura: string | null
  meja: GeoJsonPolygon | null
}

export interface GerkParcela {
  gerk_pid: string
  raba_id: number | null
  area_m2: number
  opis_rabe: string | null
  geometry: GeoJsonPolygon
}

export interface Kmetija {
  id: string
  ime: string
  naslov: string | null
}
