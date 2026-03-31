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

export interface Kmetija {
  id: string
  ime: string
  naslov: string | null
}
