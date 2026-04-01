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

export interface KmgParcela {
  gerk_pid: string
  domace_ime: string
  raba_koda: string
  raba_opis: string
  povrsina_m2: number
}

export interface Kmetija {
  id: string
  ime: string
  naslov: string | null
}
